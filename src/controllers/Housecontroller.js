const House = require("../models/HouseModel");
const Property = require("../models/propertymodels");
const User = require("../models/UserModel");

const createHouse = async (req, res) => {
  try {
    const { name, location, valuation, property_id } = req.body;
    if (!name || !location || valuation === undefined) return res.status(400).json({ success: false, message: "Name, location, and valuation are required" });
    if (property_id) {
      const property = await Property.findById(property_id);
      if (!property) return res.status(404).json({ success: false, message: "Property not found" });
      if (req.user.role !== "admin" && property.landlord_id.toString() !== req.user.id) return res.status(403).json({ success: false, message: "You cannot add a unit to this property" });
    }
    const house = await House.create({ ...req.body, landlord_id: req.user._id });
    res.status(201).json({ success: true, message: "Rental unit created successfully", data: house });
  } catch (error) {
    res.status(400).json({ success: false, message: "Failed to create rental unit", error: error.message });
  }
};

const getAllHouses = async (req, res) => {
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.property_id) filter.property_id = req.query.property_id;
  if (req.query.location) filter.location = new RegExp(req.query.location, "i");
  if (req.query.state) filter["address.state"] = new RegExp(req.query.state, "i");
  if (req.query.city) filter["address.city"] = new RegExp(req.query.city, "i");
  if (req.query.area) filter["address.area"] = new RegExp(req.query.area, "i");
  if (req.query.local_government) filter["address.local_government"] = new RegExp(req.query.local_government, "i");
  if (req.query.min_rent || req.query.max_rent) {
    filter.valuation = {};
    if (req.query.min_rent) filter.valuation.$gte = Number(req.query.min_rent);
    if (req.query.max_rent) filter.valuation.$lte = Number(req.query.max_rent);
  }
  if (req.query.min_bedrooms) filter.bedrooms = { $gte: Number(req.query.min_bedrooms) };
  if (req.query.min_bathrooms) filter.bathrooms = { $gte: Number(req.query.min_bathrooms) };
  const houses = await House.find(filter).populate("property_id", "name location").populate("agent_id", "first_name last_name phone").sort({ createdAt: -1 });
  res.json({ success: true, data: houses });
};

const getSingleHouse = async (req, res) => {
  const house = await House.findById(req.params.id).populate("property_id", "name location").populate("agent_id", "first_name last_name phone");
  if (!house) return res.status(404).json({ success: false, message: "Rental unit not found" });
  res.json({ success: true, data: house });
};

const assignAgent = async (req, res) => {
  const house = await House.findById(req.params.id);
  if (!house) return res.status(404).json({ success: false, message: "Rental unit not found" });
  if (req.user.role !== "admin" && house.landlord_id.toString() !== req.user.id) return res.status(403).json({ success: false, message: "You cannot assign this rental unit" });
  const agent = await User.findOne({ _id: req.body.agent_id, role: "agent", is_active: true });
  if (!agent) return res.status(404).json({ success: false, message: "Active agent not found" });
  house.agent_id = agent._id;
  await house.save();
  res.json({ success: true, message: "Agent assigned successfully", data: house });
};

module.exports = { createHouse, getAllHouses, getSingleHouse, assignAgent };
