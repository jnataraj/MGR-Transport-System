const crypto = require("crypto");
const prisma = require("../prisma/prisma");

// Sensitive keys that must NEVER be persisted in audit logs
const SENSITIVE_KEYS = new Set([
  "password",
  "plainpassword",
  "passwordhash",
  "token",
  "accesstoken",
  "refreshtoken",
  "secret",
  "apisecret",
  "apikey",
  "otp",
  "privatekey",
  "authorization",
  "cookie",
]);

/**
 * Recursively redacts sensitive keys in objects/arrays
 */
const sanitizeData = (data) => {
  if (data === null || data === undefined) return data;
  if (typeof data === "string") {
    // If it's a string that looks like JSON, attempt parse & redact
    const trimmed = data.trim();
    if ((trimmed.startsWith("{") && trimmed.endsWith("}")) || (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
      try {
        const parsed = JSON.parse(trimmed);
        return JSON.stringify(sanitizeData(parsed));
      } catch {
        return data;
      }
    }
    return data;
  }
  if (typeof data !== "object") return data;

  if (Array.isArray(data)) {
    return data.map((item) => sanitizeData(item));
  }

  const sanitized = {};
  for (const [key, value] of Object.entries(data)) {
    const lowerKey = key.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (SENSITIVE_KEYS.has(lowerKey) || lowerKey.includes("password") || lowerKey.includes("secret") || lowerKey.includes("token")) {
      sanitized[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      sanitized[key] = sanitizeData(value);
    } else {
      sanitized[key] = value;
    }
  }
  return sanitized;
};

/**
 * Formats a value to JSON string safely
 */
const stringifyPayload = (val) => {
  if (val === null || val === undefined) return null;
  if (typeof val === "string") return val;
  try {
    const clean = sanitizeData(val);
    return JSON.stringify(clean);
  } catch (err) {
    console.error("AuditLog JSON stringify error:", err);
    return JSON.stringify({ error: "Failed to serialize payload" });
  }
};

/**
 * Generates an event ID: AUD-YYYYMMDD-XXXXXX
 */
const generateEventId = () => {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const rand = crypto.randomBytes(3).toString("hex").toUpperCase();
  return `AUD-${dateStr}-${rand}`;
};

const parseCoordinate = (val) => {
  if (val === null || val === undefined || val === "") return null;
  const num = parseFloat(val);
  return isNaN(num) ? null : num;
};

const parseDate = (val) => {
  if (!val) return null;
  try {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
};

/**
 * Resolves accurate Application Source name
 */
const resolveAppName = (req, explicitAppName, effectiveRole) => {
  if (explicitAppName && explicitAppName.trim()) {
    return explicitAppName.toUpperCase().trim().replace(/\s+/g, "_");
  }

  const appNameHeader = req?.headers ? req.headers["x-app-name"] : null;
  if (appNameHeader && String(appNameHeader).trim()) {
    return String(appNameHeader).toUpperCase().trim().replace(/\s+/g, "_");
  }

  // Derive by authenticated role if available
  const role = (effectiveRole || req?.user?.role || "").toLowerCase();
  if (role === "driver" || role === "coordinator") {
    return "OFFICER_APP";
  }
  if (role === "student" || role === "parent") {
    return "STUDENT_PARENT_APP";
  }
  if (role === "superadmin" || role === "admin" || role === "deptadmin") {
    return "WEB_ADMIN";
  }

  // User Agent heuristics
  const userAgent = req?.headers ? req.headers["user-agent"] || "" : "";
  const ua = userAgent.toLowerCase();
  if (ua.includes("officer") || ua.includes("expo") || ua.includes("okhttp") || ua.includes("darwin")) {
    return "OFFICER_APP";
  }
  if (ua.includes("mozilla") || ua.includes("chrome") || ua.includes("safari")) {
    return "WEB_ADMIN";
  }

  return "SYSTEM_BACKEND";
};

/**
 * Extracts client metadata from an Express request
 */
const extractClientInfo = (req, explicitAppName = null, effectiveRole = null) => {
  if (!req) {
    return {
      ipAddress: null,
      userAgent: null,
      deviceId: null,
      appName: explicitAppName || "SYSTEM_BACKEND",
      appVersion: null,
      requestId: null,
    };
  }

  const rawForwarded = req.headers ? req.headers["x-forwarded-for"] : null;
  const ipAddress = rawForwarded
    ? rawForwarded.split(",")[0].trim()
    : req.socket?.remoteAddress || req.ip || null;

  const userAgent = req.headers ? req.headers["user-agent"] || null : null;
  const appName = resolveAppName(req, explicitAppName, effectiveRole);

  const deviceId = req.headers ? req.headers["x-device-id"] || null : null;
  const appVersion = req.headers ? req.headers["x-app-version"] || null : null;
  const requestId = req.headers ? req.headers["x-request-id"] || null : null;

  return {
    ipAddress,
    userAgent,
    deviceId,
    appName,
    appVersion,
    requestId,
  };
};

/**
 * Central Audit Record Function
 */
const record = async ({
  req = null,
  user = null,
  userId = null,
  userRole = null,
  userName = null,
  action,
  eventType = "ACTION",
  module = "GENERAL",
  entityType = null,
  entityId = null,
  description = null,
  oldValues = null,
  newValues = null,
  metadata = null,
  // GPS Location Fields
  latitude = null,
  longitude = null,
  gpsAccuracy = null,
  gpsTimestamp = null,
  locationStatus = null,
  locationQuality = null,
  // Entity references
  vehicleId = null,
  vehicleNumber = null,
  routeId = null,
  routeName = null,
  studentId = null,
  driverId = null,
  qrSessionId = null,
  // Client / Device overrides
  ipAddress = null,
  userAgent = null,
  deviceId = null,
  appName = null,
  appVersion = null,
  requestId = null,
  status = "SUCCESS",
  failureReason = null,
  tx = null,
  io = null,
}) => {
  try {
    if (!action) {
      console.warn("AuditLog.record called without an action");
      action = "UNKNOWN_ACTION";
    }

    // Resolve user details in priority: explicit params > req.user > passed user obj
    const effectiveUser = user || (req ? req.user : null);
    const finalUserId = userId || effectiveUser?.id || effectiveUser?.userId || null;
    const finalUserRole = (userRole || effectiveUser?.role || (effectiveUser?.isSuperAdmin ? "SUPERADMIN" : null) || "UNKNOWN").toUpperCase();
    const finalUserName = userName || effectiveUser?.name || effectiveUser?.email || null;

    const clientInfo = extractClientInfo(req, appName, finalUserRole);

    const finalIp = ipAddress || clientInfo.ipAddress;
    const finalUserAgent = userAgent || clientInfo.userAgent;
    const finalDeviceId = deviceId || clientInfo.deviceId;
    const finalAppName = (appName || clientInfo.appName || "SYSTEM_BACKEND").toUpperCase();
    const finalAppVersion = appVersion || clientInfo.appVersion;
    const finalRequestId = requestId || clientInfo.requestId;

    // Parse & evaluate GPS Coordinates
    const lat = parseCoordinate(latitude);
    const lng = parseCoordinate(longitude);
    const acc = parseCoordinate(gpsAccuracy);
    const gpsTime = parseDate(gpsTimestamp);

    let locStatus = locationStatus;
    if (!locStatus) {
      if (lat !== null && lng !== null) {
        locStatus = "CAPTURED";
      } else {
        locStatus = "NOT_PROVIDED";
      }
    }

    let locQuality = locationQuality;
    if (!locQuality && lat !== null && lng !== null) {
      if (acc !== null) {
        if (acc <= 15) locQuality = "HIGH";
        else if (acc <= 50) locQuality = "MEDIUM";
        else locQuality = "LOW";
      } else {
        locQuality = "MEDIUM";
      }
    }

    const eventId = generateEventId();

    const auditData = {
      eventId,
      userId: finalUserId ? String(finalUserId) : null,
      userRole: finalUserRole,
      userName: finalUserName,
      action: String(action).toUpperCase(),
      eventType: String(eventType).toUpperCase(),
      module: String(module).toUpperCase(),
      entityType: entityType ? String(entityType).toUpperCase() : null,
      entityId: entityId ? String(entityId) : null,
      description: description || null,
      oldValues: stringifyPayload(oldValues),
      newValues: stringifyPayload(newValues),
      metadata: stringifyPayload(metadata),

      // GPS
      latitude: lat,
      longitude: lng,
      gpsAccuracy: acc,
      gpsTimestamp: gpsTime,
      serverReceivedAt: new Date(),
      locationStatus: locStatus,
      locationQuality: locQuality,

      // Entity references
      vehicleId: vehicleId ? String(vehicleId) : null,
      vehicleNumber: vehicleNumber ? String(vehicleNumber) : null,
      routeId: routeId ? String(routeId) : null,
      routeName: routeName ? String(routeName) : null,
      studentId: studentId ? String(studentId) : null,
      driverId: driverId ? String(driverId) : null,
      qrSessionId: qrSessionId ? String(qrSessionId) : null,

      // Device / Network
      ipAddress: finalIp,
      userAgent: finalUserAgent,
      deviceId: finalDeviceId,
      appName: finalAppName,
      appVersion: finalAppVersion,
      status: String(status).toUpperCase() === "FAILED" ? "FAILED" : "SUCCESS",
      failureReason: failureReason || null,
      requestId: finalRequestId,
    };

    const client = tx || prisma;
    const createdLog = await client.auditLog.create({
      data: auditData,
    });

    // Real-time broadcast to connected web-admin sockets
    try {
      const socketServer = io || (req?.app ? req.app.get("io") : null);
      if (socketServer) {
        socketServer.emit("audit_log_created", createdLog);
      }
    } catch (socketErr) {
      console.error("Audit socket emit error:", socketErr.message);
    }

    return createdLog;
  } catch (error) {
    console.error("CRITICAL: Failed to record audit log:", error);
    if (tx) {
      throw error;
    }
    return null;
  }
};

module.exports = {
  record,
  sanitizeData,
  extractClientInfo,
  resolveAppName,
  generateEventId,
};
