const router = require("express").Router();
const { createContactMessage, listContactMessages } = require("../controllers/ContactController");
const { authenticate, allowRoles } = require("../middleware/auth");

router.post("/contact", createContactMessage);
router.get("/contact", authenticate, allowRoles("admin"), listContactMessages);

module.exports = router;
