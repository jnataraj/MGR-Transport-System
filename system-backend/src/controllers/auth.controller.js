const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const prisma = require("../prisma/prisma.js");

exports.register = async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    const existingUser = await prisma.user.findUnique({
      where: {
        email,
      },
    });

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: "Email already exists",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role,
      },
    });

    res.status(201).json({
      success: true,
      message: "User Registered Successfully",
      user,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

const resolveUserRoute = async (assignedVehicle, userId) => {
  let vehicle = assignedVehicle;
  if (!vehicle && userId) {
    vehicle = await prisma.vehicle.findFirst({
      where: { driverId: userId },
    });
  }
  if (!vehicle) return null;

  if (vehicle.route && vehicle.route.trim() !== "") {
    return vehicle.route;
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
    return routeAssign ? routeAssign.routeName : null;
  } catch (err) {
    console.error("Error fetching route assignment:", err);
    return null;
  }
};

// Safely parse the permissions JSON string stored on deptadmin users.
// Returns [] for superadmins/other roles or malformed data.
const parsePermissions = (raw) => {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const resolveVehicleForUser = async (user) => {
  const role = (user.role || "").toLowerCase();

  if (role === "driver") {
    return (
      user.vehicles?.[0] ||
      (await prisma.vehicle.findFirst({
        where: { driverId: user.id },
        include: { driver: true },
      }))
    );
  }

  if (role === "coordinator") {
    return user.coordinatorAssignments?.[0]?.vehicle || null;
  }

  if (role === "student") {
    // Always read from VehicleStudentAssignment — the same table the admin
    // dashboard uses via getAssignedBus(). This guarantees both views agree
    // after any reassignment without requiring a logout/login cycle.
    return user.studentAssignments?.[0]?.vehicle || null;
  }

  return null;
};

const resolveVehiclesForUser = async (user) => {
  const role = (user.role || "").toLowerCase();

  if (role === "student") {
    return (user.studentAssignments || [])
      .map((assignment) => assignment.vehicle)
      .filter(Boolean);
  }

  if (role === "driver") {
    return user.vehicles || [];
  }

  if (role === "coordinator") {
    return (user.coordinatorAssignments || [])
      .map((assignment) => assignment.vehicle)
      .filter(Boolean);
  }

  return [];
};

exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Normalize to lowercase so "Driver@ctms.com" matches "driver@ctms.com"
    const normalizedEmail = (email || "").trim().toLowerCase();

    const includeRelations = {
      vehicles: {
        include: { driver: true },
      },
      studentAssignments: {
        include: {
          vehicle: {
            include: { driver: true },
          },
        },
      },
      coordinatorAssignments: {
        include: {
          vehicle: {
            include: { driver: true },
          },
        },
      },
    };

    // Primary lookup: by email (case-insensitive via mode)
    let user = await prisma.user.findFirst({
      where: {
        email: { equals: normalizedEmail, mode: "insensitive" },
      },
      include: includeRelations,
    });

    // Fallback: try loginId field (for staff accounts that use a separate ID)
    if (!user && normalizedEmail) {
      user = await prisma.user.findUnique({
        where: { loginId: normalizedEmail },
        include: includeRelations,
      });
    }

    // User not found
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User Not Found",
      });
    }

    // Verify password
    const isPasswordCorrect = await bcrypt.compare(password, user.password);

    if (!isPasswordCorrect) {
      return res.status(401).json({
        success: false,
        message: "Invalid Password",
      });
    }

    // Normalize status before checking
    const status = (user.status || "").trim().toLowerCase();
    const userRole = (user.role || "").trim().toLowerCase();

    // Drivers use a dynamic status (Offline ↔ Active) managed by QR scan —
    // they must always be able to log in regardless of their current status.
    // Only block non-driver accounts that are not "active".
    if (userRole !== "driver" && status !== "active") {
      return res.status(403).json({
        success: false,
        message: `Account is ${user.status}. Contact your administrator.`,
      });
    }

    // Generate JWT Token
    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        role: user.role,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "30d",
      },
    );

    const vehicleObj = await resolveVehicleForUser(user);
    const assignedVehicles = await resolveVehiclesForUser(user);
    const assignedRoute = await resolveUserRoute(vehicleObj, user.id);
    const driverName = vehicleObj?.driver?.name || null;
    const role = (user.role || "").toLowerCase();

    // Build a per-vehicle drivers array so the mobile app can look up
    // the driver by vehicle number (used by getDriverForVehicle()).
    const drivers = assignedVehicles
      .filter((v) => v.driver)
      .map((v) => ({
        vehicleId: v.id,
        vehicleNumber: v.number,
        driverId: v.driver.id,
        driverName: v.driver.name,
        phone: v.driver.phone || null,
      }));

    // Login success
    return res.status(200).json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role,
        phone: user.phone,
        department: user.department,
        year: user.year,
        vehicle: vehicleObj?.number || null,
        vehicleId: vehicleObj?.id || null,
        // All assigned vehicles
        vehicles: assignedVehicles,
        vehicleIds: assignedVehicles.map((v) => v.id),
        vehicleNumbers: assignedVehicles.map((v) => v.number),
        route: assignedRoute,
        driverName,
        drivers,
        // Admin-specific access-control fields. Empty/null for
        // non-admin roles (driver, student, coordinator, parent).
        employeeId: user.employeeId || null,
        roleHeader: user.roleHeader || null,
        sector: user.sector || null,
        permissions:
          role === "deptadmin" ? parsePermissions(user.permissions) : [],
      },
    });
  } catch (error) {
    console.error("Login Error:", error);

    return res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

exports.profile = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: {
        id: req.user.id,
      },
      include: {
        vehicles: {
          include: { driver: true },
        },
        studentAssignments: {
          include: {
            vehicle: {
              include: { driver: true },
            },
          },
        },
        coordinatorAssignments: {
          include: {
            vehicle: {
              include: { driver: true },
            },
          },
        },
      },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User Not Found",
      });
    }

    const { password, ...safeUser } = user;
    const vehicleObj = await resolveVehicleForUser(user);
    const assignedVehicles = await resolveVehiclesForUser(user);
    const assignedRoute = await resolveUserRoute(vehicleObj, user.id);
    const driverName = vehicleObj?.driver?.name || null;
    const role = (user.role || "").toLowerCase();

    // Build a per-vehicle drivers array so the mobile app can look up
    // the driver by vehicle number (used by getDriverForVehicle()).
    const drivers = assignedVehicles
      .filter((v) => v.driver)
      .map((v) => ({
        vehicleId: v.id,
        vehicleNumber: v.number,
        driverId: v.driver.id,
        driverName: v.driver.name,
        phone: v.driver.phone || null,
      }));

    res.json({
      success: true,
      user: {
        ...safeUser,
        role,
        vehicle: vehicleObj?.number || null,
        vehicleId: vehicleObj?.id || null,
        vehicles: assignedVehicles,
        vehicleIds: assignedVehicles.map((v) => v.id),
        vehicleNumbers: assignedVehicles.map((v) => v.number),
        route: assignedRoute,
        driverName,
        drivers,
        permissions:
          role === "deptadmin" ? parsePermissions(user.permissions) : [],
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
