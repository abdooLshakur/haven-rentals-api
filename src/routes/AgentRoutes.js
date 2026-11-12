const router = require("express").Router();
const controller = require("../controllers/AgentController");
const { authenticate, allowRoles } = require("../middleware/auth");
const { authenticateAgent, requireAgentScope, requireUserDelegation, optionalUserDelegation } = require("../middleware/agentAuth");
const { requireIdempotency } = require("../middleware/idempotency");

router.get("/agent/access-keys", authenticate, allowRoles("admin"), controller.listKeys);
router.post("/agent/access-keys", authenticate, allowRoles("admin"), controller.createKey);
router.delete("/agent/access-keys/:id", authenticate, allowRoles("admin"), controller.revokeKey);

router.use("/agent", authenticateAgent);
router.get("/agent/capabilities", controller.agentCapabilities);
router.get("/agent/properties", requireAgentScope("properties:read"), optionalUserDelegation, controller.listProperties);
router.get("/agent/enquiries", requireAgentScope("enquiries:read"), requireUserDelegation, controller.listEnquiries);
router.patch("/agent/enquiries/:id", requireAgentScope("enquiries:write"), requireUserDelegation, requireIdempotency("enquiry.update"), controller.updateEnquiry);
router.get("/agent/viewings", requireAgentScope("viewings:read"), requireUserDelegation, controller.listViewings);
router.post("/agent/viewings/:id/propose-reschedule", requireAgentScope("viewings:propose_reschedule"), requireUserDelegation, requireIdempotency("viewing.propose_reschedule"), controller.proposeReschedule);
router.get("/agent/applications", requireAgentScope("applications:read"), requireUserDelegation, controller.listApplications);
router.get("/agent/maintenance", requireAgentScope("maintenance:read"), requireUserDelegation, controller.listMaintenance);
router.post("/agent/drafts", requireAgentScope("marketing:drafts"), requireUserDelegation, requireIdempotency("draft.create"), controller.createDraft);

module.exports = router;
