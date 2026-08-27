const express = require("express");
const router = express.Router();
const attendanceController = require("../controllers/attendance.controller");
const { verifyToken } = require("../middleware/auth.middleware");

// GET /api/attendance/current - Get today's latest stage for a user (MUST be before "/")
router.get("/driver-status", attendanceController.getDriverStatus);
router.get("/current", attendanceController.getCurrentStatus);

// GET /api/attendance/vehicle-gps-status - Diagnostic: full GPS state for a vehicle
router.get("/vehicle-gps-status", attendanceController.getVehicleGPSStatus);

// GET /api/attendance/live-vehicles - All currently active/online vehicles
router.get("/live-vehicles", attendanceController.getLiveVehicles);

// GET /api/attendance/bus-location - Live GPS snapshot for student/parent map
router.get("/bus-location", attendanceController.getBusLiveLocation);

// GET /api/attendance/dashboard-summary - Boarding summary for admin dashboard (boarded + zones)
router.get("/dashboard-summary", attendanceController.getDashboardBoardingSummary);

// POST /api/attendance/student-location & /student-heartbeat - Update student location & check missing status
router.post("/student-location", attendanceController.recordStudentLocation);
router.post("/student-heartbeat", attendanceController.recordStudentLocation);

// POST /api/attendance/driver-location & /driver-heartbeat - Update driver GPS & heartbeat (foreground/background)
router.post("/driver-location", attendanceController.recordDriverLocation);
router.post("/driver-heartbeat", attendanceController.recordDriverLocation);

// POST /api/attendance - Record QR scan attendance
router.post("/", attendanceController.recordAttendance);

// GET /api/attendance - Fetch attendance records
router.get("/", attendanceController.getAttendanceHistory);

router.get("/department-summary", verifyToken, attendanceController.getDepartmentAttendanceSummary);
router.get("/department-history", verifyToken, attendanceController.getDepartmentAttendanceHistory);

module.exports = router;
