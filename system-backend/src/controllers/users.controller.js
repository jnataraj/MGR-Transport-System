const bcrypt = require("bcryptjs");
const prisma = require("../prisma/prisma");

const sanitizeUserData = async (data, { isUpdate = false } = {}) => {
  const {
    name, email, password, role, phone, status, license,
    department, year, paymentStatus, parentId,
    occupation, homeAddress, studentName, studentRollNo, loginId,
    rollNumber, parentName, parentPhone, image, location, shift, // new
  } = data;

  let hashedPassword;
  if (password !== undefined && password !== "") {
    hashedPassword = await bcrypt.hash(password, 10);
  }

  return {
    ...(name !== undefined && { name }),
    ...(email !== undefined && { email }),
    ...(hashedPassword !== undefined && { password: hashedPassword }),
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
  const { password, ...rest } = user;

  const vehicleList =
    user.role?.toLowerCase() === "student"
      ? (user.studentAssignments || []).map((a) => a.vehicle)
      : (user.vehicles || []);

  return {
    ...rest,
    vehicle:
      vehicleList.length > 0
        ? vehicleList.map((v) => v.number).join(", ")
        : "Not Assigned",
    vehicleIds: vehicleList.map((v) => v.id),
    vehicles: vehicleList,
  };
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

const getUsers = async (req, res) => {
  try {
    const { role } = req.query;
    const where = role ? { role: { equals: role, mode: "insensitive" } } : {};
    // const users = await prisma.user.findMany({
    //   where,
    //   // include: { assignedVehicle: true },
    //   include: { vehicles: true }
    // });
    const users = await prisma.user.findMany({
      where,
      include: {
        vehicles: true, // Driver relation
        studentAssignments: {
          include: {
            vehicle: true,
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
      // include: { assignedVehicle: true },
      include: { vehicles: true }
    });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json(formatUser(user));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch user" });
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

    await assignDriverToVehicle(user.id, vehicleIds);

    if (user.role === "parent" && data.studentRollNo) {
      await linkParentToStudent(user, data.studentRollNo);
    }

    if (user.role === "student" && user.rollNumber) {
      await linkStudentToParent(user);
    }

    const updatedUser = await prisma.user.findUnique({
      where: { id: user.id },
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

    await assignDriverToVehicle(id, vehicleIds);

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

// const deleteUser = async (req, res) => {
//   try {
//     const { id } = req.params;
//     await prisma.user.delete({ where: { id } });
//     res.json({ success: true });
//   } catch (err) {
//     console.error(err);
//     res.status(500).json({ error: "Failed to delete user" });
//   }
// };

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
