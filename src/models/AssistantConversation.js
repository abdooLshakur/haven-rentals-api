const mongoose = require("mongoose");

const assistantConversationSchema = new mongoose.Schema({
  owner_user_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null, index: true },
  guest_token_hash: { type: String, select: false },
  active_role: { type: String, enum: ["tenant", "landlord", "agent", "admin"], default: null },
  messages: [{
    role: { type: String, enum: ["user", "assistant"], required: true },
    content: { type: String, required: true, trim: true, maxlength: 4000 },
    created_at: { type: Date, default: Date.now },
  }],
}, { timestamps: true });

module.exports = mongoose.model("AssistantConversation", assistantConversationSchema);
