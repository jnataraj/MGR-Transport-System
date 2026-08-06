const router = require("express").Router();
const ctrl = require("../controllers/admins.controller");

router.get("/", ctrl.getAdmins);
router.get("/:id", ctrl.getAdmin);
router.post("/", ctrl.createAdmin);
router.put("/:id", ctrl.updateAdmin);
router.delete("/:id", ctrl.deleteAdmin);

module.exports = router;