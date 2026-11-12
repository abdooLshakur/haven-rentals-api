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
const Lease = require("../models/Lease");
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
  acting_user_id: req.delegatedUser?._id || null, active_role: req.delegatedContext?.active_role || null,
  ip_address: req.ip, details,
});

const actorRole = (req) => req.delegatedContext?.active_role;
const listingIdsFor = async (user, role) => {
  const query = role === "landlord" ? { landlord_id: user._id } : role === "agent" ? { agent_id: user._id } : null;
  if (!query) return { properties: [], houses: [] };
  const [properties, houses] = await Promise.all([Property.find(query).select("_id"), House.find(query).select("_id")]);
  return { properties: properties.map((item) => item._id), houses: houses.map((item) => item._id) };
};
const relatedListingFilter = ({ properties, houses }) => ({ $or: [{ property_id: { $in: properties } }, { house_id: { $in: houses } }] });
const scopedListingFilter = (req, filter = {}) => {
  const role = actorRole(req);
  if (!role || role === "tenant") return { ...filter, status: "available" };
  if (role === "landlord") return { ...filter, landlord_id: req.delegatedUser._id };
  if (role === "agent") return { ...filter, agent_id: req.delegatedUser._id };
  return filter;
};

const enquiryFilterFor = async (req) => {
  const role = actorRole(req);
  if (role === "tenant") return { user_id: req.delegatedUser._id };
  if (role === "admin") return {};
  const ids = await listingIdsFor(req.delegatedUser, role);
  return role === "agent" ? { assigned_agent_id: req.delegatedUser._id } : relatedListingFilter(ids);
};
const viewingFilterFor = async (req) => {
  const role = actorRole(req);
  if (role === "tenant") return { client_id: req.delegatedUser._id };
  if (role === "admin") return {};
  if (role === "agent") return { agent_id: req.delegatedUser._id };
  return relatedListingFilter(await listingIdsFor(req.delegatedUser, role));
};
const applicationFilterFor = async (req) => {
  const role = actorRole(req);
  if (role === "tenant") return { tenant_id: req.delegatedUser._id };
  if (role === "admin") return {};
  return relatedListingFilter(await listingIdsFor(req.delegatedUser, role));
};
const maintenanceFilterFor = async (req) => {
  const role = actorRole(req);
  if (role === "tenant") return { tenant_id: req.delegatedUser._id };
  if (role === "admin") return {};
  if (role === "agent") return { assigned_agent_id: req.delegatedUser._id };
  const leases = await Lease.find({ landlord_id: req.delegatedUser._id }).select("_id");
  return { lease_id: { $in: leases.map((lease) => lease._id) } };
};

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
  let filter = scopedListingFilter(req);
  if (req.query.status && ["landlord", "agent", "admin"].includes(actorRole(req))) filter.status = req.query.status;
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
  const appUrl = (process.env.PUBLIC_APP_URL || "https://haven-rentals-tau.vercel.app").replace(/\/$/, "");
  const serialize = (item, listing_kind) => ({ ...item.toObject(), listing_kind, property_page_url: `${appUrl}/#/home/${item._id}` });
  res.json({ success: true, data: [...properties.map((item) => serialize(item, "property")), ...houses.map((item) => serialize(item, "house"))] });
};

const listEnquiries = async (req, res) => {
  const filter = await enquiryFilterFor(req);
  if (req.query.status) filter.status = req.query.status;
  if (req.query.search) filter.$or = ["full_name", "email", "phone", "message"].map((field) => ({ [field]: new RegExp(req.query.search, "i") }));
  const enquiries = await Enquiry.find(filter).populate("property_id", "name location").populate("house_id", "name location").sort({ date_created: -1 }).limit(100);
  await audit(req, "enquiries.list", "success", {}, { count: enquiries.length });
  res.json({ success: true, data: enquiries });
};

const updateEnquiry = async (req, res) => {
  const allowed = ["new", "contacted", "qualified", "closed", "archived"];
  if (!allowed.includes(req.body.status)) return res.status(400).json({ success: false, message: "Choose a valid enquiry status" });
  if (!["landlord", "admin"].includes(actorRole(req))) return res.status(403).json({ success: false, message: "This role cannot update enquiries" });
  const enquiry = await Enquiry.findOneAndUpdate({ _id: req.params.id, ...(await enquiryFilterFor(req)) }, { status: req.body.status }, { new: true });
  if (!enquiry) return res.status(404).json({ success: false, message: "Enquiry not found" });
  await audit(req, "enquiries.update_status", "success", { type: "enquiry", id: enquiry._id }, { status: enquiry.status });
  res.json({ success: true, data: enquiry });
};

const listViewings = async (req, res) => {
  const filter = await viewingFilterFor(req);
  if (req.query.status) filter.status = req.query.status;
  const viewings = await ViewingAppointment.find(filter).populate("property_id", "name location").populate("house_id", "name location").sort({ scheduled_at: 1 }).limit(100);
  await audit(req, "viewings.list", "success", {}, { count: viewings.length });
  res.json({ success: true, data: viewings });
};

const proposeReschedule = async (req, res) => {
  if (!["landlord", "agent", "admin"].includes(actorRole(req))) return res.status(403).json({ success: false, message: "This role cannot propose a reschedule" });
  const proposed = new Date(req.body.proposed_scheduled_at);
  if (Number.isNaN(proposed.getTime()) || proposed <= new Date()) return res.status(400).json({ success: false, message: "A future proposed_scheduled_at is required" });
  const viewing = await ViewingAppointment.findOne({ _id: req.params.id, ...(await viewingFilterFor(req)) });
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
  const filter = await applicationFilterFor(req);
  if (req.query.status) filter.status = req.query.status;
  const applications = await RentalApplication.find(filter).populate("tenant_id", "first_name last_name email phone").populate("property_id", "name location").populate("house_id", "name location").sort({ createdAt: -1 }).limit(100);
  await audit(req, "applications.list", "success", {}, { count: applications.length });
  res.json({ success: true, data: applications });
};

const listMaintenance = async (req, res) => {
  const filter = await maintenanceFilterFor(req);
  if (req.query.status) filter.status = req.query.status;
  const requests = await MaintenanceRequest.find(filter).populate("house_id", "name location").populate("tenant_id", "first_name last_name phone").sort({ createdAt: -1 }).limit(100);
  await audit(req, "maintenance.list", "success", {}, { count: requests.length });
  res.json({ success: true, data: requests });
};

const createDraft = async (req, res) => {
  const { type, enquiry_id, subject, message } = req.body;
  if (!["marketing_follow_up", "customer_care_reply"].includes(type) || !subject || !message) return res.status(400).json({ success: false, message: "A valid type, subject, and message are required" });
  if (!["landlord", "admin"].includes(actorRole(req))) return res.status(403).json({ success: false, message: "This role cannot create marketing drafts" });
  if (enquiry_id && !(await Enquiry.exists({ _id: enquiry_id, ...(await enquiryFilterFor(req)) }))) return res.status(404).json({ success: false, message: "Enquiry not found" });
  const draft = await AgentDraft.create({ type, enquiry_id: enquiry_id || null, subject, message, created_by_key_id: req.agentKey._id });
  await audit(req, "marketing.create_draft", "success", { type: "agent_draft", id: draft._id }, { draft_type: type });
  res.status(201).json({ success: true, message: "Draft saved for human approval. Nothing has been sent.", data: draft });
};

module.exports = { AVAILABLE_SCOPES, listKeys, createKey, revokeKey, agentCapabilities, listProperties, listEnquiries, updateEnquiry, listViewings, proposeReschedule, listApplications, listMaintenance, createDraft };
