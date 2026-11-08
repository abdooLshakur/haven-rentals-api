const mongoose = require("mongoose");

const rentalApplicationSchema = new mongoose.Schema({
  property_id: { type: mongoose.Schema.Types.ObjectId, ref: "Property", default: null },
  house_id: { type: mongoose.Schema.Types.ObjectId, ref: "House", default: null },
  tenant_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  employment_status: String,
  employer_name: String,
  monthly_income: { type: Number, min: 0 },
  move_in_date: Date,
  occupants: { type: Number, min: 1, default: 1 },
  documents: [{ type: String }],
  notes: String,
  status: { type: String, enum: ["submitted", "under_review", "approved", "rejected", "withdrawn"], default: "submitted", index: true },
  reviewed_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  review_notes: String,
}, { timestamps: true });

rentalApplicationSchema.pre("validate", function validateTarget(next) {
  if (!this.property_id && !this.house_id) this.invalidate("property_id", "A property or house is required");
  next();
});

module.exports = mongoose.model("RentalApplication", rentalApplicationSchema);
