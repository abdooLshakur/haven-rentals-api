const router = require("express").Router();
const controller = require("../controllers/AgentController");
const { authenticate, allowRoles } = require("../middleware/auth");
const { authenticateAgent, requireAgentScope, requireUserDelegation, optionalUserDelegation, requireUserPermission } = require("../middleware/agentAuth");
const { requireIdempotency } = require("../middleware/idempotency");
const { agentRateLimit } = require("../middleware/agentRateLimit");

router.get("/agent/access-keys", authenticate, allowRoles("admin"), controller.listKeys);
router.get("/agent/audit-logs", authenticate, allowRoles("admin"), controller.listAuditLogs);
router.post("/agent/access-keys", authenticate, allowRoles("admin"), controller.createKey);
router.delete("/agent/access-keys/:id", authenticate, allowRoles("admin"), controller.revokeKey);

router.use("/agent", authenticateAgent);
router.use("/agent", agentRateLimit);
router.get("/agent/capabilities", controller.agentCapabilities);
router.get("/agent/properties", requireAgentScope("properties:read"), optionalUserDelegation, controller.listProperties);
router.get("/agent/enquiries", requireAgentScope("enquiries:read"), requireUserDelegation, requireUserPermission("enquiries:read"), controller.listEnquiries);
router.patch("/agent/enquiries/:id", requireAgentScope("enquiries:write"), requireUserDelegation, requireUserPermission("enquiries:write"), requireIdempotency("enquiry.update"), controller.updateEnquiry);
router.get("/agent/viewings", requireAgentScope("viewings:read"), requireUserDelegation, requireUserPermission("viewings:read"), controller.listViewings);
router.post("/agent/viewings/:id/propose-reschedule", requireAgentScope("viewings:propose_reschedule"), requireUserDelegation, requireUserPermission("viewings:propose_reschedule"), requireIdempotency("viewing.propose_reschedule"), controller.proposeReschedule);
router.get("/agent/applications", requireAgentScope("applications:read"), requireUserDelegation, requireUserPermission("applications:read"), controller.listApplications);
router.get("/agent/maintenance", requireAgentScope("maintenance:read"), requireUserDelegation, requireUserPermission("maintenance:read"), controller.listMaintenance);
router.post("/agent/drafts", requireAgentScope("marketing:drafts"), requireUserDelegation, requireUserPermission("marketing:drafts"), requireIdempotency("draft.create"), controller.createDraft);

module.exports = router;
