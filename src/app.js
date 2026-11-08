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

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
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

app.use((error, req, res, next) => {
  if (error) return res.status(400).json({ success: false, message: error.message || "Request could not be processed" });
  next();
});

app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

module.exports = app;
