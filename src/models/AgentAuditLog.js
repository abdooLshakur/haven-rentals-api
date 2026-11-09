const mongoose = require("mongoose");

const agentAuditLogSchema = new mongoose.Schema({
  api_key_id: { type: mongoose.Schema.Types.ObjectId, ref: "AgentApiKey", required: true, index: true },
  action: { type: String, required: true, trim: true, index: true },
  resource_type: { type: String, trim: true },
  resource_id: { type: String, trim: true },
  outcome: { type: String, enum: ["success", "denied", "failed"], required: true },
  ip_address: { type: String, trim: true },
  details: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

module.exports = mongoose.model("AgentAuditLog", agentAuditLogSchema);
