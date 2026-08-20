const prisma = require("../prisma/prisma");
const { getVehicleLocation, calculateDistanceMeters, setVehicleLocation } = require("../utils/vehicleLocationStore");
const { sendPushNotification } = require("../utils/notification");

const MISSING_DISTANCE_THRESHOLD_METERS = 10; // 10 meters rule

// In-memory store of students currently in transit
// studentId -> { studentId, studentName, studentRollNo, vehicleId, vehicleNumber, driverId, driverName, stage, studentLat, studentLng, lastStudentUpdate, activeAlertId }
const inTransitStudents = new Map();

/**
 * Format coordinates nicely for display
 */
const formatCoords = (lat, lng) => {
  if (lat == null || lng == null) return "Unknown";
  return `${parseFloat(lat).toFixed(5)}, ${parseFloat(lng).toFixed(5)}`;
};

/**
 * Resolve exact notification recipients for a Student Missing Alert based on vehicle assignments:
 * 1. Web Admin users (superadmin, admin, deptadmin)
 * 2. Coordinator assigned to the SAME vehicle (assignedVehicleId === studentAssignedVehicleId)
 * 3. Driver assigned to the SAME vehicle (assignedVehicleId === studentAssignedVehicleId)
 * All other users are excluded.
 */
const resolveMissingAlertRecipients = async (studentTransit) => {
  let vehicle = null;
  const studentId = studentTransit?.studentId;

  // 1. Find student's assigned vehicle
  if (studentTransit?.vehicleId || studentTransit?.vehicleNumber) {
    vehicle = await prisma.vehicle.findFirst({
      where: {
        OR: [
          ...(studentTransit.vehicleId ? [{ id: studentTransit.vehicleId }] : []),
          ...(studentTransit.vehicleNumber ? [{ number: studentTransit.vehicleNumber }] : []),
        ],
      },
      include: {
        driver: true,
        assignedCoordinators: {
          include: {
            coordinator: true,
          },
        },
      },
    });
  }

  // Fallback: check VehicleStudentAssignment in DB if vehicle wasn't found
  if (!vehicle && studentId) {
    const studentAssign = await prisma.vehicleStudentAssignment.findFirst({
      where: { studentId },
      include: {
        vehicle: {
          include: {
            driver: true,
            assignedCoordinators: {
              include: {
                coordinator: true,
              },
            },
          },
        },
      },
    });
    if (studentAssign?.vehicle) {
      vehicle = studentAssign.vehicle;
    }
  }

  const assignedVehicleId = vehicle?.id || studentTransit?.vehicleId || "N/A";
  const assignedVehicleNumber = vehicle?.number || studentTransit?.vehicleNumber || "N/A";

  // 2. Find Web Admin recipients
  const webAdminUsers = await prisma.user.findMany({
    where: {
      role: { in: ["superadmin", "admin", "deptadmin"], mode: "insensitive" },
      status: "active",
    },
    select: {
      id: true,
      name: true,
      role: true,
      pushToken: true,
    },
  });

  // 3. Find Driver assigned to the SAME vehicle
  let assignedDriver = null;
  if (vehicle?.driver) {
    assignedDriver = vehicle.driver;
  } else if (vehicle?.driverId) {
    assignedDriver = await prisma.user.findUnique({
      where: { id: vehicle.driverId },
      select: { id: true, name: true, role: true, pushToken: true },
    });
  } else if (studentTransit?.driverId) {
    assignedDriver = await prisma.user.findFirst({
      where: {
        id: studentTransit.driverId,
        role: { equals: "driver", mode: "insensitive" },
      },
      select: { id: true, name: true, role: true, pushToken: true },
    });
  }

  // 4. Find Coordinator(s) assigned to the SAME vehicle
  let assignedCoordinators = [];
  if (vehicle?.assignedCoordinators && vehicle.assignedCoordinators.length > 0) {
    assignedCoordinators = vehicle.assignedCoordinators
      .map((ac) => ac.coordinator)
      .filter((c) => c && c.status !== "inactive");
  } else if (vehicle?.id) {
    const coordAssignments = await prisma.vehicleCoordinatorAssignment.findMany({
      where: { vehicleId: vehicle.id },
      include: { coordinator: true },
    });
    assignedCoordinators = coordAssignments
      .map((ac) => ac.coordinator)
      .filter((c) => c && c.status !== "inactive");
  }

  // Deduplicate and compile
  const recipientMap = new Map();

  // Add Web Admins
  webAdminUsers.forEach((admin) => {
    recipientMap.set(admin.id, {
      id: admin.id,
      name: admin.name,
      role: admin.role || "admin",
      category: "web_admin",
      pushToken: admin.pushToken,
    });
  });

  // Add Assigned Driver (if any)
  if (assignedDriver && assignedDriver.id) {
    recipientMap.set(assignedDriver.id, {
      id: assignedDriver.id,
      name: assignedDriver.name,
      role: "driver",
      category: "assigned_driver",
      pushToken: assignedDriver.pushToken,
      assignedVehicleId,
      assignedVehicleNumber,
    });
  }

  // Add Assigned Coordinators (if any)
  assignedCoordinators.forEach((coord) => {
    if (coord && coord.id) {
      recipientMap.set(coord.id, {
        id: coord.id,
        name: coord.name,
        role: "coordinator",
        category: "assigned_coordinator",
        pushToken: coord.pushToken,
        assignedVehicleId,
        assignedVehicleNumber,
      });
    }
  });

  const finalRecipients = Array.from(recipientMap.values());

  // Backend logs formatted as requested
  console.log("-----------------------------------------------------------------");
  console.log("[Student Missing Alert]");
  console.log(`Student ID: ${studentTransit?.studentId || "N/A"}`);
  console.log(`Student Name: ${studentTransit?.studentName || "N/A"}`);
  console.log(`Assigned Vehicle ID: ${assignedVehicleId}`);
  console.log(`Assigned Vehicle Name: ${assignedVehicleNumber}`);
  console.log(`Coordinator Recipient: ${assignedCoordinators.length > 0 ? assignedCoordinators.map((c) => `${c.name} (${c.id})`).join(", ") : "None"}`);
  console.log(`Driver Recipient: ${assignedDriver ? `${assignedDriver.name} (${assignedDriver.id})` : "None"}`);
  console.log(`Web Admin Recipients: ${webAdminUsers.map((a) => `${a.name} (${a.id})`).join(", ") || "None"}`);
  console.log(`Final Notification Recipients: ${finalRecipients.map((r) => `${r.name} [${r.role}]`).join(", ") || "None"}`);
  console.log("-----------------------------------------------------------------");

  return {
    vehicle,
    assignedVehicleId,
    assignedVehicleNumber,
    webAdminUsers,
    assignedDriver,
    assignedCoordinators,
    finalRecipients,
  };
};

