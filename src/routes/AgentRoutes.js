const router = require("express").Router();
const controller = require("../controllers/AgentController");
const { authenticate, allowRoles } = require("../middleware/auth");
const { authenticateAgent, requireAgentScope } = require("../middleware/agentAuth");

router.get("/agent/access-keys", authenticate, allowRoles("admin"), controller.listKeys);
router.post("/agent/access-keys", authenticate, allowRoles("admin"), controller.createKey);
router.delete("/agent/access-keys/:id", authenticate, allowRoles("admin"), controller.revokeKey);

router.use("/agent", authenticateAgent);
router.get("/agent/capabilities", controller.agentCapabilities);
router.get("/agent/properties", requireAgentScope("properties:read"), controller.listProperties);
router.get("/agent/enquiries", requireAgentScope("enquiries:read"), controller.listEnquiries);
router.patch("/agent/enquiries/:id", requireAgentScope("enquiries:write"), controller.updateEnquiry);
router.get("/agent/viewings", requireAgentScope("viewings:read"), controller.listViewings);
router.post("/agent/viewings/:id/propose-reschedule", requireAgentScope("viewings:propose_reschedule"), controller.proposeReschedule);
router.get("/agent/applications", requireAgentScope("applications:read"), controller.listApplications);
router.get("/agent/maintenance", requireAgentScope("maintenance:read"), controller.listMaintenance);
router.post("/agent/drafts", requireAgentScope("marketing:drafts"), controller.createDraft);

module.exports = router;
