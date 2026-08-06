require("dotenv").config();

const http = require("http");
const { Server } = require("socket.io");
const { setVehicleLocation, clearVehicleLocation } = require("./utils/vehicleLocationStore");

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

// Track which vehicleId belongs to which socket
const socketVehicleMap = new Map();

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

  socket.on("driverLocationUpdate", (data) => {
    if (!data || !data.vehicleId) return;
    socketVehicleMap.set(socket.id, data.vehicleId);
    const latitude = data.latitude ?? data.lat;
    const longitude = data.longitude ?? data.lng;
    setVehicleLocation(data.vehicleId, latitude, longitude);
    io.emit("busLocationChanged", { ...data, latitude, longitude });
  });

  socket.on("driverLocationStopped", (data) => {
    if (!data || !data.vehicleId) return;
    socketVehicleMap.delete(socket.id);
    clearVehicleLocation(data.vehicleId);
    io.emit("busLocationStopped", data);
  });

  socket.on("disconnect", () => {
    const vehicleId = socketVehicleMap.get(socket.id);
    if (vehicleId) {
      io.emit("busLocationStopped", { vehicleId });
      clearVehicleLocation(vehicleId);
      socketVehicleMap.delete(socket.id);
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server running on its ip `);
});