/**
 * Dispatch notification ONLY to Web Admin, Assigned Coordinator, and Assigned Driver of the SAME vehicle
 */
const dispatchMissingAlertNotifications = async (io, alertPayload, studentTransit, distanceMeters) => {
  const {
    assignedVehicleId,
    assignedVehicleNumber,
    webAdminUsers,
    assignedDriver,
    assignedCoordinators,
  } = await resolveMissingAlertRecipients(studentTransit);

  const title = "🚨 Student Missing Alert";
  const message = `Student: ${studentTransit.studentName}\nDistance: ${(Math.round(distanceMeters * 10) / 10).toFixed(1)} m\nPlease check the student's location.`;

  const commonData = {
    alertId: alertPayload.id,
    studentId: studentTransit.studentId,
    studentName: studentTransit.studentName,
    studentRollNo: studentTransit.studentRollNo,
    vehicleId: assignedVehicleId,
    vehicleNumber: assignedVehicleNumber,
    distanceMeters: alertPayload.distanceMeters,
    driverAlertTitle: title,
    driverAlertMessage: message,
    notificationType: "missing_alert",
  };

  // 1. Deliver to Web Admin (Dashboard Alerts Raised & Admin Notification)
  if (io) {
    if (typeof io.emit === "function") {
      // Dashboard UI listeners for Web Admin
      io.emit("student_missing_alert", alertPayload);
      io.emit("new_missing_alert", alertPayload);
    }
  }

  try {
    const adminNotif = await prisma.notification.create({
      data: {
        title,
        message,
        type: "missing_alert",
        sender: "System",
        target: "admin",
        data: JSON.stringify(commonData),
      },
    });

    if (io && typeof io.to === "function") {
      io.to("admin").emit("new_notification", adminNotif);
      io.to("superadmin").emit("new_notification", adminNotif);
      io.to("deptadmin").emit("new_notification", adminNotif);
    }

    const adminTokens = webAdminUsers.map((a) => a.pushToken).filter(Boolean);
    if (adminTokens.length > 0) {
      await sendPushNotification(adminTokens, title, message, commonData);
    }
  } catch (err) {
    console.error("[missingAlertService] Admin notification error:", err.message);
  }

  // 2. Deliver ONLY to Assigned Driver of the SAME vehicle
  if (assignedDriver && assignedDriver.id) {
    try {
      const driverNotif = await prisma.notification.create({
        data: {
          title,
          message,
          type: "missing_alert",
          sender: "System",
          target: "driver",
          userId: assignedDriver.id,
          data: JSON.stringify(commonData),
        },
      });

      if (io && typeof io.to === "function") {
        io.to(`user_${assignedDriver.id}`).emit("driver_student_missing_alert", alertPayload);
        io.to(`user_${assignedDriver.id}`).emit("new_notification", driverNotif);
      }

      if (assignedDriver.pushToken) {
        await sendPushNotification([assignedDriver.pushToken], title, message, commonData);
      }
    } catch (err) {
      console.error("[missingAlertService] Driver notification error:", err.message);
    }
  }

  // 3. Deliver ONLY to Assigned Coordinator(s) of the SAME vehicle
  for (const coordinator of assignedCoordinators) {
    if (coordinator && coordinator.id) {
      try {
        const coordNotif = await prisma.notification.create({
          data: {
            title,
            message,
            type: "missing_alert",
            sender: "System",
            target: "coordinator",
            userId: coordinator.id,
            data: JSON.stringify(commonData),
          },
        });

        if (io && typeof io.to === "function") {
          io.to(`user_${coordinator.id}`).emit("driver_student_missing_alert", alertPayload);
          io.to(`user_${coordinator.id}`).emit("new_notification", coordNotif);
        }

        if (coordinator.pushToken) {
          await sendPushNotification([coordinator.pushToken], title, message, commonData);
        }
      } catch (err) {
        console.error("[missingAlertService] Coordinator notification error:", err.message);
      }
    }
  }
};


