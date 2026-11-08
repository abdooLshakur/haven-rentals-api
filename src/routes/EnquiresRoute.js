const router = require("express").Router();
const controller = require("../controllers/EnquiriesController");
const { authenticate, allowRoles } = require("../middleware/auth");

router.post("/enquiries", controller.createEnquiry);
router.get("/enquiries", authenticate, allowRoles("landlord", "agent", "admin"), controller.listEnquiries);
router.patch("/enquiries/:id", authenticate, allowRoles("landlord", "agent", "admin"), controller.updateEnquiry);

module.exports = router;
