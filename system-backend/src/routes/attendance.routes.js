const express = require("express");
const router = express.Router();
const attendanceController = require("../controllers/attendance.controller");

// GET /api/attendance/current - Get today's latest stage for a user (MUST be before "/")
router.get("/driver-status", attendanceController.getDriverStatus);
router.get("/current", attendanceController.getCurrentStatus);

// GET /api/attendance/vehicle-gps-status - Diagnostic: full GPS state for a vehicle
router.get("/vehicle-gps-status", attendanceController.getVehicleGPSStatus);

// GET /api/attendance/bus-location - Live GPS snapshot for student/parent map
router.get("/bus-location", attendanceController.getBusLiveLocation);

// POST /api/attendance - Record QR scan attendance
router.post("/", attendanceController.recordAttendance);

// GET /api/attendance - Fetch attendance records
router.get("/", attendanceController.getAttendanceHistory);

router.get("/department-summary", attendanceController.getDepartmentAttendanceSummary);
router.get("/department-history", attendanceController.getDepartmentAttendanceHistory);

module.exports = router;
