const crypto = require("crypto");
const prisma = require("../prisma/prisma");
const { triggerNotification } = require("../utils/notification");
const auditLogService = require("../services/auditLogService");


// Helper to resolve route name for a vehicle
const resolveVehicleRoute = async (vehicle) => {
  if (!vehicle) return { routeId: null, routeName: "Unassigned Route" };
  if (vehicle.route && vehicle.route.trim() !== "") {
    return { routeId: null, routeName: vehicle.route.trim() };
  }
  try {
    const routeAssign = await prisma.routeVehicleAssignment.findFirst({
      where: {
        OR: [
          { vehicleId: vehicle.id },
          { vehicleNumber: vehicle.number },
        ],
        isActive: true,
      },
      orderBy: { assignedAt: "desc" },
    });
    if (routeAssign) {
      return {
        routeId: routeAssign.routeId,
        routeName: routeAssign.routeName,
      };
    }
  } catch (err) {
    console.error("Error resolving vehicle route:", err);
  }
  return { routeId: null, routeName: vehicle.route || "Default Route" };
};

// ── 1. DRIVER: Create or Retrieve Active QR Session ────────────────────────
// POST /api/bus-route-change/qr/session
exports.createOrGetDriverQRSession = async (req, res) => {
  try {
    const driverId = req.user.id;
    const { vehicleId, expiryMinutes = 5, forceNew = false } = req.body;

    // 1. Find the Driver & their assigned vehicle
    const driver = await prisma.user.findUnique({
      where: { id: driverId },
      include: {
        vehicles: true,
      },
    });

    if (!driver) {
      return res.status(404).json({
        success: false,
        message: "Driver account not found.",
      });
    }

    let targetVehicle = null;
    if (vehicleId) {
      targetVehicle = await prisma.vehicle.findFirst({
        where: { id: vehicleId, driverId: driver.id },
      });
    }

    if (!targetVehicle) {
      targetVehicle = driver.vehicles?.[0] || await prisma.vehicle.findFirst({
        where: { driverId: driver.id },
      });
    }

    if (!targetVehicle) {
      return res.status(400).json({
        success: false,
        message: "No vehicle is currently assigned to this driver.",
      });
    }

    const { routeId, routeName } = await resolveVehicleRoute(targetVehicle);

    const now = new Date();

    // Check if there is an existing ACTIVE session not expired unless forceNew is true
    if (!forceNew) {
      const existingSession = await prisma.busRouteChangeSession.findFirst({
        where: {
          driverId: driver.id,
          busId: targetVehicle.id,
          status: "ACTIVE",
          expiresAt: { gt: now },
        },
        include: {
          history: {
            where: { status: "COMPLETED" },
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy: { createdAt: "desc" },
      });

      if (existingSession) {
        const qrPayload = JSON.stringify({
          type: "BUS_ROUTE_CHANGE",
          sessionToken: existingSession.sessionToken,
          driverId: driver.id,
          driverName: driver.name,
          busId: targetVehicle.id,
          busNumber: targetVehicle.number,
          routeId: existingSession.routeId,
          routeName: existingSession.routeName,
          expiresAt: existingSession.expiresAt,
        });

        return res.json({
          success: true,
          message: "Active Bus/Route Change QR session retrieved.",
          data: {
            id: existingSession.id,
            sessionToken: existingSession.sessionToken,
            qrPayload,
            qrText: `BUS_ROUTE_CHANGE:${existingSession.sessionToken}`,
            driverId: driver.id,
            driverName: driver.name,
            busId: targetVehicle.id,
            busNumber: targetVehicle.number,
            routeId: existingSession.routeId,
            routeName: existingSession.routeName,
            status: existingSession.status,
            expiresAt: existingSession.expiresAt,
            createdAt: existingSession.createdAt,
            studentsChangedCount: existingSession.history.length,
            recentStudents: existingSession.history.map((h) => ({
              id: h.id,
              referenceNumber: h.referenceNumber,
              studentId: h.studentId,
              studentName: h.studentName,
              studentRollNo: h.studentRollNo,
              oldBusNumber: h.oldBusNumber,
              confirmedAt: h.confirmedAt,
            })),
          },
        });
      }
    }

    // Close any older active sessions for this driver/bus
    await prisma.busRouteChangeSession.updateMany({
      where: {
        driverId: driver.id,
        status: "ACTIVE",
      },
      data: {
        status: "CLOSED",
      },
    });

    // Generate new secure random token
    const randomHex = crypto.randomBytes(16).toString("hex");
    const sessionToken = `BRC_${Date.now()}_${randomHex}`;
    const expiresAt = new Date(Date.now() + Math.max(1, expiryMinutes) * 60 * 1000);

    const newSession = await prisma.busRouteChangeSession.create({
      data: {
        sessionToken,
        driverId: driver.id,
        driverName: driver.name,
        busId: targetVehicle.id,
        busNumber: targetVehicle.number,
        routeId: routeId || null,
        routeName: routeName || "Default Route",
        status: "ACTIVE",
        expiresAt,
      },
    });

    await auditLogService.record({
      req,
      userId: driver.id,
      userRole: "DRIVER",
      userName: driver.name,
      action: "BUS_ROUTE_CHANGE_QR_CREATED",
      eventType: "ACTION",
      module: "BUS_ROUTE_MANAGEMENT",
      entityType: "VEHICLE",
      entityId: targetVehicle.id,
      appName: "OFFICER_APP",
      description: `Driver ${driver.name} created Common QR session for Bus ${targetVehicle.number} (${routeName || "Default Route"})`,
      latitude: req.body.latitude ? parseFloat(req.body.latitude) : (req.body.driverLat ? parseFloat(req.body.driverLat) : null),
      longitude: req.body.longitude ? parseFloat(req.body.longitude) : (req.body.driverLng ? parseFloat(req.body.driverLng) : null),
      gpsAccuracy: req.body.accuracy || req.body.gpsAccuracy || null,
      gpsTimestamp: req.body.gpsTimestamp || req.body.timestamp || now,
      vehicleId: targetVehicle.id,
      vehicleNumber: targetVehicle.number,
      driverId: driver.id,
      routeId: routeId || null,
      routeName: routeName || newSession.routeName || null,
      qrSessionId: newSession.id,
      metadata: {
        sessionId: newSession.id,
        busNumber: targetVehicle.number,
        routeName: newSession.routeName,
        expiresAt: newSession.expiresAt,
      },
    });

    const qrPayload = JSON.stringify({

      type: "BUS_ROUTE_CHANGE",
      sessionToken: newSession.sessionToken,
      driverId: driver.id,
      driverName: driver.name,
      busId: targetVehicle.id,
      busNumber: targetVehicle.number,
      routeId: newSession.routeId,
      routeName: newSession.routeName,
      expiresAt: newSession.expiresAt,
    });

    return res.status(201).json({
      success: true,
      message: "New Bus/Route Change QR session generated.",
      data: {
        id: newSession.id,
        sessionToken: newSession.sessionToken,
        qrPayload,
        qrText: `BUS_ROUTE_CHANGE:${newSession.sessionToken}`,
        driverId: driver.id,
        driverName: driver.name,
        busId: targetVehicle.id,
        busNumber: targetVehicle.number,
        routeId: newSession.routeId,
        routeName: newSession.routeName,
        status: newSession.status,
        expiresAt: newSession.expiresAt,
        createdAt: newSession.createdAt,
        studentsChangedCount: 0,
        recentStudents: [],
      },
    });
  } catch (error) {
    console.error("createOrGetDriverQRSession error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to generate Bus/Route Change QR session.",
    });
  }
};

// ── 2. DRIVER: Get Active QR Session & Live Stats ──────────────────────────
// GET /api/bus-route-change/qr/active
exports.getActiveDriverQRSession = async (req, res) => {
  try {
    const driverId = req.user.id;
    const now = new Date();

    const session = await prisma.busRouteChangeSession.findFirst({
      where: {
        driverId,
        status: "ACTIVE",
        expiresAt: { gt: now },
      },
      include: {
        history: {
          where: { status: "COMPLETED" },
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    if (!session) {
      return res.json({
        success: true,
        active: false,
        session: null,
      });
    }

    const qrPayload = JSON.stringify({
      type: "BUS_ROUTE_CHANGE",
      sessionToken: session.sessionToken,
      driverId: session.driverId,
      driverName: session.driverName,
      busId: session.busId,
      busNumber: session.busNumber,
      routeId: session.routeId,
      routeName: session.routeName,
      expiresAt: session.expiresAt,
    });

    return res.json({
      success: true,
      active: true,
      data: {
        id: session.id,
        sessionToken: session.sessionToken,
        qrPayload,
        qrText: `BUS_ROUTE_CHANGE:${session.sessionToken}`,
        driverId: session.driverId,
        driverName: session.driverName,
        busId: session.busId,
        busNumber: session.busNumber,
        routeId: session.routeId,
        routeName: session.routeName,
        status: session.status,
        expiresAt: session.expiresAt,
        createdAt: session.createdAt,
        studentsChangedCount: session.history.length,
        recentStudents: session.history.map((h) => ({
          id: h.id,
          referenceNumber: h.referenceNumber,
          studentId: h.studentId,
          studentName: h.studentName,
          studentRollNo: h.studentRollNo,
          oldBusNumber: h.oldBusNumber,
          confirmedAt: h.confirmedAt,
        })),
      },
    });
  } catch (error) {
    console.error("getActiveDriverQRSession error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch active QR session.",
    });
  }
};

// ── 3. DRIVER: Close / Deactivate QR Session ───────────────────────────────
// POST /api/bus-route-change/qr/close
exports.closeDriverQRSession = async (req, res) => {
  try {
    const driverId = req.user.id;
    const { sessionId } = req.body;

    const where = { driverId, status: "ACTIVE" };
    if (sessionId) where.id = sessionId;

    await prisma.busRouteChangeSession.updateMany({
      where,
      data: { status: "CLOSED" },
    });

    return res.json({
      success: true,
      message: "Bus/Route change QR session closed.",
    });
  } catch (error) {
    console.error("closeDriverQRSession error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to close QR session.",
    });
  }
};

// ── 4. STUDENT: Validate Scanned QR Token ──────────────────────────────────
// POST /api/bus-route-change/qr/validate
exports.validateScannedQR = async (req, res) => {
  try {
    const studentId = req.user.id;
    const { token } = req.body;

    if (!token || typeof token !== "string") {
      return res.status(400).json({
        success: false,
        message: "Invalid QR code token provided.",
      });
    }

    // Extract sessionToken from various QR formats:
    // Format A: "BUS_ROUTE_CHANGE:BRC_..."
    // Format B: JSON string {"type":"BUS_ROUTE_CHANGE","sessionToken":"..."}
    // Format C: Raw "BRC_..."
    let rawToken = token.trim();
    if (rawToken.startsWith("BUS_ROUTE_CHANGE:")) {
      rawToken = rawToken.replace("BUS_ROUTE_CHANGE:", "").trim();
    } else if (rawToken.startsWith("{") && rawToken.endsWith("}")) {
      try {
        const parsed = JSON.parse(rawToken);
        if (parsed.sessionToken) {
          rawToken = parsed.sessionToken;
        }
      } catch (e) {
        // ignore JSON parse error, use string
      }
    }

    const now = new Date();

    // 1. Look up session in DB
    const session = await prisma.busRouteChangeSession.findUnique({
      where: { sessionToken: rawToken },
    });

    if (!session) {
      return res.status(404).json({
        success: false,
        message: "QR code is invalid or does not exist.",
      });
    }

    if (session.status !== "ACTIVE") {
      return res.status(400).json({
        success: false,
        message: "QR code is no longer active.",
      });
    }

    if (new Date(session.expiresAt) <= now) {
      // Mark as expired in DB
      await prisma.busRouteChangeSession.update({
        where: { id: session.id },
        data: { status: "EXPIRED" },
      }).catch(() => {});

      return res.status(400).json({
        success: false,
        message: "QR code has expired. Ask the driver to generate a new QR.",
      });
    }

    // 2. Validate Driver & Vehicle
    const driver = await prisma.user.findUnique({
      where: { id: session.driverId },
      select: { id: true, name: true, phone: true, role: true },
    });

    if (!driver) {
      return res.status(400).json({
        success: false,
        message: "Driver is no longer valid or authorized.",
      });
    }

    const newVehicle = await prisma.vehicle.findUnique({
      where: { id: session.busId },
    });

    if (!newVehicle || newVehicle.status === "inactive") {
      return res.status(400).json({
        success: false,
        message: "Target vehicle is inactive or unavailable.",
      });
    }

    // 3. Authenticate & Lookup Current Student
    const student = await prisma.user.findUnique({
      where: { id: studentId },
      include: {
        studentAssignments: {
          include: {
            vehicle: true,
          },
        },
      },
    });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: "Authenticated student account not found.",
      });
    }

    // Current student assignment details
    const currentAssignment = student.studentAssignments?.[0];
    const currentVehicle = currentAssignment?.vehicle || null;
    const currentRouteName = currentVehicle?.route || student.location || "Unassigned Route";

    const isAlreadyOnThisBus = currentVehicle && currentVehicle.id === newVehicle.id;

    await auditLogService.record({
      req,
      userId: student.id,
      userRole: "STUDENT",
      userName: student.name,
      action: "BUS_ROUTE_CHANGE_QR_SCANNED",
      eventType: "ACTION",
      module: "BUS_ROUTE_MANAGEMENT",
      entityType: "STUDENT",
      entityId: student.id,
      appName: "STUDENT_PARENT_APP",
      description: `Student ${student.name} scanned Common QR for Bus ${newVehicle.number} (${session.routeName || newVehicle.route || "Default Route"})`,
      latitude: req.body.latitude ? parseFloat(req.body.latitude) : (req.body.studentLat ? parseFloat(req.body.studentLat) : null),
      longitude: req.body.longitude ? parseFloat(req.body.longitude) : (req.body.studentLng ? parseFloat(req.body.studentLng) : null),
      gpsAccuracy: req.body.accuracy || req.body.gpsAccuracy || null,
      gpsTimestamp: req.body.gpsTimestamp || req.body.timestamp || now,
      vehicleId: newVehicle.id,
      vehicleNumber: newVehicle.number,
      studentId: student.id,
      driverId: driver.id,
      routeId: session.routeId || null,
      routeName: session.routeName || newVehicle.route || null,
      qrSessionId: session.id,
      metadata: {
        busId: newVehicle.id,
        busNumber: newVehicle.number,
        driverName: driver.name,
        isAlreadyAssigned: isAlreadyOnThisBus,
      },
    });

    return res.json({
      success: true,
      message: isAlreadyOnThisBus
        ? `You are already assigned to ${newVehicle.number}.`
        : "QR code verified successfully.",
      data: {
        qrSessionId: session.id,
        sessionToken: session.sessionToken,
        isAlreadyAssigned: isAlreadyOnThisBus,
        student: {
          id: student.id,
          name: student.name,
          rollNumber: student.rollNumber || student.studentRollNo || null,
          department: student.department || null,
        },
        driver: {
          id: driver.id,
          name: driver.name,
          phone: driver.phone || null,
        },
        currentAssignment: {
          busId: currentVehicle?.id || null,
          busNumber: currentVehicle?.number || "Not Assigned",
          routeId: null,
          routeName: currentRouteName,
        },
        newAssignment: {
          busId: newVehicle.id,
          busNumber: newVehicle.number,
          routeId: session.routeId || null,
          routeName: session.routeName || newVehicle.route || "Default Route",
        },
        expiresAt: session.expiresAt,
      },
    });
  } catch (error) {
    console.error("validateScannedQR error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to validate QR code.",
    });
  }
};

