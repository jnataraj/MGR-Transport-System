const router = require("express").Router();
const ctrl = require("../controllers/adminSections.controller");

router.get("/", ctrl.getSections);
router.post("/", ctrl.createSection);
router.put("/:id", ctrl.updateSection);
router.delete("/:id", ctrl.deleteSection);
router.post("/:id/incharge", ctrl.setIncharge);
router.delete("/:id/incharge", ctrl.removeIncharge);

module.exports = router;