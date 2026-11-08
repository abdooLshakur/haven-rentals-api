const crypto = require("crypto");
const User = require("../models/UserModel");

const jwtSecret = process.env.JWT_SECRET || "change-this-development-secret";

const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const sign = (value) => crypto.createHmac("sha256", jwtSecret).update(value).digest("base64url");

const createAccessToken = (user) => {
  const payload = encode({ id: user._id.toString(), exp: Date.now() + 1000 * 60 * 60 * 24 * 7 });
  return `${payload}.${sign(payload)}`;
};

const verifyAccessToken = (token) => {
  const [payload, signature] = token.split(".");
  if (!payload || !signature || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(sign(payload)))) {
    throw new Error("Invalid token");
  }
  const decoded = JSON.parse(Buffer.from(payload, "base64url").toString());
  if (!decoded.exp || decoded.exp < Date.now()) throw new Error("Expired token");
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
    if (!user || !user.is_active) {
      return res.status(401).json({ success: false, message: "User is not available" });
    }

    req.user = user;
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
    if (user?.is_active) req.user = user;
  } catch (error) {}
  next();
};

const allowRoles = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: "You are not allowed to perform this action" });
  }
  next();
};

module.exports = { authenticate, optionalAuthenticate, allowRoles, createAccessToken };
