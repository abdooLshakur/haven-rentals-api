const mongoose = require("mongoose");

const agentDraftSchema = new mongoose.Schema({
  type: { type: String, enum: ["marketing_follow_up", "customer_care_reply"], required: true },
  enquiry_id: { type: mongoose.Schema.Types.ObjectId, ref: "Enquiry", default: null, index: true },
  subject: { type: String, required: true, trim: true },
  message: { type: String, required: true, trim: true },
  status: { type: String, enum: ["draft", "approved", "rejected"], default: "draft", index: true },
  created_by_key_id: { type: mongoose.Schema.Types.ObjectId, ref: "AgentApiKey", required: true },
  reviewed_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  reviewed_at: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model("AgentDraft", agentDraftSchema);
