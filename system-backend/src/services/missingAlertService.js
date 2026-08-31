const prisma = require("../prisma/prisma");
const { getVehicleLocation, calculateDistanceMeters, setVehicleLocation } = require("../utils/vehicleLocationStore");
const { sendPushNotification } = require("../utils/notification");

// ─── Configurable thresholds (override via environment variables) ─────────────

/**
 * Distance (in metres) the bus must be from the student to raise a Missing Alert.
 * This is STUDENT-TO-BUS distance — NOT student movement distance.
 */
const MISSING_DISTANCE_THRESHOLD_METERS =
  process.env.MISSING_DISTANCE_THRESHOLD_METERS
    ? parseFloat(process.env.MISSING_DISTANCE_THRESHOLD_METERS)
    : 10;

/**
 * Minimum GPS displacement (in metres) required to consider a student MOVING.
 * Changes smaller than this are treated as GPS jitter and the student is marked STATIONARY.
 * Single source of truth — do NOT duplicate this value anywhere else.
 */
const STUDENT_MOVEMENT_THRESHOLD_METERS =
  process.env.STUDENT_MOVEMENT_THRESHOLD_METERS
    ? parseFloat(process.env.STUDENT_MOVEMENT_THRESHOLD_METERS)
    : 10;

/**
 * Maximum age (milliseconds) of a student GPS fix before it is considered STALE.
 * A stale fix must NOT trigger a MOVING status — we simply don't know where the student is.
 */
const STUDENT_LOCATION_STALE_MS =
  process.env.STUDENT_LOCATION_STALE_MS
    ? parseInt(process.env.STUDENT_LOCATION_STALE_MS, 10)
    : 90_000; // 90 seconds default

// ─────────────────────────────────────────────────────────────────────────────

/**
 * In-memory store of students currently in transit.
 * studentId -> {
 *   studentId, studentName, studentRollNo,
 *   vehicleId, vehicleNumber, driverId, driverName, stage,
 *   studentLat, studentLng, lastStudentUpdate, activeAlertId,
 *   studentMovementDistance,  // metres student moved between last two GPS fixes
 *   studentMovementStatus,    // "MOVING" | "STATIONARY" | "STALE" | "UNKNOWN"
 * }
 */
const inTransitStudents = new Map();

/**
 * Previous GPS fix per student — used ONLY for student movement calculation.
 * studentId -> { lat, lng, timestamp }
 *
 * Completely separate from studentLat/studentLng in inTransitStudents
 * and completely separate from bus/driver location.
 */
const studentPreviousLocations = new Map();

/**
 * Format coordinates nicely for display
 */
const formatCoords = (lat, lng) => {
  if (lat == null || lng == null) return "Unknown";
  return `${parseFloat(lat).toFixed(5)}, ${parseFloat(lng).toFixed(5)}`;
};

/**
 * Resolve exact notification recipients for a Student Missing Alert:
 * 1. Web Admin users (superadmin, admin, deptadmin)
 * 2. Coordinator assigned to the SAME vehicle (assignedVehicleId === studentAssignedVehicleId)
 * 3. Driver assigned to the SAME vehicle (assignedVehicleId === studentAssignedVehicleId)
 * 4. Parent(s) assigned to that SPECIFIC student ONLY
 * 5. HOD of that student's department ONLY
 * All other users are excluded.
 */
const resolveMissingAlertRecipients = async (studentTransit) => {
  let vehicle = null;
  const studentId = studentTransit?.studentId;

  // 1. Find Student record from DB to get Department, Roll Number, Parent links
  let studentUser = null;
  if (studentId) {
    studentUser = await prisma.user.findFirst({
      where: {
        OR: [
          { id: studentId },
          ...(studentTransit.studentRollNo ? [{ rollNumber: studentTransit.studentRollNo }] : []),
        ],
      },
    });
  }

  // 2. Find student's assigned vehicle
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
  const studentDepartment = studentUser?.department || null;

  // 3. Find Web Admin recipients
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

  // 4. Find Driver assigned to the SAME vehicle
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

  // 5. Find Coordinator(s) assigned to the SAME vehicle
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

  // 6. Find Parent(s) assigned to this specific student ONLY
  let assignedParents = [];
  const parentQueries = [];

  if (studentUser?.parentId) {
    parentQueries.push({ id: studentUser.parentId });
  }
  if (studentUser?.rollNumber || studentTransit?.studentRollNo) {
    parentQueries.push({
      role: { equals: "parent", mode: "insensitive" },
      studentRollNo: studentUser?.rollNumber || studentTransit?.studentRollNo,
    });
  }
  if (studentUser?.parentPhone) {
    parentQueries.push({
      role: { equals: "parent", mode: "insensitive" },
      phone: studentUser.parentPhone,
    });
  }

  if (parentQueries.length > 0) {
    assignedParents = await prisma.user.findMany({
      where: {
        status: "active",
        OR: parentQueries,
      },
      select: { id: true, name: true, role: true, phone: true, pushToken: true },
    });
  }

  // 7. Find HOD of that student's department ONLY
  let assignedHods = [];
  if (studentDepartment) {
    assignedHods = await prisma.user.findMany({
      where: {
        role: { in: ["hod", "deptadmin"], mode: "insensitive" },
        status: "active",
        OR: [
          { department: { equals: studentDepartment, mode: "insensitive" } },
          { sector: { equals: studentDepartment, mode: "insensitive" } },
        ],
      },
      select: { id: true, name: true, role: true, department: true, pushToken: true },
    });
  }

  // Deduplicate and compile recipients
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

  // Add Assigned Parent(s) (if any)
  assignedParents.forEach((parent) => {
    if (parent && parent.id) {
      recipientMap.set(parent.id, {
        id: parent.id,
        name: parent.name,
        role: "parent",
        category: "assigned_parent",
        pushToken: parent.pushToken,
        studentId: studentUser?.id || studentTransit.studentId,
        studentName: studentUser?.name || studentTransit.studentName,
      });
    }
  });

  // Add Assigned HOD(s) (if any)
  assignedHods.forEach((hod) => {
    if (hod && hod.id) {
      recipientMap.set(hod.id, {
        id: hod.id,
        name: hod.name,
        role: "hod",
        category: "department_hod",
        department: hod.department || studentDepartment,
        pushToken: hod.pushToken,
      });
    }
  });

  const finalRecipients = Array.from(recipientMap.values());

  // Backend logs formatted as requested
  console.log("-----------------------------------------------------------------");
  console.log("[Student Missing Alert]");
  console.log(`Student ID: ${studentTransit?.studentId || "N/A"}`);
  console.log(`Student Name: ${studentTransit?.studentName || "N/A"}`);
  console.log(`Department: ${studentDepartment || "N/A"}`);
  console.log(`Assigned Vehicle ID: ${assignedVehicleId}`);
  console.log(`Assigned Vehicle Name: ${assignedVehicleNumber}`);
  console.log(`Parent Recipient(s): ${assignedParents.length > 0 ? assignedParents.map((p) => `${p.name} (${p.id})`).join(", ") : "None"}`);
  console.log(`HOD Recipient(s): ${assignedHods.length > 0 ? assignedHods.map((h) => `${h.name} (${h.id}) - ${h.department || studentDepartment}`).join(", ") : "None"}`);
  console.log(`Coordinator Recipient: ${assignedCoordinators.length > 0 ? assignedCoordinators.map((c) => `${c.name} (${c.id})`).join(", ") : "None"}`);
  console.log(`Driver Recipient: ${assignedDriver ? `${assignedDriver.name} (${assignedDriver.id})` : "None"}`);
  console.log(`Web Admin Recipients: ${webAdminUsers.map((a) => `${a.name} (${a.id})`).join(", ") || "None"}`);
  console.log(`Final Notification Recipients: ${finalRecipients.map((r) => `${r.name} [${r.role}]`).join(", ") || "None"}`);
  console.log("-----------------------------------------------------------------");

  return {
    vehicle,
    studentUser,
    studentDepartment,
    assignedVehicleId,
    assignedVehicleNumber,
    webAdminUsers,
    assignedDriver,
    assignedCoordinators,
    assignedParents,
    assignedHods,
    finalRecipients,
  };
};

