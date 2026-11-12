const crypto = require("crypto");
const AgentIdempotencyKey = require("../models/AgentIdempotencyKey");

const requireIdempotency = (operation) => async (req, res, next) => {
  const key = req.get("idempotency-key");
  if (!key) return res.status(400).json({ success: false, message: "Idempotency-Key is required for this agent write operation" });
  if (key.length > 200) return res.status(400).json({ success: false, message: "Idempotency-Key is too long" });
  const key_hash = crypto.createHash("sha256").update(key).digest("hex");
  const filter = { api_key_id: req.agentKey._id, acting_user_id: req.delegatedUser._id, operation, key_hash };
  try {
    const existing = await AgentIdempotencyKey.findOne(filter);
    if (existing?.state === "completed") return res.status(existing.status_code || 200).json(existing.response);
    if (existing) return res.status(409).json({ success: false, message: "An identical request is still being processed" });
    const record = await AgentIdempotencyKey.create({ ...filter, expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000) });
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 200 && res.statusCode < 300) AgentIdempotencyKey.updateOne({ _id: record._id }, { state: "completed", status_code: res.statusCode, response: body }).catch(() => {});
      return originalJson(body);
    };
    next();
  } catch (error) {
    if (error?.code === 11000) return res.status(409).json({ success: false, message: "An identical request is already being processed" });
    next(error);
  }
};

module.exports = { requireIdempotency };
