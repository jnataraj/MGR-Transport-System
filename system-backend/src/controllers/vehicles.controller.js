const prisma = require("../prisma/prisma");
const { isVehicleOnline } = require("../utils/vehicleLocationStore");
const auditLogService = require("../services/auditLogService");


const parseOptionalNumber = (value) => {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const sanitizeVehicleData = async (data) => {
  const {
    number,
    circleNumber,
    type,
    vehicleTypeId,
    model,
    capacity,
    status,
    route,
    rcDetails,
    chassisNumber,
    purchaseDate,
    maintenanceDueDate,
    kmRun,
    haltedCount,
    image,
    driverId,
  } = data;

  let validDriverId = undefined;
  if (driverId && driverId !== "") {
    const driverUser = await prisma.user.findUnique({ where: { id: driverId } });
    if (!driverUser || driverUser.role?.toLowerCase() !== "driver") {
      throw new Error("driverId must reference a user with role 'driver'");
    }
    validDriverId = driverId;
  } else if (driverId === null || driverId === "") {
    validDriverId = null;
  }

  return {
    ...(number !== undefined && { number }),
    ...(circleNumber !== undefined && { circleNumber }),
    ...(type !== undefined && { type }),
    ...(vehicleTypeId !== undefined && { vehicleTypeId }),
    ...(model !== undefined && { model }),
    ...(capacity !== undefined && { capacity: parseOptionalNumber(capacity) }),
    ...(status !== undefined && { status }),
    ...(route !== undefined && { route }),
    ...(rcDetails !== undefined && { rcDetails }),
    ...(chassisNumber !== undefined && { chassisNumber }),
    ...(purchaseDate !== undefined && {
      purchaseDate: purchaseDate || undefined,
    }),
    ...(maintenanceDueDate !== undefined && {
      maintenanceDueDate: maintenanceDueDate || undefined,
    }),
    ...(kmRun !== undefined && { kmRun: parseOptionalNumber(kmRun) }),
    ...(haltedCount !== undefined && {
      haltedCount: parseOptionalNumber(haltedCount),
    }),
    ...(image !== undefined && { image }),
    ...(driverId !== undefined && { driverId: validDriverId }),
  };
};

const normalizeVehicle = (vehicle) => ({
  ...vehicle,
  studentIds: vehicle.assignedStudents?.map((a) => a.studentId) || [],
  coordinatorIds:
    vehicle.assignedCoordinators?.map((a) => a.coordinatorId) || [],
  assignedStudents:
    vehicle.assignedStudents?.map((a) => ({
      ...(a.student || {}),
      studentId: a.studentId,
      name: a.student?.name || a.studentName || "",
      class: a.class || a.student?.department || null,
      pickupPoint: a.pickupPoint || a.student?.location || null,
      assignedAt: a.assignedAt,
    })) || [],
  assignedCoordinators:
    vehicle.assignedCoordinators?.map((a) => ({
      ...(a.coordinator || {}),
      coordinatorId: a.coordinatorId,
      assignedAt: a.assignedAt,
    })) || [],
  driver: vehicle.driver || null,
});

const unassignDriverFromExistingVehicle = async (tx, driverId) => {
  if (!driverId) return;

  const currentVehicle = await tx.vehicle.findFirst({
    where: { driverId },
  });

  if (currentVehicle) {
    await tx.vehicle.update({
      where: { id: currentVehicle.id },
      data: { driverId: null },
    });
  }
};

const syncVehicleRouteAssignment = async (tx, vehicle) => {
  const vehicleId = vehicle.id;
  const vehicleNumber = vehicle.number;
  const routeName = vehicle.route?.trim();

  // Vehicle has no route assigned
  if (!routeName) {
    return;
  }

  // Find an existing active route assignment with the same route name
  // and without a vehicle assigned yet.
  const existingRoute = await tx.routeVehicleAssignment.findFirst({
    where: {
      routeName,
      isActive: true,
      vehicleId: null,
    },
    orderBy: {
      assignedAt: "desc",
    },
  });

  if (existingRoute) {
    // Assign the vehicle to the existing route
    await tx.routeVehicleAssignment.update({
      where: {
        id: existingRoute.id,
      },
      data: {
        vehicleId,
        vehicleNumber,
        assignedBy: "vehicle-sync",
      },
    });

    return;
  }

  // If the route is already assigned to this vehicle,
  // just make sure the vehicle number is updated.
  const existingVehicleAssignment =
    await tx.routeVehicleAssignment.findFirst({
      where: {
        vehicleId,
        routeName,
        isActive: true,
      },
    });

  if (existingVehicleAssignment) {
    await tx.routeVehicleAssignment.update({
      where: {
        id: existingVehicleAssignment.id,
      },
      data: {
        vehicleNumber,
      },
    });
  }
};

const fetchVehicles = async (req, res) => {
  try {
    const vehicles = await prisma.vehicle.findMany({
      include: {
        driver: true,
        assignedStudents: { include: { student: true } },
        assignedCoordinators: { include: { coordinator: true } },
      },
    });
    res.json(vehicles.map(normalizeVehicle));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch vehicles" });
  }
};

const createVehicle = async (req, res) => {
  try {
    const { studentIds = [], coordinatorIds = [] } = req.body;
    const vehicleData = await sanitizeVehicleData(req.body);

    const createdVehicle = await prisma.$transaction(async (tx) => {
      const vehicle = await tx.vehicle.create({ data: vehicleData });

      if (studentIds && studentIds.length > 0) {
        const studentAssignments = studentIds.map((sid) => ({
          vehicleId: vehicle.id,
          studentId: sid,
        }));
        await tx.vehicleStudentAssignment.createMany({
          data: studentAssignments,
          skipDuplicates: true,
        });
      }

      if (coordinatorIds && coordinatorIds.length > 0) {
        const coordAssignments = coordinatorIds.map((cid) => ({
          vehicleId: vehicle.id,
          coordinatorId: cid,
        }));
        await tx.vehicleCoordinatorAssignment.createMany({
          data: coordAssignments,
          skipDuplicates: true,
        });
      }

      // Keep RouteVehicleAssignment in sync
      await syncVehicleRouteAssignment(tx, vehicle);

      const result = await tx.vehicle.findUnique({
        where: { id: vehicle.id },
        include: {
          driver: true,
          assignedStudents: { include: { student: true } },
          assignedCoordinators: { include: { coordinator: true } },
        },
      });

      await auditLogService.record({
        req,
        action: "BUS_CREATED",
        eventType: "CREATE",
        module: "VEHICLE_MANAGEMENT",
        entityType: "VEHICLE",
        entityId: vehicle.id,
        description: `Created vehicle ${vehicle.number} (Type: ${vehicle.type || "Bus"}, Route: ${vehicle.route || "Unassigned"})`,
        newValues: {
          id: vehicle.id,
          number: vehicle.number,
          type: vehicle.type,
          route: vehicle.route,
          capacity: vehicle.capacity,
          driverId: vehicle.driverId,
        },
        tx,
      });

      return result;
    });

    res.status(201).json(normalizeVehicle(createdVehicle));
  } catch (err) {
    console.error(err);
    const message =
      err?.meta?.cause || err?.message || "Failed to create vehicle";
    res.status(500).json({ error: message });
  }
};

const updateVehicle = async (req, res) => {
  try {
    const { id } = req.params;
    const vehicleData = await sanitizeVehicleData(req.body);

    const previousVehicle = await prisma.vehicle.findUnique({
      where: { id },
    });

    if (!previousVehicle) {
      return res.status(404).json({ error: "Vehicle not found" });
    }

    const vehicle = await prisma.$transaction(async (tx) => {
      const updated = await tx.vehicle.update({
        where: { id },
        data: vehicleData,
      });

      // Keep RouteVehicleAssignment in sync
      await syncVehicleRouteAssignment(tx, updated);

      await auditLogService.record({
        req,
        action: "BUS_UPDATED",
        eventType: "UPDATE",
        module: "VEHICLE_MANAGEMENT",
        entityType: "VEHICLE",
        entityId: id,
        description: `Updated vehicle ${updated.number}`,
        oldValues: {
          number: previousVehicle.number,
          route: previousVehicle.route,
          status: previousVehicle.status,
          capacity: previousVehicle.capacity,
          driverId: previousVehicle.driverId,
        },
        newValues: {
          number: updated.number,
          route: updated.route,
          status: updated.status,
          capacity: updated.capacity,
          driverId: updated.driverId,
        },
        tx,
      });

      return updated;
    });

    res.json(vehicle);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to update vehicle" });
  }
};


const fetchVehicleMembers = async (req, res) => {
  try {
    const { id } = req.params;
    const vehicle = await prisma.vehicle.findUnique({
      where: { id },
      include: {
        driver: true,
        assignedStudents: { include: { student: true } },
        assignedCoordinators: { include: { coordinator: true } },
      },
    });
    if (!vehicle) return res.status(404).json({ error: "Vehicle not found" });

    const coordinators =
      vehicle.assignedCoordinators?.map((a) => ({
        ...(a.coordinator || {}),
        coordinatorId: a.coordinatorId,
        assignedAt: a.assignedAt,
      })) || [];
    const students =
      vehicle.assignedStudents?.map((a) => ({
        ...(a.student || {}),
        studentId: a.studentId,
        name: a.student?.name || a.studentName || "",
        class: a.class || a.student?.department || null,
        pickupPoint: a.pickupPoint || a.student?.location || null,
        assignedAt: a.assignedAt,
      })) || [];

    res.json({
      vehicleId: vehicle.id,
      vehicleNumber: vehicle.number,
      driver: vehicle.driver || null,
      driverOnline: isVehicleOnline(vehicle.number),
      coordinators,
      students,
      coordinatorCount: coordinators.length,
      studentCount: students.length,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch vehicle members" });
  }
};

const assignVehicleMembers = async (req, res) => {
  try {
    const { id } = req.params;
    const { studentIds = [], coordinatorIds = [], driverId } = req.body;

    await prisma.$transaction(async (tx) => {
      await tx.vehicle.update({
        where: { id },
        data: { driverId: driverId || null },
      });

      await tx.vehicleStudentAssignment.deleteMany({
        where: { vehicleId: id },
      });
      await tx.vehicleCoordinatorAssignment.deleteMany({
        where: { vehicleId: id },
      });

      if (studentIds && studentIds.length > 0) {
        const studentUsers = await tx.user.findMany({
          where: { id: { in: studentIds } },
          select: { id: true, name: true, location: true, department: true },
        });
        const studentMap = new Map(studentUsers.map((u) => [u.id, u]));
        const studentAssignments = studentIds.map((sid) => ({
          vehicleId: id,
          studentId: sid,
          studentName: studentMap.get(sid)?.name || "",
          class: studentMap.get(sid)?.department || null,
          pickupPoint: studentMap.get(sid)?.location || null,
        }));
        await tx.vehicleStudentAssignment.createMany({
          data: studentAssignments,
          skipDuplicates: true,
        });
      }

      if (coordinatorIds && coordinatorIds.length > 0) {
        const coordAssignments = coordinatorIds.map((cid) => ({
          vehicleId: id,
          coordinatorId: cid,
        }));
        await tx.vehicleCoordinatorAssignment.createMany({
          data: coordAssignments,
          skipDuplicates: true,
        });
      }

      await auditLogService.record({
        req,
        action: "BUS_MEMBERS_ASSIGNED",
        eventType: "UPDATE",
        module: "VEHICLE_MANAGEMENT",
        entityType: "VEHICLE",
        entityId: id,
        description: `Assigned members to vehicle: Driver ID ${driverId || "None"}, ${studentIds.length} students, ${coordinatorIds.length} coordinators`,
        metadata: {
          driverId,
          studentCount: studentIds.length,
          coordinatorCount: coordinatorIds.length,
          studentIds,
          coordinatorIds,
        },
        tx,
      });
    });

    const updated = await prisma.vehicle.findUnique({
      where: { id },
      include: { driver: true },
    });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to assign vehicle members" });
  }
};

const removeVehicleMember = async (req, res) => {
  try {
    const { id } = req.params;
    const { type, memberId } = req.query;
    if (!type || !memberId)
      return res.status(400).json({ error: "Missing type or memberId" });

    if (type === "driver") {
      await prisma.vehicle.update({ where: { id }, data: { driverId: null } });
      await auditLogService.record({
        req,
        action: "DRIVER_UNASSIGNED",
        eventType: "UPDATE",
        module: "VEHICLE_MANAGEMENT",
        entityType: "VEHICLE",
        entityId: id,
        description: `Unassigned driver ${memberId} from vehicle ${id}`,
        metadata: { vehicleId: id, driverId: memberId },
      });
      return res.json({ success: true });
    }

    if (type === "student") {
      await prisma.vehicleStudentAssignment.deleteMany({
        where: { vehicleId: id, studentId: memberId },
      });
      await auditLogService.record({
        req,
        action: "STUDENT_UNASSIGNED_FROM_BUS",
        eventType: "UPDATE",
        module: "VEHICLE_MANAGEMENT",
        entityType: "VEHICLE",
        entityId: id,
        description: `Removed student ${memberId} from vehicle ${id}`,
        metadata: { vehicleId: id, studentId: memberId },
      });
      return res.json({ success: true });
    }

    if (type === "coordinator") {
      await prisma.vehicleCoordinatorAssignment.deleteMany({
        where: { vehicleId: id, coordinatorId: memberId },
      });
      await auditLogService.record({
        req,
        action: "COORDINATOR_UNASSIGNED_FROM_BUS",
        eventType: "UPDATE",
        module: "VEHICLE_MANAGEMENT",
        entityType: "VEHICLE",
        entityId: id,
        description: `Removed coordinator ${memberId} from vehicle ${id}`,
        metadata: { vehicleId: id, coordinatorId: memberId },
      });
      return res.json({ success: true });
    }

    res.status(400).json({ error: "Unknown type" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to remove member" });
  }
};

const assignStudentBus = async (req, res) => {
  try {
    const { studentId, vehicleNumber, vehicleId, vehicleIds, pickupPoint } = req.body;
    if (!studentId) {
      return res.status(400).json({ error: "studentId is required" });
    }
    await prisma.vehicleStudentAssignment.deleteMany({ where: { studentId } });

    const rawIds = vehicleIds || (vehicleId ? [vehicleId] : (vehicleNumber ? [vehicleNumber] : []));
    let cleanIds = (Array.isArray(rawIds) ? rawIds : [rawIds]).filter((id) => id && id !== "Not Assigned" && id !== "");

    if (cleanIds.length === 0) {
      await auditLogService.record({
        req,
        action: "STUDENT_BUS_UNASSIGNED",
        eventType: "UPDATE",
        module: "BUS_ROUTE_MANAGEMENT",
        entityType: "STUDENT",
        entityId: studentId,
        description: `Unassigned all buses for student ${studentId}`,
      });
      return res.json({ success: true, vehicleId: null, vehicleNumber: null, route: null, pickupPoint: null });
    }

    const vehicles = await prisma.vehicle.findMany({
      where: {
        OR: [
          { id: { in: cleanIds } },
          { number: { in: cleanIds } },
        ],
      },
    });

    if (vehicles.length === 0) {
      return res.status(404).json({ error: "No matching vehicles found" });
    }

    const student = await prisma.user.findUnique({ where: { id: studentId } });
    const effectivePickup = pickupPoint !== undefined && pickupPoint !== "" ? pickupPoint : (student?.location || null);

    for (const vehicle of vehicles) {
      await prisma.vehicleStudentAssignment.create({
        data: {
          vehicleId: vehicle.id,
          studentId,
          studentName: student?.name || "",
          class: student?.department || null,
          pickupPoint: effectivePickup || undefined,
        },
      });
    }

    if (pickupPoint !== undefined && pickupPoint !== "") {
      await prisma.user.update({
        where: { id: studentId },
        data: { location: pickupPoint },
      });
    }

    const primaryVehicle = vehicles[0] || null;

    await auditLogService.record({
      req,
      action: "STUDENT_BUS_ASSIGNED",
      eventType: "UPDATE",
      module: "BUS_ROUTE_MANAGEMENT",
      entityType: "STUDENT",
      entityId: studentId,
      description: `Assigned student ${student?.name || studentId} to vehicle(s) ${vehicles.map((v) => v.number).join(", ")}`,
      newValues: {
        studentId,
        vehicles: vehicles.map((v) => ({ id: v.id, number: v.number, route: v.route })),
        pickupPoint: effectivePickup,
      },
    });

    res.json({
      success: true,
      vehicleId: primaryVehicle?.id || null,
      vehicleNumber: vehicles.map((v) => v.number).join(", "),
      route: vehicles.map((v) => v.route).filter(Boolean).join(", ") || null,
      pickupPoint: effectivePickup || null,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to assign student bus" });
  }
};

const deleteVehicle = async (req, res) => {
  try {
    const { id } = req.params;

    const existing = await prisma.vehicle.findUnique({
      where: { id },
    });

    if (!existing) {
      return res.status(404).json({ error: "Vehicle not found" });
    }

    await prisma.$transaction(async (tx) => {
      await tx.vehicleStudentAssignment.deleteMany({ where: { vehicleId: id } });
      await tx.vehicleCoordinatorAssignment.deleteMany({ where: { vehicleId: id } });
      await tx.routeVehicleAssignment.updateMany({
        where: { vehicleId: id, isActive: true },
        data: { isActive: false, removedAt: new Date(), removedBy: "vehicle-deleted" },
      });
      await tx.vehicle.delete({ where: { id } });

      await auditLogService.record({
        req,
        action: "BUS_DELETED",
        eventType: "DELETE",
        module: "VEHICLE_MANAGEMENT",
        entityType: "VEHICLE",
        entityId: id,
        description: `Deleted vehicle ${existing.number}`,
        oldValues: {
          id: existing.id,
          number: existing.number,
          route: existing.route,
        },
        tx,
      });
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    if (err.code === "P2025") {
      return res.status(404).json({ error: "Vehicle not found" });
    }
    res.status(500).json({ error: "Failed to delete vehicle" });
  }
};


module.exports = {
  fetchVehicles,
  createVehicle,
  updateVehicle,
  fetchVehicleMembers,
  assignVehicleMembers,
  removeVehicleMember,
  assignStudentBus,
  deleteVehicle,
};