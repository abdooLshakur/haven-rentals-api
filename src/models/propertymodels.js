const mongoose = require("mongoose");

const propertySchema = new mongoose.Schema(
  {
    landlord_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    agent_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    type: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    location: { type: String, required: true, trim: true, index: true },
    address: {
      estate_name: { type: String, trim: true },
      address_line: { type: String, trim: true },
      area: { type: String, trim: true, index: true },
      local_government: { type: String, trim: true, index: true },
      city: { type: String, trim: true, index: true },
      state: { type: String, trim: true, index: true },
      country: { type: String, default: "Nigeria", trim: true },
      postal_code: { type: String, trim: true },
      formatted_address: { type: String, trim: true },
    },
    geo_location: {
      type: { type: String, enum: ["Point"], default: undefined },
      coordinates: {
        type: [Number],
        validate: {
          validator: (value) => !value || (value.length === 2 && value.every(Number.isFinite)),
          message: "Coordinates must be [longitude, latitude]",
        },
      },
    },
    map_url: { type: String, trim: true },
    nearby_landmarks: [{
      name: { type: String, trim: true },
      category: { type: String, enum: ["hospital", "school", "market", "transport", "other"], default: "other" },
      distance_km: { type: Number, min: 0 },
    }],
    measurement: String,
    bedrooms: { type: Number, min: 0 },
    bathrooms: { type: Number, min: 0 },
    valuation: { type: Number, min: 0 },
    currency: { type: String, default: "NGN", uppercase: true, trim: true },
    images: [{ type: String }],
    amenities: [{ type: String, trim: true }],
    status: { type: String, enum: ["draft", "available", "reserved", "rented", "occupied", "inactive"], default: "draft", index: true },
  },
  { timestamps: true }
);

propertySchema.index({ geo_location: "2dsphere" }, { sparse: true });

module.exports = mongoose.model("Property", propertySchema);
