const bcrypt = require("bcryptjs");
const prisma = require("../prisma/prisma");
const { isVehicleOnline, DEFAULT_TIMEOUT_MS } = require("../utils/vehicleLocationStore");

const sanitizeUserData = async (data, { isUpdate = false } = {}) => {
  const {
    name, email, password, role, phone, status, license,
    department, year, paymentStatus, parentId,
    occupation, homeAddress, studentName, studentRollNo, loginId,
    rollNumber, parentName, parentPhone, image, location, shift,
    employeeId, workId, plainPassword: rawPlainPassword,
  } = data;

  let hashedPassword;
  let plainPassword;
  const inputPassword = password || rawPlainPassword;
  if (inputPassword !== undefined && inputPassword !== "") {
    hashedPassword = await bcrypt.hash(inputPassword, 10);
    plainPassword = inputPassword;
  }

  const finalEmployeeId = employeeId !== undefined ? employeeId : (workId !== undefined ? workId : undefined);

  return {
    ...(name !== undefined && { name }),
    ...(email !== undefined && { email }),
    ...(hashedPassword !== undefined && { password: hashedPassword }),
    ...(plainPassword !== undefined && { plainPassword }),
    ...(finalEmployeeId !== undefined && { employeeId: finalEmployeeId }),
    ...(role !== undefined && { role }),
    ...(phone !== undefined && { phone }),
    ...(status !== undefined && { status }),
    ...(license !== undefined && { license }),
    ...(department !== undefined && { department }),
    ...(year !== undefined && { year }),
    ...(paymentStatus !== undefined && { paymentStatus }),
    ...(parentId !== undefined && { parentId }),
    ...(occupation !== undefined && { occupation }),
    ...(homeAddress !== undefined && { homeAddress }),
    ...(studentName !== undefined && { studentName }),
    ...(studentRollNo !== undefined && { studentRollNo }),
    ...(loginId !== undefined && { loginId }),
    ...(rollNumber !== undefined && { rollNumber }),
    ...(parentName !== undefined && { parentName }),
    ...(parentPhone !== undefined && { parentPhone }),
    ...(image !== undefined && { image }),
    ...(location !== undefined && { location }),
    ...(shift !== undefined && { shift }),
  };
};

const formatUser = (user) => {
  const { password, plainPassword, ...rest } = user;

  const vehicleList =
    user.role?.toLowerCase() === "student"
      ? (user.studentAssignments || [])
        .map((a) => a.vehicle)
        .filter(Boolean)
      : (user.vehicles || []);

  const effectivePassword = plainPassword || (password && !password.startsWith("$2b$") ? password : "123456");

  const isOnline = (() => {
    if (user.id && isVehicleOnline(user.id)) return true;
    if (user.lastSeenAt && Date.now() - new Date(user.lastSeenAt).getTime() < DEFAULT_TIMEOUT_MS) return true;
    const assignedIds = vehicleList.map((v) => v.id).concat(vehicleList.map((v) => v.number));
    return assignedIds.some((id) => isVehicleOnline(id));
  })();

  return {
    ...rest,
    isOnline,
    lastSeenAt: user.lastSeenAt || null,
    password: effectivePassword,
    plainPassword: effectivePassword,
    employeeId: user.employeeId || (user.id ? user.id.slice(-8).toUpperCase() : null),

    vehicle:
      vehicleList.length > 0
        ? vehicleList.map((v) => v.number).join(", ")
        : "Not Assigned",

    vehicleIds: vehicleList.map((v) => v.id),

    vehicles: vehicleList,

    driverName:
      vehicleList.find((v) => v.driver?.name)?.driver?.name || null,

    driverId:
      vehicleList.find((v) => v.driver?.id)?.driver?.id || null,

    drivers: vehicleList
      .filter((v) => v.driver)
      .map((v) => ({
        vehicleId: v.id,
        vehicleNumber: v.number,
        driverId: v.driver.id,
        driverName: v.driver.name,
        phone: v.driver.phone || null,
      })),
  };
};

