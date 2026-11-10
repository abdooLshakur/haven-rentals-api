const crypto = require("crypto");
const AgentApiKey = require("../models/AgentApiKey");
const AgentAuditLog = require("../models/AgentAuditLog");
const AgentDraft = require("../models/AgentDraft");
const Property = require("../models/propertymodels");
const House = require("../models/HouseModel");
const Enquiry = require("../models/Enquiries");
const ViewingAppointment = require("../models/TourModel");
const RentalApplication = require("../models/RentalApplication");
const MaintenanceRequest = require("../models/MaintenanceRequest");
const { hashKey } = require("../middleware/agentAuth");

const AVAILABLE_SCOPES = [
  "properties:read", "enquiries:read", "enquiries:write", "viewings:read",
  "viewings:propose_reschedule", "applications:read", "maintenance:read", "marketing:drafts",
];

const applyListingIntentFilter = (filter, intent) => {
  if (intent === "sale") filter.listing_intent = "sale";
  if (intent === "rent") filter.$and = [...(filter.$and || []), { $or: [{ listing_intent: "rent" }, { listing_intent: { $exists: false } }] }];
};

const audit = (req, action, outcome, resource = {}, details = {}) => AgentAuditLog.create({
  api_key_id: req.agentKey._id, action, outcome, resource_type: resource.type, resource_id: resource.id?.toString(),
  ip_address: req.ip, details,
});

const listKeys = async (req, res) => {
  const keys = await AgentApiKey.find({ created_by: req.user._id }).select("-key_hash").sort({ createdAt: -1 });
  res.json({ success: true, data: keys, available_scopes: AVAILABLE_SCOPES });
};

const createKey = async (req, res) => {
  const { name, scopes = [], expires_at } = req.body;
  if (!name || !Array.isArray(scopes) || !scopes.length) return res.status(400).json({ success: false, message: "A key name and at least one scope are required" });
  const invalidScopes = scopes.filter((scope) => !AVAILABLE_SCOPES.includes(scope));
  if (invalidScopes.length) return res.status(400).json({ success: false, message: `Invalid scopes: ${invalidScopes.join(", ")}` });
  if (expires_at && Number.isNaN(new Date(expires_at).getTime())) return res.status(400).json({ success: false, message: "expires_at must be a valid date" });
  const rawKey = `hr_ai_${crypto.randomBytes(32).toString("base64url")}`;
  const key = await AgentApiKey.create({ name, key_prefix: rawKey.slice(0, 14), key_hash: hashKey(rawKey), scopes, created_by: req.user._id, expires_at: expires_at || null });
  res.status(201).json({ success: true, message: "Copy this API key now. It will not be shown again.", data: { id: key._id, name: key.name, key: rawKey, key_prefix: key.key_prefix, scopes: key.scopes, expires_at: key.expires_at } });
};

const revokeKey = async (req, res) => {
  const key = await AgentApiKey.findOne({ _id: req.params.id, created_by: req.user._id });
  if (!key) return res.status(404).json({ success: false, message: "Agent API key not found" });
  key.revoked_at = new Date();
  await key.save();
  res.json({ success: true, message: "Agent API key revoked" });
};

const agentCapabilities = async (req, res) => res.json({ success: true, data: { scopes: req.agentKey.scopes, safeguards: ["No payment approval", "No account management", "No outbound marketing sends", "All agent calls are audited"] } });

const listProperties = async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.location) filter.location = new RegExp(req.query.location, "i");
  if (req.query.area) filter["address.area"] = new RegExp(req.query.area, "i");
  if (req.query.city) filter["address.city"] = new RegExp(req.query.city, "i");
  if (req.query.state) filter["address.state"] = new RegExp(req.query.state, "i");
  applyListingIntentFilter(filter, req.query.listing_intent);
  if (req.query.price_period) filter.price_period = req.query.price_period;
  const minPrice = req.query.min_price || req.query.min_rent;
  const maxPrice = req.query.max_price || req.query.max_rent;
  if (minPrice || maxPrice) {
    filter.valuation = {};
    if (minPrice) filter.valuation.$gte = Number(minPrice);
    if (maxPrice) filter.valuation.$lte = Number(maxPrice);
  }
  if (req.query.min_bedrooms) filter.bedrooms = { $gte: Number(req.query.min_bedrooms) };
  const [properties, houses] = await Promise.all([
    Property.find(filter).select("name type location address bedrooms bathrooms valuation listing_intent price_period currency status map_url nearby_landmarks amenities images").limit(100),
    House.find(filter).select("name type location address bedrooms bathrooms valuation listing_intent price_period currency status map_url nearby_landmarks amenities images").limit(100),
  ]);
  await audit(req, "properties.list", "success", {}, { count: properties.length + houses.length });
  res.json({ success: true, data: [...properties.map((item) => ({ ...item.toObject(), listing_kind: "property" })), ...houses.map((item) => ({ ...item.toObject(), listing_kind: "house" }))] });
};

