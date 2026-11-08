const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");

const uploadDirectory = path.join(__dirname, "../../uploads/properties");

const storage = multer.diskStorage({
  destination: (req, file, callback) => {
    fs.mkdirSync(uploadDirectory, { recursive: true });
    callback(null, uploadDirectory);
  },
  filename: (req, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    callback(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${extension}`);
  },
});

const imageUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024, files: 8 },
  fileFilter: (req, file, callback) => {
    if (file.mimetype.startsWith("image/")) return callback(null, true);
    callback(new Error("Only image files are allowed"));
  },
});

const paymentUploadDirectory = path.join(__dirname, "../../uploads/payment-evidence");
const paymentEvidenceUpload = multer({
  storage: multer.diskStorage({
    destination: (req, file, callback) => {
      fs.mkdirSync(paymentUploadDirectory, { recursive: true });
      callback(null, paymentUploadDirectory);
    },
    filename: (req, file, callback) => {
      const extension = path.extname(file.originalname).toLowerCase();
      callback(null, `${Date.now()}-${crypto.randomBytes(8).toString("hex")}${extension}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024, files: 4 },
  fileFilter: (req, file, callback) => {
    if (file.mimetype.startsWith("image/") || file.mimetype === "application/pdf") return callback(null, true);
    callback(new Error("Only image files and PDF documents are allowed"));
  },
});

const propertyImportUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, callback) => {
    if (file.mimetype === "application/json" || path.extname(file.originalname).toLowerCase() === ".json") return callback(null, true);
    callback(new Error("Upload a JSON file"));
  },
});

module.exports = { imageUpload, paymentEvidenceUpload, propertyImportUpload };