// ── 5. STUDENT: Confirm Bus / Route Change Transaction ─────────────────────
// POST /api/bus-route-change/confirm
exports.confirmBusRouteChange = async (req, res) => {
  try {
    const studentId = req.user.id;
    const {
      sessionToken,
      remarks,
      studentLat,
      studentLng,
      driverLat,
      driverLng,
    } = req.body;

    if (!sessionToken) {
      return res.status(400).json({
        success: false,
        message: "Session token is required to confirm bus change.",
      });
    }

    let cleanToken = sessionToken.trim();
    if (cleanToken.startsWith("BUS_ROUTE_CHANGE:")) {
      cleanToken = cleanToken.replace("BUS_ROUTE_CHANGE:", "").trim();
    }

    const now = new Date();

    // Execute atomic transaction
    const result = await prisma.$transaction(async (tx) => {
      // 1. Re-validate QR Session inside transaction
      const session = await tx.busRouteChangeSession.findUnique({
        where: { sessionToken: cleanToken },
      });

      if (!session) {
        throw new Error("Bus change session not found.");
      }

      if (session.status !== "ACTIVE") {
        throw new Error("Bus change QR session is no longer active.");
      }

      if (new Date(session.expiresAt) <= now) {
        await tx.busRouteChangeSession.update({
          where: { id: session.id },
          data: { status: "EXPIRED" },
        }).catch(() => {});
        throw new Error("Bus change QR code has expired.");
      }

      // 2. Validate Target Vehicle
      const targetVehicle = await tx.vehicle.findUnique({
        where: { id: session.busId },
      });

      if (!targetVehicle) {
        throw new Error("Target vehicle no longer exists.");
      }

      // 3. Find current student
      const student = await tx.user.findUnique({
        where: { id: studentId },
        include: {
          studentAssignments: {
            include: { vehicle: true },
          },
        },
      });

      if (!student) {
        throw new Error("Student account not found.");
      }

      const existingAssignment = student.studentAssignments?.[0];
      const oldBusId = existingAssignment?.vehicleId || null;
      const oldBusNumber = existingAssignment?.vehicle?.number || "None";
      const oldRouteName = existingAssignment?.vehicle?.route || student.location || "None";

      // 4. Update student's vehicle assignment:
      // Remove any prior VehicleStudentAssignment for this student
      await tx.vehicleStudentAssignment.deleteMany({
        where: { studentId },
      });

      // Insert new VehicleStudentAssignment for target bus
      const newAssignment = await tx.vehicleStudentAssignment.create({
        data: {
          vehicleId: targetVehicle.id,
          studentId: student.id,
          studentName: student.name,
          class: student.year ? `${student.department || ""} ${student.year}` : student.department,
          pickupPoint: student.location || undefined,
          assignedBy: `QR_DRIVER_${session.driverName || "Driver"}`,
        },
      });

      // Update student location/remarks if appropriate
      if (session.routeName) {
        await tx.user.update({
          where: { id: student.id },
          data: {
            location: session.routeName,
          },
        }).catch(() => {});
      }

      // 5. Generate Reference Number: BRC-YYYYMMDD-XXXX
      const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const randPart = crypto.randomBytes(3).toString("hex").toUpperCase();
      const referenceNumber = `BRC-${datePart}-${randPart}`;

      // 6. Insert BusRouteChangeHistory record
      const historyRecord = await tx.busRouteChangeHistory.create({
        data: {
          referenceNumber,
          studentId: student.id,
          studentName: student.name,
          studentRollNo: student.rollNumber || student.studentRollNo || null,
          oldBusId,
          oldBusNumber,
          oldRouteId: null,
          oldRouteName,
          newBusId: targetVehicle.id,
          newBusNumber: targetVehicle.number,
          newRouteId: session.routeId || null,
          newRouteName: session.routeName || targetVehicle.route || "Default Route",
          driverId: session.driverId,
          driverName: session.driverName || "Driver",
          qrSessionId: session.id,
          changeType: "QR_SCAN",
          status: "COMPLETED",
          studentLat: studentLat ? parseFloat(studentLat) : null,
          studentLng: studentLng ? parseFloat(studentLng) : null,
          driverLat: driverLat ? parseFloat(driverLat) : null,
          driverLng: driverLng ? parseFloat(driverLng) : null,
          remarks: remarks || null,
          scannedAt: now,
          confirmedAt: now,
        },
      });

      // 7. Central System Audit Log for Student Bus/Route Change
      await auditLogService.record({
        req,
        userId: student.id,
        userRole: "STUDENT",
        userName: student.name,
        action: "BUS_ROUTE_CHANGE_CONFIRMED",
        eventType: "UPDATE",
        module: "BUS_ROUTE_MANAGEMENT",
        entityType: "STUDENT",
        entityId: student.id,
        appName: "STUDENT_PARENT_APP",
        description: `Student ${student.name} changed from Bus ${oldBusNumber} / ${oldRouteName} to Bus ${targetVehicle.number} / ${session.routeName || targetVehicle.route || "Default Route"}`,
        latitude: studentLat ? parseFloat(studentLat) : (req.body.latitude ? parseFloat(req.body.latitude) : null),
        longitude: studentLng ? parseFloat(studentLng) : (req.body.longitude ? parseFloat(req.body.longitude) : null),
        gpsAccuracy: req.body.accuracy || req.body.gpsAccuracy || null,
        gpsTimestamp: req.body.gpsTimestamp || req.body.timestamp || now,
        vehicleId: targetVehicle.id,
        vehicleNumber: targetVehicle.number,
        studentId: student.id,
        driverId: session.driverId,
        routeId: session.routeId || null,
        routeName: session.routeName || targetVehicle.route || null,
        qrSessionId: session.id,
        oldValues: {
          busId: oldBusId,
          busNumber: oldBusNumber,
          routeName: oldRouteName,
        },
        newValues: {
          busId: targetVehicle.id,
          busNumber: targetVehicle.number,
          routeName: session.routeName || targetVehicle.route,
        },
        metadata: {
          referenceNumber,
          driverId: session.driverId,
          driverName: session.driverName,
          qrSessionId: session.id,
          studentLat,
          studentLng,
          driverLat,
          driverLng,
          remarks: remarks || null,
        },
        tx,
      });

      return {

        referenceNumber,
        historyRecord,
        student,
        targetVehicle,
        session,
        oldBusNumber,
        oldRouteName,
      };
    });

    const io = req.app.get("io");

    // Real-time Socket Event to notify all dashboards & mobile clients
    if (io) {
      io.emit("bus_route_change_confirmed", {
        referenceNumber: result.referenceNumber,
        studentId: result.student.id,
        studentName: result.student.name,
        studentRollNo: result.student.rollNumber || result.student.studentRollNo,
        oldBusNumber: result.oldBusNumber,
        oldRouteName: result.oldRouteName,
        newBusId: result.targetVehicle.id,
        newBusNumber: result.targetVehicle.number,
        newRouteName: result.session.routeName,
        driverId: result.session.driverId,
        driverName: result.session.driverName,
        confirmedAt: result.historyRecord.confirmedAt,
      });

      // Specific room emits
      io.to(`user_${result.student.id}`).emit("assignment_updated", {
        newBusId: result.targetVehicle.id,
        newBusNumber: result.targetVehicle.number,
        newRouteName: result.session.routeName,
      });

      io.to(`user_${result.session.driverId}`).emit("student_joined_bus", {
        studentName: result.student.name,
        referenceNumber: result.referenceNumber,
      });

      io.to("admin").emit("bus_change_audit", result.historyRecord);
    }

    // Trigger push & database notifications
    // 1. To Student & Parent
    triggerNotification(io, {
      title: "🚌 Bus & Route Changed",
      message: `Your bus has been successfully changed from ${result.oldBusNumber} to ${result.targetVehicle.number} (${result.session.routeName}). Ref: ${result.referenceNumber}`,
      type: "route",
      sender: "System",
      target: "student",
      userId: result.student.id,
      data: {
        referenceNumber: result.referenceNumber,
        newBusNumber: result.targetVehicle.number,
        newRouteName: result.session.routeName,
      },
    }).catch((e) => console.error("Notification to student failed:", e));

    if (result.student.parentId) {
      triggerNotification(io, {
        title: "🚌 Child Bus / Route Changed",
        message: `${result.student.name}'s bus has been changed from ${result.oldBusNumber} to ${result.targetVehicle.number} (${result.session.routeName}). Ref: ${result.referenceNumber}`,
        type: "route",
        sender: "System",
        target: "parent",
        userId: result.student.parentId,
        data: {
          studentId: result.student.id,
          referenceNumber: result.referenceNumber,
          newBusNumber: result.targetVehicle.number,
        },
      }).catch((e) => console.error("Notification to parent failed:", e));
    }

    // 2. To Driver
    triggerNotification(io, {
      title: "🎒 Student Switched to Your Bus",
      message: `${result.student.name} (${result.student.rollNumber || "Student"}) joined your bus ${result.targetVehicle.number}. Ref: ${result.referenceNumber}`,
      type: "general",
      sender: "System",
      target: "driver",
      userId: result.session.driverId,
      data: {
        studentId: result.student.id,
        referenceNumber: result.referenceNumber,
      },
    }).catch((e) => console.error("Notification to driver failed:", e));

    return res.status(200).json({
      success: true,
      message: "Bus/Route changed successfully",
      data: {
        referenceNumber: result.referenceNumber,
        changeId: result.historyRecord.id,
        studentId: result.student.id,
        studentName: result.student.name,
        oldBusId: result.historyRecord.oldBusId,
        oldBusNumber: result.oldBusNumber,
        oldRouteName: result.oldRouteName,
        newBusId: result.targetVehicle.id,
        newBusNumber: result.targetVehicle.number,
        newRouteId: result.session.routeId,
        newRouteName: result.session.routeName,
        driverId: result.session.driverId,
        driverName: result.session.driverName,
        status: "COMPLETED",
        confirmedAt: result.historyRecord.confirmedAt,
      },
    });
  } catch (error) {
    console.error("confirmBusRouteChange error:", error);
    return res.status(400).json({
      success: false,
      message: error.message || "Failed to confirm Bus/Route change.",
    });
  }
};

