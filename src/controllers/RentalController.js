const Application = require("../models/RentalApplication");
const Lease = require("../models/Lease");
const Payment = require("../models/Payment");
const House = require("../models/HouseModel");
const Property = require("../models/propertymodels");
const { createNotification } = require("../services/notifications");

const ownedHouse = (house, user) => user.role === "admin" || house.landlord_id.toString() === user.id;
const paymentListing = async (payment) => {
  const property = payment.property_id && await Property.findById(payment.property_id);
  const house = payment.house_id && await House.findById(payment.house_id);
  return { property, house, landlordId: property?.landlord_id || house?.landlord_id || payment.lease_id?.landlord_id };
};

const createApplication = async (req, res) => {
  const { property_id, house_id } = req.body;
  if (!property_id && !house_id) return res.status(400).json({ success: false, message: "A property_id or house_id is required" });
  const rentalListing = { status: "available", $or: [{ listing_intent: "rent" }, { listing_intent: { $exists: false } }] };
  if (house_id && !(await House.exists({ _id: house_id, ...rentalListing }))) return res.status(400).json({ success: false, message: "Available rental unit not found" });
  if (property_id && !(await Property.exists({ _id: property_id, ...rentalListing }))) return res.status(400).json({ success: false, message: "This listing is not available to rent" });
  const application = await Application.create({ ...req.body, tenant_id: req.user._id });
  const listing = property_id ? await Property.findById(property_id) : await House.findById(house_id);
  await createNotification(listing?.landlord_id, "application_submitted", "New rental application", `${req.user.first_name} ${req.user.last_name} submitted an application.`, "/dashboard/applications");
  res.status(201).json({ success: true, data: application });
};

const listApplications = async (req, res) => {
  let filter = { tenant_id: req.user._id };
  if (["landlord", "admin", "agent"].includes(req.user.role)) filter = {};
  if (req.user.role === "landlord") {
    const [houses, properties] = await Promise.all([House.find({ landlord_id: req.user._id }).select("_id"), Property.find({ landlord_id: req.user._id }).select("_id")]);
    filter = { $or: [{ house_id: { $in: houses.map((house) => house._id) } }, { property_id: { $in: properties.map((property) => property._id) } }] };
  }
  if (req.query.status) filter.status = req.query.status;
  const data = await Application.find(filter).populate("tenant_id", "first_name last_name email phone").populate("house_id", "name location").populate("property_id", "name location").sort({ createdAt: -1 });
  res.json({ success: true, data });
};

const reviewApplication = async (req, res) => {
  const application = await Application.findById(req.params.id);
  if (!application) return res.status(404).json({ success: false, message: "Application not found" });
  if (req.user.role === "tenant") {
    if (application.tenant_id.toString() !== req.user.id || req.body.action !== "withdraw") return res.status(403).json({ success: false, message: "You cannot update this application" });
    application.status = "withdrawn";
    await application.save();
    return res.json({ success: true, data: application });
  }
  const house = application.house_id && await House.findById(application.house_id);
  const property = application.property_id && await Property.findById(application.property_id);
  const canReview = req.user.role === "admin" || house?.landlord_id.toString() === req.user.id || property?.landlord_id.toString() === req.user.id;
  if (!canReview) return res.status(403).json({ success: false, message: "You cannot review this application" });
  if (!["under_review", "approved", "rejected"].includes(req.body.status)) return res.status(400).json({ success: false, message: "Choose a valid application decision" });
  const listing = property || house;
  if (req.body.status === "approved" && listing?.status !== "available") return res.status(400).json({ success: false, message: "This listing is no longer available" });
  application.status = req.body.status;
  application.review_notes = req.body.review_notes;
  application.reviewed_by = req.user._id;
  await application.save();
  if (application.status === "approved") {
    const existingPayment = await Payment.findOne({ application_id: application._id, status: { $in: ["pending", "submitted"] } });
    if (!existingPayment) {
      await Payment.create({
        application_id: application._id,
        property_id: application.property_id,
        house_id: application.house_id,
        tenant_id: application.tenant_id,
        amount: listing.valuation,
        currency: listing.currency,
        type: "rent",
        status: "pending",
      });
    }
    listing.status = "reserved";
    await listing.save();
  }
  const paymentMessage = application.status === "approved" ? " Your rent payment request is ready in Payments." : "";
  await createNotification(application.tenant_id, "application_update", "Application updated", `Your rental application is now ${application.status.replace("_", " ")}.${paymentMessage}`, application.status === "approved" ? "/dashboard/payments" : "/dashboard/applications");
  res.json({ success: true, data: application });
};

