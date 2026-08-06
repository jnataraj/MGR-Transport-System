require("dotenv").config();
const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth.routes");
const userRoutes = require("./routes/users.routes");
const vehicleRoutes = require("./routes/vehicles.routes");
const routeRoutes = require("./routes/router.routes");
const notificationRoutes = require("./routes/notification.routes");
const attendanceRoutes = require("./routes/attendance.routes");
const adminSectionRoutes = require("./routes/adminSections.routes");
const adminRoutes = require("./routes/admins.routes");
const transitRoutes = require("./routes/transit.routes");
const maintenanceRoutes = require("./routes/maintenance.routes");
const issueRoutes = require("./routes/issues.routes");
const busChangeRoutes = require("./routes/busChange.routes");
const settingsRoutes = require("./routes/settings.routes");

const app = express();

if (!process.env.CLIENT_URLS) {
  throw new Error("CLIENT_URLS is not set in .env");
}

const allowedOrigins = process.env.CLIENT_URLS.split(",").map((u) => u.trim());

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin) return callback(null, true);

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("Not allowed by CORS"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(express.json({ limit: "10mb" }));

app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/vehicles", vehicleRoutes);
app.use("/api/routes", routeRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/attendance", attendanceRoutes);
app.use("/api/admin-sections", adminSectionRoutes);
app.use("/api/admins", adminRoutes);
app.use("/api/transit", transitRoutes);
app.use("/api/maintenance", maintenanceRoutes);
app.use("/api/issues", issueRoutes);
app.use("/api/bus-change", busChangeRoutes);
app.use("/api/settings", settingsRoutes);

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "CTMS Backend API Running",
  });
});

module.exports = app;