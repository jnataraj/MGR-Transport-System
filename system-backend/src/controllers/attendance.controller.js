const prisma = require("../prisma/prisma");
const { triggerNotification } = require("../utils/notification");
const { getVehicleLocation, isVehicleOnline, getAllOnlineVehicles, calculateDistanceMeters, setVehicleLocation, clearVehicleLocation } = require("../utils/vehicleLocationStore");
const {
  startStudentTransit,
  endStudentTransit,
  endVehicleTransit,
  updateStudentLocation,
  updateDriverLocation,
} = require("../services/missingAlertService");

exports.recordAttendance = async (req, res) => {
  try {
    const {
      studentId, userId, driverId, coordinatorId,
      vehicleId, vehicleNumber,
      direction = "COLLEGE_TO_INROUTE",
      stage, type,
      latitude, longitude,
    } = req.body;

    const scannerUserId = userId || studentId || driverId || coordinatorId || req.user?.id;
    const targetVehicle = vehicleId || vehicleNumber || "UNASSIGNED";

    if (!scannerUserId) {
      return res.status(400).json({ success: false, message: "User ID is required to record attendance" });
    }

    const user = await prisma.user.findUnique({
      where: { id: scannerUserId },
      select: { id: true, name: true, email: true, role: true, phone: true, parentId: true, department: true, year: true },
    });
    if (!user) return res.status(404).json({ success: false, message: "User record not found" });

    const userRole = (user.role || req.user?.role || "student").toLowerCase();
    let scanType = type;
    if (!scanType) {
      scanType = userRole.includes("driver") ? "driver_scan"
        : userRole.includes("coordinator") ? "coordinator_scan"
          : "student_scan";
    }

    const now = new Date();
    const todayStr = now.toISOString().split("T")[0];
    const vehicleLoc = getVehicleLocation(targetVehicle);

    // ── GPS Proximity Check (students only, 200 m gate) ──────────────────────
    if (userRole.includes("student")) {
      // 1. Resolve vehicle GPS location — in-memory store first, DB fallback second.
      //    The store is cleared on server restart, so we need a DB fallback to handle
      //    cases where the driver scanned STARTED before the server was last restarted.
      let resolvedVehicleLoc = vehicleLoc;

      if (!resolvedVehicleLoc) {
        console.log(`[proximity-check] Store empty for "${targetVehicle}" — running DB fallback…`);

        const startOfToday = new Date(now);
        startOfToday.setHours(0, 0, 0, 0);

        // Resolve the vehicle row first so we can search by BOTH UUID and plate number.
        // Driver attendance can be stored under either key depending on which value their
        // app sent in the vehicleId field.
        const vehicleForCheck = await prisma.vehicle.findFirst({
          where: { OR: [{ id: targetVehicle }, { number: targetVehicle }] },
          select: { id: true, number: true },
        });

        const vehicleIdsToSearch = vehicleForCheck
          ? [...new Set([vehicleForCheck.id, vehicleForCheck.number, targetVehicle])]
          : [targetVehicle];

        console.log(`[proximity-check] Searching attendance for vehicleIds: ${vehicleIdsToSearch.join(", ")}`);

        // 1st fallback — driver_scan STARTED attendance record (has GPS from QR scan)
        const latestDriverScan = await prisma.attendance.findFirst({
          where: {
            vehicleId: { in: vehicleIdsToSearch },
            type: "driver_scan",
            stage: "STARTED",
            scannedAt: { gte: startOfToday },
            latitude: { not: null },
            longitude: { not: null },
          },
          orderBy: { scannedAt: "desc" },
        });

        if (latestDriverScan) {
          resolvedVehicleLoc = {
            latitude: latestDriverScan.latitude,
            longitude: latestDriverScan.longitude,
            updatedAt: latestDriverScan.scannedAt,
          };
          // Re-seed both keys in the store so the next student scan is instant
          vehicleIdsToSearch.forEach((key) =>
            setVehicleLocation(key, latestDriverScan.latitude, latestDriverScan.longitude)
          );
          console.log(`[proximity-check] ✅ Attendance fallback: vehicle at (${latestDriverScan.latitude}, ${latestDriverScan.longitude}) from driver STARTED scan`);
        } else {
          // 2nd fallback — VehicleGPSLog (most recent GPS ping persisted to DB)
          if (vehicleForCheck) {
            const latestGpsLog = await prisma.vehicleGPSLog.findFirst({
              where: {
                vehicleId: vehicleForCheck.id,
                recordedAt: { gte: startOfToday },
              },
              orderBy: { recordedAt: "desc" },
            });
            if (latestGpsLog) {
              resolvedVehicleLoc = {
                latitude: latestGpsLog.latitude,
                longitude: latestGpsLog.longitude,
                updatedAt: latestGpsLog.recordedAt,
              };
              vehicleIdsToSearch.forEach((key) =>
                setVehicleLocation(key, latestGpsLog.latitude, latestGpsLog.longitude)
              );
              console.log(`[proximity-check] ✅ GPSLog fallback: vehicle at (${latestGpsLog.latitude}, ${latestGpsLog.longitude}) from GPS log`);
            }
          }
        }

        if (!resolvedVehicleLoc) {
          console.log(`[proximity-check] ❌ No vehicle GPS found for "${targetVehicle}" (searched: ${vehicleIdsToSearch.join(", ")})`);
        }

      } else {
        console.log(`[proximity-check] ✅ Store hit: vehicle ${targetVehicle} location from in-memory store (${resolvedVehicleLoc.latitude}, ${resolvedVehicleLoc.longitude})`);
      }

      // 2. Vehicle must have a resolvable GPS location (store or DB).
      if (!resolvedVehicleLoc) {
        return res.status(422).json({
          success: false,
          message: "Vehicle GPS is not available. Please ask the driver to scan START before boarding.",
          code: "VEHICLE_OFFLINE",
        });
      }

      // 3. Student's device must have sent GPS coordinates.
      if (latitude == null || longitude == null) {
        return res.status(422).json({
          success: false,
          message: "Your device GPS location is required to mark attendance. Please enable location access and try again.",
          code: "STUDENT_GPS_MISSING",
        });
      }

      // 4. Enforce 5 km distance limit.
      const distanceMeters = calculateDistanceMeters(
        parseFloat(latitude), parseFloat(longitude),
        resolvedVehicleLoc.latitude, resolvedVehicleLoc.longitude
      );
      const PROXIMITY_LIMIT_METERS = 5000; // 5 km

      console.log(`[GPS DEBUG][BACKEND][STUDENT]
vehicleId: ${targetVehicle}
studentId: ${scannerUserId}
latitude: ${latitude}
longitude: ${longitude}
timestamp: ${now.toISOString()}`);

      console.log(`[GPS DEBUG][DISTANCE]
driverLat: ${resolvedVehicleLoc.latitude}
driverLng: ${resolvedVehicleLoc.longitude}
studentLat: ${latitude}
studentLng: ${longitude}
distanceMeters: ${Math.round(distanceMeters)}`);

      console.log(`[proximity-check] Student ${scannerUserId} is ${Math.round(distanceMeters)} m from vehicle ${targetVehicle} (limit: ${PROXIMITY_LIMIT_METERS} m)`);

      if (distanceMeters > PROXIMITY_LIMIT_METERS) {
        return res.status(422).json({
          success: false,
          message: `You are ${Math.round(distanceMeters)} m away from the bus. Please move within ${PROXIMITY_LIMIT_METERS} m to mark attendance.`,
          code: "TOO_FAR_FROM_VEHICLE",
          distanceMeters: Math.round(distanceMeters),
          limitMeters: PROXIMITY_LIMIT_METERS,
        });
      }
    }
    // ─────────────────────────────────────────────────────────────────────────


    // Resolve the real Vehicle row — targetVehicle may be either the
    // vehicle's DB id or its plate number depending on which QR/app sent it.
    const vehicleRecord = await prisma.vehicle.findFirst({
      where: { OR: [{ id: targetVehicle }, { number: targetVehicle }] },
    });

    const attendance = await prisma.attendance.create({
      data: {
        userId: user.id,
        vehicleId: targetVehicle,
        type: scanType,
        stage: stage || null,
        latitude: latitude ? parseFloat(latitude) : (vehicleLoc?.latitude ?? null),
        longitude: longitude ? parseFloat(longitude) : (vehicleLoc?.longitude ?? null),
        scannedAt: now,
      },
    });

    let rosterChanged = false;

    // ── Auto-enroll student ──
    console.log("[auto-enroll] userRole:", userRole, "| vehicleRecord found:", !!vehicleRecord, "| vehicleRecord.id:", vehicleRecord?.id);
    if (userRole.includes("student") && vehicleRecord) {
      const existing = await prisma.vehicleStudentAssignment.findFirst({
        where: { vehicleId: vehicleRecord.id, studentId: user.id },
      });
      console.log("[auto-enroll] existing assignment found:", !!existing);
      if (!existing) {
        try {
          const created = await prisma.vehicleStudentAssignment.create({
            // await prisma.vehicleStudentAssignment.create({
            data: { vehicleId: vehicleRecord.id, studentId: user.id },
          });
          console.log("[auto-enroll] ✅ created assignment:", created);
          rosterChanged = true;
        } catch (e) {
          console.log("[auto-enroll] ❌ FAILED to create assignment:", e.code, e.message);
          if (e.code !== "P2002") console.log("Auto-enroll student note:", e.message);
        }
      }

      try {
        await prisma.studentTransit.create({
          data: {
            studentId: user.id,
            studentName: user.name || "Student",
            vehicleId: targetVehicle,
            vehicleNumber: vehicleRecord?.number || targetVehicle,
            parentId: user.parentId || null,
            department: user.department || null,
            year: user.year || null,
            boardLat: latitude ? parseFloat(latitude) : null,
            boardLng: longitude ? parseFloat(longitude) : null,
            status: stageToTransitStatus(stage, direction),
            stage: stage || null,
            date: todayStr,
          },
        });
      } catch (err) {
        console.log("StudentTransit record note (non-fatal):", err.message);
      }

      if (user.parentId) {
        try {
          const io = req.app.get("io");
          await triggerNotification(io, {
            title: `Transit Update: ${stageLabel(stage)}`,
            message: `${user.name} — ${stageLabel(stage)} (Bus ${vehicleRecord?.number || targetVehicle}).`,
            type: "general",
            target: "parent",
            userId: user.parentId,
            data: { studentId: user.id, attendanceId: attendance.id, stage, vehicleId: targetVehicle },
          });
        } catch (notifErr) {
          console.log("Parent notification error (non-fatal):", notifErr.message);
        }
      }
      // ── Missing Alert Transit Lifecycle ──
      try {
        const normStage = (stage || "").toUpperCase();
        const isBoardingStage =
          normStage === "TO_COLLEGE" ||
          normStage === "TO_HOME" ||
          normStage === "MORNING_PICKUP" ||
          normStage === "MORNING_INROUTE" ||
          normStage === "EVENING_INROUTE";

        const isArrivalOrCloseStage =
          normStage === "AT_COLLEGE" ||
          normStage === "AT_HOME" ||
          normStage === "MORNING_COLLEGE" ||
          normStage === "EVENING_DROP" ||
          normStage === "CLOSED" ||
          normStage === "DROPPED";

        const io = req.app.get("io");

        if (isBoardingStage) {
          await startStudentTransit({
            studentId: user.id,
            studentName: user.name,
            studentRollNo: user.rollNumber || user.studentRollNo,
            vehicleId: vehicleRecord?.id || targetVehicle,
            vehicleNumber: vehicleRecord?.number || targetVehicle,
            driverId: vehicleRecord?.driverId,
            driverName: vehicleRecord?.driver?.name,
            stage: normStage,
            latitude,
            longitude,
            io,
          });
        } else if (isArrivalOrCloseStage) {
          const reason = normStage.includes("COLLEGE")
            ? "Arrived at College"
            : normStage.includes("HOME") || normStage.includes("DROP")
            ? "Arrived at Home"
            : "Attendance Closed";
          await endStudentTransit({
            studentId: user.id,
            reason,
            io,
          });
        }
      } catch (transitErr) {
        console.error("MissingAlert transit tracking error (non-fatal):", transitErr.message);
      }
    }

    // ── Auto-enroll coordinator ──
    if (userRole.includes("coordinator") && vehicleRecord) {
      const existing = await prisma.vehicleCoordinatorAssignment.findFirst({
        where: { vehicleId: vehicleRecord.id, coordinatorId: user.id },
      });
      if (!existing) {
        try {
          await prisma.vehicleCoordinatorAssignment.create({
            data: { vehicleId: vehicleRecord.id, coordinatorId: user.id },
          });
          rosterChanged = true;
        } catch (e) {
          if (e.code !== "P2002") console.log("Auto-enroll coordinator note:", e.message);
        }
      }
    }

    // ── Driver Scan handling (STARTED / CLOSED / auto-assign) ──
    if (userRole.includes("driver")) {
      const vehicleKey = vehicleRecord?.id || targetVehicle;
      const isStart = stage === "STARTED";
      const isClose = stage === "CLOSED";

      // 1. Update Driver (User) status in database
      const driverStatus = isStart ? "active" : isClose ? "offline" : undefined;
      if (driverStatus) {
        try {
          await prisma.user.update({
            where: { id: user.id },
            data: { status: driverStatus },
          });
        } catch (uErr) {
          console.error("Failed to update driver status:", uErr.message);
        }
      }

      // 2. Update Vehicle driver assignment and status in database
      if (vehicleRecord) {
        try {
          // Free this driver from any other vehicle they were previously driving
          await prisma.vehicle.updateMany({
            where: { driverId: user.id, NOT: { id: vehicleRecord.id } },
            data: { driverId: null },
          });

          const vehicleStatus = isStart ? "active" : isClose ? "inactive" : undefined;
          await prisma.vehicle.update({
            where: { id: vehicleRecord.id },
            data: {
              driverId: user.id,
              ...(vehicleStatus && { status: vehicleStatus }),
            },
          });
          rosterChanged = true;
        } catch (vErr) {
          console.error("Failed to update vehicle driver/status:", vErr.message);
        }
      }

      // 3. Seed / clear vehicle GPS store from driver's QR scan
      if (isStart && latitude != null && longitude != null) {
        console.log(`[GPS DEBUG][BACKEND][DRIVER]
vehicleId: ${vehicleKey}
driverId: ${user.id}
latitude: ${latitude}
longitude: ${longitude}
timestamp: ${now.toISOString()}`);

        setVehicleLocation(vehicleKey, parseFloat(latitude), parseFloat(longitude));
        if (vehicleRecord?.number && vehicleRecord.number !== vehicleKey) {
          setVehicleLocation(vehicleRecord.number, parseFloat(latitude), parseFloat(longitude));
        }
        console.log(`[attendance] 🟢 Vehicle ${vehicleKey} seeded in GPS store at (${latitude}, ${longitude}) from STARTED scan`);
      } else if (isClose) {
        clearVehicleLocation(vehicleKey);
        if (vehicleRecord?.number) clearVehicleLocation(vehicleRecord.number);
        console.log(`[attendance] 🔴 Vehicle ${vehicleKey} cleared from GPS store on CLOSED scan`);

        // Close all active missing alerts for this vehicle on trip completion
        try {
          const io = req.app.get("io");
          await endVehicleTransit({
            vehicleId: vehicleRecord?.id || targetVehicle,
            reason: "Trip Completed",
            io,
          });
        } catch (closeErr) {
          console.error("Failed to close vehicle missing alerts on trip close:", closeErr.message);
        }
      }
    }
    // ─────────────────────────────────────────────────────────────────────────

    const io = req.app.get("io");
    if (io) {
      const payload = {
        userId: user.id,
        userName: user.name,
        userRole: user.role,
        vehicleId: targetVehicle,
        scanType,
        stage: stage || null,
        direction,
        scannedAt: now.toISOString(),
        latitude,
        longitude,
        vehicleLatitude: vehicleLoc?.latitude ?? null,
        vehicleLongitude: vehicleLoc?.longitude ?? null,
      };
      io.to(`user_${user.id}`).emit("student_boarded", payload);
      io.to(userRole).emit("attendance_scanned", payload);
      io.emit("attendance_scanned", payload);

      if (userRole.includes("driver")) {
        const vId = vehicleRecord?.id || targetVehicle;
        const vNum = vehicleRecord?.number || targetVehicle;
        if (stage === "STARTED") {
          io.emit("busLocationChanged", {
            vehicleId: vId,
            id: vId,
            number: vNum,
            latitude: latitude ? parseFloat(latitude) : undefined,
            longitude: longitude ? parseFloat(longitude) : undefined,
            lat: latitude ? parseFloat(latitude) : undefined,
            lng: longitude ? parseFloat(longitude) : undefined,
            role: "driver",
            driverId: user.id,
            status: "active",
          });
          io.emit("vehicleUpdated", { id: vId, number: vNum, driverId: user.id, status: "active" });
          io.emit("userUpdated", { id: user.id, role: user.role, status: "active" });
        } else if (stage === "CLOSED") {
          io.emit("busLocationStopped", {
            vehicleId: vId,
            id: vId,
            number: vNum,
            driverId: user.id,
            status: "offline",
          });
          io.emit("vehicleUpdated", { id: vId, number: vNum, status: "inactive" });
          io.emit("userUpdated", { id: user.id, role: user.role, status: "offline" });
        }
      }

      // Tell the Vehicles admin page to refresh this vehicle's roster panel.
      if (rosterChanged && vehicleRecord) {
        io.emit("vehicleMembersUpdated", { vehicleId: vehicleRecord.id, reason: "qr_auto_enroll" });
      }
    }

    return res.status(201).json({
      success: true,
      message: `${user.name} (${user.role.toUpperCase()}) marked ${stageLabel(stage)}`,
      attendance,
      autoEnrolled: rosterChanged,
      vehicleLocation: vehicleLoc,
    });
  } catch (error) {
    console.error("recordAttendance Error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to record attendance" });
  }
};

