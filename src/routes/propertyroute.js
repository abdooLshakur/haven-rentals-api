const router = require("express").Router();
const controller = require("../controllers/Propertycontroller");
const { authenticate, allowRoles } = require("../middleware/auth");
const { imageUpload, propertyImportUpload } = require("../middleware/upload");
const { uploadPropertyImages } = require("../controllers/UploadController");

router.get("/properties", controller.listProperties);
router.get("/properties/mine", authenticate, allowRoles("landlord", "admin"), controller.listMyProperties);
router.get("/properties/:id", controller.getProperty);
router.post("/uploads/property-images", authenticate, allowRoles("landlord", "admin"), imageUpload.array("images", 8), uploadPropertyImages);
router.post("/properties/import", authenticate, allowRoles("landlord", "admin"), propertyImportUpload.single("file"), controller.importProperties);
router.post("/properties", authenticate, allowRoles("landlord", "admin"), controller.createProperty);
router.patch("/properties/:id", authenticate, allowRoles("landlord", "agent", "admin"), controller.updateProperty);
router.put("/properties/:id/agent", authenticate, allowRoles("landlord", "admin"), controller.assignAgent);

module.exports = router;
