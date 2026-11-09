const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const User = require("../models/UserModel");
const { createAccessToken } = require("../middleware/auth");

const publicUser = (user) => ({
  id: user._id,
  first_name: user.first_name,
  last_name: user.last_name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  avatar: user.avatar,
});

const register = async (req, res) => {
  try {
    const { first_name, last_name, email, phone, gender, dob, password, avatar, role } = req.body;
    if (!first_name || !last_name || !email || !phone || !password) {
      return res.status(400).json({ success: false, message: "First name, last name, email, phone, and password are required" });
    }
    if (password.length < 8) return res.status(400).json({ success: false, message: "Password must be at least 8 characters" });
    if (await User.exists({ email: email.toLowerCase() })) {
      return res.status(409).json({ success: false, message: "Email already exists" });
    }

    const user = await User.create({
      first_name, last_name, email, phone, gender, dob, avatar,
      role: role === "landlord" ? "landlord" : "tenant",
      password: await bcrypt.hash(password, 12),
    });
    res.status(201).json({ success: true, message: "User created successfully", data: { user: publicUser(user), access_token: createAccessToken(user) } });
  } catch (error) {
    res.status(400).json({ success: false, message: "Failed to create user", error: error.message });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ success: false, message: "Email and password are required" });
    const user = await User.findOne({ email: email.toLowerCase() }).select("+password");
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ success: false, message: "Invalid email or password" });
    }
    if (!user.is_active) return res.status(403).json({ success: false, message: "This account is inactive" });
    res.json({ success: true, message: "Login successful", data: { user: publicUser(user), access_token: createAccessToken(user) } });
  } catch (error) {
    res.status(500).json({ success: false, message: "Login failed", error: error.message });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;
    const message = "If an account exists for that email, a reset link has been prepared.";
    if (!email) return res.status(400).json({ success: false, message: "Email is required" });

    const user = await User.findOne({ email: email.toLowerCase() }).select("+password_reset_token_hash +password_reset_expires_at");
    if (!user) return res.json({ success: true, message });

    const resetToken = crypto.randomBytes(32).toString("hex");
    user.password_reset_token_hash = crypto.createHash("sha256").update(resetToken).digest("hex");
    user.password_reset_expires_at = new Date(Date.now() + 1000 * 60 * 30);
    await user.save();

    const data = process.env.NODE_ENV === "production" ? undefined : {
      reset_token: resetToken,
      reset_url: `/reset-password?token=${resetToken}`,
      note: "Development reset link. Configure an email provider before production.",
    };
    res.json({ success: true, message, data });
  } catch (error) {
    res.status(500).json({ success: false, message: "We could not start the password reset", error: error.message });
  }
};

const resetPassword = async (req, res) => {
  try {
    const { token, password } = req.body;
    if (!token || !password) return res.status(400).json({ success: false, message: "Reset token and new password are required" });
    if (password.length < 8) return res.status(400).json({ success: false, message: "Password must be at least 8 characters" });

    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const user = await User.findOne({ password_reset_token_hash: tokenHash, password_reset_expires_at: { $gt: new Date() } })
      .select("+password +password_reset_token_hash +password_reset_expires_at");
    if (!user) return res.status(400).json({ success: false, message: "This reset link is invalid or has expired" });

    user.password = await bcrypt.hash(password, 12);
    user.password_reset_token_hash = undefined;
    user.password_reset_expires_at = undefined;
    await user.save();
    res.json({ success: true, message: "Your password has been reset", data: { user: publicUser(user), access_token: createAccessToken(user) } });
  } catch (error) {
    res.status(500).json({ success: false, message: "We could not reset your password", error: error.message });
  }
};

const getProfile = (req, res) => res.json({ success: true, data: publicUser(req.user) });

const listAgents = async (req, res) => {
  const agents = await User.find({ role: "agent", is_active: true }).select("first_name last_name email phone avatar");
  res.json({ success: true, data: agents });
};

const bootstrapAdmin = async (req, res) => {
  try {
    const configuredSecret = process.env.ADMIN_BOOTSTRAP_SECRET;
    const providedSecret = req.get("x-admin-bootstrap-secret");
    if (!configuredSecret) return res.status(503).json({ success: false, message: "Admin bootstrap has not been configured" });
    if (!providedSecret || providedSecret.length !== configuredSecret.length || !crypto.timingSafeEqual(Buffer.from(providedSecret), Buffer.from(configuredSecret))) {
      return res.status(401).json({ success: false, message: "Invalid admin bootstrap secret" });
    }
    if (await User.exists({ role: "admin" })) return res.status(409).json({ success: false, message: "An administrator already exists. This one-time setup route is locked." });
    const email = String(req.body.email || "").toLowerCase().trim();
    if (!email) return res.status(400).json({ success: false, message: "The existing account email is required" });
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ success: false, message: "No account exists for this email. Register the account first." });
    user.role = "admin";
    await user.save();
    res.json({ success: true, message: "Administrator created. Sign out and sign in again to use the admin dashboard.", data: { user: publicUser(user) } });
  } catch (error) {
    res.status(500).json({ success: false, message: "Could not create the administrator" });
  }
};

module.exports = { register, login, forgotPassword, resetPassword, getProfile, listAgents, bootstrapAdmin };
