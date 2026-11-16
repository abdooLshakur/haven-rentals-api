const crypto = require("crypto");
const AssistantConversation = require("../models/AssistantConversation");
const { createDelegationToken } = require("../middleware/auth");
const { verifiedContext } = require("../services/accessControl");

const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
const matches = (left, right) => {
  const a = Buffer.from(left || "");
  const b = Buffer.from(right || "");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};
const previewReply = (message, context) => {
  const text = message.toLowerCase();
  if (/rent|lease|annual|monthly/.test(text)) return "I can help you search rental homes by location, budget, bedrooms, and price period. Tell me where you would like to live and your maximum budget.";
  if (/buy|sale|purchase/.test(text)) return "I can help you explore homes for sale. Share your preferred location, budget, and any must-have features.";
  if (/view|inspect|appointment/.test(text)) return "I can help you find a suitable listing and guide you to request a viewing. Viewing confirmation remains with the property team.";
  if (context?.active_role === "landlord") return "I can help you review your permitted listing enquiries and viewings, or prepare a follow-up draft for your approval.";
  return "Welcome to Haven. I can help you search available homes, understand renting or buying, and guide you through the next step.";
};

const createConversation = async (req, res) => {
  const activeRole = req.user ? req.activeRole : null;
  const guestToken = req.user ? null : crypto.randomBytes(32).toString("base64url");
  const conversation = await AssistantConversation.create({
    owner_user_id: req.user?._id || null,
    ...(guestToken && { guest_token_hash: hash(guestToken) }),
    active_role: activeRole,
  });
  res.status(201).json({ success: true, data: { conversation_id: conversation._id, ...(guestToken && { guest_token: guestToken }), active_role: activeRole } });
};

const loadConversation = async (req) => {
  const conversation = await AssistantConversation.findById(req.params.id).select("+guest_token_hash");
  if (!conversation) return null;
  if (req.user) {
    const isOwner = conversation.owner_user_id?.toString() === req.user._id.toString();
    const sameRole = conversation.active_role === req.activeRole;
    return isOwner && sameRole ? conversation : null;
  }
  const guestToken = req.get("x-haven-guest-token");
  return guestToken && conversation.guest_token_hash && matches(hash(guestToken), conversation.guest_token_hash) ? conversation : null;
};

const externalReply = async ({ conversation, message, user }) => {
  const endpoint = process.env.AI_ASSISTANT_URL;
  if (!endpoint) return { reply: previewReply(message, user && verifiedContext(user.user, user.activeRole)), preview: true };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const context = user && verifiedContext(user.user, user.activeRole);
    const delegation_token = user ? createDelegationToken(user.user, user.activeRole, null, conversation._id.toString()) : null;
    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...(process.env.AI_ASSISTANT_SHARED_SECRET && { "X-Haven-Integration-Secret": process.env.AI_ASSISTANT_SHARED_SECRET }) },
      body: JSON.stringify({ conversation_id: conversation._id.toString(), message, context, delegation_token }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || typeof body.reply !== "string") throw new Error("Assistant service unavailable");
    return { reply: body.reply.slice(0, 4000), preview: false };
  } finally {
    clearTimeout(timeout);
  }
};

const sendMessage = async (req, res) => {
  try {
    const message = String(req.body.message || "").trim();
    if (!message || message.length > 2000) return res.status(400).json({ success: false, message: "Message must be between 1 and 2,000 characters" });
    const conversation = await loadConversation(req);
    if (!conversation) return res.status(404).json({ success: false, message: "Conversation not found" });
    conversation.messages.push({ role: "user", content: message });
    const result = await externalReply({ conversation, message, user: req.user && { user: req.user, activeRole: req.activeRole } });
    conversation.messages.push({ role: "assistant", content: result.reply });
    conversation.messages = conversation.messages.slice(-40);
    await conversation.save();
    res.json({ success: true, data: { conversation_id: conversation._id, reply: result.reply, preview: result.preview } });
  } catch (error) {
    res.status(502).json({ success: false, message: "The Haven assistant is temporarily unavailable. Please try again." });
  }
};

module.exports = { createConversation, sendMessage };