/**
 * Dispatch notification ONLY to Web Admin, Same Vehicle Driver & Coordinator, Student's Parent, and Department HOD
 * Ensures strictly 1 Notification record in DB per (recipient, active missing student)
 */
const dispatchMissingAlertNotifications = async (io, alertPayload, studentTransit, distanceMeters) => {
  const {
    studentUser,
    studentDepartment,
    assignedVehicleId,
    assignedVehicleNumber,
    webAdminUsers,
    assignedDriver,
    assignedCoordinators,
    assignedParents,
    assignedHods,
  } = await resolveMissingAlertRecipients(studentTransit);

  const title = "🚨 Student Missing Alert";
  // distanceMeters passed in = STUDENT-TO-BUS distance (NOT student movement)
  const studentBusDistStr = (Math.round(distanceMeters * 10) / 10).toFixed(1);
  const movementStatus = studentTransit.studentMovementStatus || "UNKNOWN";
  const driverMessage =
    `Student: ${studentTransit.studentName}\n` +
    `Student ↔ Bus Distance: ${studentBusDistStr} m (> ${MISSING_DISTANCE_THRESHOLD_METERS}m threshold)\n` +
    `Student Movement: ${movementStatus}\n` +
    `Please check the student's location.`;
  const parentMessage =
    `Alert: Student ${studentTransit.studentName} is more than ${MISSING_DISTANCE_THRESHOLD_METERS} meters away from ` +
    `assigned vehicle ${assignedVehicleNumber}. Student movement status: ${movementStatus}. Please check student status.`;
  const hodMessage =
    `Alert: Student ${studentTransit.studentName} ` +
    `(${studentTransit.studentRollNo || studentUser?.rollNumber || "N/A"}) from ` +
    `${studentDepartment || "Department"} is more than ${MISSING_DISTANCE_THRESHOLD_METERS} meters away from ` +
    `assigned vehicle ${assignedVehicleNumber}. Student movement: ${movementStatus}.`;

  const commonData = {
    alertId: alertPayload.id,
    studentId: studentTransit.studentId,
    studentName: studentTransit.studentName,
    studentRollNo: studentTransit.studentRollNo,
    department: studentDepartment,
    vehicleId: assignedVehicleId,
    vehicleNumber: assignedVehicleNumber,
    // Proximity: student ↔ bus distance (what triggered the alert)
    distanceMeters: alertPayload.distanceMeters,
    studentBusDistance: alertPayload.studentBusDistance ?? alertPayload.distanceMeters,
    // Student movement: independent of bus position
    studentMovementStatus: movementStatus,
    studentMovementDistance: alertPayload.studentMovementDistance ?? 0,
    driverAlertTitle: title,
    driverAlertMessage: driverMessage,
    notificationType: "missing_alert",
  };

  // 1. Deliver to Web Admin via Real-Time Socket
  if (io) {
    if (typeof io.emit === "function") {
      io.emit("student_missing_alert", alertPayload);
      io.emit("new_missing_alert", alertPayload);
    }
  }

  // 1. Web Admin DB Notification (Strictly 1 record per active missing student)
  try {
    const existingAdminNotif = await prisma.notification.findFirst({
      where: {
        type: "missing_alert",
        target: "admin",
        data: { contains: `"studentId":"${studentTransit.studentId}"` },
      },
      orderBy: { createdAt: "desc" },
    });

    if (existingAdminNotif) {
      // Update existing notification with latest distance
      await prisma.notification.update({
        where: { id: existingAdminNotif.id },
        data: {
          message: driverMessage,
          data: JSON.stringify(commonData),
        },
      });
    } else {
      // Create ONE new notification
      const adminNotif = await prisma.notification.create({
        data: {
          title,
          message: driverMessage,
          type: "missing_alert",
          sender: "System",
          target: "admin",
          data: JSON.stringify(commonData),
        },
      });

      const adminTokens = webAdminUsers.map((a) => a.pushToken).filter(Boolean);
      if (adminTokens.length > 0) {
        await sendPushNotification(adminTokens, title, driverMessage, commonData);
      }

      if (io && typeof io.to === "function") {
        io.to("admin").emit("new_notification", adminNotif);
        io.to("superadmin").emit("new_notification", adminNotif);
        io.to("deptadmin").emit("new_notification", adminNotif);
      }
    }
  } catch (err) {
    console.error("[missingAlertService] Admin notification error:", err.message);
  }

  // 2. Deliver ONLY to Assigned Driver of the SAME vehicle (Strictly 1 record per active missing student)
  if (assignedDriver && assignedDriver.id) {
    try {
      if (io && typeof io.to === "function") {
        io.to(`user_${assignedDriver.id}`).emit("driver_student_missing_alert", alertPayload);
      }

      const existingDriverNotif = await prisma.notification.findFirst({
        where: {
          type: "missing_alert",
          userId: assignedDriver.id,
          data: { contains: `"studentId":"${studentTransit.studentId}"` },
        },
        orderBy: { createdAt: "desc" },
      });

      if (existingDriverNotif) {
        await prisma.notification.update({
          where: { id: existingDriverNotif.id },
          data: {
            message: driverMessage,
            data: JSON.stringify(commonData),
          },
        });
      } else {
        const driverNotif = await prisma.notification.create({
          data: {
            title,
            message: driverMessage,
            type: "missing_alert",
            sender: "System",
            target: "driver",
            userId: assignedDriver.id,
            data: JSON.stringify(commonData),
          },
        });

        if (io && typeof io.to === "function") {
          io.to(`user_${assignedDriver.id}`).emit("new_notification", driverNotif);
        }

        if (assignedDriver.pushToken) {
          await sendPushNotification([assignedDriver.pushToken], title, driverMessage, commonData);
        }
      }
    } catch (err) {
      console.error("[missingAlertService] Driver notification error:", err.message);
    }
  }

  // 3. Deliver ONLY to Assigned Coordinator(s) of the SAME vehicle (Strictly 1 record per active missing student)
  for (const coordinator of assignedCoordinators) {
    if (coordinator && coordinator.id) {
      try {
        if (io && typeof io.to === "function") {
          io.to(`user_${coordinator.id}`).emit("driver_student_missing_alert", alertPayload);
        }

        const existingCoordNotif = await prisma.notification.findFirst({
          where: {
            type: "missing_alert",
            userId: coordinator.id,
            data: { contains: `"studentId":"${studentTransit.studentId}"` },
          },
          orderBy: { createdAt: "desc" },
        });

        if (existingCoordNotif) {
          await prisma.notification.update({
            where: { id: existingCoordNotif.id },
            data: {
              message: driverMessage,
              data: JSON.stringify(commonData),
            },
          });
        } else {
          const coordNotif = await prisma.notification.create({
            data: {
              title,
              message: driverMessage,
              type: "missing_alert",
              sender: "System",
              target: "coordinator",
              userId: coordinator.id,
              data: JSON.stringify(commonData),
            },
          });

          if (io && typeof io.to === "function") {
            io.to(`user_${coordinator.id}`).emit("new_notification", coordNotif);
          }

          if (coordinator.pushToken) {
            await sendPushNotification([coordinator.pushToken], title, driverMessage, commonData);
          }
        }
      } catch (err) {
        console.error("[missingAlertService] Coordinator notification error:", err.message);
      }
    }
  }

  // 4. Deliver ONLY to Parent(s) assigned to this specific student (Strictly 1 record per active missing student)
  for (const parent of assignedParents) {
    if (parent && parent.id) {
      try {
        if (io && typeof io.to === "function") {
          io.to(`user_${parent.id}`).emit("driver_student_missing_alert", alertPayload);
        }

        const existingParentNotif = await prisma.notification.findFirst({
          where: {
            type: "missing_alert",
            userId: parent.id,
            data: { contains: `"studentId":"${studentTransit.studentId}"` },
          },
          orderBy: { createdAt: "desc" },
        });

        if (existingParentNotif) {
          await prisma.notification.update({
            where: { id: existingParentNotif.id },
            data: {
              message: parentMessage,
              data: JSON.stringify(commonData),
            },
          });
        } else {
          const parentNotif = await prisma.notification.create({
            data: {
              title,
              message: parentMessage,
              type: "missing_alert",
              sender: "System",
              target: "parent",
              userId: parent.id,
              data: JSON.stringify(commonData),
            },
          });

          if (io && typeof io.to === "function") {
            io.to(`user_${parent.id}`).emit("new_notification", parentNotif);
          }

          if (parent.pushToken) {
            await sendPushNotification([parent.pushToken], title, parentMessage, commonData);
          }
        }
      } catch (err) {
        console.error("[missingAlertService] Parent notification error:", err.message);
      }
    }
  }

  // 5. Deliver ONLY to HOD of that student's department (Strictly 1 record per active missing student)
  for (const hod of assignedHods) {
    if (hod && hod.id) {
      try {
        if (io && typeof io.to === "function") {
          io.to(`user_${hod.id}`).emit("driver_student_missing_alert", alertPayload);
        }

        const existingHodNotif = await prisma.notification.findFirst({
          where: {
            type: "missing_alert",
            userId: hod.id,
            data: { contains: `"studentId":"${studentTransit.studentId}"` },
          },
          orderBy: { createdAt: "desc" },
        });

        if (existingHodNotif) {
          await prisma.notification.update({
            where: { id: existingHodNotif.id },
            data: {
              message: hodMessage,
              data: JSON.stringify(commonData),
            },
          });
        } else {
          const hodNotif = await prisma.notification.create({
            data: {
              title: `🚨 Student Missing Alert - ${studentDepartment || "Department"}`,
              message: hodMessage,
              type: "missing_alert",
              sender: "System",
              target: "hod",
              userId: hod.id,
              data: JSON.stringify(commonData),
            },
          });

          if (io && typeof io.to === "function") {
            io.to(`user_${hod.id}`).emit("new_notification", hodNotif);
          }

          if (hod.pushToken) {
            await sendPushNotification([hod.pushToken], `🚨 Student Missing Alert - ${studentDepartment || "Department"}`, hodMessage, commonData);
          }
        }
      } catch (err) {
        console.error("[missingAlertService] HOD notification error:", err.message);
      }
    }
  }
};



