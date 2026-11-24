const Enquiry = require("../models/Enquiries");
const Property = require("../models/propertymodels");
const House = require("../models/HouseModel");
const User = require("../models/UserModel");

const validateTarget = async ({ property_id, house_id }) => {
  if (!property_id && !house_id) return "A property_id or house_id is required";
  if (property_id && !(await Property.exists({ _id: property_id }))) return "Property not found";
  if (house_id && !(await House.exists({ _id: house_id }))) return "Rental unit not found";
  return null;
};

const createEnquiry = async (req, res) => {
  try {
    const { full_name, email, phone, message, property_id, house_id } = req.body;
    if (!full_name || !email || !phone || !message) return res.status(400).json({ success: false, message: "Name, email, phone, and message are required" });
    const targetError = await validateTarget({ property_id, house_id });
    if (targetError) return res.status(400).json({ success: false, message: targetError });
    const enquiry = await Enquiry.create({ ...req.body, user_id: req.user?._id });
    res.status(201).json({ success: true, message: "Enquiry created successfully", data: enquiry });
  } catch (error) {
    res.status(400).json({ success: false, message: "Failed to create enquiry", error: error.message });
  }
};

const listEnquiries = async (req, res) => {
  const filter = req.user.role === "admin" ? {} : { $or: [{ assigned_agent_id: req.user._id }] };
  if (req.user.role === "landlord") {
    const [properties, houses] = await Promise.all([Property.find({ landlord_id: req.user._id }).select("_id"), House.find({ landlord_id: req.user._id }).select("_id")]);
    filter.$or = [{ property_id: { $in: properties.map((item) => item._id) } }, { house_id: { $in: houses.map((item) => item._id) } }];
  }
  if (req.query.status) filter.status = req.query.status;
  const enquiries = await Enquiry.find(filter).populate("property_id", "name location").populate("house_id", "name location").populate("assigned_agent_id", "first_name last_name").sort({ date_created: -1 });
  res.json({ success: true, data: enquiries });
};

const canManageEnquiry = async (enquiry, user) => {
  if (user.role === "admin") return true;
  if (user.role === "agent") return enquiry.assigned_agent_id?.toString() === user.id;
  if (user.role !== "landlord") return false;
  if (enquiry.property_id) return Boolean(await Property.exists({ _id: enquiry.property_id, landlord_id: user._id }));
  if (enquiry.house_id) return Boolean(await House.exists({ _id: enquiry.house_id, landlord_id: user._id }));
  return false;
};

const updateEnquiry = async (req, res) => {
  const enquiry = await Enquiry.findById(req.params.id);
  if (!enquiry) return res.status(404).json({ success: false, message: "Enquiry not found" });
  if (!(await canManageEnquiry(enquiry, req.user))) return res.status(404).json({ success: false, message: "Enquiry not found" });
  if (req.body.status) {
    const statuses = ["new", "contacted", "qualified", "closed", "archived"];
    if (!statuses.includes(req.body.status)) return res.status(400).json({ success: false, message: "Choose a valid enquiry status" });
    enquiry.status = req.body.status;
  }
  if (req.body.assigned_agent_id) {
    if (!["admin", "landlord"].includes(req.user.role)) return res.status(403).json({ success: false, message: "Only a landlord or administrator can assign an agent" });
    const agent = await User.findOne({ _id: req.body.assigned_agent_id, role: "agent", is_active: true });
    if (!agent) return res.status(404).json({ success: false, message: "Active agent not found" });
    enquiry.assigned_agent_id = agent._id;
  }
  await enquiry.save();
  res.json({ success: true, message: "Enquiry updated successfully", data: enquiry });
};

module.exports = { createEnquiry, listEnquiries, updateEnquiry };
