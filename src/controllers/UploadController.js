const uploadPropertyImages = (req, res) => {
  const images = (req.files || []).map((file) => `/uploads/properties/${file.filename}`);
  res.status(201).json({ success: true, message: "Images uploaded successfully", data: { images } });
};

const uploadPaymentEvidence = (req, res) => {
  const evidence = (req.files || []).map((file) => `/uploads/payment-evidence/${file.filename}`);
  res.status(201).json({ success: true, message: "Payment evidence uploaded successfully", data: { evidence } });
};

module.exports = { uploadPropertyImages, uploadPaymentEvidence };
