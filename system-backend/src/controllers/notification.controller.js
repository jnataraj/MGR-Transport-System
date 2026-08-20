const prisma = require("../prisma/prisma");
const { triggerNotification } = require("../utils/notification");
const {
  getMissingAlerts,
  getActiveMissingAlerts,
  closeAlertById,
} = require("../services/missingAlertService");

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

// GET /api/notifications/route-alerts
// Query params: ?today=true (default: true for dashboard), ?routeId=..., ?date=...
exports.getRouteAlerts = async (req, res) => {
  try {
    const { today, routeId, date, type } = req.query;

    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    const where = {};
    if (routeId) where.routeId = routeId;
    if (type) where.notificationType = type;

    // By default or when today === 'true', fetch today's route alerts
    if (today === "true" || today === true || (!date && today !== "false")) {
      where.OR = [
        { createdAt: { gte: startOfDay, lte: endOfDay } },
        { effectiveDate: todayStr },
      ];
    } else if (date) {
      where.OR = [
        { effectiveDate: date },
        {
          createdAt: {
            gte: new Date(new Date(date).setHours(0, 0, 0, 0)),
            lte: new Date(new Date(date).setHours(23, 59, 59, 999)),
          },
        },
      ];
    }

    const [routeAlerts, driverIssuesToday, maintenanceAlertsToday, missingAlertsToday] = await Promise.all([
      prisma.routeNotification.findMany({
        where,
        orderBy: { createdAt: "desc" },
      }),
      prisma.issue.findMany({
        where: { createdAt: { gte: startOfDay, lte: endOfDay } },
        orderBy: { createdAt: "desc" },
      }),
      prisma.maintenanceAlert.findMany({
        where: { createdAt: { gte: startOfDay, lte: endOfDay } },
        orderBy: { createdAt: "desc" },
      }),
      getMissingAlerts({ today: true }),
    ]);

    const formattedToday = now.toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

    const totalAlertsCount =
      routeAlerts.length +
      driverIssuesToday.length +
      maintenanceAlertsToday.length +
      missingAlertsToday.length;

    return res.status(200).json({
      success: true,
      routeAlerts,
      driverIssues: driverIssuesToday,
      adminAlerts: maintenanceAlertsToday,
      missingAlerts: missingAlertsToday,
      totals: {
        total: totalAlertsCount,
        route: routeAlerts.length,
        driver: driverIssuesToday.length,
        admin: maintenanceAlertsToday.length,
        missing: missingAlertsToday.length,
        activeMissing: missingAlertsToday.filter((m) => m.status === "ACTIVE").length,
      },
      today: formattedToday,
    });
  } catch (error) {
    console.error("getRouteAlerts Error:", error);
    return res.status(500).json({ success: false, message: error.message, routeAlerts: [] });
  }
};

// GET /api/notifications/missing-alerts
exports.fetchMissingAlerts = async (req, res) => {
  try {
    const { today = true, date, status, studentId, vehicleId, limit } = req.query;
    const alerts = await getMissingAlerts({ today, date, status, studentId, vehicleId, limit });
    return res.status(200).json({
      success: true,
      missingAlerts: alerts,
      count: alerts.length,
      activeCount: alerts.filter((a) => a.status === "ACTIVE").length,
    });
  } catch (error) {
    console.error("fetchMissingAlerts Error:", error);
    return res.status(500).json({ success: false, message: error.message, missingAlerts: [] });
  }
};

// GET /api/notifications/missing-alerts/active
exports.fetchActiveMissingAlerts = async (req, res) => {
  try {
    const activeAlerts = await getActiveMissingAlerts();
    return res.status(200).json({
      success: true,
      activeAlerts,
      count: activeAlerts.length,
    });
  } catch (error) {
    console.error("fetchActiveMissingAlerts Error:", error);
    return res.status(500).json({ success: false, message: error.message, activeAlerts: [] });
  }
};

