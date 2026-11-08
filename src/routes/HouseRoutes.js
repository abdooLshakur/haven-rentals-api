const router = require("express").Router();
const controller = require("../controllers/Housecontroller");
const { authenticate, allowRoles } = require("../middleware/auth");

router.get("/houses", controller.getAllHouses);
router.get("/houses/:id", controller.getSingleHouse);
router.post("/houses", authenticate, allowRoles("landlord", "admin"), controller.createHouse);
router.put("/houses/:id/agent", authenticate, allowRoles("landlord", "admin"), controller.assignAgent);

module.exports = router;