exports.getAttendanceHistory = async (req, res) => {
  try {
    const { userId, vehicleId, type, limit = 50 } = req.query;
    const where = {};
    if (userId) where.userId = userId;
    if (vehicleId) where.vehicleId = vehicleId;
    if (type) where.type = type;

    const history = await prisma.attendance.findMany({
      where,
      orderBy: { scannedAt: "desc" },
      take: parseInt(limit, 10) || 50,
    });

    return res.status(200).json({ success: true, attendance: history });
  } catch (error) {
    console.error("getAttendanceHistory Error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to fetch attendance history" });
  }
};

/**
 * Get the student's most recent attendance stage for TODAY only.
 * Used by the app on load/refresh to restore real state instead of
 * resetting to PICKUP every time.
 * GET /api/attendance/current?userId=xxx
 */
exports.getCurrentStatus = async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ success: false, message: "userId is required" });
    }

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const latest = await prisma.attendance.findFirst({
      where: {
        userId,
        scannedAt: { gte: startOfToday },
      },
      orderBy: { scannedAt: "desc" },
    });

    return res.status(200).json({
      success: true,
      stage: latest?.stage || null, // null = no scan yet today, app should default to PICKUP
      vehicleId: latest?.vehicleId || null,
      scannedAt: latest?.scannedAt || null,
    });
  } catch (error) {
    console.error("getCurrentStatus Error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to fetch current status" });
  }
};

