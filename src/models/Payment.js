const mongoose = require("mongoose");

const paymentSchema = new mongoose.Schema({
  lease_id: { type: mongoose.Schema.Types.ObjectId, ref: "Lease", default: null, index: true },
  application_id: { type: mongoose.Schema.Types.ObjectId, ref: "RentalApplication", default: null, index: true },
  property_id: { type: mongoose.Schema.Types.ObjectId, ref: "Property", default: null, index: true },
  house_id: { type: mongoose.Schema.Types.ObjectId, ref: "House", default: null, index: true },
  tenant_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  amount: { type: Number, required: true, min: 0 },
  currency: { type: String, default: "NGN", uppercase: true },
  type: { type: String, enum: ["rent", "deposit", "fee", "refund"], default: "rent" },
  due_date: Date,
  paid_at: Date,
  submitted_at: Date,
  method: { type: String, enum: ["bank_transfer", "card", "cash", "other"], default: "bank_transfer" },
  reference: { type: String, trim: true, index: true },
  evidence: [{ type: String }],
  status: { type: String, enum: ["pending", "submitted", "paid", "overdue", "failed", "refunded"], default: "pending", index: true },
}, { timestamps: true });

module.exports = mongoose.model("Payment", paymentSchema);
