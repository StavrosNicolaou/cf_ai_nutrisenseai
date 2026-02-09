import { Hono } from 'hono';
import { routeAgentRequest } from 'agents';
import { getDb } from './db/client.js';
import { getUserById, upsertUser, upsertOAuthAccount, setTotpSecret, disableTotp } from './db/queries.js';
import { landingHandler } from './routes/landing.js';
import { dashboardHandler } from './routes/dashboard.js';
import { dayHandler } from './routes/day.js';
import { foodsHandler } from './routes/foods.js';
import { settingsHandler, settingsProfilePostHandler } from './routes/settings.js';
import { otpHandler } from './routes/auth.js';
import { onboardingGetHandler, onboardingPostHandler } from './routes/onboarding.js';
import { requireUser, getAuthFromRequest, createAuthCookie, clearAuthCookie } from './auth/middleware.js';
import { createCodeChallenge, createCodeVerifier, exchangeCodeForToken, fetchGoogleUser, getGoogleAuthUrl } from './auth/oauth.js';
import { generateTotpSecret, encryptSecret, decryptSecret, buildOtpAuthUri, buildQrCodeUrl, verifyTotpCode } from './auth/totp.js';
import { parseTextHandler, parseImageHandler, addFoodHandler, daySummaryHandler, nutrientListHandler, foodsSearchHandler, foodDetailHandler, updateEntryHandler, deleteEntryHandler, entryDetailHandler, imageUploadUrlHandler } from './api/food.js';
import { listJobsHandler, getJobHandler, consumeJobHandler, deleteJobHandler, retryJobHandler } from './api/jobs.js';
import { FoodAgentSql } from './agents/foodAgent.js';
import { createSetupCookie, clearSetupCookie, parseCookies, verifyJwt } from './auth/jwt.js';
import { rateLimit } from './auth/rateLimit.js';
import { isProfileComplete } from './utils/profile.js';
import { handleFoodQueue } from './queues/foodQueue.js';

const app = new Hono();

app.use('*', async (c, next) => {
  const auth = await getAuthFromRequest(c.req.raw, c.env);
  if (auth?.userId) {
    c.set('session', auth);
    const db = getDb(c.env);
    const user = await getUserById(db, auth.userId);
    c.set('user', user);
    const path = c.req.path;
    const isAllowed =
      path.startsWith('/onboarding') ||
      path.startsWith('/auth') ||
      path.startsWith('/api') ||
      path.startsWith('/agents');
    if (!isAllowed && c.req.method === 'GET' && user && !isProfileComplete(user)) {
      return c.redirect('/onboarding');
    }
  }
  await next();
});

app.get('/', async (c) => {
  if (c.get('session')) return c.redirect('/dashboard');
  return landingHandler(c);
});

app.get('/onboarding', requireUser, onboardingGetHandler);
app.post('/onboarding', requireUser, onboardingPostHandler);
app.get('/dashboard', requireUser, dashboardHandler);
app.get('/day/:date', requireUser, dayHandler);
app.get('/foods', requireUser, foodsHandler);
app.get('/settings', requireUser, async (c) => {
  const cookies = parseCookies(c.req.header('cookie'));
  const setupToken = cookies.totp_setup;
  if (setupToken) {
    const setup = await verifyJwt(setupToken, c.env.SESSION_SECRET);
    if (setup?.secret_enc) {
      const secret = await decryptSecret(setup.secret_enc, c.env.ENCRYPTION_KEY);
      const uri = buildOtpAuthUri({ secret, accountName: c.get('user').email, issuer: 'NutriSense AI' });
      c.set('totp', { enabled: false, provisioningUri: uri, qrCodeUrl: buildQrCodeUrl(uri) });
    }
  }
  return settingsHandler(c);
});
app.post('/settings/profile', requireUser, settingsProfilePostHandler);

app.get('/auth/google', async (c) => {
  const state = crypto.randomUUID();
  const verifier = createCodeVerifier();
  const challenge = await createCodeChallenge(verifier);
  const cookie = await createSetupCookie(c.env, { oauth_state: state, verifier });
  c.header('Set-Cookie', cookie);
  return c.redirect(getGoogleAuthUrl(c.env, state, challenge));
});

app.get('/auth/google/callback', async (c) => {
  const code = c.req.query('code');
  const state = c.req.query('state');
  if (!code || !state) return c.text('Invalid OAuth response', 400);
  const ip = c.req.header('cf-connecting-ip') || 'unknown';
  const rate = await rateLimit(c.env, `login:${ip}`, 10, 600);
  if (!rate.allowed) return c.text('Too many login attempts. Try again later.', 429);

  const cookies = parseCookies(c.req.header('cookie'));
  const setupToken = cookies.totp_setup;
  const setup = setupToken ? await verifyJwt(setupToken, c.env.SESSION_SECRET) : null;
  if (!setup || setup.oauth_state !== state) return c.text('Invalid OAuth state', 400);

  const tokens = await exchangeCodeForToken(c.env, code, setup.verifier);
  const profile = await fetchGoogleUser(tokens.access_token);
  const db = getDb(c.env);
  const user = await upsertUser(db, { email: profile.email, name: profile.name, pictureUrl: profile.picture });
  await upsertOAuthAccount(db, {
    userId: user.id,
    provider: 'google',
    providerUserId: profile.sub,
    accessToken: tokens.access_token
  });

  const authCookie = await createAuthCookie(c.env, {
    userId: user.id,
    mfaRequired: Boolean(user.totp_enabled),
    mfaVerified: !user.totp_enabled
  });
  c.header('Set-Cookie', authCookie);
  c.res.headers.append('Set-Cookie', clearSetupCookie(c.env));
  return c.redirect(user.totp_enabled ? '/auth/otp' : '/dashboard');
});

