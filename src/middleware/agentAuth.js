const crypto = require("crypto");
const AgentApiKey = require("../models/AgentApiKey");
const User = require("../models/UserModel");
const { verifyDelegationToken } = require("./auth");
const { userRoles, verifiedContext } = require("../services/accessControl");

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

const loadDelegatedUser = async (req, required) => {
  const token = req.get("x-haven-delegation");
  if (!token) {
    if (required) throw new Error("A verified user delegation is required");
    return null;
  }
  const payload = verifyDelegationToken(token);
  if (payload.agent_key_id && payload.agent_key_id !== req.agentKey._id.toString()) throw new Error("Delegation token is not valid for this agent application");
  const user = await User.findById(payload.user_id);
  if (!user || !user.is_active || (payload.ver || 0) !== (user.auth_version || 0)) throw new Error("Delegated user is no longer available");
  if (!userRoles(user).includes(payload.active_role)) throw new Error("Delegated active role is no longer valid");
  return { user, context: verifiedContext(user, payload.active_role), token: payload };
};

const requireUserDelegation = async (req, res, next) => {
  try {
    const delegated = await loadDelegatedUser(req, true);
    req.delegatedUser = delegated.user;
    req.delegatedContext = delegated.context;
    req.delegation = delegated.token;
    next();
  } catch (error) {
    res.status(error.message === "Agent delegation is not configured" ? 503 : 401).json({ success: false, message: error.message || "Invalid or expired user delegation" });
  }
};

const optionalUserDelegation = async (req, res, next) => {
  try {
    const delegated = await loadDelegatedUser(req, false);
    if (delegated) {
      req.delegatedUser = delegated.user;
      req.delegatedContext = delegated.context;
      req.delegation = delegated.token;
    }
    next();
  } catch (error) {
    res.status(error.message === "Agent delegation is not configured" ? 503 : 401).json({ success: false, message: error.message || "Invalid or expired user delegation" });
  }
};

module.exports = { hashKey, authenticateAgent, requireAgentScope, requireUserDelegation, optionalUserDelegation };