/**
 * Register or update a student's active in-transit state upon boarding QR scan
 */
const startStudentTransit = async ({
  studentId,
  studentName,
  studentRollNo,
  vehicleId,
  vehicleNumber,
  driverId,
  driverName,
  stage = "TO_COLLEGE",
  latitude,
  longitude,
  io,
}) => {
  if (!studentId) return;

  // Resolve vehicle & driver info if not fully supplied
  let vId = vehicleId;
  let vNum = vehicleNumber;
  let dId = driverId;
  let dName = driverName;
  let sName = studentName;
  let sRoll = studentRollNo;

  try {
    if (!vNum || !dId || !dName) {
      const vehicleRecord = await prisma.vehicle.findFirst({
        where: { OR: [{ id: vehicleId || "" }, { number: vehicleId || vehicleNumber || "" }] },
        include: { driver: true },
      });
      if (vehicleRecord) {
        vId = vehicleRecord.id;
        vNum = vehicleRecord.number;
        if (!dId && vehicleRecord.driverId) {
          dId = vehicleRecord.driverId;
          dName = vehicleRecord.driver?.name || "Driver";
        }
      }
    }

    if (!sName || !sRoll) {
      const studentRecord = await prisma.user.findUnique({
        where: { id: studentId },
        select: { name: true, rollNumber: true, studentRollNo: true },
      });
      if (studentRecord) {
        sName = sName || studentRecord.name;
        sRoll = sRoll || studentRecord.rollNumber || studentRecord.studentRollNo;
      }
    }
  } catch (err) {
    console.error("[missingAlertService] Info resolution error:", err.message);
  }

  const transitEntry = {
    studentId,
    studentName: sName || "Student",
    studentRollNo: sRoll || "N/A",
    vehicleId: vId || vehicleId || "N/A",
    vehicleNumber: vNum || vehicleNumber || vehicleId || "N/A",
    driverId: dId || null,
    driverName: dName || "Assigned Driver",
    stage,
    studentLat: latitude != null ? parseFloat(latitude) : null,
    studentLng: longitude != null ? parseFloat(longitude) : null,
    lastStudentUpdate: new Date(),
    activeAlertId: null,
  };

  inTransitStudents.set(studentId, transitEntry);
  console.log(`[missingAlertService] 🟢 Student ${sName} (${studentId}) is now IN-TRANSIT on ${transitEntry.vehicleNumber} (Stage: ${stage})`);

  if (latitude != null && longitude != null) {
    await evaluateProximity(studentId, io);
  }
};