app.get('/auth/otp', async (c) => {
  const auth = await getAuthFromRequest(c.req.raw, c.env);
  if (!auth) return c.redirect('/');
  if (!auth.mfaRequired || auth.mfaVerified) return c.redirect('/dashboard');
  const db = getDb(c.env);
  const user = await getUserById(db, auth.userId);
  c.set('user', user);
  return otpHandler(c);
});

app.post('/auth/otp', async (c) => {
  const auth = await getAuthFromRequest(c.req.raw, c.env);
  if (!auth) return c.redirect('/');
  const form = await c.req.parseBody();
  const token = String(form.token || '').trim();
  const rate = await rateLimit(c.env, `otp:${auth.userId}`, 5, 300);
  if (!rate.allowed) return c.text('Too many OTP attempts. Try later.', 429);
  const db = getDb(c.env);
  const user = await getUserById(db, auth.userId);
  const secret = await decryptSecret(user?.totp_secret_enc, c.env.ENCRYPTION_KEY);
  if (!secret) return c.text('2FA not configured', 400);
  const ok = await verifyTotpCode(secret, token);
  if (!ok) return c.text('Invalid code', 400);

  const authCookie = await createAuthCookie(c.env, {
    userId: auth.userId,
    mfaRequired: true,
    mfaVerified: true
  });
  c.header('Set-Cookie', authCookie);
  return c.redirect('/dashboard');
});

app.post('/auth/logout', async (c) => {
  c.header('Set-Cookie', clearAuthCookie(c.env));
  return c.redirect('/');
});

app.post('/settings/2fa/enable', requireUser, async (c) => {
  const secret = generateTotpSecret();
  const encrypted = await encryptSecret(secret, c.env.ENCRYPTION_KEY);
  const cookie = await createSetupCookie(c.env, { secret_enc: encrypted });
  c.header('Set-Cookie', cookie);
  return c.redirect('/settings');
});

app.post('/settings/2fa/verify', requireUser, async (c) => {
  const cookies = parseCookies(c.req.header('cookie'));
  const setupToken = cookies.totp_setup;
  const setup = setupToken ? await verifyJwt(setupToken, c.env.SESSION_SECRET) : null;
  if (!setup?.secret_enc) return c.redirect('/settings');
  const secret = await decryptSecret(setup.secret_enc, c.env.ENCRYPTION_KEY);
  const form = await c.req.parseBody();
  const token = String(form.token || '').trim();
  const ok = await verifyTotpCode(secret, token);
  if (!ok) return c.text('Invalid code', 400);
  const db = getDb(c.env);
  const auth = c.get('session');
  await setTotpSecret(db, auth.userId, setup.secret_enc);
  c.header('Set-Cookie', clearSetupCookie(c.env));

  const authCookie = await createAuthCookie(c.env, {
    userId: auth.userId,
    mfaRequired: true,
    mfaVerified: true
  });
  c.res.headers.append('Set-Cookie', authCookie);
  return c.redirect('/settings');
});

app.post('/settings/2fa/disable', requireUser, async (c) => {
  const auth = c.get('session');
  const db = getDb(c.env);
  await disableTotp(db, auth.userId);
  const authCookie = await createAuthCookie(c.env, {
    userId: auth.userId,
    mfaRequired: false,
    mfaVerified: true
  });
  c.header('Set-Cookie', authCookie);
  return c.redirect('/settings');
});

app.post('/api/food/parse-text', requireUser, parseTextHandler);
app.post('/api/food/image-upload-url', requireUser, imageUploadUrlHandler);
app.post('/api/food/parse-image', requireUser, parseImageHandler);
app.post('/api/food/add', requireUser, addFoodHandler);
app.post('/api/food/update', requireUser, updateEntryHandler);
app.post('/api/food/delete', requireUser, deleteEntryHandler);
app.get('/api/food/entry/:id', requireUser, entryDetailHandler);
app.get('/api/day', requireUser, daySummaryHandler);
app.get('/api/nutrients/list', requireUser, nutrientListHandler);
app.get('/api/foods/search', requireUser, foodsSearchHandler);
app.get('/api/foods/:id', requireUser, foodDetailHandler);
app.get('/api/jobs', requireUser, listJobsHandler);
app.get('/api/jobs/:id', requireUser, getJobHandler);
app.post('/api/jobs/:id/consume', requireUser, consumeJobHandler);
app.delete('/api/jobs/:id', requireUser, deleteJobHandler);
app.post('/api/jobs/:id/retry', requireUser, retryJobHandler);

app.all('/agents/*', async (c) => {
  const response = await routeAgentRequest(c.req.raw, c.env);
  return response || c.text('Agent route not found', 404);
});

app.notFound((c) => c.text('Not Found', 404));

export default {
  fetch: app.fetch,
  queue: handleFoodQueue
};
export { FoodAgentSql };
