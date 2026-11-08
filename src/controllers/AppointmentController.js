const ViewingAppointment = require("../models/TourModel");
const Property = require("../models/propertymodels");
const House = require("../models/HouseModel");
const User = require("../models/UserModel");
const { createNotification } = require("../services/notifications");
const { sendEmail } = require("../services/email");

const formatViewingTime = (value) => new Intl.DateTimeFormat("en-NG", {
  dateStyle: "full", timeStyle: "short", timeZone: "Africa/Lagos",
}).format(new Date(value));

const sendViewingEmail = async (appointment, listingName, event) => {
  const proposedTime = appointment.proposed_scheduled_at && formatViewingTime(appointment.proposed_scheduled_at);
  const scheduledTime = formatViewingTime(appointment.scheduled_at);
  const copy = {
    requested: { subject: "We received your viewing request", body: `We received your request to view ${listingName} on ${scheduledTime}. The property team will respond shortly.` },
    confirmed: { subject: "Your viewing is confirmed", body: `Your viewing for ${listingName} is confirmed for ${scheduledTime}.` },
    declined: { subject: "Update on your viewing request", body: `The viewing request for ${listingName} could not be accepted. ${appointment.cancellation_reason || ""}` },
    reschedule_proposed: { subject: "A new viewing time was suggested", body: `The property team suggested ${proposedTime} for your viewing of ${listingName}. ${appointment.reschedule_note || ""}` },
    cancelled: { subject: "Your viewing was cancelled", body: `Your viewing request for ${listingName} has been cancelled.` },
  }[event];
  if (!copy) return;
  await sendEmail({
    to: appointment.email,
    subject: copy.subject,
    text: `Hello ${appointment.full_name},\n\n${copy.body}\n\nHaven Rentals`,
    html: `<p>Hello ${appointment.full_name},</p><p>${copy.body}</p><p>Haven Rentals</p>`,
  });
};

const targetExists = async ({ property_id, house_id }) => {
  if (!property_id && !house_id) return false;
  if (property_id && !(await Property.exists({ _id: property_id }))) return false;
  if (house_id && !(await House.exists({ _id: house_id }))) return false;
  return true;
};

const requestAppointment = async (req, res) => {
  try {
    const { scheduled_at, property_id, house_id, full_name, email, phone } = req.body;
    if (!scheduled_at) return res.status(400).json({ success: false, message: "Choose a viewing time" });
    if (!req.user && (!full_name || !email || !phone)) return res.status(400).json({ success: false, message: "Name, email, and phone are required for a guest viewing request" });
    if (Number.isNaN(new Date(scheduled_at).getTime()) || new Date(scheduled_at) <= new Date()) return res.status(400).json({ success: false, message: "Choose a future appointment time" });
    if (!(await targetExists({ property_id, house_id }))) return res.status(400).json({ success: false, message: "A valid property_id or house_id is required" });
    const appointment = await ViewingAppointment.create({
      ...req.body,
      full_name: req.user ? `${req.user.first_name} ${req.user.last_name}` : full_name,
      email: req.user?.email || email,
      phone: req.user?.phone || phone,
      client_id: req.user?._id || null,
      status: "requested",
    });
    const listing = property_id ? await Property.findById(property_id) : await House.findById(house_id);
    await createNotification(listing?.landlord_id, "viewing_request", "New viewing request", `${appointment.full_name} requested a viewing.`, "/dashboard/viewings");
    await sendViewingEmail(appointment, listing?.name || "the property", "requested");
    res.status(201).json({ success: true, message: "Viewing appointment requested", data: appointment });
  } catch (error) {
    res.status(400).json({ success: false, message: "Failed to request appointment", error: error.message });
  }
};