/**
 * Register or update a student's active in-transit state
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
    if (!vNum || !dId || !dName || !vId || vId === "N/A") {
      let vehicleRecord = null;
      if (vehicleId || vehicleNumber) {
        vehicleRecord = await prisma.vehicle.findFirst({
          where: { OR: [{ id: vehicleId || "" }, { number: vehicleId || vehicleNumber || "" }] },
          include: { driver: true },
        });
      }

      // Fallback: check VehicleStudentAssignment in DB
      if (!vehicleRecord) {
        const assignment = await prisma.vehicleStudentAssignment.findFirst({
          where: { studentId },
          include: { vehicle: { include: { driver: true } } },
        });
        if (assignment?.vehicle) {
          vehicleRecord = assignment.vehicle;
        }
      }

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

  const validLat = latitude != null && !isNaN(parseFloat(latitude)) && Math.abs(parseFloat(latitude)) > 0.001
    ? parseFloat(latitude)
    : null;
  const validLng = longitude != null && !isNaN(parseFloat(longitude)) && Math.abs(parseFloat(longitude)) > 0.001
    ? parseFloat(longitude)
    : null;

  const transitEntry = {
    studentId,
    studentName: sName || "Student",
    studentRollNo: sRoll || "N/A",
    vehicleId: vId || vehicleId || "N/A",
    vehicleNumber: vNum || vehicleNumber || vehicleId || "N/A",
    driverId: dId || null,
    driverName: dName || "Assigned Driver",
    stage,
    studentLat: validLat,
    studentLng: validLng,
    lastStudentUpdate: new Date(),
    activeAlertId: null,
  };

  inTransitStudents.set(studentId, transitEntry);
  console.log(`[missingAlertService] 🟢 Student ${sName} (${studentId}) is now IN-TRANSIT on ${transitEntry.vehicleNumber} (Stage: ${stage})`);

  if (validLat != null && validLng != null) {
    await evaluateProximity(studentId, io);
  }
};

/**
 * Compare student location against assigned driver/vehicle location
 */