const listEnquiries = async (req, res) => {
  const filter = req.query.status ? { status: req.query.status } : {};
  if (req.query.search) filter.$or = ["full_name", "email", "phone", "message"].map((field) => ({ [field]: new RegExp(req.query.search, "i") }));
  const enquiries = await Enquiry.find(filter).populate("property_id", "name location").populate("house_id", "name location").sort({ date_created: -1 }).limit(100);
  await audit(req, "enquiries.list", "success", {}, { count: enquiries.length });
  res.json({ success: true, data: enquiries });
};

const updateEnquiry = async (req, res) => {
  const allowed = ["new", "contacted", "qualified", "closed", "archived"];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ success: false, message: "Choose a valid enquiry status" });
  const enquiry = await Enquiry.findByIdAndUpdate(req.params.id, { status: req.body.status }, { new: true });
  if (!enquiry) return res.status(404).json({ success: false, message: "Enquiry not found" });
  await audit(req, "enquiries.update_status", "success", { type: "enquiry", id: enquiry._id }, { status: enquiry.status });
  res.json({ success: true, data: enquiry });
};

const listViewings = async (req, res) => {
  const filter = req.query.status ? { status: req.query.status } : {};
  const viewings = await ViewingAppointment.find(filter).populate("property_id", "name location").populate("house_id", "name location").sort({ scheduled_at: 1 }).limit(100);
  await audit(req, "viewings.list", "success", {}, { count: viewings.length });
  res.json({ success: true, data: viewings });
};

const proposeReschedule = async (req, res) => {
  const proposed = new Date(req.body.proposed_scheduled_at);
  if (Number.isNaN(proposed.getTime()) || proposed <= new Date()) return res.status(400).json({ success: false, message: "A future proposed_scheduled_at is required" });
  const viewing = await ViewingAppointment.findById(req.params.id);
  if (!viewing) return res.status(404).json({ success: false, message: "Viewing not found" });
  if (!["requested", "reschedule_proposed"].includes(viewing.status)) return res.status(400).json({ success: false, message: "This viewing cannot be rescheduled" });
  viewing.status = "reschedule_proposed";
  viewing.proposed_scheduled_at = proposed;
  viewing.reschedule_note = req.body.note || "A new viewing time has been proposed.";
  viewing.responded_at = new Date();
  await viewing.save();
  await audit(req, "viewings.propose_reschedule", "success", { type: "viewing", id: viewing._id }, { proposed_scheduled_at: proposed });
  res.json({ success: true, message: "Reschedule proposed. The tenant must accept it.", data: viewing });
};

const listApplications = async (req, res) => {
  const filter = req.query.status ? { status: req.query.status } : {};
  const applications = await RentalApplication.find(filter).populate("tenant_id", "first_name last_name email phone").populate("property_id", "name location").populate("house_id", "name location").sort({ createdAt: -1 }).limit(100);
  await audit(req, "applications.list", "success", {}, { count: applications.length });
  res.json({ success: true, data: applications });
};

const listMaintenance = async (req, res) => {
  const filter = req.query.status ? { status: req.query.status } : {};
  const requests = await MaintenanceRequest.find(filter).populate("house_id", "name location").populate("tenant_id", "first_name last_name phone").sort({ createdAt: -1 }).limit(100);
  await audit(req, "maintenance.list", "success", {}, { count: requests.length });
  res.json({ success: true, data: requests });
};

const createDraft = async (req, res) => {
  const { type, enquiry_id, subject, message } = req.body;
  if (!["marketing_follow_up", "customer_care_reply"].includes(type) || !subject || !message) return res.status(400).json({ success: false, message: "A valid type, subject, and message are required" });
  if (enquiry_id && !(await Enquiry.exists({ _id: enquiry_id }))) return res.status(404).json({ success: false, message: "Enquiry not found" });
  const draft = await AgentDraft.create({ type, enquiry_id: enquiry_id || null, subject, message, created_by_key_id: req.agentKey._id });
  await audit(req, "marketing.create_draft", "success", { type: "agent_draft", id: draft._id }, { draft_type: type });
  res.status(201).json({ success: true, message: "Draft saved for human approval. Nothing has been sent.", data: draft });
};

module.exports = { AVAILABLE_SCOPES, listKeys, createKey, revokeKey, agentCapabilities, listProperties, listEnquiries, updateEnquiry, listViewings, proposeReschedule, listApplications, listMaintenance, createDraft };