/**
 * Compare student location against assigned driver/vehicle location
 */
const evaluateProximity = async (studentId, io) => {
  const studentTransit = inTransitStudents.get(studentId);
  if (!studentTransit) return null;

  // Student must have GPS fix
  if (studentTransit.studentLat == null || studentTransit.studentLng == null) {
    return null;
  }

  // Get driver location from in-memory vehicle location store or DB
  const vehicleKey = studentTransit.vehicleId;
  const vehicleNum = studentTransit.vehicleNumber;
  let vehicleLoc = getVehicleLocation(vehicleKey) || (vehicleNum ? getVehicleLocation(vehicleNum) : null);

  if (!vehicleLoc && studentTransit.driverId) {
    vehicleLoc = getVehicleLocation(studentTransit.driverId);
  }

  if (!vehicleLoc) {
    // Driver GPS not available in store
    return null;
  }

  const driverLat = parseFloat(vehicleLoc.latitude);
  const driverLng = parseFloat(vehicleLoc.longitude);
  const studentLat = parseFloat(studentTransit.studentLat);
  const studentLng = parseFloat(studentTransit.studentLng);

  const distanceMeters = calculateDistanceMeters(studentLat, studentLng, driverLat, driverLng);
  console.log(`[missingAlertService] Distance check for ${studentTransit.studentName}: ${distanceMeters.toFixed(2)}m (Threshold: ${MISSING_DISTANCE_THRESHOLD_METERS}m)`);

  if (distanceMeters > MISSING_DISTANCE_THRESHOLD_METERS) {
    // Distance exceeds 10 meters -> Raise or update Active Alert
    let alertRecord = null;

    try {
      if (studentTransit.activeAlertId) {
        // Update existing active alert
        alertRecord = await prisma.studentMissingAlert.update({
          where: { id: studentTransit.activeAlertId },
          data: {
            driverLat,
            driverLng,
            studentLat,
            studentLng,
            distanceMeters: Math.round(distanceMeters * 10) / 10,
            status: "ACTIVE",
            stage: studentTransit.stage,
          },
        });
      } else {
        // Create new active alert
        alertRecord = await prisma.studentMissingAlert.create({
          data: {
            studentId: studentTransit.studentId,
            studentName: studentTransit.studentName,
            studentRollNo: studentTransit.studentRollNo,
            driverId: studentTransit.driverId,
            driverName: studentTransit.driverName,
            vehicleId: studentTransit.vehicleId,
            vehicleNumber: studentTransit.vehicleNumber,
            driverLat,
            driverLng,
            studentLat,
            studentLng,
            distanceMeters: Math.round(distanceMeters * 10) / 10,
            status: "ACTIVE",
            stage: studentTransit.stage,
            alertTime: new Date(),
          },
        });
        studentTransit.activeAlertId = alertRecord.id;
      }
    } catch (dbErr) {
      console.error("[missingAlertService] DB Alert write error:", dbErr.message);
    }

    const driverAlertTitle = "🚨 Student Missing Alert";
    const driverAlertMessage = `Student: ${studentTransit.studentName}\nDistance: ${(Math.round(distanceMeters * 10) / 10).toFixed(1)} m\nPlease check the student's location.`;

    const alertPayload = {
      id: alertRecord?.id || `temp-${studentTransit.studentId}`,
      studentId: studentTransit.studentId,
      studentName: studentTransit.studentName,
      studentRollNo: studentTransit.studentRollNo,
      driverId: studentTransit.driverId,
      driverName: studentTransit.driverName,
      vehicleId: studentTransit.vehicleId,
      vehicleNumber: studentTransit.vehicleNumber,
      driverLocation: formatCoords(driverLat, driverLng),
      studentLocation: formatCoords(studentLat, studentLng),
      driverLat,
      driverLng,
      studentLat,
      studentLng,
      distanceMeters: Math.round(distanceMeters * 10) / 10,
      alertTime: alertRecord?.alertTime || new Date(),
      status: "ACTIVE",
      stage: studentTransit.stage,
      driverAlertTitle,
      driverAlertMessage,
    };

    // Dispatch notification strictly to Web Admin, Assigned Coordinator, and Assigned Driver of the SAME vehicle
    await dispatchMissingAlertNotifications(io, alertPayload, studentTransit, distanceMeters);

    return alertPayload;


  } else {
    // Distance <= 10 meters -> If an active alert existed, resolve it
    if (studentTransit.activeAlertId) {
      const closedAlert = await closeAlertById(
        studentTransit.activeAlertId,
        "Rejoined Vehicle (<10m)",
        io
      );
      studentTransit.activeAlertId = null;
      return closedAlert;
    }
  }

  return null;
};

