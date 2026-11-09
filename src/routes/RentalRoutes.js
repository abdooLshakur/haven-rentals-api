const router = require("express").Router();
const controller = require("../controllers/RentalController");
const { authenticate, allowRoles } = require("../middleware/auth");
const { paymentEvidenceUpload } = require("../middleware/upload");
const { uploadPaymentEvidence } = require("../controllers/UploadController");
// Authenticate only rental endpoints. A router-wide middleware here would also
// intercept later /api/v1 routes, including the separately authenticated Agent API.
router.post("/applications", authenticate, allowRoles("tenant"), controller.createApplication);
router.get("/applications", authenticate, controller.listApplications);
router.patch("/applications/:id", authenticate, allowRoles("tenant", "landlord", "admin"), controller.reviewApplication);
router.post("/leases", authenticate, allowRoles("landlord", "admin"), controller.createLease);
router.get("/leases", authenticate, controller.listLeases);
router.post("/payments", authenticate, allowRoles("landlord", "admin"), controller.createPayment);
router.get("/payments", authenticate, controller.listPayments);
router.post("/uploads/payment-evidence", authenticate, allowRoles("tenant"), paymentEvidenceUpload.array("evidence", 4), uploadPaymentEvidence);
router.post("/payments/:id/submit", authenticate, allowRoles("tenant"), controller.submitPayment);
router.patch("/payments/:id", authenticate, allowRoles("landlord", "admin"), controller.updatePayment);
module.exports = router;
