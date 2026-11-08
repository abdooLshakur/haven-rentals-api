const mongoose = require("mongoose");

const favoriteSchema = new mongoose.Schema({
  tenant_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  property_id: { type: mongoose.Schema.Types.ObjectId, ref: "Property", default: null },
  house_id: { type: mongoose.Schema.Types.ObjectId, ref: "House", default: null },
}, { timestamps: true });

favoriteSchema.index({ tenant_id: 1, property_id: 1, house_id: 1 }, { unique: true });
module.exports = mongoose.model("Favorite", favoriteSchema);
