const express = require("express");
const router = express.Router();
const busRouteChangeController = require("../controllers/busRouteChange.controller");
const { verifyToken } = require("../middleware/auth.middleware");

// DRIVER: Generate or fetch active Bus/Route Change Common QR Session
router.post(
  "/qr/session",
  verifyToken,
  busRouteChangeController.createOrGetDriverQRSession
);

// DRIVER: Get active session with live student counts
router.get(
  "/qr/active",
  verifyToken,
  busRouteChangeController.getActiveDriverQRSession
);

// DRIVER: Close / Deactivate active QR session
router.post(
  "/qr/close",
  verifyToken,
  busRouteChangeController.closeDriverQRSession
);

// STUDENT: Validate scanned QR Code token
router.post(
  "/qr/validate",
  verifyToken,
  busRouteChangeController.validateScannedQR
);

// STUDENT: Confirm Bus/Route change transaction
router.post(
  "/confirm",
  verifyToken,
  busRouteChangeController.confirmBusRouteChange
);

// ADMIN / DRIVER: View all change history
router.get(
  "/history",
  verifyToken,
  busRouteChangeController.getBusRouteChangeHistory
);

// STUDENT: View own change history
router.get(
  "/history/my",
  verifyToken,
  busRouteChangeController.getMyBusRouteChangeHistory
);

module.exports = router;