exports.getDriverStatus = async (req, res) => {
  try {
    const { userId } = req.query;
    if (!userId) {
      return res.status(400).json({ success: false, message: "userId is required" });
    }

    const vehicle = await prisma.vehicle.findFirst({
      where: { driverId: userId },
    });

    if (!vehicle) {
      return res.status(200).json({
        success: true,
        onDuty: false,
        vehicleId: null,
        vehicleNumber: null,
      });
    }

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    // Most recent driver_scan today tells us whether they last toggled
    // START or CLOSED — not just "did they scan at all today".
    const latestScan = await prisma.attendance.findFirst({
      where: {
        userId,
        type: "driver_scan",
        scannedAt: { gte: startOfToday },
      },
      orderBy: { scannedAt: "desc" },
    });

    return res.status(200).json({
      success: true,
      onDuty: latestScan?.stage === "STARTED",
      vehicleId: vehicle.id,
      vehicleNumber: vehicle.number,
      lastScanAt: latestScan?.scannedAt || null,
    });
  } catch (error) {
    console.error("getDriverStatus Error:", error);
    return res.status(500).json({ success: false, message: error.message || "Failed to fetch driver status" });
  }
};

/**
 * Diagnostic endpoint — shows exactly what GPS data the backend has for a vehicle.
 * Use this to debug VEHICLE_OFFLINE errors.
 * GET /api/attendance/vehicle-gps-status?vehicleId=TN-05-NJ-1008
 */