const listAppointments = async (req, res) => {
  let filter = {};
  if (req.user.role === "agent") filter = { agent_id: req.user._id };
  if (req.user.role === "tenant") filter = { client_id: req.user._id };
  if (req.user.role === "landlord") {
    const [properties, houses] = await Promise.all([Property.find({ landlord_id: req.user._id }).select("_id"), House.find({ landlord_id: req.user._id }).select("_id")]);
    filter = { $or: [{ property_id: { $in: properties.map((item) => item._id) } }, { house_id: { $in: houses.map((item) => item._id) } }] };
  }
  if (req.query.status) filter.status = req.query.status;
  const appointments = await ViewingAppointment.find(filter).populate("property_id", "name location").populate("house_id", "name location").populate("agent_id", "first_name last_name phone").sort({ scheduled_at: 1 });
  res.json({ success: true, data: appointments });
};

const updateAppointment = async (req, res) => {
  const appointment = await ViewingAppointment.findById(req.params.id);
  if (!appointment) return res.status(404).json({ success: false, message: "Viewing appointment not found" });
  const property = appointment.property_id && await Property.findOne({ _id: appointment.property_id, landlord_id: req.user._id });
  const house = appointment.house_id && await House.findOne({ _id: appointment.house_id, landlord_id: req.user._id });
  const isOwner = req.user.role === "admin" || Boolean(property || house);
  const isAssignedAgent = req.user.role === "agent" && appointment.agent_id?.toString() === req.user.id;
  const isTenant = req.user.role === "tenant" && appointment.client_id?.toString() === req.user.id;
  if (!isOwner && !isAssignedAgent && !isTenant) return res.status(403).json({ success: false, message: "You cannot update this appointment" });

  const action = req.body.action;
  if (action === "cancel") {
    if (!isTenant) return res.status(403).json({ success: false, message: "Only the requesting tenant can cancel this viewing" });
    appointment.status = "cancelled";
    appointment.cancellation_reason = req.body.cancellation_reason || "Cancelled by tenant";
  } else if (action === "accept_reschedule") {
    if (!isTenant || appointment.status !== "reschedule_proposed") return res.status(400).json({ success: false, message: "There is no reschedule proposal to accept" });
    appointment.scheduled_at = appointment.proposed_scheduled_at;
    appointment.proposed_scheduled_at = undefined;
    appointment.status = "confirmed";
  } else if (["confirm", "decline", "propose_reschedule"].includes(action)) {
    if (!isOwner && !isAssignedAgent) return res.status(403).json({ success: false, message: "Only the property team can respond to this viewing request" });
    if (action === "confirm") appointment.status = "confirmed";
    if (action === "decline") { appointment.status = "declined"; appointment.cancellation_reason = req.body.cancellation_reason || "Declined by property team"; }
    if (action === "propose_reschedule") {
      const proposedTime = new Date(req.body.proposed_scheduled_at);
      if (Number.isNaN(proposedTime.getTime()) || proposedTime <= new Date()) return res.status(400).json({ success: false, message: "Choose a future rescheduled time" });
      appointment.status = "reschedule_proposed";
      appointment.proposed_scheduled_at = proposedTime;
      appointment.reschedule_note = req.body.reschedule_note;
    }
  } else {
    if (!isOwner && !isAssignedAgent) return res.status(403).json({ success: false, message: "Only the property team can update this viewing" });
    ["scheduled_at", "duration_minutes", "status", "notes", "cancellation_reason"].forEach((field) => {
      if (req.body[field] !== undefined) appointment[field] = req.body[field];
    });
  }
  if (req.body.agent_id) {
    const agent = await User.findOne({ _id: req.body.agent_id, role: "agent", is_active: true });
    if (!agent) return res.status(404).json({ success: false, message: "Active agent not found" });
    appointment.agent_id = agent._id;
  }
  appointment.responded_at = new Date();
  await appointment.save();
  if (appointment.client_id) await createNotification(appointment.client_id, "viewing_update", "Viewing request updated", `Your viewing request is now ${appointment.status.replace("_", " ")}.`, "/dashboard/viewings");
  const listing = appointment.property_id ? await Property.findById(appointment.property_id) : await House.findById(appointment.house_id);
  await sendViewingEmail(appointment, listing?.name || "the property", appointment.status);
  res.json({ success: true, message: "Viewing appointment updated", data: appointment });
};

module.exports = { requestAppointment, listAppointments, updateAppointment };
