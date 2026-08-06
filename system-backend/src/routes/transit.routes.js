const express = require("express");
const router = express.Router();
const transitController = require("../controllers/transit.controller");

// GET /api/transit/today - Get today's transit summary (in-transit & dropped count)
router.get("/today", transitController.getTodaySummary);

// GET /api/transit - Fetch transit history with filters
router.get("/", transitController.getTransitHistory);

module.exports = router;
