// const express = require("express");
// const router = express.Router();
// const notificationController = require("../controllers/notification.controller");
// const authMiddleware = require("../middleware/auth.middleware");

// // Register Expo Push Token for logged-in user
// router.post("/push-token", authMiddleware.verifyToken, notificationController.savePushToken);

// // Admin send notification
// router.post("/send", authMiddleware.verifyToken, notificationController.sendNotification);

// // Get notifications for logged-in user
// router.get("/", authMiddleware.verifyToken, notificationController.getUserNotifications);

// // Mark notification as read
// router.put("/:id/read", authMiddleware.verifyToken, notificationController.markAsRead);

// module.exports = router;


const express = require("express");
const router = express.Router();
const notificationController = require("../controllers/notification.controller");
const authMiddleware = require("../middleware/auth.middleware");

// Register Expo Push Token for logged-in user
router.post("/push-token", authMiddleware.verifyToken, notificationController.savePushToken);

// Admin send notification
router.post("/send", authMiddleware.verifyToken, notificationController.sendNotification);

// Route alerts / notifications breakdown
router.get("/route-alerts", notificationController.getRouteAlerts);
router.post("/route-alerts", notificationController.createRouteAlert);

// Get notifications for logged-in user
router.get("/", authMiddleware.verifyToken, notificationController.getUserNotifications);

// Mark notification as read
router.put("/:id/read", authMiddleware.verifyToken, notificationController.markAsRead);

// Driver / Coordinator SOS emergency alert -> routed to Maintenance team
router.post("/sos", authMiddleware.verifyToken, notificationController.sendSOSAlert);

// Stop / resolve an active SOS alert
router.post("/sos/resolve", authMiddleware.verifyToken, notificationController.resolveSOSAlert);

module.exports = router;