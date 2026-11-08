const mongoose = require("mongoose");

const leaseSchema = new mongoose.Schema({
  application_id: { type: mongoose.Schema.Types.ObjectId, ref: "RentalApplication", default: null },
  property_id: { type: mongoose.Schema.Types.ObjectId, ref: "Property", default: null },
  house_id: { type: mongoose.Schema.Types.ObjectId, ref: "House", required: true, index: true },
  landlord_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  tenant_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  rent_amount: { type: Number, required: true, min: 0 },
  deposit_amount: { type: Number, min: 0, default: 0 },
  currency: { type: String, default: "NGN", uppercase: true },
  payment_frequency: { type: String, enum: ["monthly", "quarterly", "yearly"], default: "monthly" },
  start_date: { type: Date, required: true },
  end_date: { type: Date, required: true },
  signed_document: String,
  status: { type: String, enum: ["draft", "active", "ended", "terminated"], default: "draft", index: true },
}, { timestamps: true });

module.exports = mongoose.model("Lease", leaseSchema);
