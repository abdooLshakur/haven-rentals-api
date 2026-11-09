const crypto = require("crypto");
const AgentApiKey = require("../models/AgentApiKey");

const hashKey = (key) => crypto.createHash("sha256").update(key).digest("hex");

const authenticateAgent = async (req, res, next) => {
  try {
    const key = req.get("x-agent-api-key");
    if (!key || !key.startsWith("hr_ai_")) return res.status(401).json({ success: false, message: "A valid agent API key is required" });
    const apiKey = await AgentApiKey.findOne({ key_hash: hashKey(key) }).select("+key_hash");
    if (!apiKey || apiKey.revoked_at || (apiKey.expires_at && apiKey.expires_at <= new Date())) {
      return res.status(401).json({ success: false, message: "Agent API key is invalid, expired, or revoked" });
    }
    apiKey.last_used_at = new Date();
    await apiKey.save();
    req.agentKey = apiKey;
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: "Agent authentication failed" });
  }
};

const requireAgentScope = (...scopes) => (req, res, next) => {
  if (!req.agentKey || !scopes.every((scope) => req.agentKey.scopes.includes(scope))) {
    return res.status(403).json({ success: false, message: "This agent key does not have the required permission" });
  }
  next();
};

module.exports = { hashKey, authenticateAgent, requireAgentScope };
