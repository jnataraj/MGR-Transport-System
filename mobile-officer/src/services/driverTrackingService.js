import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE } from "../api/client";

export const DRIVER_LOCATION_TASK = "CTMS_DRIVER_BACKGROUND_LOCATION_TASK";
const TRACKING_STATE_KEY = "ctms_driver_tracking_state";

let activeSocketRef = null;
let foregroundHeartbeatInterval = null;
let isTrackingActive = false;

// ─────────────────────────────────────────────────────────────────────────────
// Top-Level Background Task Definition (Registered at module load)
// ─────────────────────────────────────────────────────────────────────────────
if (!TaskManager.isTaskDefined(DRIVER_LOCATION_TASK)) {
  TaskManager.defineTask(DRIVER_LOCATION_TASK, async ({ data, error }) => {
    if (error) {
      console.warn(`[DriverTracking] Background task error: ${error.message}`);
      return;
    }

    if (data && data.locations && data.locations.length > 0) {
      const latest = data.locations[data.locations.length - 1];
      const coords = latest.coords;
      if (!coords) return;

      try {
        // Retrieve tracking context from AsyncStorage for headless execution
        const rawState = await AsyncStorage.getItem(TRACKING_STATE_KEY);
        const state = rawState ? JSON.parse(rawState) : {};

        const payload = {
          driverId: state.driverId,
          userId: state.driverId,
          vehicleId: state.vehicleId,
          vehicleNumber: state.vehicleNumber,
          latitude: coords.latitude,
          longitude: coords.longitude,
          speed: coords.speed != null ? coords.speed : 0,
          heading: coords.heading != null ? coords.heading : 0,
          role: state.role || "driver",
          timestamp: new Date().toISOString(),
        };

        // 1. Send reliable HTTP POST to backend (works even if socket is suspended in background)
        const headers = { "Content-Type": "application/json" };
        if (state.token) {
          headers["Authorization"] = `Bearer ${state.token}`;
        }

        console.log(`[GPS DEBUG][DRIVER]
latitude: ${coords.latitude}
longitude: ${coords.longitude}
accuracy: ${coords.accuracy}
timestamp: ${new Date().toISOString()}
source: DriverApp-BackgroundLocationTask`);

        try {
          const res = await fetch(`${API_BASE}/api/attendance/driver-location`, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
          });
          if (res.ok) {
            console.log(`[DriverTracking] Background location sent (${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)})`);
          } else {
            console.log(`[DriverTracking] Background location HTTP ${res.status}`);
          }
        } catch (netErr) {
          console.log(`[DriverTracking] Network unavailable in background task: ${netErr.message}`);
        }

        // 2. Also emit via socket if connected
        if (activeSocketRef && activeSocketRef.connected) {
          activeSocketRef.emit("driverLocationUpdate", payload);
        }
      } catch (err) {
        console.warn(`[DriverTracking] Background location processing error: ${err.message}`);
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Permissions Helper
// ─────────────────────────────────────────────────────────────────────────────
export const requestDriverLocationPermissions = async () => {
  try {
    const fg = await Location.requestForegroundPermissionsAsync();
    if (fg.status !== "granted") {
      return { granted: false, background: false, reason: "Foreground permission denied" };
    }

    try {
      const bg = await Location.requestBackgroundPermissionsAsync();
      return {
        granted: true,
        background: bg.status === "granted",
      };
    } catch (bgErr) {
      console.log(`[DriverTracking] Background permission request error: ${bgErr.message}`);
      return { granted: true, background: false };
    }
  } catch (err) {
    console.error(`[DriverTracking] Permission error: ${err.message}`);
    return { granted: false, background: false, reason: err.message };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Start Driver Tracking (Foreground + Background)
// ─────────────────────────────────────────────────────────────────────────────
export const startDriverTracking = async ({ user, vehicleId, vehicleNumber, token, socket }) => {
  if (isTrackingActive) {
    console.log("[DriverTracking] Tracking is already active");
    return true;
  }

  console.log("[DriverTracking] Starting tracking");

  const driverId = user?.id;
  const role = user?.role || "driver";

  // Persist tracking context for headless background task
  const trackingState = {
    driverId,
    vehicleId,
    vehicleNumber,
    token,
    role,
    startedAt: new Date().toISOString(),
  };

  await AsyncStorage.setItem(TRACKING_STATE_KEY, JSON.stringify(trackingState));
  activeSocketRef = socket || null;

  try {
    // 1. Check/Request Permissions
    const perm = await requestDriverLocationPermissions();
    if (!perm.granted) {
      console.warn("[DriverTracking] Foreground location permission not granted");
      return false;
    }

    // 2. Immediate GPS fix & dispatch
    try {
      const initial = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      if (initial?.coords) {
        sendLocationPing({
          coords: initial.coords,
          driverId,
          vehicleId,
          vehicleNumber,
          role,
          token,
          socket,
        });
      }
    } catch (locErr) {
      console.log(`[DriverTracking] Initial position fix skipped: ${locErr.message}`);
    }

    // 3. Start Expo Task Manager Background Updates
    try {
      const isRegistered = await TaskManager.isTaskRegisteredAsync(DRIVER_LOCATION_TASK);
      if (isRegistered) {
        await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK).catch(() => { });
      }

      await Location.startLocationUpdatesAsync(DRIVER_LOCATION_TASK, {
        accuracy: Location.Accuracy.High,
        timeInterval: 15000, // 15 seconds
        distanceInterval: 10, // 10 meters
        deferredUpdatesInterval: 15000,
        showsBackgroundLocationIndicator: true,
        pausesLocationUpdatesAutomatically: false,
        foregroundService: {
          notificationTitle: "CTMS Driver Duty Active",
          notificationBody: "Vehicle location tracking is active in background",
          notificationColor: "#2563EB",
        },
      });

      console.log("[DriverTracking] Background location task started");
    } catch (bgStartErr) {
      console.warn(`[DriverTracking] Background update start failed, falling back to foreground watcher: ${bgStartErr.message}`);
    }

    // 4. Foreground Heartbeat Interval (backup for stationary vehicle)
    if (foregroundHeartbeatInterval) {
      clearInterval(foregroundHeartbeatInterval);
    }

    foregroundHeartbeatInterval = setInterval(async () => {
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }).catch(() => null);

        if (loc?.coords) {
          sendLocationPing({
            coords: loc.coords,
            driverId,
            vehicleId,
            vehicleNumber,
            role,
            token,
            socket: activeSocketRef,
          });
        }
      } catch (hbErr) {
        console.log(`[DriverTracking] Heartbeat tick failed: ${hbErr.message}`);
      }
    }, 20000); // every 20s

    isTrackingActive = true;
    return true;
  } catch (err) {
    console.error(`[DriverTracking] Failed to start tracking: ${err.message}`);
    return false;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Send Single Location Ping (HTTP + Socket)
// ─────────────────────────────────────────────────────────────────────────────
const sendLocationPing = async ({ coords, driverId, vehicleId, vehicleNumber, role, token, socket }) => {
  if (!coords) return;

  const payload = {
    driverId,
    userId: driverId,
    vehicleId,
    vehicleNumber,
    latitude: coords.latitude,
    longitude: coords.longitude,
    lat: coords.latitude,
    lng: coords.longitude,
    speed: coords.speed != null ? coords.speed : 0,
    heading: coords.heading != null ? coords.heading : 0,
    role: role || "driver",
    timestamp: new Date().toISOString(),
  };

  // Socket emit
  if (socket && socket.connected) {
    socket.emit("driverLocationUpdate", payload);
  }

  // HTTP POST fallback/sync
  try {
    const headers = { "Content-Type": "application/json" };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    await fetch(`${API_BASE}/api/attendance/driver-location`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.log(`[DriverTracking] HTTP location ping error: ${err.message}`);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Stop Driver Tracking
// ─────────────────────────────────────────────────────────────────────────────
export const stopDriverTracking = async ({ vehicleId, driverId, socket } = {}) => {
  console.log("[DriverTracking] Tracking stopped");
  isTrackingActive = false;

  if (foregroundHeartbeatInterval) {
    clearInterval(foregroundHeartbeatInterval);
    foregroundHeartbeatInterval = null;
  }

  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(DRIVER_LOCATION_TASK);
    if (isRegistered) {
      await Location.stopLocationUpdatesAsync(DRIVER_LOCATION_TASK);
    }
  } catch (err) {
    console.log(`[DriverTracking] Stop location updates error: ${err.message}`);
  }

  await AsyncStorage.removeItem(TRACKING_STATE_KEY);

  const sock = socket || activeSocketRef;
  if (sock && sock.connected) {
    sock.emit("driverLocationStopped", {
      vehicleId,
      driverId,
    });
  }

  activeSocketRef = null;
};
