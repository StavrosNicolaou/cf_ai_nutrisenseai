export async function rateLimit(env, key, limit = 10, windowSeconds = 600) {
  const store = env?.RATE_LIMIT_KV;
  if (!store) {
    throw new Error('RATE_LIMIT_KV is not configured');
  }
  const now = Date.now();
  const existing = (await store.get(key, { type: 'json' })) || null;
  const resetAt = existing?.resetAt && existing.resetAt > now ? existing.resetAt : now + windowSeconds * 1000;
  const count = existing?.resetAt && existing.resetAt > now ? Number(existing.count || 0) + 1 : 1;
  await store.put(key, JSON.stringify({ count, resetAt }), {
    expirationTtl: windowSeconds
  });
  return {
    allowed: count <= limit,
    remaining: Math.max(limit - count, 0),
    resetAt
  };
}
