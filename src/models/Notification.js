const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema({
  recipient_id: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  type: { type: String, required: true },
  title: { type: String, required: true },
  message: { type: String, required: true },
  link: String,
  is_read: { type: Boolean, default: false, index: true },
}, { timestamps: true });

module.exports = mongoose.model("Notification", notificationSchema);