// ── 6. ADMIN & DRIVER: Get Bus / Route Change History ──────────────────────
// GET /api/bus-route-change/history
exports.getBusRouteChangeHistory = async (req, res) => {
  try {
    const {
      studentId,
      driverId,
      vehicleId,
      status,
      search,
      limit = 100,
      page = 1,
    } = req.query;

    const where = {};

    if (studentId) where.studentId = studentId;
    if (driverId) where.driverId = driverId;
    if (status) where.status = status;
    if (vehicleId) {
      where.OR = [
        { oldBusId: vehicleId },
        { newBusId: vehicleId },
      ];
    }

    if (search && search.trim() !== "") {
      const q = search.trim();
      where.OR = [
        { studentName: { contains: q, mode: "insensitive" } },
        { studentRollNo: { contains: q, mode: "insensitive" } },
        { referenceNumber: { contains: q, mode: "insensitive" } },
        { oldBusNumber: { contains: q, mode: "insensitive" } },
        { newBusNumber: { contains: q, mode: "insensitive" } },
        { driverName: { contains: q, mode: "insensitive" } },
      ];
    }

    const take = Math.min(200, Math.max(1, parseInt(limit, 10) || 100));
    const skip = (Math.max(1, parseInt(page, 10) || 1) - 1) * take;

    const [total, history] = await Promise.all([
      prisma.busRouteChangeHistory.count({ where }),
      prisma.busRouteChangeHistory.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take,
        skip,
      }),
    ]);

    return res.json({
      success: true,
      total,
      page: parseInt(page, 10) || 1,
      totalPages: Math.ceil(total / take),
      data: history,
    });
  } catch (error) {
    console.error("getBusRouteChangeHistory error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch Bus/Route change history.",
    });
  }
};

// ── 7. STUDENT: Get Own Bus / Route Change History ─────────────────────────
// GET /api/bus-route-change/history/my
exports.getMyBusRouteChangeHistory = async (req, res) => {
  try {
    const studentId = req.user.id;

    const history = await prisma.busRouteChangeHistory.findMany({
      where: {
        studentId,
      },
      orderBy: { createdAt: "desc" },
    });

    return res.json({
      success: true,
      data: history,
    });
  } catch (error) {
    console.error("getMyBusRouteChangeHistory error:", error);
    return res.status(500).json({
      success: false,
      message: error.message || "Failed to fetch student change history.",
    });
  }
};
