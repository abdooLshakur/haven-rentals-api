const express = require("express");
const path = require("path");
const cors = require("cors");
const authRoutes = require("./routes/Routes");
const propertyRoutes = require("./routes/propertyroute");
const houseRoutes = require("./routes/HouseRoutes");
const enquiryRoutes = require("./routes/EnquiresRoute");
const appointmentRoutes = require("./routes/AppointmentRoutes");
const rentalRoutes = require("./routes/RentalRoutes");
const operationsRoutes = require("./routes/OperationsRoutes");
const contactRoutes = require("./routes/ContactRoutes");
const agentRoutes = require("./routes/AgentRoutes");

const app = express();
const allowedOrigins = (process.env.CORS_ORIGINS || "https://haven-rentals-tau.vercel.app,http://localhost:5000")
  .split(",").map((origin) => origin.trim()).filter(Boolean);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Origin is not allowed"));
  },
}));
app.use(express.static(path.join(__dirname, "../public")));
app.use("/uploads", express.static(path.join(__dirname, "../uploads")));

app.get("/", (req, res) => {
  res.json({ success: true, message: "House rental API is running" });
});

app.use("/api/v1", authRoutes);
app.use("/api/v1", propertyRoutes);
app.use("/api/v1", houseRoutes);
app.use("/api/v1", enquiryRoutes);
app.use("/api/v1", appointmentRoutes);
app.use("/api/v1", rentalRoutes);
app.use("/api/v1", operationsRoutes);
app.use("/api/v1", contactRoutes);
app.use("/api/v1", agentRoutes);

app.use((error, req, res, next) => {
  if (error) return res.status(400).json({ success: false, message: error.message || "Request could not be processed" });
  next();
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

module.exports = app;
