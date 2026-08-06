const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/maintenance.controller");

router.get("/overview", ctrl.getMaintenanceOverview);
router.post("/logs", ctrl.createMaintenanceLog);
router.patch("/logs/:id/resolve", ctrl.resolveMaintenanceLog);

module.exports = router;