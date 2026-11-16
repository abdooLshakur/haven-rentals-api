const router = require("express").Router();
const controller = require("../controllers/AssistantController");
const { optionalAuthenticate } = require("../middleware/auth");
const { assistantRateLimit } = require("../middleware/assistantRateLimit");

router.post("/assistant/conversations", optionalAuthenticate, assistantRateLimit, controller.createConversation);
router.post("/assistant/conversations/:id/messages", optionalAuthenticate, assistantRateLimit, controller.sendMessage);

module.exports = router;
