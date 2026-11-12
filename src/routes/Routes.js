const router = require("express").Router();
const { register, registerAdmin, login, forgotPassword, resetPassword, getProfile, setActiveRole, createAgentDelegation, logout, listAgents, bootstrapAdmin } = require("../controllers/UserController");
const { authenticate, allowRoles } = require("../middleware/auth");

router.post("/auth/register", register);
router.post("/auth/admin/register", registerAdmin);
router.post("/auth/login", login);
router.post("/auth/logout", authenticate, logout);
router.post("/auth/forgot-password", forgotPassword);
router.post("/auth/reset-password", resetPassword);
router.post("/auth/bootstrap-admin", bootstrapAdmin);
router.get("/auth/me", authenticate, getProfile);
router.post("/auth/active-role", authenticate, setActiveRole);
router.post("/auth/agent-delegation", authenticate, createAgentDelegation);
router.get("/agents", authenticate, allowRoles("landlord", "admin"), listAgents);

module.exports = router;