const evaluateProximity = async (studentId, io) => {
  const studentTransit = inTransitStudents.get(studentId);
  if (!studentTransit) return null;

  // Student must have a valid non-zero GPS fix
  if (
    studentTransit.studentLat == null ||
    studentTransit.studentLng == null ||
    isNaN(studentTransit.studentLat) ||
    isNaN(studentTransit.studentLng) ||
    Math.abs(studentTransit.studentLat) < 0.001 ||
    Math.abs(studentTransit.studentLng) < 0.001
  ) {
    return null;
  }

  // Get driver location from in-memory vehicle location store
  const vehicleKey = studentTransit.vehicleId;
  const vehicleNum = studentTransit.vehicleNumber;
  let vehicleLoc =
    (vehicleKey && vehicleKey !== "N/A" ? getVehicleLocation(vehicleKey) : null) ||
    (vehicleNum && vehicleNum !== "N/A" ? getVehicleLocation(vehicleNum) : null);

  if (!vehicleLoc && studentTransit.driverId) {
    vehicleLoc = getVehicleLocation(studentTransit.driverId);
  }

  // Fallback: if vehicle location not found by stored keys, try to find assigned vehicle in DB
  if (!vehicleLoc && studentTransit.studentId) {
    try {
      const assignment = await prisma.vehicleStudentAssignment.findFirst({
        where: { studentId: studentTransit.studentId },
        include: { vehicle: true },
      });
      if (assignment?.vehicle) {
        studentTransit.vehicleId = assignment.vehicle.id;
        studentTransit.vehicleNumber = assignment.vehicle.number;
        if (assignment.vehicle.driverId) studentTransit.driverId = assignment.vehicle.driverId;

        vehicleLoc =
          getVehicleLocation(assignment.vehicle.id) ||
          getVehicleLocation(assignment.vehicle.number) ||
          (assignment.vehicle.driverId ? getVehicleLocation(assignment.vehicle.driverId) : null);
      }
    } catch (e) {
      console.warn("[missingAlertService] Proximity vehicle lookup fallback error:", e.message);
    }
  }

  if (!vehicleLoc) {
    // Driver GPS not available in store
    return null;
  }

  const driverLat = parseFloat(vehicleLoc.latitude);
  const driverLng = parseFloat(vehicleLoc.longitude);
  const studentLat = parseFloat(studentTransit.studentLat);
  const studentLng = parseFloat(studentTransit.studentLng);

  // Validate coordinates are real numbers and not uninitialized (0, 0)
  if (
    isNaN(driverLat) ||
    isNaN(driverLng) ||
    Math.abs(driverLat) < 0.001 ||
    Math.abs(driverLng) < 0.001 ||
    isNaN(studentLat) ||
    isNaN(studentLng) ||
    Math.abs(studentLat) < 0.001 ||
    Math.abs(studentLng) < 0.001
  ) {
    return null;
  }

  const distanceMeters = calculateDistanceMeters(studentLat, studentLng, driverLat, driverLng);
  if (isNaN(distanceMeters)) return null;

  console.log(`[missingAlertService] Distance check for ${studentTransit.studentName}: ${distanceMeters.toFixed(2)}m (Threshold: ${MISSING_DISTANCE_THRESHOLD_METERS}m)`);

  if (distanceMeters > MISSING_DISTANCE_THRESHOLD_METERS) {
    // Distance exceeds 10 meters -> Raise or update Active Alert
    let alertRecord = null;

    try {
      // 1. Check if an ACTIVE missing alert already exists in DB for this student and vehicle
      let existingActiveAlert = null;
      if (studentTransit.activeAlertId) {
        existingActiveAlert = await prisma.studentMissingAlert.findUnique({
          where: { id: studentTransit.activeAlertId },
        });
        if (existingActiveAlert && existingActiveAlert.status !== "ACTIVE") {
          existingActiveAlert = null;
        }
      }

      if (!existingActiveAlert) {
        existingActiveAlert = await prisma.studentMissingAlert.findFirst({
          where: {
            studentId: studentTransit.studentId,
            status: "ACTIVE",
          },
          orderBy: { alertTime: "desc" },
        });
      }

      if (existingActiveAlert) {
        // UPDATE existing active alert
        alertRecord = await prisma.studentMissingAlert.update({
          where: { id: existingActiveAlert.id },
          data: {
            driverLat,
            driverLng,
            studentLat,
            studentLng,
            distanceMeters: Math.round(distanceMeters * 10) / 10,
            status: "ACTIVE",
            stage: studentTransit.stage,
            updatedAt: new Date(),
          },
        });
        studentTransit.activeAlertId = alertRecord.id;

        // Clean up any stale duplicate active alerts if any exist for this student in DB
        await prisma.studentMissingAlert.updateMany({
          where: {
            studentId: studentTransit.studentId,
            status: "ACTIVE",
            NOT: { id: existingActiveAlert.id },
          },
          data: {
            status: "RESOLVED",
            resolvedAt: new Date(),
            resolvedReason: "Duplicate active alert cleanup",
          },
        }).catch(() => { });
      } else {
        // CREATE one new active alert
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
    // distanceMeters here is STUDENT-TO-BUS distance, NOT student movement distance.
    const studentBusDistanceFormatted = (Math.round(distanceMeters * 10) / 10).toFixed(1);
    const driverAlertMessage =
      `Student: ${studentTransit.studentName}\n` +
      `Student ↔ Bus Distance: ${studentBusDistanceFormatted} m (> ${MISSING_DISTANCE_THRESHOLD_METERS}m threshold)\n` +
      `Student Movement: ${studentTransit.studentMovementStatus || "UNKNOWN"}\n` +
      `Please check the student's location.`;

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
      // ── Proximity (student ↔ bus) ─────────────────────────────────────────
      // This is the distance between the student's current GPS and the bus's
      // current GPS. It is what triggered this alert (> MISSING_DISTANCE_THRESHOLD_METERS).
      // It must NOT be interpreted as "how far the student moved".
      distanceMeters: Math.round(distanceMeters * 10) / 10,   // kept for DB & backward compat
      studentBusDistance: Math.round(distanceMeters * 10) / 10, // explicit alias
      missingDistanceThreshold: MISSING_DISTANCE_THRESHOLD_METERS,
      // ── Student Movement (student prev GPS → student current GPS) ────────
      // These fields reflect actual student movement, computed independently
      // of the bus location.
      studentMovementDistance: studentTransit.studentMovementDistance ?? 0,
      studentMovementStatus: studentTransit.studentMovementStatus || "UNKNOWN",
      studentMovementThreshold: STUDENT_MOVEMENT_THRESHOLD_METERS,
      // ── Timestamps ────────────────────────────────────────────────────────
      studentLocationTimestamp: studentTransit.studentLocationTimestamp || new Date().toISOString(),
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
    // Distance <= 10 meters (including < 5m) -> If active alert(s) existed, auto-resolve them
    try {
      const activeAlerts = await prisma.studentMissingAlert.findMany({
        where: {
          studentId: studentTransit.studentId,
          status: "ACTIVE",
        },
      });

      for (const a of activeAlerts) {
        await closeAlertById(
          a.id,
          "Rejoined Vehicle (<10m)",
          io
        );
      }
      studentTransit.activeAlertId = null;
    } catch (resolveErr) {
      console.error("[missingAlertService] Auto-resolve error:", resolveErr.message);
    }
  }

  return null;
};

/**
 * Handle student location update (via socket or REST).
 *
 * IMPORTANT: studentMovementDistance and studentMovementStatus are computed HERE
 * by comparing the student's PREVIOUS GPS fix to the current one.
 * This is completely separate from:
 *   - student-to-bus distance (computed in evaluateProximity)
 *   - bus/driver movement (computed when driver GPS arrives)
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

  const validLat = parseFloat(latitude);
  const validLng = parseFloat(longitude);
  if (isNaN(validLat) || isNaN(validLng) || Math.abs(validLat) < 0.001 || Math.abs(validLng) < 0.001) {
    return null;
  }

  // ── Step 1: Compute STUDENT MOVEMENT (prev student GPS → current student GPS) ──
  // This is the ONLY correct way to determine if the student moved.
  // Do NOT use student-to-bus distance for this purpose.
  const now = new Date();
  const prevStudentLoc = studentPreviousLocations.get(studentId);

  let studentMovementDistance = 0;
  let studentMovementStatus = "UNKNOWN";

  if (prevStudentLoc) {
    const locationAgeMs = now.getTime() - prevStudentLoc.timestamp.getTime();

    if (locationAgeMs > STUDENT_LOCATION_STALE_MS) {
      // Previous fix is too old — we cannot reliably compute movement from it.
      // Mark as STALE rather than risk a false MOVING status.
      studentMovementStatus = "STALE";
      studentMovementDistance = 0;
      console.log(`[missingAlertService] ⏱ Student ${studentId} prev GPS is stale (${Math.round(locationAgeMs / 1000)}s old) — movement status: STALE`);
    } else {
      // Compute Haversine distance between previous student GPS and current student GPS.
      // This is STUDENT movement — nothing to do with the bus location.
      studentMovementDistance = calculateDistanceMeters(
        prevStudentLoc.lat, prevStudentLoc.lng,
        validLat, validLng
      );

      if (studentMovementDistance > STUDENT_MOVEMENT_THRESHOLD_METERS) {
        studentMovementStatus = "MOVING";
      } else {
        // Change is within jitter threshold — student is considered stationary.
        studentMovementStatus = "STATIONARY";
        studentMovementDistance = 0; // suppress sub-threshold noise
      }

      console.log(
        `[missingAlertService] 📍 Student ${studentId} movement: ` +
        `${studentMovementDistance.toFixed(1)}m from prev GPS → status: ${studentMovementStatus} ` +
        `(threshold: ${STUDENT_MOVEMENT_THRESHOLD_METERS}m)`
      );
    }
  } else {
    // First GPS fix for this student — no previous position to compare.
    studentMovementStatus = "UNKNOWN";
  }

  // Always update the previous location store with the latest valid fix.
  studentPreviousLocations.set(studentId, { lat: validLat, lng: validLng, timestamp: now });
  // ────────────────────────────────────────────────────────────────────────────

  let transit = inTransitStudents.get(studentId);
  if (!transit) {
    // Check if student has an active transit stage in DB for today
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    let stageToUse = "TO_COLLEGE";
    let resolvedVehicleId = vehicleId;
    let resolvedVehicleNumber = vehicleNumber;

    const latestAttendance = await prisma.attendance.findFirst({
      where: {
        userId: studentId,
        type: "student_scan",
        scannedAt: { gte: startOfToday },
      },
      orderBy: { scannedAt: "desc" },
    });

    if (latestAttendance) {
      stageToUse = latestAttendance.stage || "TO_COLLEGE";
      if (!resolvedVehicleId) resolvedVehicleId = latestAttendance.vehicleId;
    }

    // Fallback: check VehicleStudentAssignment in DB for assigned vehicle
    if (!resolvedVehicleId) {
      const assignment = await prisma.vehicleStudentAssignment.findFirst({
        where: { studentId },
        include: { vehicle: { include: { driver: true } } },
      });
      if (assignment?.vehicle) {
        resolvedVehicleId = assignment.vehicle.id;
        resolvedVehicleNumber = assignment.vehicle.number;
      }
    }

    // Register student transit
    await startStudentTransit({
      studentId,
      studentName,
      studentRollNo,
      vehicleId: resolvedVehicleId,
      vehicleNumber: resolvedVehicleNumber,
      stage: stageToUse,
      latitude: validLat,
      longitude: validLng,
      io,
    });
    transit = inTransitStudents.get(studentId);
  }

  if (transit) {
    // Update current student GPS in the transit entry
    transit.studentLat = validLat;
    transit.studentLng = validLng;
    transit.lastStudentUpdate = now;
    // Store student movement fields (separate from student-to-bus distance)
    transit.studentMovementDistance = studentMovementDistance;
    transit.studentMovementStatus = studentMovementStatus;
    transit.studentLocationTimestamp = now.toISOString();

    if (studentName) transit.studentName = studentName;
    if (studentRollNo) transit.studentRollNo = studentRollNo;
    if (vehicleId && (!transit.vehicleId || transit.vehicleId === "N/A")) transit.vehicleId = vehicleId;
    if (vehicleNumber && (!transit.vehicleNumber || transit.vehicleNumber === "N/A")) transit.vehicleNumber = vehicleNumber;

    // evaluateProximity computes student-to-bus distance (separate from movement above)
    return await evaluateProximity(studentId, io);
  }

  return null;
};

/**
 * Handle driver location update -> evaluate proximity for all boarded students on this vehicle
 */
const updateDriverLocation = async ({
  vehicleId,
  vehicleNumber,
  driverId,
  driverName,
  latitude,
  longitude,
  io,
}) => {
  if ((!vehicleId && !driverId) || latitude == null || longitude == null) return;

  const lat = parseFloat(latitude);
  const lng = parseFloat(longitude);
  if (isNaN(lat) || isNaN(lng) || Math.abs(lat) < 0.001 || Math.abs(lng) < 0.001) return;

  const extra = {
    vehicleNumber,
    driverId,
  };

  if (vehicleId) setVehicleLocation(vehicleId, lat, lng, extra);
  if (vehicleNumber) setVehicleLocation(vehicleNumber, lat, lng, extra);
  if (driverId) setVehicleLocation(driverId, lat, lng, extra);

  // Check all active in-transit students assigned to this vehicle/driver
  const promises = [];
  for (const [studentId, transit] of inTransitStudents.entries()) {
    const isSameVehicle =
      (vehicleId && (transit.vehicleId === vehicleId || transit.vehicleNumber === vehicleId)) ||
      (vehicleNumber && (transit.vehicleId === vehicleNumber || transit.vehicleNumber === vehicleNumber)) ||
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
  if (!alertId) return null;

  try {
    const existing = await prisma.studentMissingAlert.findUnique({
      where: { id: alertId },
    });

    if (!existing) {
      console.warn(`[missingAlertService] Alert ${alertId} not found to resolve.`);
      return null;
    }

    let resolved = existing;
    if (existing.status !== "RESOLVED") {
      resolved = await prisma.studentMissingAlert.update({
        where: { id: alertId },
        data: {
          status: "RESOLVED",
          resolvedAt: new Date(),
          resolvedReason: reason,
        },
      });
    }

    const payload = {
      id: resolved.id,
      missingAlertId: resolved.id,
      alertId: resolved.id,
      studentId: resolved.studentId,
      studentName: resolved.studentName,
      vehicleId: resolved.vehicleId,
      vehicleNumber: resolved.vehicleNumber,
      driverId: resolved.driverId,
      status: "RESOLVED",
      resolvedReason: reason,
      resolvedAt: resolved.resolvedAt,
    };

    // Clean up previous active missing alert notifications for this student
    if (resolved.studentId) {
      await prisma.notification.deleteMany({
        where: {
          type: "missing_alert",
          data: { contains: `"studentId":"${resolved.studentId}"` },
        },
      }).catch(() => { });
    }

    // 1. Emit resolution event to connected clients (Single broadcast)
    if (io) {
      if (typeof io.emit === "function") {
        io.emit("student_missing_alert_resolved", payload);
        io.emit("missing_alert_closed", payload);
      }
    }

    // 2. Create resolution notifications idempotently
    try {
      const vehicle = await prisma.vehicle.findFirst({
        where: {
          OR: [
            ...(resolved.vehicleId ? [{ id: resolved.vehicleId }] : []),
            ...(resolved.vehicleNumber ? [{ number: resolved.vehicleNumber }] : []),
          ],
        },
        include: {
          driver: true,
          assignedCoordinators: {
            include: { coordinator: true },
          },
        },
      });

      const resTitle = "✅ Student Missing Alert Resolved";
      const resMessage = `Student ${resolved.studentName} has rejoined the vehicle / resolved (${reason}).`;

      // 2a. Resolution notification for Web Admin (Strictly 1 per missingAlertId)
      const existingAdminNotif = await prisma.notification.findFirst({
        where: {
          type: "missing_alert_resolved",
          target: "admin",
          OR: [
            { data: { contains: `"missingAlertId":"${resolved.id}"` } },
            { data: { contains: `"alertId":"${resolved.id}"` } },
            { data: { contains: `"id":"${resolved.id}"` } },
          ],
        },
      });

      if (!existingAdminNotif) {
        const adminNotif = await prisma.notification.create({
          data: {
            title: resTitle,
            message: resMessage,
            type: "missing_alert_resolved",
            sender: "System",
            target: "admin",
            data: JSON.stringify(payload),
          },
        });

        if (io && typeof io.to === "function") {
          io.to("admin").emit("new_notification", adminNotif);
          io.to("superadmin").emit("new_notification", adminNotif);
          io.to("deptadmin").emit("new_notification", adminNotif);
        }
      }

      // 2b. Resolution notification for Assigned Driver (Strictly 1 per driver + missingAlertId)
      const driverUser = vehicle?.driver || (resolved.driverId ? await prisma.user.findUnique({ where: { id: resolved.driverId } }) : null);
      if (driverUser && driverUser.id) {
        const existingDriverNotif = await prisma.notification.findFirst({
          where: {
            type: "missing_alert_resolved",
            userId: driverUser.id,
            OR: [
              { data: { contains: `"missingAlertId":"${resolved.id}"` } },
              { data: { contains: `"alertId":"${resolved.id}"` } },
              { data: { contains: `"id":"${resolved.id}"` } },
            ],
          },
        });

        if (!existingDriverNotif) {
          const driverNotif = await prisma.notification.create({
            data: {
              title: resTitle,
              message: resMessage,
              type: "missing_alert_resolved",
              sender: "System",
              target: "driver",
              userId: driverUser.id,
              data: JSON.stringify(payload),
            },
          });

          if (io && typeof io.to === "function") {
            io.to(`user_${driverUser.id}`).emit("new_notification", driverNotif);
          }

          if (driverUser.pushToken) {
            await sendPushNotification([driverUser.pushToken], resTitle, resMessage, payload);
          }
        }
      }

      // 2c. Resolution notification for Assigned Coordinator(s) (Strictly 1 per coordinator + missingAlertId)
      const coordinators = (vehicle?.assignedCoordinators || []).map((ac) => ac.coordinator).filter(Boolean);
      for (const coord of coordinators) {
        if (coord && coord.id) {
          const existingCoordNotif = await prisma.notification.findFirst({
            where: {
              type: "missing_alert_resolved",
              userId: coord.id,
              OR: [
                { data: { contains: `"missingAlertId":"${resolved.id}"` } },
                { data: { contains: `"alertId":"${resolved.id}"` } },
                { data: { contains: `"id":"${resolved.id}"` } },
              ],
            },
          });

          if (!existingCoordNotif) {
            const coordNotif = await prisma.notification.create({
              data: {
                title: resTitle,
                message: resMessage,
                type: "missing_alert_resolved",
                sender: "System",
                target: "coordinator",
                userId: coord.id,
                data: JSON.stringify(payload),
              },
            });

            if (io && typeof io.to === "function") {
              io.to(`user_${coord.id}`).emit("new_notification", coordNotif);
            }

            if (coord.pushToken) {
              await sendPushNotification([coord.pushToken], resTitle, resMessage, payload);
            }
          }
        }
      }

      // 2d. Resolution notification for Parent(s) of this specific student (Strictly 1 per parent + missingAlertId)
      const studentUser = resolved.studentId ? await prisma.user.findUnique({ where: { id: resolved.studentId } }) : null;
      const parentQueries = [];
      if (studentUser?.parentId) parentQueries.push({ id: studentUser.parentId });
      if (studentUser?.rollNumber) parentQueries.push({ role: { equals: "parent", mode: "insensitive" }, studentRollNo: studentUser.rollNumber });
      if (studentUser?.parentPhone) parentQueries.push({ role: { equals: "parent", mode: "insensitive" }, phone: studentUser.parentPhone });

      if (parentQueries.length > 0) {
        const parents = await prisma.user.findMany({
          where: { status: "active", OR: parentQueries },
          select: { id: true, name: true, role: true, pushToken: true },
        });

        for (const parent of parents) {
          const existingParentNotif = await prisma.notification.findFirst({
            where: {
              type: "missing_alert_resolved",
              userId: parent.id,
              OR: [
                { data: { contains: `"missingAlertId":"${resolved.id}"` } },
                { data: { contains: `"alertId":"${resolved.id}"` } },
                { data: { contains: `"id":"${resolved.id}"` } },
              ],
            },
          });

          if (!existingParentNotif) {
            const parentNotif = await prisma.notification.create({
              data: {
                title: resTitle,
                message: `Student ${resolved.studentName} has rejoined the vehicle / journey resolved (${reason}).`,
                type: "missing_alert_resolved",
                sender: "System",
                target: "parent",
                userId: parent.id,
                data: JSON.stringify(payload),
              },
            });

            if (io && typeof io.to === "function") {
              io.to(`user_${parent.id}`).emit("new_notification", parentNotif);
            }

            if (parent.pushToken) {
              await sendPushNotification([parent.pushToken], resTitle, `Student ${resolved.studentName} has rejoined the vehicle / journey resolved (${reason}).`, payload);
            }
          }
        }
      }

      // 2e. Resolution notification for Department HOD (Strictly 1 per HOD + missingAlertId)
      if (studentUser?.department) {
        const hods = await prisma.user.findMany({
          where: {
            role: { in: ["hod", "deptadmin"], mode: "insensitive" },
            status: "active",
            OR: [
              { department: { equals: studentUser.department, mode: "insensitive" } },
              { sector: { equals: studentUser.department, mode: "insensitive" } },
            ],
          },
          select: { id: true, name: true, role: true, pushToken: true },
        });

        for (const hod of hods) {
          const existingHodNotif = await prisma.notification.findFirst({
            where: {
              type: "missing_alert_resolved",
              userId: hod.id,
              OR: [
                { data: { contains: `"missingAlertId":"${resolved.id}"` } },
                { data: { contains: `"alertId":"${resolved.id}"` } },
                { data: { contains: `"id":"${resolved.id}"` } },
              ],
            },
          });

          if (!existingHodNotif) {
            const hodNotif = await prisma.notification.create({
              data: {
                title: `✅ Student Missing Alert Resolved - ${studentUser.department}`,
                message: `Student ${resolved.studentName} (${studentUser.rollNumber || "N/A"}) from ${studentUser.department} has rejoined the vehicle / journey resolved (${reason}).`,
                type: "missing_alert_resolved",
                sender: "System",
                target: "hod",
                userId: hod.id,
                data: JSON.stringify(payload),
              },
            });

            if (io && typeof io.to === "function") {
              io.to(`user_${hod.id}`).emit("new_notification", hodNotif);
            }

            if (hod.pushToken) {
              await sendPushNotification([hod.pushToken], `✅ Student Missing Alert Resolved - ${studentUser.department}`, `Student ${resolved.studentName} from ${studentUser.department} has rejoined the vehicle / journey resolved (${reason}).`, payload);
            }
          }
        }
      }
    } catch (notifErr) {
      console.error("[missingAlertService] Resolution notification error:", notifErr.message);
    }

    console.log(`[missingAlertService] ✅ Alert ${alertId} resolved for ${resolved.studentName}. Reason: "${reason}".`);
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

  inTransitStudents.delete(studentId);
  // Clear the student's previous GPS fix so it doesn't persist across trips
  studentPreviousLocations.delete(studentId);

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
      // Clear the student's previous GPS fix so it doesn't persist across trips
      studentPreviousLocations.delete(studentId);
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
  } catch (err) {
    console.error("[missingAlertService] endVehicleTransit error:", err.message);
  }
};

/**
 * Safe cleanup: ensure only one latest ACTIVE record per (studentId, vehicleId) in the database.
 * Stale duplicate active records are closed with "Duplicate active alert cleanup" (preserving audit history).
 */
const cleanupDuplicateActiveAlerts = async () => {
  try {
    const activeAlerts = await prisma.studentMissingAlert.findMany({
      where: { status: "ACTIVE" },
      orderBy: [{ alertTime: "desc" }, { createdAt: "desc" }],
    });

    const seen = new Set();
    const duplicatesToResolve = [];

    for (const alert of activeAlerts) {
      const key = `${alert.studentId}_${alert.vehicleId || alert.vehicleNumber}`;
      if (seen.has(key)) {
        duplicatesToResolve.push(alert.id);
      } else {
        seen.add(key);
      }
    }

    if (duplicatesToResolve.length > 0) {
      await prisma.studentMissingAlert.updateMany({
        where: { id: { in: duplicatesToResolve } },
        data: {
          status: "RESOLVED",
          resolvedAt: new Date(),
          resolvedReason: "Duplicate active alert cleanup",
        },
      });
      console.log(`[missingAlertService] 🧹 Cleaned up ${duplicatesToResolve.length} stale duplicate active alerts.`);
    }

    // Also cleanup duplicate resolved notifications in DB
    const resolvedNotifs = await prisma.notification.findMany({
      where: { type: "missing_alert_resolved" },
      orderBy: { createdAt: "desc" },
    });

    const seenNotif = new Set();
    const notifsToDelete = [];
    for (const notif of resolvedNotifs) {
      let parsed = {};
      try {
        parsed = typeof notif.data === "string" ? JSON.parse(notif.data || "{}") : (notif.data || {});
      } catch {}
      const missingKey = parsed.missingAlertId || parsed.alertId || parsed.id || null;
      const targetKey = notif.userId || notif.target || "admin";
      if (missingKey) {
        const uniqueKey = `${missingKey}_${targetKey}`;
        if (seenNotif.has(uniqueKey)) {
          notifsToDelete.push(notif.id);
        } else {
          seenNotif.add(uniqueKey);
        }
      }
    }

    if (notifsToDelete.length > 0) {
      await prisma.notification.deleteMany({
        where: { id: { in: notifsToDelete } },
      });
      console.log(`[missingAlertService] 🧹 Cleaned up ${notifsToDelete.length} duplicate resolved notifications.`);
    }
  } catch (err) {
    console.error("[missingAlertService] Duplicate cleanup error:", err.message);
  }
};

// Run duplicate cleanup on startup
cleanupDuplicateActiveAlerts().catch(() => { });

/**
 * Get all active missing alerts for today (strictly 1 active alert per student+vehicle)
 */
const getActiveMissingAlerts = async () => {
  await cleanupDuplicateActiveAlerts();

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const activeAlerts = await prisma.studentMissingAlert.findMany({
    where: {
      status: "ACTIVE",
      alertTime: { gte: startOfToday },
    },
    orderBy: [{ alertTime: "desc" }, { createdAt: "desc" }],
  });

  const seen = new Set();
  const deduped = [];
  for (const a of activeAlerts) {
    const key = `${a.studentId}_${a.vehicleId || a.vehicleNumber}`;
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(a);
    }
  }

  return deduped.map((a) => ({
    ...a,
    driverLocation: formatCoords(a.driverLat, a.driverLng),
    studentLocation: formatCoords(a.studentLat, a.studentLng),
  }));
};

/**
 * Get missing alerts with filtering (ACTIVE alerts deduplicated, all historical RESOLVED preserved)
 */
const getMissingAlerts = async ({ today = true, date, status, studentId, vehicleId, limit = 50 } = {}) => {
  await cleanupDuplicateActiveAlerts();

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
    orderBy: [{ alertTime: "desc" }, { createdAt: "desc" }],
    take: parseInt(limit, 10) || 50,
  });

  const seenActive = new Set();
  const filtered = [];
  for (const a of alerts) {
    if (a.status === "ACTIVE") {
      const key = `${a.studentId}_${a.vehicleId || a.vehicleNumber}`;
      if (!seenActive.has(key)) {
        seenActive.add(key);
        filtered.push(a);
      }
    } else {
      filtered.push(a);
    }
  }

  return filtered.map((a) => ({
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
  cleanupDuplicateActiveAlerts,
};
