const router = require("express").Router();
const controller = require("../controllers/AppointmentController");
const { authenticate, optionalAuthenticate, allowRoles } = require("../middleware/auth");

router.post("/appointments", optionalAuthenticate, controller.requestAppointment);
router.get("/appointments", authenticate, controller.listAppointments);
router.patch("/appointments/:id", authenticate, allowRoles("tenant", "landlord", "agent", "admin"), controller.updateAppointment);

module.exports = router;
