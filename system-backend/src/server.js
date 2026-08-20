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
    if (!data || !data.vehicleId) return;
    socketVehicleMap.set(socket.id, data.vehicleId);
    if (data.driverId || data.userId) {
      socketDriverMap.set(socket.id, data.driverId || data.userId);
    }
    const latitude = data.latitude ?? data.lat;
    const longitude = data.longitude ?? data.lng;
    setVehicleLocation(data.vehicleId, latitude, longitude);
    io.emit("busLocationChanged", { ...data, latitude, longitude });

    // Compare with all active in-transit students on this vehicle
    try {
      await updateDriverLocation({
        vehicleId: data.vehicleId,
        driverId: data.driverId || data.userId,
        driverName: data.driverName || data.name,
        latitude,
        longitude,
        io,
      });
    } catch (err) {
      console.error("Socket driverLocationUpdate proximity check error:", err.message);
    }
  });

  socket.on("driverLocationStopped", async (data) => {
    if (!data || !data.vehicleId) return;
    socketVehicleMap.delete(socket.id);
    socketDriverMap.delete(socket.id);
    clearVehicleLocation(data.vehicleId);
    io.emit("busLocationStopped", data);

    try {
      await endVehicleTransit({
        vehicleId: data.vehicleId,
        reason: "Trip Stopped",
        io,
      });
    } catch (err) {
      console.error("Socket driverLocationStopped close alerts error:", err.message);
    }
  });

  socket.on("disconnect", async () => {
    const vehicleId = socketVehicleMap.get(socket.id);
    const driverId = socketDriverMap.get(socket.id);
    if (vehicleId || driverId) {
      if (vehicleId) {
        clearVehicleLocation(vehicleId);
        try {
          await endVehicleTransit({
            vehicleId,
            reason: "Driver Disconnected",
            io,
          });
        } catch (err) {
          console.error("Disconnect endVehicleTransit error:", err.message);
        }
      }
      io.emit("busLocationStopped", { vehicleId, driverId, reason: "disconnected" });
      socketVehicleMap.delete(socket.id);
      socketDriverMap.delete(socket.id);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on its ip `);
});