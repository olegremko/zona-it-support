export function createMemoryRateLimit({
  windowMs,
  max,
  keyPrefix,
  message = 'Too many requests'
}) {
  const buckets = new Map();

  function cleanup(now) {
    for (const [key, entry] of buckets.entries()) {
      if (entry.resetAt <= now) buckets.delete(key);
    }
  }

  return function rateLimitMiddleware(req, res, next) {
    const now = Date.now();
    cleanup(now);

    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown';
    const key = `${keyPrefix}:${ip}`;
    const current = buckets.get(key);

    if (!current || current.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    if (current.count >= max) {
      const retryAfter = Math.max(1, Math.ceil((current.resetAt - now) / 1000));
      res.setHeader('Retry-After', String(retryAfter));
      return res.status(429).json({
        error: {
          message,
          retryAfter
        }
      });
    }

    current.count += 1;
    return next();
  };
}
