const mongoose = require("mongoose");

const maintenanceRequestSchema = new mongoose.Schema({
  lease_id: { type: mongoose.Schema.Types.ObjectId, ref: "Lease", required: true },
  house_id: { type: mongoose.Schema.Types.ObjectId, ref: "House", required: true, index: true },
  tenant_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  assigned_agent_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  title: { type: String, required: true, trim: true },
  description: { type: String, required: true, trim: true },
  photos: [{ type: String }],
  priority: { type: String, enum: ["low", "medium", "high", "emergency"], default: "medium" },
  status: { type: String, enum: ["open", "assigned", "in_progress", "resolved", "closed"], default: "open", index: true },
  resolution_notes: String,
}, { timestamps: true });

module.exports = mongoose.model("MaintenanceRequest", maintenanceRequestSchema);
