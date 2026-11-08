const Property = require("../models/propertymodels");
const User = require("../models/UserModel");
const mongoose = require("mongoose");

const coordinatesFromMapUrl = (mapUrl) => {
  if (!mapUrl) return undefined;
  const coordinateMatch = mapUrl.match(/@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/)
    || mapUrl.match(/[?&](?:q|query|ll)=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/);
  if (!coordinateMatch) return undefined;
  const latitude = Number(coordinateMatch[1]);
  const longitude = Number(coordinateMatch[2]);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return undefined;
  return { type: "Point", coordinates: [longitude, latitude] };
};

const pagination = (query) => ({ page: Math.max(Number(query.page) || 1, 1), limit: Math.min(Math.max(Number(query.limit) || 12, 1), 100) });

const createProperty = async (req, res) => {
  try {
    const { type, name, location } = req.body;
    if (!type || !name || !location) return res.status(400).json({ success: false, message: "Type, name, and location are required" });
    const geoLocation = req.body.geo_location || coordinatesFromMapUrl(req.body.map_url);
    const property = await Property.create({ ...req.body, ...(geoLocation && { geo_location: geoLocation }), landlord_id: req.user._id, status: req.body.status || "draft" });
    res.status(201).json({ success: true, message: "Property created successfully", data: property });
  } catch (error) {
    res.status(400).json({ success: false, message: "Failed to create property", error: error.message });
  }
};

const importProperties = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "Choose a JSON file to import" });
    const parsed = JSON.parse(req.file.buffer.toString("utf8"));
    const records = Array.isArray(parsed) ? parsed : parsed.properties;
    if (!Array.isArray(records) || !records.length) return res.status(400).json({ success: false, message: "JSON must contain a non-empty property array" });
    if (records.length > 500) return res.status(400).json({ success: false, message: "Import at most 500 properties at a time" });

    const properties = records.map((record, index) => {
      if (!record || !record.name || !record.type || !record.location) {
        throw new Error(`Record ${index + 1} needs name, type, and location`);
      }
      if (record.landlord_id && !mongoose.isValidObjectId(record.landlord_id)) {
        throw new Error(`Record ${index + 1} has an invalid landlord_id`);
      }
      const geoLocation = record.geo_location || coordinatesFromMapUrl(record.map_url);
      return {
        landlord_id: req.user.role === "admin" && record.landlord_id ? record.landlord_id : req.user._id,
        agent_id: record.agent_id || null,
        type: record.type,
        name: record.name,
        description: record.description,
        location: record.location,
        address: record.address,
        ...(geoLocation && { geo_location: geoLocation }),
        map_url: record.map_url,
        nearby_landmarks: Array.isArray(record.nearby_landmarks) ? record.nearby_landmarks : [],
        measurement: record.measurement,
        bedrooms: record.bedrooms,
        bathrooms: record.bathrooms,
        valuation: record.valuation,
        currency: record.currency || "NGN",
        images: Array.isArray(record.images) ? record.images : [],
        amenities: Array.isArray(record.amenities) ? record.amenities : [],
        status: record.status || "draft",
      };
    });
    const inserted = await Property.insertMany(properties, { ordered: true });
    res.status(201).json({ success: true, message: `${inserted.length} properties imported successfully`, data: { imported: inserted.length } });
  } catch (error) {
    res.status(400).json({ success: false, message: "Property import failed", error: error.message });
  }
};

const listProperties = async (req, res) => {
  const { page, limit } = pagination(req.query);
  const filter = {};
  if (req.query.status) filter.status = req.query.status;
  if (req.query.location) filter.location = new RegExp(req.query.location, "i");
  if (req.query.type) filter.type = req.query.type;
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
  const [properties, total] = await Promise.all([
    Property.find(filter).populate("landlord_id", "first_name last_name phone").populate("agent_id", "first_name last_name phone").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
    Property.countDocuments(filter),
  ]);
  res.json({ success: true, data: properties, meta: { page, limit, total } });
};

const listMyProperties = async (req, res) => {
  const filter = req.user.role === "admin" ? {} : { landlord_id: req.user._id };
  const properties = await Property.find(filter)
    .populate("landlord_id", "first_name last_name email phone")
    .populate("agent_id", "first_name last_name phone")
    .sort({ createdAt: -1 });
  res.json({ success: true, data: properties });
};

const getProperty = async (req, res) => {
  const property = await Property.findById(req.params.id).populate("landlord_id", "first_name last_name phone").populate("agent_id", "first_name last_name phone");
  if (!property) return res.status(404).json({ success: false, message: "Property not found" });
  res.json({ success: true, data: property });
};

const updateProperty = async (req, res) => {
  const property = await Property.findById(req.params.id);
  if (!property) return res.status(404).json({ success: false, message: "Property not found" });
  const canManage = req.user.role === "admin"
    || property.landlord_id.toString() === req.user.id
    || (req.user.role === "agent" && property.agent_id?.toString() === req.user.id);
  if (!canManage) return res.status(403).json({ success: false, message: "You cannot update this property" });
  const editable = ["type", "name", "description", "location", "address", "geo_location", "map_url", "nearby_landmarks", "measurement", "bedrooms", "bathrooms", "valuation", "currency", "images", "amenities", "status"];
  editable.forEach((field) => { if (req.body[field] !== undefined) property[field] = req.body[field]; });
  if (req.body.map_url && req.body.geo_location === undefined) property.geo_location = coordinatesFromMapUrl(req.body.map_url) || property.geo_location;
  await property.save();
  res.json({ success: true, message: "Property updated successfully", data: property });
};

const assignAgent = async (req, res) => {
  const property = await Property.findById(req.params.id);
  if (!property) return res.status(404).json({ success: false, message: "Property not found" });
  if (req.user.role !== "admin" && property.landlord_id.toString() !== req.user.id) return res.status(403).json({ success: false, message: "You cannot assign this property" });
  if (!req.body.agent_id) {
    property.agent_id = null;
    await property.save();
    return res.json({ success: true, message: "Agent assignment cleared", data: property });
  }
  const agent = await User.findOne({ _id: req.body.agent_id, role: "agent", is_active: true });
  if (!agent) return res.status(404).json({ success: false, message: "Active agent not found" });
  property.agent_id = agent._id;
  await property.save();
  res.json({ success: true, message: "Agent assigned successfully", data: property });
};

module.exports = { createProperty, importProperties, listProperties, listMyProperties, getProperty, updateProperty, assignAgent };
