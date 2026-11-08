const ContactMessage = require("../models/ContactMessage");

const createContactMessage = async (req, res) => {
  try {
    const { full_name, email, subject, message } = req.body;
    if (!full_name || !email || !subject || !message) {
      return res.status(400).json({ success: false, message: "Name, email, subject, and message are required" });
    }
    const contactMessage = await ContactMessage.create(req.body);
    res.status(201).json({ success: true, message: "Your message has been received", data: contactMessage });
  } catch (error) {
    res.status(400).json({ success: false, message: "We could not send your message", error: error.message });
  }
};

const listContactMessages = async (req, res) => {
  const messages = await ContactMessage.find().sort({ createdAt: -1 });
  res.json({ success: true, data: messages });
};

module.exports = { createContactMessage, listContactMessages };
