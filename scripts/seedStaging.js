/*
 * Seeds fictional data only. This script refuses to run unless it is given a
 * dedicated staging URI and two explicit safety flags. Never point it at production.
 */
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../src/models/UserModel");
const Property = require("../src/models/propertymodels");
const House = require("../src/models/HouseModel");
const Enquiry = require("../src/models/Enquiries");
const ViewingAppointment = require("../src/models/TourModel");
const RentalApplication = require("../src/models/RentalApplication");
const Lease = require("../src/models/Lease");
const MaintenanceRequest = require("../src/models/MaintenanceRequest");
const Payment = require("../src/models/Payment");

const required = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
};

const accountSpecs = [
  { key: "tenantA", first_name: "Ada", last_name: "Okafor", email: "ada.tenant@haven-staging.test", phone: "08030000001", role: "tenant" },
  { key: "tenantB", first_name: "Bola", last_name: "Ibrahim", email: "bola.tenant@haven-staging.test", phone: "08030000002", role: "tenant" },
  { key: "landlordA", first_name: "Chidi", last_name: "Okoro", email: "chidi.landlord@haven-staging.test", phone: "08030000003", role: "landlord" },
  { key: "landlordB", first_name: "Dami", last_name: "Bello", email: "dami.landlord@haven-staging.test", phone: "08030000004", role: "landlord" },
  { key: "admin", first_name: "Admin", last_name: "Haven", email: "admin@haven-staging.test", phone: "08030000005", role: "admin" },
  { key: "staff", first_name: "Seyi", last_name: "Agent", email: "seyi.staff@haven-staging.test", phone: "08030000006", role: "agent" },
];

