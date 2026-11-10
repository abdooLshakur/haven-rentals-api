const router = require("express").Router();
const controller = require("../controllers/OperationsController");
const { authenticate, allowRoles } = require("../middleware/auth");
// Apply normal account authentication to operations routes only. Keeping this
// router-wide would intercept unrelated API routes mounted later in src/app.js.
router.post("/maintenance", authenticate, allowRoles("tenant"), controller.createMaintenance);
router.get("/maintenance", authenticate, controller.listMaintenance);
router.patch("/maintenance/:id", authenticate, allowRoles("landlord", "agent", "admin"), controller.updateMaintenance);
router.post("/favorites", authenticate, allowRoles("tenant"), controller.toggleFavorite);
router.get("/favorites", authenticate, allowRoles("tenant"), controller.listFavorites);
router.get("/notifications", authenticate, controller.listNotifications);
router.patch("/notifications/:id/read", authenticate, controller.markNotificationRead);
module.exports = router;
