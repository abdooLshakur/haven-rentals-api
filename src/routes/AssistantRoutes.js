const router = require("express").Router();
const controller = require("../controllers/AssistantController");
const { authenticate, optionalAuthenticate, allowRoles } = require("../middleware/auth");
const { assistantRateLimit } = require("../middleware/assistantRateLimit");

router.get("/assistant/status", authenticate, allowRoles("admin"), controller.getAssistantStatus);
router.post("/assistant/conversations", optionalAuthenticate, assistantRateLimit, controller.createConversation);
router.post("/assistant/conversations/:id/messages", optionalAuthenticate, assistantRateLimit, controller.sendMessage);

module.exports = router;
