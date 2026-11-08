const Notification = require("../models/Notification");

const createNotification = async (recipientId, type, title, message, link) => {
  if (!recipientId) return;
  await Notification.create({ recipient_id: recipientId, type, title, message, link });
};

module.exports = { createNotification };
