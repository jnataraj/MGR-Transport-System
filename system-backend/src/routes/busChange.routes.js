const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/busChange.controller");

router.get("/", ctrl.getBusChanges);
router.post("/", ctrl.createBusChange);

module.exports = router;