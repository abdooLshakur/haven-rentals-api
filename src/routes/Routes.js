const router = require("express").Router();
const { register, login, forgotPassword, resetPassword, getProfile, listAgents } = require("../controllers/UserController");
const { authenticate, allowRoles } = require("../middleware/auth");

router.post("/auth/register", register);
router.post("/auth/login", login);
router.post("/auth/forgot-password", forgotPassword);
router.post("/auth/reset-password", resetPassword);
router.get("/auth/me", authenticate, getProfile);
router.get("/agents", authenticate, allowRoles("landlord", "admin"), listAgents);

module.exports = router;