/**
 * Handle student location update (via socket or REST)
 */
const updateStudentLocation = async ({
  studentId,
  studentName,
  studentRollNo,
  vehicleId,
  vehicleNumber,
  latitude,
  longitude,
  io,
}) => {
  if (!studentId || latitude == null || longitude == null) return null;

  let transit = inTransitStudents.get(studentId);
  if (!transit) {
    // Check if student has an active transit stage in DB for today
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const latestAttendance = await prisma.attendance.findFirst({
      where: {
        userId: studentId,
        type: "student_scan",
        scannedAt: { gte: startOfToday },
      },
      orderBy: { scannedAt: "desc" },
    });

    const isTransitStage =
      latestAttendance &&
      (latestAttendance.stage === "TO_COLLEGE" ||
        latestAttendance.stage === "TO_HOME" ||
        latestAttendance.stage === "MORNING_INROUTE" ||
        latestAttendance.stage === "EVENING_INROUTE");

    if (isTransitStage) {
      await startStudentTransit({
        studentId,
        studentName,
        studentRollNo,
        vehicleId: vehicleId || latestAttendance.vehicleId,
        vehicleNumber,
        stage: latestAttendance.stage,
        latitude,
        longitude,
        io,
      });
      transit = inTransitStudents.get(studentId);
    }
  }

  if (transit) {
    transit.studentLat = parseFloat(latitude);
    transit.studentLng = parseFloat(longitude);
    transit.lastStudentUpdate = new Date();
    if (studentName) transit.studentName = studentName;
    if (studentRollNo) transit.studentRollNo = studentRollNo;
    if (vehicleId) transit.vehicleId = vehicleId;
    if (vehicleNumber) transit.vehicleNumber = vehicleNumber;

    return await evaluateProximity(studentId, io);
  }

  return null;
};

/**
 * Handle driver location update -> evaluate proximity for all boarded students on this vehicle
 */
const updateDriverLocation = async ({
  vehicleId,
  driverId,
  driverName,
  latitude,
  longitude,
  io,
}) => {
  if (!vehicleId || latitude == null || longitude == null) return;

  const lat = parseFloat(latitude);
  const lng = parseFloat(longitude);
  setVehicleLocation(vehicleId, lat, lng);
  if (driverId) setVehicleLocation(driverId, lat, lng);

  // Check all active in-transit students assigned to this vehicle/driver
  const promises = [];
  for (const [studentId, transit] of inTransitStudents.entries()) {
    const isSameVehicle =
      transit.vehicleId === vehicleId ||
      transit.vehicleNumber === vehicleId ||
      (driverId && transit.driverId === driverId);

    if (isSameVehicle) {
      if (driverName) transit.driverName = driverName;
      if (driverId) transit.driverId = driverId;
      promises.push(evaluateProximity(studentId, io));
    }
  }

  await Promise.all(promises);
};

/**
 * Close/resolve an alert by ID
 */
