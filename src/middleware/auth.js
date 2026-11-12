const crypto = require("crypto");
const User = require("../models/UserModel");
const { activeRoleFor, verifiedContext } = require("../services/accessControl");

const jwtSecret = process.env.JWT_SECRET || "change-this-development-secret";
const delegationSecret = process.env.AGENT_DELEGATION_SECRET;

const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const sign = (value, secret = jwtSecret) => crypto.createHmac("sha256", secret).update(value).digest("base64url");

const safelyMatches = (left, right) => {
  const leftBuffer = Buffer.from(left || "");
  const rightBuffer = Buffer.from(right || "");
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const createAccessToken = (user, requestedRole) => {
  const payload = encode({ id: user._id.toString(), active_role: activeRoleFor(user, requestedRole), ver: user.auth_version || 0, jti: crypto.randomUUID(), exp: Date.now() + 1000 * 60 * 60 * 24 * 7 });
  return `${payload}.${sign(payload)}`;
};

const verifyAccessToken = (token) => {
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !safelyMatches(signature, sign(payload))) {
    throw new Error("Invalid token");
  }
  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString());
  if (!decoded.exp || decoded.exp < Date.now()) throw new Error("Expired token");
  return decoded;
};

const createDelegationToken = (user, requestedRole, agentKeyId, conversationId) => {
  if (!delegationSecret) throw new Error("Agent delegation is not configured");
  const context = verifiedContext(user, requestedRole);
  const payload = encode({
    ...context,
    agent_key_id: agentKeyId || null,
    conversation_id: conversationId || null,
    ver: user.auth_version || 0,
    jti: crypto.randomUUID(),
    iat: Date.now(),
    exp: Date.now() + 1000 * 60 * 10,
  });
  return `${payload}.${sign(payload, delegationSecret)}`;
};

const verifyDelegationToken = (token) => {
  if (!delegationSecret) throw new Error("Agent delegation is not configured");
  const [payload, signature] = String(token || "").split(".");
  if (!payload || !signature || !safelyMatches(signature, sign(payload, delegationSecret))) throw new Error("Invalid delegation token");
  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString());
  if (!decoded.exp || decoded.exp < Date.now() || !decoded.user_id || !decoded.active_role) throw new Error("Expired delegation token");
  return decoded;
};

const authenticate = async (req, res, next) => {
  try {
    const authorization = req.headers.authorization || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : null;

    if (!token) {
      return res.status(401).json({ success: false, message: "Authentication is required" });
    }

    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.id);
    if (!user || !user.is_active || (payload.ver || 0) !== (user.auth_version || 0)) {
      return res.status(401).json({ success: false, message: "User is not available" });
    }

    req.user = user;
    req.activeRole = activeRoleFor(user, payload.active_role);
    req.auth = payload;
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: "Invalid or expired access token" });
  }
};

const optionalAuthenticate = async (req, res, next) => {
  try {
    const authorization = req.headers.authorization || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : null;
    if (!token) return next();

    const payload = verifyAccessToken(token);
    const user = await User.findById(payload.id);
    if (user?.is_active && (payload.ver || 0) === (user.auth_version || 0)) {
      req.user = user;
      req.activeRole = activeRoleFor(user, payload.active_role);
      req.auth = payload;
    }
  } catch (error) {}
  next();
};

const allowRoles = (...roles) => (req, res, next) => {
  if (!roles.includes(req.activeRole || req.user.role)) {
    return res.status(403).json({ success: false, message: "You are not allowed to perform this action" });
  }
  next();
};

module.exports = { authenticate, optionalAuthenticate, allowRoles, createAccessToken, createDelegationToken, verifyDelegationToken };
