const express = require("express");
const router = express.Router();
const {
    getSettings,
    updateGpsConfig,
    updateSystemConfig,
} = require("../controllers/settings.controller");

router.get("/", getSettings);
router.put("/gps", updateGpsConfig);
router.put("/system", updateSystemConfig);

module.exports = router;