const closeAlertById = async (alertId, reason, io) => {
  try {
    const resolved = await prisma.studentMissingAlert.update({
      where: { id: alertId },
      data: {
        status: "RESOLVED",
        resolvedAt: new Date(),
        resolvedReason: reason,
      },
    });

    const payload = {
      id: resolved.id,
      studentId: resolved.studentId,
      studentName: resolved.studentName,
      status: "RESOLVED",
      resolvedReason: reason,
      resolvedAt: resolved.resolvedAt,
    };

    if (io) {
      io.emit("student_missing_alert_resolved", payload);
      io.emit("missing_alert_closed", payload);
    }

    return resolved;
  } catch (err) {
    console.error("[missingAlertService] closeAlertById error:", err.message);
    return null;
  }
};

/**
 * End a student's active transit journey (e.g. arrived at College/Home, attendance closed)
 */
const endStudentTransit = async ({ studentId, reason = "Arrived at College", io }) => {
  if (!studentId) return;

  const transit = inTransitStudents.get(studentId);
  inTransitStudents.delete(studentId);

  try {
    // Close any active missing alerts for this student in the database
    const activeAlerts = await prisma.studentMissingAlert.findMany({
      where: {
        studentId,
        status: "ACTIVE",
      },
    });

    for (const alert of activeAlerts) {
      await closeAlertById(alert.id, reason, io);
    }

    console.log(`[missingAlertService] 🔴 Student ${studentId} transit ended. Reason: "${reason}". Active alerts closed.`);
  } catch (err) {
    console.error("[missingAlertService] endStudentTransit error:", err.message);
  }
};

/**
 * End transit for all students on a vehicle (e.g. trip closed / driver finished route)
 */
const endVehicleTransit = async ({ vehicleId, reason = "Trip Completed", io }) => {
  if (!vehicleId) return;

  // Clear in-transit tracking for this vehicle
  for (const [studentId, transit] of inTransitStudents.entries()) {
    if (transit.vehicleId === vehicleId || transit.vehicleNumber === vehicleId) {
      inTransitStudents.delete(studentId);
    }
  }

  try {
    const activeAlerts = await prisma.studentMissingAlert.findMany({
      where: {
        OR: [{ vehicleId }, { vehicleNumber: vehicleId }],
        status: "ACTIVE",
      },
    });

    for (const alert of activeAlerts) {
      await closeAlertById(alert.id, reason, io);
    }

    console.log(`[missingAlertService] 🔴 Vehicle ${vehicleId} transit ended. Reason: "${reason}". Active alerts closed.`);
  } catch (err) {
    console.error("[missingAlertService] endVehicleTransit error:", err.message);
  }
};

/**
 * Get all active missing alerts for today
 */
const getActiveMissingAlerts = async () => {
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const activeAlerts = await prisma.studentMissingAlert.findMany({
    where: {
      status: "ACTIVE",
      alertTime: { gte: startOfToday },
    },
    orderBy: { alertTime: "desc" },
  });

  return activeAlerts.map((a) => ({
    ...a,
    driverLocation: formatCoords(a.driverLat, a.driverLng),
    studentLocation: formatCoords(a.studentLat, a.studentLng),
  }));
};

/**
 * Get missing alerts with filtering
 */
const getMissingAlerts = async ({ today = true, date, status, studentId, vehicleId, limit = 50 } = {}) => {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

  const where = {};
  if (status) where.status = status;
  if (studentId) where.studentId = studentId;
  if (vehicleId) where.OR = [{ vehicleId }, { vehicleNumber: vehicleId }];

  if (today === true || today === "true" || (!date && today !== false && today !== "false")) {
    where.alertTime = { gte: startOfToday, lte: endOfToday };
  } else if (date) {
    const d = new Date(date);
    where.alertTime = {
      gte: new Date(d.setHours(0, 0, 0, 0)),
      lte: new Date(d.setHours(23, 59, 59, 999)),
    };
  }

  const alerts = await prisma.studentMissingAlert.findMany({
    where,
    orderBy: { alertTime: "desc" },
    take: parseInt(limit, 10) || 50,
  });

  return alerts.map((a) => ({
    ...a,
    driverLocation: formatCoords(a.driverLat, a.driverLng),
    studentLocation: formatCoords(a.studentLat, a.studentLng),
  }));
};

module.exports = {
  MISSING_DISTANCE_THRESHOLD_METERS,
  startStudentTransit,
  evaluateProximity,
  updateStudentLocation,
  updateDriverLocation,
  endStudentTransit,
  endVehicleTransit,
  getActiveMissingAlerts,
  getMissingAlerts,
  closeAlertById,
};