const run = async () => {
  if (process.env.NODE_ENV !== "staging" || process.env.STAGING_SEED_CONFIRM !== "HAVEN_STAGING_ONLY") {
    throw new Error("Refusing to seed. Set NODE_ENV=staging and STAGING_SEED_CONFIRM=HAVEN_STAGING_ONLY.");
  }
  const uri = required("STAGING_MONGODB_URI");
  const password = required("STAGING_TEST_PASSWORD");
  if (password.length < 12) throw new Error("STAGING_TEST_PASSWORD must be at least 12 characters.");

  await mongoose.connect(uri);
  const existingUsers = await User.find({ email: { $in: accountSpecs.map((account) => account.email) } }).select("_id");
  const existingIds = existingUsers.map((user) => user._id);
  const [existingProperties, existingHouses] = await Promise.all([
    Property.find({ landlord_id: { $in: existingIds } }).select("_id"),
    House.find({ landlord_id: { $in: existingIds } }).select("_id"),
  ]);
  const propertyIds = existingProperties.map((item) => item._id);
  const houseIds = existingHouses.map((item) => item._id);
  const leases = await Lease.find({ $or: [{ landlord_id: { $in: existingIds } }, { tenant_id: { $in: existingIds } }, { house_id: { $in: houseIds } }] }).select("_id");

  await Promise.all([
    Enquiry.deleteMany({ $or: [{ user_id: { $in: existingIds } }, { property_id: { $in: propertyIds } }, { house_id: { $in: houseIds } }] }),
    ViewingAppointment.deleteMany({ $or: [{ client_id: { $in: existingIds } }, { property_id: { $in: propertyIds } }, { house_id: { $in: houseIds } }] }),
    RentalApplication.deleteMany({ $or: [{ tenant_id: { $in: existingIds } }, { property_id: { $in: propertyIds } }, { house_id: { $in: houseIds } }] }),
    MaintenanceRequest.deleteMany({ $or: [{ tenant_id: { $in: existingIds } }, { house_id: { $in: houseIds } }, { lease_id: { $in: leases.map((lease) => lease._id) } }] }),
    Payment.deleteMany({ $or: [{ tenant_id: { $in: existingIds } }, { property_id: { $in: propertyIds } }, { house_id: { $in: houseIds } }, { lease_id: { $in: leases.map((lease) => lease._id) } }] }),
    Lease.deleteMany({ _id: { $in: leases.map((lease) => lease._id) } }),
  ]);
  await Promise.all([Property.deleteMany({ _id: { $in: propertyIds } }), House.deleteMany({ _id: { $in: houseIds } })]);

  const passwordHash = await bcrypt.hash(password, 12);
  const users = {};
  for (const spec of accountSpecs) {
    users[spec.key] = await User.findOneAndUpdate(
      { email: spec.email },
      { ...spec, roles: [spec.role], password: passwordHash, is_active: true, auth_version: 0 },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    );
  }

  const commonAddress = (area, city, state) => ({ area, city, state, country: "Nigeria", formatted_address: `${area}, ${city}, ${state}, Nigeria` });
  const [cedar, lagoon] = await Property.create([
    { landlord_id: users.landlordA._id, agent_id: users.staff._id, name: "Cedar Court", type: "Apartment", location: "Idu, Abuja", address: commonAddress("Idu", "Abuja", "FCT"), bedrooms: 2, bathrooms: 2, valuation: 1200000, listing_intent: "rent", price_period: "annual", currency: "NGN", status: "available", amenities: ["Security", "Parking"] },
    { landlord_id: users.landlordB._id, name: "Lagoon View", type: "House", location: "Lekki, Lagos", address: commonAddress("Lekki", "Lagos", "Lagos"), bedrooms: 3, bathrooms: 3, valuation: 85000000, listing_intent: "sale", price_period: "one_time", currency: "NGN", status: "available", amenities: ["Garden", "Security"] },
  ]);
  const house = await House.create({ property_id: cedar._id, landlord_id: users.landlordA._id, agent_id: users.staff._id, name: "Cedar Court Unit 2", unit_number: "2", location: "Idu, Abuja", address: commonAddress("Idu", "Abuja", "FCT"), bedrooms: 2, bathrooms: 2, valuation: 1200000, listing_intent: "rent", price_period: "annual", currency: "NGN", status: "rented" });
  const application = await RentalApplication.create({ property_id: cedar._id, tenant_id: users.tenantA._id, employment_status: "employed", employer_name: "Example Company", monthly_income: 450000, occupants: 2, status: "under_review" });
  const lease = await Lease.create({ house_id: house._id, property_id: cedar._id, landlord_id: users.landlordA._id, tenant_id: users.tenantA._id, rent_amount: 1200000, deposit_amount: 100000, payment_frequency: "yearly", start_date: new Date("2026-01-01T00:00:00.000Z"), end_date: new Date("2026-12-31T00:00:00.000Z"), status: "active" });
  await Promise.all([
    Enquiry.create({ property_id: cedar._id, user_id: users.tenantA._id, assigned_agent_id: users.staff._id, full_name: "Ada Okafor", email: users.tenantA.email, phone: users.tenantA.phone, message: "Can I view Cedar Court this weekend?", status: "new" }),
    Enquiry.create({ property_id: lagoon._id, user_id: users.tenantB._id, full_name: "Bola Ibrahim", email: users.tenantB.email, phone: users.tenantB.phone, message: "I would like more purchase details.", status: "contacted" }),
    ViewingAppointment.create({ property_id: cedar._id, agent_id: users.staff._id, client_id: users.tenantA._id, full_name: "Ada Okafor", email: users.tenantA.email, phone: users.tenantA.phone, scheduled_at: new Date("2026-12-01T09:30:00.000Z"), status: "requested" }),
    ViewingAppointment.create({ property_id: lagoon._id, client_id: users.tenantB._id, full_name: "Bola Ibrahim", email: users.tenantB.email, phone: users.tenantB.phone, scheduled_at: new Date("2026-12-02T09:30:00.000Z"), status: "confirmed" }),
    MaintenanceRequest.create({ lease_id: lease._id, house_id: house._id, tenant_id: users.tenantA._id, assigned_agent_id: users.staff._id, title: "Kitchen tap leak", description: "A fictional staging request.", priority: "medium", status: "open" }),
    Payment.create({ lease_id: lease._id, application_id: application._id, property_id: cedar._id, house_id: house._id, tenant_id: users.tenantA._id, amount: 1200000, currency: "NGN", type: "rent", status: "pending", due_date: new Date("2026-12-31T00:00:00.000Z") }),
  ]);

  console.log(`Staging seed completed. Accounts: ${accountSpecs.map((account) => account.email).join(", ")}`);
};

run().catch((error) => { console.error(`Staging seed failed: ${error.message}`); process.exitCode = 1; }).finally(() => mongoose.disconnect());
