const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/busChange.controller");
const { optionalToken } = require("../middleware/auth.middleware");

router.use(optionalToken);

router.get("/", ctrl.getBusChanges);
router.post("/", ctrl.createBusChange);

module.exports = router;