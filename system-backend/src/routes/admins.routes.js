const router = require("express").Router();
const ctrl = require("../controllers/admins.controller");
const { optionalToken } = require("../middleware/auth.middleware");

router.use(optionalToken);

router.get("/", ctrl.getAdmins);
router.get("/:id", ctrl.getAdmin);
router.post("/", ctrl.createAdmin);
router.put("/:id", ctrl.updateAdmin);
router.delete("/:id", ctrl.deleteAdmin);

module.exports = router;