const attachDriverDetails = async (users) => {
  // Get all vehicles from students/drivers
  const allVehicles = users.flatMap((user) => {
    if (user.role?.toLowerCase() === "student") {
      return (user.studentAssignments || [])
        .map((a) => a.vehicle)
        .filter(Boolean);
    }

    return user.vehicles || [];
  });

  // Get unique driver IDs
  const driverIds = [
    ...new Set(
      allVehicles
        .map((vehicle) => vehicle?.driverId)
        .filter(Boolean)
    ),
  ];

  if (driverIds.length === 0) {
    return users;
  }

  // Get actual driver users
  const drivers = await prisma.user.findMany({
    where: {
      id: { in: driverIds },
    },
    select: {
      id: true,
      name: true,
      phone: true,
    },
  });

  const driverMap = new Map(
    drivers.map((driver) => [driver.id, driver])
  );

  // Attach driver details to every vehicle
  return users.map((user) => {
    const vehicleList =
      user.role?.toLowerCase() === "student"
        ? (user.studentAssignments || [])
          .map((a) => a.vehicle)
          .filter(Boolean)
        : (user.vehicles || []);

    const updatedVehicles = vehicleList.map((vehicle) => ({
      ...vehicle,
      driver: vehicle.driverId
        ? driverMap.get(vehicle.driverId) || null
        : null,
    }));

    return {
      ...user,

      vehicles: updatedVehicles,

      studentAssignments:
        user.role?.toLowerCase() === "student"
          ? (user.studentAssignments || []).map((assignment) => ({
            ...assignment,
            vehicle:
              updatedVehicles.find(
                (v) => v.id === assignment.vehicle?.id
              ) || assignment.vehicle,
          }))
          : user.studentAssignments,

      driverName:
        updatedVehicles.find((v) => v.driver?.name)?.driver?.name ||
        null,

      drivers: updatedVehicles
        .filter((v) => v.driver)
        .map((v) => ({
          vehicleId: v.id,
          vehicleNumber: v.number,
          driverId: v.driver.id,
          driverName: v.driver.name,
          phone: v.driver.phone || null,
        })),
    };
  });
};

// Assigns userId to exactly the vehicles in vehicleIds (adds new links, removes any no longer selected)
const assignDriverToVehicle = async (userId, rawVehicleIds = []) => {
  let vehicleIds = Array.isArray(rawVehicleIds) ? rawVehicleIds : (rawVehicleIds ? [rawVehicleIds] : []);

  // Clean empty values
  let cleanIds = vehicleIds.filter((id) => id && id !== "Not Assigned");

  if (cleanIds.length > 0) {
    // Check if any cleanIds are vehicle numbers (e.g. "BUS-101") instead of UUIDs
    const vehiclesByNumber = await prisma.vehicle.findMany({
      where: { number: { in: cleanIds } },
      select: { id: true, number: true },
    });

    if (vehiclesByNumber.length > 0) {
      const numberToIdMap = new Map(vehiclesByNumber.map((v) => [v.number, v.id]));
      cleanIds = cleanIds.map((val) => numberToIdMap.get(val) || val);
    }
  }

  // Unassign from any vehicle this driver currently has that is NOT in the new selection
  await prisma.vehicle.updateMany({
    where: { driverId: userId, id: { notIn: cleanIds } },
    data: { driverId: null },
  });

  // Assign to every vehicle in the new selection
  if (cleanIds.length > 0) {
    await prisma.vehicle.updateMany({
      where: { id: { in: cleanIds } },
      data: { driverId: userId },
    });
  }
};

const assignStudentToVehicle = async (studentId, rawVehicleIds = [], studentName = "") => {
  let vehicleIds = Array.isArray(rawVehicleIds) ? rawVehicleIds : (rawVehicleIds ? [rawVehicleIds] : []);
  let cleanIds = vehicleIds.filter((id) => id && id !== "Not Assigned");

  if (cleanIds.length === 0) return;

  const vehicles = await prisma.vehicle.findMany({
    where: { OR: [{ id: { in: cleanIds } }, { number: { in: cleanIds } }] },
    select: { id: true, number: true },
  });

  if (vehicles.length > 0) {
    await prisma.vehicleStudentAssignment.deleteMany({ where: { studentId } });
    for (const v of vehicles) {
      await prisma.vehicleStudentAssignment.create({
        data: {
          vehicleId: v.id,
          studentId,
          studentName: studentName || "",
        },
      });
    }
  }
};

