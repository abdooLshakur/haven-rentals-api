const mongoose = require("mongoose");

const viewingAppointmentSchema = new mongoose.Schema(
  {
    property_id: { type: mongoose.Schema.Types.ObjectId, ref: "Property", default: null, index: true },
    house_id: { type: mongoose.Schema.Types.ObjectId, ref: "House", default: null, index: true },
    agent_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
    client_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    full_name: { type: String, required: true, trim: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    scheduled_at: { type: Date, required: true, index: true },
    duration_minutes: { type: Number, default: 30, min: 15, max: 240 },
    status: { type: String, enum: ["requested", "reschedule_proposed", "confirmed", "declined", "cancelled", "completed", "no_show"], default: "requested", index: true },
    notes: { type: String, trim: true },
    cancellation_reason: { type: String, trim: true },
    proposed_scheduled_at: Date,
    reschedule_note: { type: String, trim: true },
    responded_at: Date,
  },
  { timestamps: true }
);

viewingAppointmentSchema.pre("validate", function validateTarget(next) {
  if (!this.property_id && !this.house_id) {
    this.invalidate("property_id", "A property or house is required");
  }
  next();
});

module.exports = mongoose.model("ViewingAppointment", viewingAppointmentSchema);
