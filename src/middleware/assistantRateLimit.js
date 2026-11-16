const buckets = new Map();

const assistantRateLimit = (req, res, next) => {
  const maximum = Math.max(Number(process.env.ASSISTANT_RATE_LIMIT_MAX) || 30, 1);
  const windowMs = Math.max(Number(process.env.ASSISTANT_RATE_LIMIT_WINDOW_SECONDS) || 60, 1) * 1000;
  const key = req.user?._id?.toString() || req.ip;
  const now = Date.now();
  const previous = buckets.get(key);
  const bucket = !previous || previous.expiresAt <= now ? { count: 0, expiresAt: now + windowMs } : previous;
  bucket.count += 1;
  buckets.set(key, bucket);
  if (bucket.count > maximum) {
    const retryAfter = Math.max(Math.ceil((bucket.expiresAt - now) / 1000), 1);
    res.set("Retry-After", String(retryAfter));
    return res.status(429).json({ success: false, message: "Too many assistant messages. Please retry shortly." });
  }
  next();
};

module.exports = { assistantRateLimit };
