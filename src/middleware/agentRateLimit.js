// Lightweight per-agent-key protection. For horizontally scaled production
// deployments, replace this in-memory store with a shared Redis-backed limiter.
const buckets = new Map();

const integerSetting = (name, fallback, minimum) => {
  const value = Number(process.env[name]);
  return Number.isInteger(value) && value >= minimum ? value : fallback;
};

const agentRateLimit = (req, res, next) => {
  const windowSeconds = integerSetting("AGENT_RATE_LIMIT_WINDOW_SECONDS", 60, 1);
  const maximum = integerSetting("AGENT_RATE_LIMIT_MAX", 120, 1);
  const now = Date.now();
  const key = req.agentKey?._id?.toString() || req.ip;
  const bucket = buckets.get(key);
  const expiresAt = now + windowSeconds * 1000;
  const current = !bucket || bucket.expiresAt <= now ? { count: 0, expiresAt } : bucket;
  current.count += 1;
  buckets.set(key, current);

  const remaining = Math.max(maximum - current.count, 0);
  const retryAfter = Math.max(Math.ceil((current.expiresAt - now) / 1000), 1);
  res.set("X-RateLimit-Limit", String(maximum));
  res.set("X-RateLimit-Remaining", String(remaining));
  res.set("X-RateLimit-Reset", String(Math.ceil(current.expiresAt / 1000)));
  if (current.count > maximum) {
    res.set("Retry-After", String(retryAfter));
    return res.status(429).json({ success: false, message: "Agent API rate limit exceeded. Please retry later." });
  }
  next();
};

module.exports = { agentRateLimit };
