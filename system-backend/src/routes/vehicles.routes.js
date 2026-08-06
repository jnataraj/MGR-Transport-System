const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/vehicles.controller");

router.get("/", ctrl.fetchVehicles);
router.post("/", ctrl.createVehicle);
router.post("/students/assign", ctrl.assignStudentBus);
router.put("/:id", ctrl.updateVehicle);
router.delete("/:id", ctrl.deleteVehicle);

router.get("/:id/members", ctrl.fetchVehicleMembers);
router.post("/:id/assign", ctrl.assignVehicleMembers);
router.delete("/:id/members", ctrl.removeVehicleMember);

module.exports = router;
