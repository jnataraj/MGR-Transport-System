const prisma = require("../prisma/prisma");
const { isVehicleOnline } = require("../utils/vehicleLocationStore");

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
  assignedStudents: vehicle.assignedStudents?.map((a) => a.student) || [],
  assignedCoordinators:
    vehicle.assignedCoordinators?.map((a) => a.coordinator) || [],
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
  const routeName = vehicle.route;

  const existingActive = await tx.routeVehicleAssignment.findFirst({
    where: { vehicleId, isActive: true },
  });

  if (!routeName || routeName.trim() === "") {
    if (existingActive) {
      await tx.routeVehicleAssignment.update({
        where: { id: existingActive.id },
        data: {
          isActive: false,
          removedAt: new Date(),
          removedBy: "vehicle-sync",
        },
      });
    }
    return;
  }

  if (existingActive) {
    if (
      existingActive.routeName !== routeName ||
      existingActive.vehicleNumber !== vehicleNumber
    ) {
      await tx.routeVehicleAssignment.update({
        where: { id: existingActive.id },
        data: { routeName, vehicleNumber },
      });
    }
    return;
  }

  await tx.routeVehicleAssignment.create({
    data: {
      routeId: `AUTO-${vehicleId}`,
      routeName,
      vehicleId,
      vehicleNumber,
      isActive: true,
      assignedBy: "vehicle-sync",
      notes: "Auto-created from Vehicle Management",
    },
  });
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

      return tx.vehicle.findUnique({
        where: { id: vehicle.id },
        include: {
          driver: true,
          assignedStudents: { include: { student: true } },
          assignedCoordinators: { include: { coordinator: true } },
        },
      });
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

    const vehicle = await prisma.$transaction(async (tx) => {
      const updated = await tx.vehicle.update({
        where: { id },
        data: vehicleData,
      });

      // Keep RouteVehicleAssignment in sync
      await syncVehicleRouteAssignment(tx, updated);

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

    const coordinators = vehicle.assignedCoordinators?.map((a) => a.coordinator) || [];
    const students = vehicle.assignedStudents?.map((a) => a.student) || [];

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
        const studentAssignments = studentIds.map((sid) => ({
          vehicleId: id,
          studentId: sid,
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
      return res.json({ success: true });
    }

    if (type === "student") {
      await prisma.vehicleStudentAssignment.deleteMany({
        where: { vehicleId: id, studentId: memberId },
      });
      return res.json({ success: true });
    }

    if (type === "coordinator") {
      await prisma.vehicleCoordinatorAssignment.deleteMany({
        where: { vehicleId: id, coordinatorId: memberId },
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
    const { studentId, vehicleNumber } = req.body;
    if (!studentId) {
      return res.status(400).json({ error: "studentId is required" });
    }
    await prisma.vehicleStudentAssignment.deleteMany({ where: { studentId } });
    if (!vehicleNumber || vehicleNumber === "Not Assigned") {
      return res.json({ success: true, vehicleNumber: null });
    }
    const vehicle = await prisma.vehicle.findFirst({ where: { number: vehicleNumber } });
    if (!vehicle) {
      return res.status(404).json({ error: `Vehicle ${vehicleNumber} not found` });
    }
    const student = await prisma.user.findUnique({ where: { id: studentId } });
    await prisma.vehicleStudentAssignment.create({
      data: {
        vehicleId: vehicle.id,
        studentId,
        studentName: student?.name || "",
      },
    });
    res.json({ success: true, vehicleNumber: vehicle.number });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to assign student bus" });
  }
};

const deleteVehicle = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.$transaction(async (tx) => {
      await tx.vehicleStudentAssignment.deleteMany({ where: { vehicleId: id } });
      await tx.vehicleCoordinatorAssignment.deleteMany({ where: { vehicleId: id } });
      await tx.routeVehicleAssignment.updateMany({
        where: { vehicleId: id, isActive: true },
        data: { isActive: false, removedAt: new Date(), removedBy: "vehicle-deleted" },
      });
      await tx.vehicle.delete({ where: { id } });
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