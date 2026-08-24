require("dotenv").config();

const http = require("http");
const { Server } = require("socket.io");
const { setVehicleLocation, clearVehicleLocation } = require("./utils/vehicleLocationStore");
const {
  updateStudentLocation,
  updateDriverLocation,
  endVehicleTransit,
  endStudentTransit,
} = require("./services/missingAlertService");

const app = require("./app");

const PORT = process.env.PORT || 5000;

if (!process.env.CLIENT_URLS) {
  throw new Error("CLIENT_URLS is not set in .env");
}

const allowedSocketOrigins = process.env.CLIENT_URLS.split(",").map((u) => u.trim());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedSocketOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    methods: ["GET", "POST"],
    credentials: true,
  },
});

app.set("io", io);

const prisma = require("./prisma/prisma");

// Track which vehicleId and driverId belong to which socket
const socketVehicleMap = new Map();
const socketDriverMap = new Map();

io.on("connection", (socket) => {
  socket.on("joinRoom", (role) => {
    if (role) {
      socket.join(role);
    }
  });

  socket.on("joinUser", (userId) => {
    if (userId) {
      socket.join(`user_${userId}`);
    }
  });

  // ── Student Real-Time Location Update ──
  socket.on("studentLocationUpdate", async (data) => {
    if (!data || !data.studentId) return;
    const latitude = data.latitude ?? data.lat;
    const longitude = data.longitude ?? data.lng;
    if (latitude == null || longitude == null) return;

    // Update student's lastSeenAt in DB
    prisma.user.update({
      where: { id: data.studentId },
      data: { lastSeenAt: new Date() },
    }).catch(() => {});

    try {
      await updateStudentLocation({
        studentId: data.studentId,
        studentName: data.studentName,
        studentRollNo: data.studentRollNo,
        vehicleId: data.vehicleId,
        vehicleNumber: data.vehicleNumber,
        latitude,
        longitude,
        io,
      });
    } catch (err) {
      console.error("Socket studentLocationUpdate error:", err.message);
    }
  });

  // ── Student Transit Completed ──
  socket.on("studentTransitCompleted", async (data) => {
    if (!data || !data.studentId) return;
    try {
      await endStudentTransit({
        studentId: data.studentId,
        reason: data.reason || "Arrived at Destination",
        io,
      });
    } catch (err) {
      console.error("Socket studentTransitCompleted error:", err.message);
    }
  });

  // ── Driver Real-Time Location Update ──
  socket.on("driverLocationUpdate", async (data) => {
    if (!data || (!data.vehicleId && !data.driverId && !data.userId)) return;
    const driverId = data.driverId || data.userId;
    const vehicleId = data.vehicleId;

    if (vehicleId) socketVehicleMap.set(socket.id, vehicleId);
    if (driverId) socketDriverMap.set(socket.id, driverId);

    const latitude = data.latitude ?? data.lat;
    const longitude = data.longitude ?? data.lng;

    // Update lastSeenAt in DB
    if (driverId) {
      prisma.user.update({
        where: { id: driverId },
        data: { lastSeenAt: new Date() },
      }).catch(() => {});
    }

    if (latitude != null && longitude != null) {
      setVehicleLocation(vehicleId || driverId, latitude, longitude, {
        vehicleNumber: data.vehicleNumber,
        driverId,
        speed: data.speed,
        heading: data.heading,
        isHalted: data.isHalted,
      });
    }

    io.emit("busLocationChanged", {
      ...data,
      latitude,
      longitude,
      lat: latitude,
      lng: longitude,
      timestamp: data.timestamp || new Date().toISOString(),
    });

    // Compare with all active in-transit students on this vehicle
    if ((vehicleId || driverId) && latitude != null && longitude != null) {
      try {
        await updateDriverLocation({
          vehicleId,
          vehicleNumber: data.vehicleNumber,
          driverId,
          driverName: data.driverName || data.name,
          latitude,
          longitude,
          io,
        });
      } catch (err) {
        console.error("Socket driverLocationUpdate proximity check error:", err.message);
      }
    }
  });

  // ── Explicit Driver Location Stopped (trip end / logout) ──
  socket.on("driverLocationStopped", async (data) => {
    if (!data) return;
    const targetKey = data.vehicleId || data.driverId || data.userId;
    if (!targetKey) return;

    socketVehicleMap.delete(socket.id);
    socketDriverMap.delete(socket.id);
    clearVehicleLocation(targetKey);
    io.emit("busLocationStopped", data);

    try {
      await endVehicleTransit({
        vehicleId: targetKey,
        reason: "Trip Stopped",
        io,
      });
    } catch (err) {
      console.error("Socket driverLocationStopped close alerts error:", err.message);
    }
  });

  // ── Socket Disconnect: Do NOT immediately mark driver offline / clear location ──
  // Driver active status is governed by DRIVER_ACTIVE_TIMEOUT_MS via background heartbeats
  socket.on("disconnect", () => {
    socketVehicleMap.delete(socket.id);
    socketDriverMap.delete(socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`Server running on its ip `);
});