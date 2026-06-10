function createRateLimiter(options = {}) {
  const windowMs = Number(options.windowMs || process.env.RATE_LIMIT_WINDOW_MS || 60_000);
  const max = Number(options.max || process.env.RATE_LIMIT_MAX || 300);
  const buckets = new Map();

  return function rateLimit(req) {
    const key = req.headers["x-forwarded-for"] || req.socket.remoteAddress || "unknown";
    const now = Date.now();
    const bucket = buckets.get(key) || { count: 0, resetAt: now + windowMs };
    if (now > bucket.resetAt) {
      bucket.count = 0;
      bucket.resetAt = now + windowMs;
    }
    bucket.count += 1;
    buckets.set(key, bucket);
    if (bucket.count > max) {
      const error = new Error("Rate limit exceeded");
      error.statusCode = 429;
      error.code = "RATE_LIMITED";
      throw error;
    }
    return {
      limit: max,
      remaining: Math.max(0, max - bucket.count),
      resetAt: bucket.resetAt
    };
  };
}

module.exports = { createRateLimiter };
