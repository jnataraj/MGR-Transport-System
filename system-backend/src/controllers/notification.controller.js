const prisma = require("../prisma/prisma");
const { triggerNotification } = require("../utils/notification");

// Save/Update user's Expo Push Token
exports.savePushToken = async (req, res) => {
  try {
    const { pushToken } = req.body;
    const userId = req.user.id;

    if (!pushToken) {
      return res.status(400).json({ success: false, message: "Push token is required" });
    }

    const updatedUser = await prisma.user.update({
      where: { id: userId },
      data: { pushToken },
      select: { id: true, name: true, email: true, pushToken: true },
    });

    return res.status(200).json({
      success: true,
      message: "Push token registered successfully",
      user: updatedUser,
    });
  } catch (error) {
    console.error("savePushToken Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Admin sends notification to target audience or single user
exports.sendNotification = async (req, res) => {
  try {
    const { title, message, type = "general", target = "all", userId = null, data = {} } = req.body;

    if (!title || !message) {
      return res.status(400).json({ success: false, message: "Title and message are required" });
    }

    const io = req.app.get("io");
    const sender = req.user?.name || "Admin";

    const notification = await triggerNotification(io, {
      title,
      message,
      type,
      sender,
      target,
      userId,
      data,
    });

    return res.status(201).json({
      success: true,
      message: "Notification sent successfully",
      notification,
    });
  } catch (error) {
    console.error("sendNotification Controller Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Driver/Coordinator triggers SOS -> notifies Maintenance team
exports.sendSOSAlert = async (req, res) => {
  try {
    const { vehicleId, driverId, driverName, role, latitude, longitude } = req.body;
    const io = req.app.get("io");
    const sender = driverName || req.user?.name || "Driver";

    const notification = await triggerNotification(io, {
      title: "🚨 SOS EMERGENCY",
      message: `${sender} (${role || "driver"}) triggered SOS on ${vehicleId || "vehicle"}.`,
      type: "sos",
      sender,
      target: "maintenance",
      data: { vehicleId, driverId, latitude, longitude },
    });

    return res.status(201).json({ success: true, notification });
  } catch (error) {
    console.error("sendSOSAlert Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Driver/Coordinator stops an active SOS -> notifies Maintenance team it's resolved
exports.resolveSOSAlert = async (req, res) => {
  try {
    const { vehicleId, resolvedBy } = req.body;
    const io = req.app.get("io");

    const notification = await triggerNotification(io, {
      title: "✅ SOS Resolved",
      message: `Emergency on ${vehicleId || "vehicle"} has been stopped by ${resolvedBy || "driver"}.`,
      type: "sos_resolved",
      sender: resolvedBy || "Driver",
      target: "maintenance",
      data: { vehicleId },
    });

    return res.status(201).json({ success: true, notification });
  } catch (error) {
    console.error("resolveSOSAlert Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Fetch notifications for logged-in user / role / all
exports.getUserNotifications = async (req, res) => {
  try {
    const userId = req.user.id;
    const userRole = (req.user.role || "").toLowerCase();

    // Fetch notifications matching user, role, or 'all'
    const notifications = await prisma.notification.findMany({
      where: {
        isRead: false,
        OR: [
          { target: "all" },
          { target: userRole },
          { userId: userId },
          ...(userRole.includes("admin") ? [{ target: "admin" }] : []),
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 50,
    });

    return res.status(200).json({
      success: true,
      notifications,
    });
  } catch (error) {
    console.error("getUserNotifications Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

// Mark notification as read
exports.markAsRead = async (req, res) => {
  try {
    const { id } = req.params;

    const notification = await prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });

    return res.status(200).json({
      success: true,
      notification,
    });
  } catch (error) {
    console.error("markAsRead Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
