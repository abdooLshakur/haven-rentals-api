const nodemailer = require("nodemailer");

const smtpConfigured = () => Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.EMAIL_FROM);

let transporter;

const getTransporter = () => {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === "true",
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }
  return transporter;
};

const sendEmail = async ({ to, subject, text, html }) => {
  if (!smtpConfigured()) return { sent: false, reason: "SMTP is not configured" };
  try {
    await getTransporter().sendMail({ from: process.env.EMAIL_FROM, to, subject, text, html });
    return { sent: true };
  } catch (error) {
    console.error("Email delivery failed:", error.message);
    return { sent: false, reason: error.message };
  }
};

module.exports = { sendEmail };
