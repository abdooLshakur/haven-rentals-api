const Maintenance = require("../models/MaintenanceRequest");
const Lease = require("../models/Lease");
const Favorite = require("../models/Favorite");
const Notification = require("../models/Notification");
const { createNotification } = require("../services/notifications");

const createMaintenance = async (req, res) => {
  const lease = await Lease.findOne({ _id: req.body.lease_id, tenant_id: req.user._id, status: "active" });
  if (!lease) return res.status(400).json({ success: false, message: "An active tenant lease is required" });
  const request = await Maintenance.create({ ...req.body, tenant_id: req.user._id, house_id: lease.house_id });
  await createNotification(lease.landlord_id, "maintenance_request", "New maintenance request", `${req.user.first_name} ${req.user.last_name} reported: ${request.title}.`, "/dashboard/maintenance");
  res.status(201).json({ success: true, data: request });
};

const listMaintenance = async (req, res) => {
  let filter = req.user.role === "tenant" ? { tenant_id: req.user._id } : req.user.role === "agent" ? { assigned_agent_id: req.user._id } : {};
  if (req.user.role === "landlord") {
    const leases = await Lease.find({ landlord_id: req.user._id }).select("_id");
    filter = { lease_id: { $in: leases.map((lease) => lease._id) } };
  }
  if (req.query.status) filter.status = req.query.status;
  const data = await Maintenance.find(filter).populate("house_id", "name location").populate("tenant_id", "first_name last_name phone").sort({ createdAt: -1 });
  res.json({ success: true, data });
};

const updateMaintenance = async (req, res) => {
  const request = await Maintenance.findById(req.params.id).populate("lease_id");
  if (!request) return res.status(404).json({ success: false, message: "Maintenance request not found" });
  const canUpdate = req.user.role === "admin" || request.lease_id.landlord_id.toString() === req.user.id || request.assigned_agent_id?.toString() === req.user.id;
  if (!canUpdate) return res.status(403).json({ success: false, message: "You cannot update this maintenance request" });
  ["status", "assigned_agent_id", "resolution_notes", "priority"].forEach((field) => { if (req.body[field] !== undefined) request[field] = req.body[field]; });
  await request.save();
  await createNotification(request.tenant_id, "maintenance_update", "Maintenance request updated", `${request.title} is now ${request.status.replace("_", " ")}.`, "/dashboard/maintenance");
  res.json({ success: true, data: request });
};

const toggleFavorite = async (req, res) => {
  if (!req.body.property_id && !req.body.house_id) return res.status(400).json({ success: false, message: "A property_id or house_id is required" });
  const filter = { tenant_id: req.user._id, property_id: req.body.property_id || null, house_id: req.body.house_id || null };
  const existing = await Favorite.findOne(filter);
  if (existing) { await existing.deleteOne(); return res.json({ success: true, saved: false }); }
  await Favorite.create(filter);
  res.status(201).json({ success: true, saved: true });
};

const listFavorites = async (req, res) => res.json({ success: true, data: await Favorite.find({ tenant_id: req.user._id }).populate("property_id").populate("house_id") });
const listNotifications = async (req, res) => res.json({ success: true, data: await Notification.find({ recipient_id: req.user._id }).sort({ createdAt: -1 }) });
const markNotificationRead = async (req, res) => {
  const notification = await Notification.findOneAndUpdate({ _id: req.params.id, recipient_id: req.user._id }, { is_read: true }, { new: true });
  if (!notification) return res.status(404).json({ success: false, message: "Notification not found" });
  res.json({ success: true, data: notification });
};

module.exports = { createMaintenance, listMaintenance, updateMaintenance, toggleFavorite, listFavorites, listNotifications, markNotificationRead };