const createLease = async (req, res) => {
  const house = await House.findById(req.body.house_id);
  if (!house) return res.status(404).json({ success: false, message: "Rental unit not found" });
  if (!ownedHouse(house, req.user)) return res.status(403).json({ success: false, message: "You cannot create this lease" });
  if (req.body.application_id) {
    const application = await Application.findById(req.body.application_id);
    if (!application || application.status !== "approved") return res.status(400).json({ success: false, message: "An approved application is required" });
  }
  const lease = await Lease.create({ ...req.body, landlord_id: house.landlord_id, property_id: house.property_id });
  if (lease.status === "active") house.status = "rented";
  await house.save();
  res.status(201).json({ success: true, data: lease });
};

const listLeases = async (req, res) => {
  const filter = req.user.role === "tenant" ? { tenant_id: req.user._id } : req.user.role === "landlord" ? { landlord_id: req.user._id } : {};
  const data = await Lease.find(filter).populate("house_id", "name location").populate("tenant_id", "first_name last_name email phone").sort({ end_date: 1 });
  res.json({ success: true, data });
};

const createPayment = async (req, res) => {
  const lease = await Lease.findById(req.body.lease_id);
  if (!lease) return res.status(404).json({ success: false, message: "Lease not found" });
  if (req.user.role !== "admin" && lease.landlord_id.toString() !== req.user.id) return res.status(403).json({ success: false, message: "You cannot create this payment" });
  const payment = await Payment.create({ ...req.body, tenant_id: lease.tenant_id });
  res.status(201).json({ success: true, data: payment });
};

const listPayments = async (req, res) => {
  let filter = {};
  if (req.user.role === "tenant") filter = { tenant_id: req.user._id };
  if (req.user.role === "landlord") {
    const [leases, houses, properties] = await Promise.all([Lease.find({ landlord_id: req.user._id }).select("_id"), House.find({ landlord_id: req.user._id }).select("_id"), Property.find({ landlord_id: req.user._id }).select("_id")]);
    filter = { $or: [{ lease_id: { $in: leases.map((lease) => lease._id) } }, { house_id: { $in: houses.map((house) => house._id) } }, { property_id: { $in: properties.map((property) => property._id) } }] };
  }
  const data = await Payment.find(filter).populate("lease_id", "rent_amount currency landlord_id").populate("property_id", "name location").populate("house_id", "name location").sort({ createdAt: -1 });
  res.json({ success: true, data });
};

const updatePayment = async (req, res) => {
  const payment = await Payment.findById(req.params.id).populate("lease_id");
  if (!payment) return res.status(404).json({ success: false, message: "Payment not found" });
  const listing = await paymentListing(payment);
  if (req.user.role !== "admin" && listing.landlordId?.toString() !== req.user.id) return res.status(403).json({ success: false, message: "You cannot update this payment" });
  ["status", "reference", "method", "paid_at"].forEach((field) => { if (req.body[field] !== undefined) payment[field] = req.body[field]; });
  if (payment.status === "paid" && !payment.paid_at) payment.paid_at = new Date();
  await payment.save();
  if (payment.status === "paid") {
    if (listing.property) { listing.property.status = "rented"; await listing.property.save(); }
    if (listing.house) { listing.house.status = "rented"; await listing.house.save(); }
  }
  if (payment.status === "failed") {
    if (listing.property?.status === "reserved") { listing.property.status = "available"; await listing.property.save(); }
    if (listing.house?.status === "reserved") { listing.house.status = "available"; await listing.house.save(); }
  }
  await createNotification(payment.tenant_id, "payment_update", "Payment updated", `Your payment is now ${payment.status}.`, "/dashboard/payments");
  res.json({ success: true, data: payment });
};

const submitPayment = async (req, res) => {
  const payment = await Payment.findById(req.params.id).populate("lease_id");
  if (!payment) return res.status(404).json({ success: false, message: "Payment not found" });
  if (payment.tenant_id.toString() !== req.user.id) return res.status(403).json({ success: false, message: "You cannot submit this payment" });
  if (!["pending", "overdue"].includes(payment.status)) return res.status(400).json({ success: false, message: "This payment cannot be submitted" });
  if (!req.body.reference) return res.status(400).json({ success: false, message: "Payment reference is required" });
  if (!Array.isArray(req.body.evidence) || !req.body.evidence.length) return res.status(400).json({ success: false, message: "Upload payment evidence before submitting" });
  payment.reference = req.body.reference;
  payment.evidence = req.body.evidence;
  payment.method = req.body.method || payment.method;
  payment.submitted_at = new Date();
  payment.status = "submitted";
  await payment.save();
  const listing = await paymentListing(payment);
  await createNotification(listing.landlordId, "payment_submitted", "Payment awaiting acknowledgement", "A tenant submitted a payment reference for review.", "/dashboard/payments");
  res.json({ success: true, data: payment });
};

module.exports = { createApplication, listApplications, reviewApplication, createLease, listLeases, createPayment, listPayments, updatePayment, submitPayment };