// PUT /api/notifications/missing-alerts/:id/resolve
exports.resolveMissingAlert = async (req, res) => {
  try {
    const { id } = req.params;
    const { reason = "Resolved by Admin" } = req.body;
    const io = req.app.get("io");

    const resolved = await closeAlertById(id, reason, io);
    if (!resolved) {
      return res.status(404).json({ success: false, message: "Alert not found or already closed" });
    }

    return res.status(200).json({
      success: true,
      message: "Missing alert resolved successfully",
      alert: resolved,
    });
  } catch (error) {
    console.error("resolveMissingAlert Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};


// POST /api/notifications/route-alerts
exports.createRouteAlert = async (req, res) => {
  try {
    const {
      routeId,
      routeName,
      vehicleIds,
      vehicleNumbers,
      notificationType = "RouteChange",
      effectiveDate,
      effectiveTime,
      duration,
      updatedRoute,
      pickupChange,
      dropChange,
      customMessage,
      adminId,
      adminName,
    } = req.body;

    const now = new Date();
    const finalEffectiveDate = effectiveDate || `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    const finalEffectiveTime = effectiveTime || now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
    const finalRouteName = routeName || "All Zones (Tamil Nadu)";
    const finalRouteId = routeId || (routeName ? routeName.toLowerCase().replace(/\s+/g, "-") : "all-routes");

    // Calculate stakeholders snapshot
    let studentCount = 0;
    let parentCount = 0;
    let driverCount = 0;
    let coordinatorCount = 0;

    try {
      if (finalRouteName && finalRouteName !== "All Zones (Tamil Nadu)") {
        const vehiclesOnRoute = await prisma.vehicle.findMany({
          where: { route: finalRouteName },
          include: {
            assignedStudents: true,
            assignedCoordinators: true,
            driver: true,
          },
        });

        studentCount = vehiclesOnRoute.reduce((acc, v) => acc + (v.assignedStudents?.length || 0), 0);
        parentCount = studentCount;
        driverCount = vehiclesOnRoute.filter((v) => v.driverId).length;
        coordinatorCount = vehiclesOnRoute.reduce((acc, v) => acc + (v.assignedCoordinators?.length || 0), 0);
      } else {
        const [students, drivers, coords] = await Promise.all([
          prisma.user.count({ where: { role: "student" } }),
          prisma.user.count({ where: { role: "driver" } }),
          prisma.user.count({ where: { role: "coordinator" } }),
        ]);
        studentCount = students;
        parentCount = students;
        driverCount = drivers;
        coordinatorCount = coords;
      }
    } catch (countErr) {
      console.warn("Stakeholder count estimation warning:", countErr.message);
    }

    const routeAlert = await prisma.routeNotification.create({
      data: {
        routeId: finalRouteId,
        routeName: finalRouteName,
        vehicleIdsJson: JSON.stringify(vehicleIds || []),
        vehicleNumbersJson: JSON.stringify(vehicleNumbers || []),
        notificationType: notificationType || "RouteChange",
        effectiveDate: finalEffectiveDate,
        effectiveTime: finalEffectiveTime,
        duration: duration || null,
        updatedRoute: updatedRoute || null,
        pickupChange: pickupChange || null,
        dropChange: dropChange || null,
        customMessage: customMessage || `${notificationType} alert for ${finalRouteName}`,
        totalStudents: studentCount,
        totalParents: parentCount,
        totalDrivers: driverCount,
        totalCoordinators: coordinatorCount,
        stakeholdersJson: JSON.stringify({ studentCount, parentCount, driverCount, coordinatorCount }),
        status: "sent",
        adminId: adminId || req.user?.id || "admin",
        adminName: adminName || req.user?.name || "Super Admin",
      },
    });

    const io = req.app.get("io");
    if (io) {
      io.emit("new_route_alert", routeAlert);
      io.emit("new_notification", {
        id: routeAlert.id,
        title: finalRouteName,
        message: customMessage || `${notificationType} on ${finalRouteName}`,
        type: notificationType,
        sender: adminName || "Admin",
        target: "all",
        createdAt: routeAlert.createdAt,
      });
    }

    return res.status(201).json({
      success: true,
      message: "Route alert created successfully",
      alert: routeAlert,
    });
  } catch (error) {
    console.error("createRouteAlert Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};
