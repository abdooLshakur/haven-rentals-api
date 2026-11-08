const mongoose = require("mongoose");

const enquirySchema = new mongoose.Schema(
  {
    property_id: { type: mongoose.Schema.Types.ObjectId, ref: "Property", default: null, index: true },
    house_id: { type: mongoose.Schema.Types.ObjectId, ref: "House", default: null, index: true },
    user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    assigned_agent_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    full_name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    message: { type: String, required: true, trim: true },
    status: { type: String, enum: ["new", "contacted", "qualified", "closed", "archived"], default: "new", index: true },
  },
  { timestamps: { createdAt: "date_created", updatedAt: "updated_at" } }
);

enquirySchema.pre("validate", function validateTarget(next) {
  if (!this.property_id && !this.house_id) {
    this.invalidate("property_id", "A property or house is required");
  }
  next();
});

module.exports = mongoose.model("Enquiry", enquirySchema);
