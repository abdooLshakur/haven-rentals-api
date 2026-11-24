const crypto = require("crypto");
const mongoose = require("mongoose");
const AssistantConversation = require("../models/AssistantConversation");
const Property = require("../models/propertymodels");
const House = require("../models/HouseModel");
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

const assistantUi = (value) => {
  if (!value || typeof value !== "object" || value.type !== "property_cards" || !Array.isArray(value.items)) return null;
  const string = (field, max = 300) => typeof field === "string" ? field.trim().slice(0, max) : "";
  const number = (field) => Number.isFinite(field) ? field : null;
  const items = value.items.slice(0, 6).map((item) => ({
    id: string(item?.id || item?._id, 100),
    listing_kind: ["property", "house"].includes(item?.listing_kind) ? item.listing_kind : "property",
    name: string(item?.name, 120), type: string(item?.type, 60), location: string(item?.location, 200),
    image: string(item?.image || item?.images?.[0], 1000), description: string(item?.description, 700),
    bedrooms: number(item?.bedrooms), bathrooms: number(item?.bathrooms), valuation: number(item?.valuation),
    currency: string(item?.currency, 10) || "NGN", listing_intent: item?.listing_intent === "sale" ? "sale" : "rent",
    price_period: ["monthly", "annual", "one_time"].includes(item?.price_period) ? item.price_period : "annual",
    property_page_url: string(item?.property_page_url, 1000),
  })).filter((item) => item.id && item.name);
  return items.length ? { type: "property_cards", items } : null;
};

// Compatibility layer: while the existing Python agent returns a normal
// Markdown listing link, Haven enriches it into a safe visual property card.
const cardsFromListingLinks = async (reply) => {
  const ids = [...String(reply || "").matchAll(/#\/home\/([a-f\d]{24})/gi)].map((match) => match[1]);
  const uniqueIds = [...new Set(ids)].slice(0, 6).filter((id) => mongoose.isValidObjectId(id));
  if (!uniqueIds.length) return null;
  const available = { _id: { $in: uniqueIds }, status: "available" };
  const [properties, houses] = await Promise.all([
    Property.find(available).select("name type location description bedrooms bathrooms valuation currency listing_intent price_period images"),
    House.find(available).select("name location description bedrooms bathrooms valuation currency listing_intent price_period images"),
  ]);
  const toCard = (listing, listing_kind) => ({
    id: listing._id.toString(), listing_kind, name: listing.name, type: listing.type || "Home", location: listing.location,
    image: listing.images?.find(Boolean) || "", description: listing.description || "", bedrooms: listing.bedrooms,
    bathrooms: listing.bathrooms, valuation: listing.valuation, currency: listing.currency || "NGN",
    listing_intent: listing.listing_intent === "sale" ? "sale" : "rent",
    price_period: listing.listing_intent === "sale" ? "one_time" : (["monthly", "annual"].includes(listing.price_period) ? listing.price_period : "annual"),
    property_page_url: `${(process.env.PUBLIC_APP_URL || "https://haven-rentals-tau.vercel.app").replace(/\/$/, "")}/#/home/${listing._id}`,
  });
  const records = [...properties.map((item) => toCard(item, "property")), ...houses.map((item) => toCard(item, "house"))];
  const items = uniqueIds.map((id) => records.find((item) => item.id === id)).filter(Boolean);
  return items.length ? { type: "property_cards", items } : null;
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

// Deliberately returns configuration presence only—never secret values.
const getAssistantStatus = async (req, res) => {
  const endpoint = String(process.env.AI_ASSISTANT_URL || "").trim();
  res.json({
    success: true,
    data: {
      proxy_configured: Boolean(endpoint),
      shared_secret_configured: Boolean(process.env.AI_ASSISTANT_SHARED_SECRET),
      endpoint_origin: endpoint ? (() => { try { return new URL(endpoint).origin; } catch (_) { return "invalid URL"; } })() : null,
      preview_mode: !endpoint,
    },
  });
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
  const endpoint = String(process.env.AI_ASSISTANT_URL || "").trim();
  if (!endpoint) {
    console.warn("[haven-assistant-proxy] Preview response: AI_ASSISTANT_URL is missing in the running service environment.");
    return { reply: previewReply(message, user && verifiedContext(user.user, user.activeRole)), preview: true };
  }
  let endpointOrigin = "invalid URL";
  try { endpointOrigin = new URL(endpoint).origin; } catch (_) {}
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  try {
    const context = user && verifiedContext(user.user, user.activeRole);
    const delegation_token = user ? createDelegationToken(user.user, user.activeRole, null, conversation._id.toString()) : null;
    console.info(`[haven-assistant-proxy] Forwarding chat request to ${endpointOrigin}; authenticated=${Boolean(user)}.`);
    const response = await fetch(endpoint, {
      method: "POST",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...(process.env.AI_ASSISTANT_SHARED_SECRET && { "X-Haven-Integration-Secret": process.env.AI_ASSISTANT_SHARED_SECRET }) },
      body: JSON.stringify({ conversation_id: conversation._id.toString(), message, context, delegation_token }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || typeof body.reply !== "string") {
      console.warn(`[haven-assistant-proxy] Upstream responded with HTTP ${response.status}; valid_reply=${typeof body.reply === "string"}.`);
      throw new Error("Assistant service unavailable");
    }
    console.info(`[haven-assistant-proxy] Upstream response accepted from ${endpointOrigin}.`);
    const reply = body.reply.slice(0, 4000);
    return { reply, ui: assistantUi(body.ui) || await cardsFromListingLinks(reply), preview: false };
  } catch (error) {
    console.error(`[haven-assistant-proxy] Upstream request failed for ${endpointOrigin}: ${error.name || "Error"} ${error.message || ""}`);
    throw error;
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
    res.json({ success: true, data: { conversation_id: conversation._id, reply: result.reply, ui: result.ui || null, preview: result.preview } });
  } catch (error) {
    res.status(502).json({ success: false, message: "The Haven assistant is temporarily unavailable. Please try again." });
  }
};

module.exports = { createConversation, getAssistantStatus, sendMessage };
