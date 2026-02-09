import { parseCookies, verifyJwt, createAuthCookie, clearAuthCookie } from './jwt.js';

export async function getAuthFromRequest(request, env) {
  const cookies = parseCookies(request.headers.get('cookie'));
  const token = cookies.session;
  if (!token) return null;
  return verifyJwt(token, env.SESSION_SECRET);
}

export async function requireUser(c, next) {
  const auth = await getAuthFromRequest(c.req.raw, c.env);
  if (!auth) return c.redirect('/');
  if (auth.mfaRequired && !auth.mfaVerified) {
    return c.redirect('/auth/otp');
  }
  c.set('session', auth);
  await next();
}

export { createAuthCookie, clearAuthCookie };