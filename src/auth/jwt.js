import jwt from '@tsndr/cloudflare-worker-jwt';

export async function signJwt(payload, secret, ttlSeconds) {
  const now = Math.floor(Date.now() / 1000);
  const body = { ...payload, iat: now };
  if (ttlSeconds) body.exp = now + ttlSeconds;
  return jwt.sign(body, secret);
}

export async function verifyJwt(token, secret) {
  if (!token) return null;
  const ok = await jwt.verify(token, secret);
  if (!ok) return null;
  const decoded = jwt.decode(token);
  const payload = decoded?.payload || null;
  if (!payload) return null;
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

export function buildCookie(name, value, options = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`];
  if (options.maxAge !== undefined) parts.push(`Max-Age=${options.maxAge}`);
  if (options.path) parts.push(`Path=${options.path}`);
  if (options.httpOnly) parts.push('HttpOnly');
  if (options.secure) parts.push('Secure');
  if (options.sameSite) parts.push(`SameSite=${options.sameSite}`);
  return parts.join('; ');
}

export function parseCookies(header) {
  const out = {};
  if (!header) return out;
  const parts = header.split(';');
  for (const part of parts) {
    const [name, ...rest] = part.trim().split('=');
    if (!name) continue;
    out[name] = decodeURIComponent(rest.join('=') || '');
  }
  return out;
}

export async function createAuthCookie(env, payload) {
  const token = await signJwt(payload, env.SESSION_SECRET, 60 * 60 * 24 * 30);
  const secure = String(env.APP_BASE_URL || '').startsWith('https');
  return buildCookie('session', token, {
    httpOnly: true,
    secure,
    sameSite: 'Lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30
  });
}

export function clearAuthCookie(env) {
  const secure = String(env.APP_BASE_URL || '').startsWith('https');
  return buildCookie('session', '', {
    httpOnly: true,
    secure,
    sameSite: 'Lax',
    path: '/',
    maxAge: 0
  });
}

export async function createSetupCookie(env, payload) {
  const token = await signJwt(payload, env.SESSION_SECRET, 15 * 60);
  const secure = String(env.APP_BASE_URL || '').startsWith('https');
  return buildCookie('totp_setup', token, {
    httpOnly: true,
    secure,
    sameSite: 'Lax',
    path: '/',
    maxAge: 15 * 60
  });
}

export function clearSetupCookie(env) {
  const secure = String(env.APP_BASE_URL || '').startsWith('https');
  return buildCookie('totp_setup', '', {
    httpOnly: true,
    secure,
    sameSite: 'Lax',
    path: '/',
    maxAge: 0
  });
}
