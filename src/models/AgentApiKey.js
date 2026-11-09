const mongoose = require("mongoose");

const agentApiKeySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  key_prefix: { type: String, required: true, trim: true },
  key_hash: { type: String, required: true, unique: true, select: false },
  scopes: [{ type: String, required: true }],
  created_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  expires_at: { type: Date, default: null },
  revoked_at: { type: Date, default: null },
  last_used_at: { type: Date, default: null },
}, { timestamps: true });

module.exports = mongoose.model("AgentApiKey", agentApiKeySchema);