exports.getVehicleGPSStatus = async (req, res) => {
  try {
    const { vehicleId } = req.query;
    if (!vehicleId) {
      return res.status(400).json({ success: false, message: "vehicleId query param is required" });
    }

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    // 1. In-memory store
    const inMemoryLoc = getVehicleLocation(vehicleId);

    // 2. Vehicle DB record
    const vehicleRecord = await prisma.vehicle.findFirst({
      where: { OR: [{ id: vehicleId }, { number: vehicleId }] },
      select: { id: true, number: true, driverId: true, status: true },
    });

    const vehicleIdsToSearch = vehicleRecord
      ? [...new Set([vehicleRecord.id, vehicleRecord.number, vehicleId])]
      : [vehicleId];

    // 3. All driver scans today (any stage)
    const todayDriverScans = await prisma.attendance.findMany({
      where: {
        vehicleId: { in: vehicleIdsToSearch },
        type: "driver_scan",
        scannedAt: { gte: startOfToday },
      },
      orderBy: { scannedAt: "desc" },
      take: 10,
    });

    // 4. Latest GPS log entry today
    const latestGpsLog = vehicleRecord
      ? await prisma.vehicleGPSLog.findFirst({
        where: { vehicleId: vehicleRecord.id, recordedAt: { gte: startOfToday } },
        orderBy: { recordedAt: "desc" },
      })
      : null;

    // 5. Summary diagnosis
    const hasStartedScanWithGPS = todayDriverScans.some(
      (s) => s.stage === "STARTED" && s.latitude != null && s.longitude != null
    );
    const hasStartedScanWithoutGPS = todayDriverScans.some(
      (s) => s.stage === "STARTED" && (s.latitude == null || s.longitude == null)
    );

    let diagnosis;
    if (inMemoryLoc) {
      diagnosis = "✅ GPS READY — in-memory store has vehicle location (live socket updates active)";
    } else if (hasStartedScanWithGPS) {
      diagnosis = "✅ GPS READY via DB — STARTED scan with GPS exists. Server restart may have cleared the in-memory store; it will be re-seeded on first student scan.";
    } else if (hasStartedScanWithoutGPS) {
      diagnosis = "⚠️ STARTED scan found but GPS coords are NULL — driver app did not send lat/lng with the QR scan. Check GPS permission in driver app.";
    } else if (todayDriverScans.length > 0) {
      diagnosis = `⚠️ Driver scans found today but none with stage=STARTED. Latest stage: '${todayDriverScans[0].stage}'. Driver may need to re-scan START.`;
    } else {
      diagnosis = "❌ NO driver scan found today for this vehicle. Driver must open the app and scan the vehicle QR code to START.";
    }

    return res.status(200).json({
      success: true,
      vehicleId,
      diagnosis,
      inMemoryStore: inMemoryLoc
        ? { latitude: inMemoryLoc.latitude, longitude: inMemoryLoc.longitude, updatedAt: inMemoryLoc.updatedAt }
        : null,
      vehicleRecord: vehicleRecord || null,
      searchedVehicleIds: vehicleIdsToSearch,
      todayDriverScans: todayDriverScans.map((s) => ({
        id: s.id,
        storedVehicleId: s.vehicleId,   // ← exact value in DB
        stage: s.stage,
        type: s.type,
        latitude: s.latitude,
        longitude: s.longitude,
        scannedAt: s.scannedAt,
        hasGPS: s.latitude != null && s.longitude != null,
      })),
      latestGpsLog: latestGpsLog
        ? { latitude: latestGpsLog.latitude, longitude: latestGpsLog.longitude, recordedAt: latestGpsLog.recordedAt }
        : null,
    });
  } catch (error) {
    console.error("getVehicleGPSStatus Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};


function stageToTransitStatus(stage, direction) {
  const map = {
    PICKUP: "waiting_pickup", TO_COLLEGE: "in_transit_college", AT_COLLEGE: "at_college",
    TO_HOME: "in_transit_home", AT_HOME: "dropped_home",
  };
  return map[stage] || (direction === "INROUTE_TO_HOME" ? "in_transit_home" : "in_transit_college");
}
function stageLabel(stage) {
  const map = {
    PICKUP: "Waiting for Pickup", TO_COLLEGE: "In-Route to College", AT_COLLEGE: "Arrived at College",
    TO_HOME: "In-Route to Home", AT_HOME: "Arrived Home",
  };
  return map[stage] || "Transit Update";
}

/**
 * GET /api/attendance/bus-location?vehicleId=<id_or_number>
 *
 * Returns the most recent in-memory GPS snapshot for the given vehicle and
 * whether the driver is currently considered online (last ping < 45 s ago).
 * Used by the student/parent Live Bus Tracking map to get an immediate
 * position when the modal first opens, before the next socket broadcast.
 */
exports.getBusLiveLocation = async (req, res) => {
  try {
    const { vehicleId } = req.query;
    if (!vehicleId) {
      return res.status(400).json({ success: false, message: "vehicleId query param is required" });
    }

    // The in-memory store is keyed by vehicleId (UUID or number string from driver app).
    // Try the raw value first; if missing, look up by vehicle number in the DB.
    let loc = getVehicleLocation(vehicleId);
    let online = isVehicleOnline(vehicleId);

    // Resolve vehicle record (needed to find the driver)
    let vehicleRecord = await prisma.vehicle.findFirst({
      where: { OR: [{ id: vehicleId }, { number: vehicleId }] },
      select: { id: true, number: true, driverId: true, driver: { select: { id: true, status: true } } },
    });

    if (!loc && vehicleRecord) {
      // Resolve: maybe the client sent the vehicle number, store has the UUID (or vice-versa)
      const altKey = vehicleRecord.id === vehicleId ? vehicleRecord.number : vehicleRecord.id;
      loc = getVehicleLocation(altKey) || null;
      online = isVehicleOnline(altKey);
    }

    // ── Driver status checks ───────────────────────────────────────────────
    // driverActive: driver account is NOT suspended or inactive.
    //   Drivers have a dynamic status toggled between "Offline" ↔ "Active"
    //   (capital A) by QR scan — they are "active" as long as they are not
    //   explicitly suspended or set to inactive by an admin.
    // driverOnDuty: driver performed a STARTED scan today (most recent scan).
    let driverActive = false;
    let driverOnDuty = false;

    const driverId = vehicleRecord?.driver?.id || vehicleRecord?.driverId || null;
    if (driverId) {
      // Fetch the driver's latest status fresh from DB (vehicleRecord.driver may be stale)
      const driverUser = await prisma.user.findUnique({
        where: { id: driverId },
        select: { status: true },
      });
      // Active = account is NOT suspended or inactive
      const driverStatus = (driverUser?.status || "").toLowerCase();
      driverActive = driverStatus !== "inactive" && driverStatus !== "suspended";

      // OnDuty: most-recent driver_scan today must be stage=STARTED
      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const latestScan = await prisma.attendance.findFirst({
        where: {
          userId: driverId,
          type: "driver_scan",
          scannedAt: { gte: startOfToday },
        },
        orderBy: { scannedAt: "desc" },
      });
      driverOnDuty = latestScan?.stage === "STARTED";
    }

    return res.json({
      success: true,
      online,
      driverActive,
      driverOnDuty,
      location: loc
        ? {
          latitude: loc.latitude,
          longitude: loc.longitude,
          updatedAt: loc.updatedAt,
        }
        : null,
    });
  } catch (err) {
    console.error("[getBusLiveLocation]", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * Today's live attendance snapshot for a department (or ALL departments).
 * GET /api/attendance/department-summary?department=Computer%20Science%20%26%20Engg.
 * GET /api/attendance/department-summary?department=ALL   ← HoD all-dept view
 */
exports.getDepartmentAttendanceSummary = async (req, res) => {
  try {
    const { department } = req.query;
    if (!department) {
      return res.status(400).json({ success: false, message: "department is required" });
    }

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    // ── Resolve student filter ──────────────────────────────────────────────
    const studentFilter =
      department === "ALL"
        ? { role: "student" }
        : { role: "student", department };

    const students = await prisma.user.findMany({
      where: studentFilter,
      select: {
        id: true, name: true, rollNumber: true, year: true, department: true,
        studentAssignments: { include: { vehicle: true } },
      },
      orderBy: [{ department: "asc" }, { name: "asc" }],
    });

    const studentIds = students.map((s) => s.id);

    const todayScans = await prisma.attendance.findMany({
      where: {
        userId: { in: studentIds },
        type: "student_scan",
        scannedAt: { gte: startOfToday },
      },
      orderBy: { scannedAt: "desc" },
    });

    // Keep only the latest scan per student (first occurrence = most recent due to orderBy desc)
    const latestByStudent = {};
    for (const rec of todayScans) {
      if (!latestByStudent[rec.userId]) latestByStudent[rec.userId] = rec;
    }

    const presentList = [];
    const absentList = [];

    for (const s of students) {
      const rec = latestByStudent[s.id];
      const vehicle = s.studentAssignments?.[0]?.vehicle;
      const base = {
        id: s.id,
        name: s.name,
        rollNumber: s.rollNumber,
        year: s.year,
        department: s.department || "—",
        route: vehicle?.route || vehicle?.number || "—",
      };
      if (rec) {
        presentList.push({ ...base, stage: rec.stage, scannedAt: rec.scannedAt });
      } else {
        // Only truly absent = no scan at all today
        absentList.push(base);
      }
    }

    // ── Per-department breakdown (useful for ALL mode) ─────────────────────
    const deptMap = {};
    for (const s of students) {
      const dept = s.department || "Unknown";
      if (!deptMap[dept]) deptMap[dept] = { department: dept, total: 0, present: 0, absent: 0 };
      deptMap[dept].total += 1;
      if (latestByStudent[s.id]) {
        deptMap[dept].present += 1;
      } else {
        deptMap[dept].absent += 1;
      }
    }
    const deptBreakdown = Object.values(deptMap).sort((a, b) => a.department.localeCompare(b.department));

    return res.status(200).json({
      success: true,
      department,
      totalStudents: students.length,
      presentCount: presentList.length,
      absentCount: absentList.length,
      presentList,
      absentList,
      deptBreakdown,
    });
  } catch (error) {
    console.error("getDepartmentAttendanceSummary Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * Day-wise attendance history for a department (used by HoD History screen).
 * GET /api/attendance/department-history?department=...&days=7
 */
exports.getDepartmentAttendanceHistory = async (req, res) => {
  try {
    const { department, days = 7 } = req.query;
    if (!department) {
      return res.status(400).json({ success: false, message: "department is required" });
    }
    const numDays = parseInt(days, 10) || 7;

    const students = await prisma.user.findMany({
      where: { role: "student", department },
      select: { id: true },
    });
    const studentIds = students.map((s) => s.id);
    const totalStudents = studentIds.length;

    const dayWise = [];
    for (let i = numDays - 1; i >= 0; i--) {
      const dayStart = new Date();
      dayStart.setHours(0, 0, 0, 0);
      dayStart.setDate(dayStart.getDate() - i);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);

      const scans = await prisma.attendance.findMany({
        where: {
          userId: { in: studentIds },
          type: "student_scan",
          scannedAt: { gte: dayStart, lt: dayEnd },
        },
        select: { userId: true },
      });
      const present = new Set(scans.map((s) => s.userId)).size;
      const absent = totalStudents - present;
      const rate = totalStudents ? ((present / totalStudents) * 100).toFixed(1) : "0.0";

      dayWise.push({
        date: dayStart.toISOString().split("T")[0],
        label: dayStart.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short" }),
        present,
        absent,
        rate: `${rate}%`,
      });
    }

    const avgRate = dayWise.length
      ? (dayWise.reduce((sum, r) => sum + parseFloat(r.rate), 0) / dayWise.length).toFixed(1)
      : "0.0";
    const totalAbsent = dayWise.reduce((sum, r) => sum + r.absent, 0);

    return res.status(200).json({
      success: true,
      department,
      totalStudents,
      daysTracked: dayWise.length,
      avgAttendanceRate: `${avgRate}%`,
      totalAbsent,
      dayWise,
    });
  } catch (error) {
    console.error("getDepartmentAttendanceHistory Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /api/attendance/live-vehicles
 * Returns list of vehicle IDs / numbers currently active/online
 */
exports.getLiveVehicles = async (req, res) => {
  try {
    const liveVehicles = getAllOnlineVehicles();
    return res.status(200).json({
      success: true,
      liveVehicles,
    });
  } catch (error) {
    console.error("getLiveVehicles Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};


exports.getDashboardBoardingSummary = async (req, res) => {
  try {
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);

    const students = await prisma.user.findMany({
      where: { role: "student" },
      select: {
        id: true,
        studentAssignments: {
          select: {
            vehicleId: true,
            vehicle: { select: { id: true, number: true, route: true } },
          },
        },
      },
    });

    const todayScans = await prisma.attendance.findMany({
      where: {
        type: "student_scan",
        scannedAt: { gte: startOfToday },
      },
      select: { userId: true },
    });

    const boardedStudentIds = new Set(todayScans.map((s) => s.userId));
    const zoneMap = new Map();

    const getOrCreate = (zoneName) => {
      if (!zoneMap.has(zoneName)) {
        zoneMap.set(zoneName, {
          zone: zoneName,
          assignedStudents: new Set(),
          boardedStudents: new Set(),
          vehicles: new Set(),
        });
      }
      return zoneMap.get(zoneName);
    };

    const assignedStudentIds = new Set();
    for (const student of students) {
      const assignment = student.studentAssignments?.[0];
      if (assignment?.vehicle) {
        const zoneName = assignment.vehicle.route?.trim() || "Unassigned";
        const entry = getOrCreate(zoneName);
        entry.assignedStudents.add(student.id);
        entry.vehicles.add(assignment.vehicle.number);
        if (boardedStudentIds.has(student.id)) {
          entry.boardedStudents.add(student.id);
        }
        assignedStudentIds.add(student.id);
      }
    }

    const totalAssigned = assignedStudentIds.size;
    const totalBoarded = boardedStudentIds.size;
    const zones = Array.from(zoneMap.values())
      .map((z) => ({
        zone: z.zone,
        assigned: z.assignedStudents.size,
        present: z.boardedStudents.size,
        percentage:
          z.assignedStudents.size > 0
            ? Math.round((z.boardedStudents.size / z.assignedStudents.size) * 100)
            : 0,
        vehicles: Array.from(z.vehicles),
      }))
      .sort((a, b) => a.zone.localeCompare(b.zone));

    return res.status(200).json({
      success: true,
      boarded: totalBoarded,
      total: totalAssigned,
      zones,
    });
  } catch (error) {
    console.error("getDashboardBoardingSummary Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/attendance/student-location
 * REST endpoint for student GPS pings (continuous location updates while in transit)
 */
exports.recordStudentLocation = async (req, res) => {
  try {
    const { studentId, userId, vehicleId, vehicleNumber, latitude, longitude } = req.body;
    const targetUserId = studentId || userId || req.user?.id;

    if (!targetUserId || latitude == null || longitude == null) {
      return res.status(400).json({
        success: false,
        message: "studentId, latitude and longitude are required",
      });
    }

    const now = new Date();

    // 1. Update Student's lastSeenAt timestamp in DB
    try {
      await prisma.user.update({
        where: { id: targetUserId },
        data: { lastSeenAt: now },
      });
    } catch (dbErr) {
      console.warn(`[StudentTracking] Could not update User.lastSeenAt for ${targetUserId}:`, dbErr.message);
    }

    const io = req.app.get("io");
    const alert = await updateStudentLocation({
      studentId: targetUserId,
      vehicleId,
      vehicleNumber,
      latitude,
      longitude,
      io,
    });

    return res.status(200).json({
      success: true,
      message: "Student location & heartbeat recorded",
      lastSeenAt: now.toISOString(),
      missingAlert: alert && alert.status === "ACTIVE" ? alert : null,
    });
  } catch (error) {
    console.error("recordStudentLocation Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /api/attendance/driver-location
 * REST endpoint for driver background/foreground location updates & heartbeats
 */
exports.recordDriverLocation = async (req, res) => {
  try {
    const {
      driverId,
      userId,
      vehicleId,
      vehicleNumber,
      latitude,
      longitude,
      speed,
      heading,
      isHalted,
      timestamp,
      role = "driver",
    } = req.body;

    const targetDriverId = driverId || userId || req.user?.id;
    if (!targetDriverId) {
      return res.status(400).json({
        success: false,
        message: "driverId or userId is required",
      });
    }

    const now = new Date();

    // 1. Update Driver's lastSeenAt timestamp in DB
    try {
      await prisma.user.update({
        where: { id: targetDriverId },
        data: { lastSeenAt: now },
      });
    } catch (dbErr) {
      // Driver might be simulated or id slightly different
      console.warn(`[DriverTracking] Could not update User.lastSeenAt for ${targetDriverId}:`, dbErr.message);
    }

    // 2. Resolve vehicle if not provided
    let resolvedVehicleId = vehicleId;
    let resolvedVehicleNumber = vehicleNumber;

    if (!resolvedVehicleId && targetDriverId) {
      const vehicle = await prisma.vehicle.findFirst({
        where: { driverId: targetDriverId },
        select: { id: true, number: true },
      });
      if (vehicle) {
        resolvedVehicleId = vehicle.id;
        resolvedVehicleNumber = vehicle.number;
      }
    }

    const lat = latitude != null ? parseFloat(latitude) : null;
    const lng = longitude != null ? parseFloat(longitude) : null;

    // 3. Update in-memory store
    if (resolvedVehicleId && lat != null && lng != null) {
      console.log(`[GPS DEBUG][BACKEND][DRIVER]
vehicleId: ${resolvedVehicleId}
driverId: ${targetDriverId}
latitude: ${lat}
longitude: ${lng}
timestamp: ${now.toISOString()}`);

      setVehicleLocation(resolvedVehicleId, lat, lng, {
        vehicleNumber: resolvedVehicleNumber,
        driverId: targetDriverId,
        speed,
        heading,
        isHalted,
      });
    } else if (targetDriverId && lat != null && lng != null) {
      setVehicleLocation(targetDriverId, lat, lng, {
        driverId: targetDriverId,
        speed,
        heading,
        isHalted,
      });
    }

    const io = req.app.get("io");

    // 4. Update student missing proximity checks if location is present
    if (resolvedVehicleId && lat != null && lng != null) {
      try {
        await updateDriverLocation({
          vehicleId: resolvedVehicleId,
          vehicleNumber: resolvedVehicleNumber,
          driverId: targetDriverId,
          latitude: lat,
          longitude: lng,
          io,
        });
      } catch (proxErr) {
        console.error("[DriverTracking] Proximity update error:", proxErr.message);
      }
    }

    // 5. Broadcast to connected clients / Web Admin
    if (io && (resolvedVehicleId || targetDriverId)) {
      io.emit("busLocationChanged", {
        vehicleId: resolvedVehicleId,
        vehicleNumber: resolvedVehicleNumber,
        driverId: targetDriverId,
        lat,
        lng,
        latitude: lat,
        longitude: lng,
        speed: speed != null ? parseFloat(speed) : 0,
        heading: heading != null ? parseFloat(heading) : null,
        isHalted: !!isHalted,
        role,
        timestamp: timestamp || now.toISOString(),
      });
    }

    return res.status(200).json({
      success: true,
      message: "Driver location & heartbeat recorded",
      lastSeenAt: now.toISOString(),
    });
  } catch (error) {
    console.error("[DriverTracking] recordDriverLocation Error:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
};


