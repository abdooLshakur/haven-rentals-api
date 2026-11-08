const mongoose = require("mongoose");

const userSchema = new mongoose.Schema(
  {
    first_name: { type: String, required: true, trim: true },
    last_name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, required: true, trim: true },
    gender: { type: String, trim: true },
    dob: Date,
    password: { type: String, required: true, select: false },
    password_reset_token_hash: { type: String, select: false },
    password_reset_expires_at: { type: Date, select: false },
    role: { type: String, enum: ["landlord", "agent", "tenant", "admin"], default: "tenant" },
    avatar: String,
    is_active: { type: Boolean, default: true },
  },
  { timestamps: { createdAt: "date_registered", updatedAt: "updated_at" } }
);

module.exports = mongoose.model("User", userSchema);