const getUsers = async (req, res) => {
  try {
    const { role } = req.query;
    const where = role ? { role: { equals: role, mode: "insensitive" } } : {};
    const users = await prisma.user.findMany({
      where,
      include: {
        vehicles: {
          include: {
            driver: {
              select: {
                id: true,
                name: true,
                phone: true,
              },
            },
          },
        },

        studentAssignments: {
          include: {
            vehicle: {
              include: {
                driver: {
                  select: {
                    id: true,
                    name: true,
                    phone: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    res.json(users.map(formatUser));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch users" });
  }
};

const getUser = async (req, res) => {
  try {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        vehicles: {
          include: {
            driver: {
              select: {
                id: true,
                name: true,
                phone: true,
              },
            },
          },
        },
        studentAssignments: {
          include: {
            vehicle: {
              include: {
                driver: {
                  select: {
                    id: true,
                    name: true,
                    phone: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({
        error: "User not found",
      });
    }

    res.json(formatUser(user));
  } catch (err) {
    console.error(err);
    res.status(500).json({
      error: "Failed to fetch user",
    });
  }
};

// Finds the student with the matching roll number and stamps
// that student record with this parent's name/phone.
const linkParentToStudent = async (parentUser, studentRollNo) => {
  if (!studentRollNo) return;

  const student = await prisma.user.findFirst({
    where: { role: "student", rollNumber: studentRollNo.trim() },
  });

  if (!student) return; // no matching student yet — parent still saves fine

  await prisma.user.update({
    where: { id: student.id },
    data: {
      parentId: parentUser.id,
      parentName: parentUser.name,
      parentPhone: parentUser.phone,
    },
  });
};

// Reverse direction: when a student is saved, check if any parent
// already listed this student's rollNumber and link them.
const linkStudentToParent = async (studentUser) => {
  if (!studentUser.rollNumber) return;

  const parent = await prisma.user.findFirst({
    where: { role: "parent", studentRollNo: studentUser.rollNumber },
  });

  if (!parent) return;

  await prisma.user.update({
    where: { id: studentUser.id },
    data: {
      parentId: parent.id,
      parentName: parent.name,
      parentPhone: parent.phone,
    },
  });
};

const createUser = async (req, res) => {
  try {
    const data = req.body;
    if (!data.password) {
      return res.status(400).json({ error: "Password is required" });
    }

    const vehicleIds = (Array.isArray(data.vehicleIds) && data.vehicleIds.length > 0)
      ? data.vehicleIds
      : (data.vehicle ? [data.vehicle] : (Array.isArray(data.vehicleIds) ? data.vehicleIds : []));
    const userData = await sanitizeUserData(data);
    const user = await prisma.user.create({ data: userData });

    if (user.role?.toLowerCase() === "student") {
      await assignStudentToVehicle(user.id, vehicleIds, user.name);
    } else {
      await assignDriverToVehicle(user.id, vehicleIds);
    }

    if (user.role === "parent" && data.studentRollNo) {
      await linkParentToStudent(user, data.studentRollNo);
    }

    if (user.role === "student" && user.rollNumber) {
      await linkStudentToParent(user);
    }

    const updatedUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: {
        vehicles: true,
        studentAssignments: {
          include: {
            vehicle: true,
          },
        },
      }
    });

    res.status(201).json(formatUser(updatedUser));
  } catch (err) {
    console.error(err);
    if (err.code === "P2002") {
      return res.status(400).json({ error: "Email already exists" });
    }
    res.status(500).json({ error: "Failed to create user" });
  }
};

const updateUser = async (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body;
    const vehicleIds = (Array.isArray(data.vehicleIds) && data.vehicleIds.length > 0)
      ? data.vehicleIds
      : (data.vehicle ? [data.vehicle] : (Array.isArray(data.vehicleIds) ? data.vehicleIds : []));
    const userData = await sanitizeUserData(data, { isUpdate: true });

    const user = await prisma.user.update({ where: { id }, data: userData });

    if (user.role?.toLowerCase() === "student") {
      await assignStudentToVehicle(id, vehicleIds, user.name);
    } else {
      await assignDriverToVehicle(id, vehicleIds);
    }

    if (user.role === "parent" && data.studentRollNo) {
      await linkParentToStudent(user, data.studentRollNo);
    }

    if (user.role === "student" && user.rollNumber) {
      await linkStudentToParent(user);
    }

    const updatedUser = await prisma.user.findUnique({
      where: { id },
      // include: { vehicles: true }
      include: {
        vehicles: true,
        studentAssignments: {
          include: {
            vehicle: true,
          },
        },
      }
    });

    res.json(formatUser(updatedUser));
  } catch (err) {
    console.error(err);
    if (err.code === "P2002") {
      const field = err.meta?.target?.join(", ") || "field";
      return res.status(400).json({ error: `${field} already in use by another user` });
    }
    res.status(500).json({ error: "Failed to update user" });
  }
};

const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.$transaction(async (tx) => {
      // If this user is a driver on any vehicle, unassign them first
      await tx.vehicle.updateMany({
        where: { driverId: id },
        data: { driverId: null },
      });

      // Remove any home-bus / coordinator assignment rows referencing this user
      await tx.vehicleStudentAssignment.deleteMany({ where: { studentId: id } });
      await tx.vehicleCoordinatorAssignment.deleteMany({ where: { coordinatorId: id } });

      // Unlink any students that list this user as their parent
      await tx.user.updateMany({
        where: { parentId: id },
        data: { parentId: null },
      });

      await tx.user.delete({ where: { id } });
    });

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    if (err.code === "P2025") {
      return res.status(404).json({ error: "User not found" });
    }
    res.status(500).json({ error: "Failed to delete user" });
  }
};

module.exports = {
  getUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
};
