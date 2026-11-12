const mongoose = require("mongoose");

const agentIdempotencyKeySchema = new mongoose.Schema({
  api_key_id: { type: mongoose.Schema.Types.ObjectId, ref: "AgentApiKey", required: true },
  acting_user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  operation: { type: String, required: true },
  key_hash: { type: String, required: true },
  state: { type: String, enum: ["processing", "completed"], default: "processing" },
  status_code: Number,
  response: mongoose.Schema.Types.Mixed,
  expires_at: { type: Date, required: true, index: { expires: 0 } },
}, { timestamps: true });

agentIdempotencyKeySchema.index({ api_key_id: 1, acting_user_id: 1, operation: 1, key_hash: 1 }, { unique: true });

module.exports = mongoose.model("AgentIdempotencyKey", agentIdempotencyKeySchema);
