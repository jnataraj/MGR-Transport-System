import * as Location from "expo-location";
import * as TaskManager from "expo-task-manager";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE } from "../api/client";

export const STUDENT_LOCATION_TASK = "CTMS_STUDENT_BACKGROUND_LOCATION_TASK";
const TRACKING_STATE_KEY = "ctms_student_tracking_state";

let activeSocketRef = null;
let foregroundHeartbeatInterval = null;
let isTrackingActive = false;

// ─────────────────────────────────────────────────────────────────────────────
// Top-Level Background Task Definition (Registered at module load)
// ─────────────────────────────────────────────────────────────────────────────
if (!TaskManager.isTaskDefined(STUDENT_LOCATION_TASK)) {
  TaskManager.defineTask(STUDENT_LOCATION_TASK, async ({ data, error }) => {
    if (error) {
      console.warn(`[StudentTracking] Background task error: ${error.message}`);
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
          studentId: state.studentId,
          userId: state.studentId,
          studentName: state.studentName,
          studentRollNo: state.studentRollNo,
          vehicleId: state.vehicleId,
          vehicleNumber: state.vehicleNumber,
          latitude: coords.latitude,
          longitude: coords.longitude,
          lat: coords.latitude,
          lng: coords.longitude,
          speed: coords.speed != null ? coords.speed : 0,
          heading: coords.heading != null ? coords.heading : 0,
          role: "student",
          timestamp: new Date().toISOString(),
        };

        // 1. Send reliable HTTP POST to backend
        const headers = { "Content-Type": "application/json" };
        if (state.token) {
          headers["Authorization"] = `Bearer ${state.token}`;
        }

        console.log(`[GPS DEBUG][STUDENT]
latitude: ${coords.latitude}
longitude: ${coords.longitude}
accuracy: ${coords.accuracy}
timestamp: ${new Date().toISOString()}
source: StudentApp-BackgroundLocationTask`);

        try {
          const res = await fetch(`${API_BASE}/api/attendance/student-location`, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
          });
          if (res.ok) {
            console.log(`[StudentTracking] Background location sent (${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)})`);
          } else {
            console.log(`[StudentTracking] Background location HTTP ${res.status}`);
          }
        } catch (netErr) {
          console.log(`[StudentTracking] Network unavailable in background task: ${netErr.message}`);
        }

        // 2. Also emit via socket if connected
        if (activeSocketRef && activeSocketRef.connected) {
          activeSocketRef.emit("studentLocationUpdate", payload);
        }
      } catch (err) {
        console.warn(`[StudentTracking] Background location processing error: ${err.message}`);
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Permissions Helper
// ─────────────────────────────────────────────────────────────────────────────
export const requestStudentLocationPermissions = async () => {
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
      console.log(`[StudentTracking] Background permission request error: ${bgErr.message}`);
      return { granted: true, background: false };
    }
  } catch (err) {
    console.error(`[StudentTracking] Permission error: ${err.message}`);
    return { granted: false, background: false, reason: err.message };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Start Student Transit Tracking (Foreground + Background)
// ─────────────────────────────────────────────────────────────────────────────
export const startStudentTracking = async ({ user, vehicleId, vehicleNumber, token, socket }) => {
  if (isTrackingActive) {
    console.log("[StudentTracking] Tracking is already active");
    return true;
  }

  console.log("[StudentTracking] Starting transit tracking");

  const studentId = user?.id;
  const studentName = user?.name;
  const studentRollNo = user?.rollNumber || user?.studentRollNo;

  const trackingState = {
    studentId,
    studentName,
    studentRollNo,
    vehicleId,
    vehicleNumber,
    token,
    startedAt: new Date().toISOString(),
  };

  await AsyncStorage.setItem(TRACKING_STATE_KEY, JSON.stringify(trackingState));
  activeSocketRef = socket || null;

  try {
    // 1. Check/Request Permissions
    const perm = await requestStudentLocationPermissions();
    if (!perm.granted) {
      console.warn("[StudentTracking] Foreground location permission not granted");
      return false;
    }

    // 2. Immediate GPS fix & dispatch
    try {
      const initial = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });

      if (initial?.coords) {
        sendStudentLocationPing({
          coords: initial.coords,
          studentId,
          studentName,
          studentRollNo,
          vehicleId,
          vehicleNumber,
          token,
          socket,
        });
      }
    } catch (locErr) {
      console.log(`[StudentTracking] Initial position fix skipped: ${locErr.message}`);
    }

    // 3. Start Expo Task Manager Background Updates
    try {
      const isRegistered = await TaskManager.isTaskRegisteredAsync(STUDENT_LOCATION_TASK);
      if (isRegistered) {
        await Location.stopLocationUpdatesAsync(STUDENT_LOCATION_TASK).catch(() => { });
      }

      await Location.startLocationUpdatesAsync(STUDENT_LOCATION_TASK, {
        accuracy: Location.Accuracy.High,
        timeInterval: 10000, // 10 seconds
        distanceInterval: 5,  // 5 meters
        deferredUpdatesInterval: 10000,
        showsBackgroundLocationIndicator: true,
        pausesLocationUpdatesAutomatically: false,
        foregroundService: {
          notificationTitle: "CTMS Student Transit Active",
          notificationBody: "Live trip tracking is running in the background",
          notificationColor: "#2563EB",
        },
      });

      console.log("[StudentTracking] Background location task started");
    } catch (bgStartErr) {
      console.warn(`[StudentTracking] Background update start failed, fallback to foreground watcher: ${bgStartErr.message}`);
    }

    // 4. Foreground Heartbeat Interval (backup for stationary bus / traffic)
    if (foregroundHeartbeatInterval) {
      clearInterval(foregroundHeartbeatInterval);
    }

    foregroundHeartbeatInterval = setInterval(async () => {
      try {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }).catch(() => null);

        if (loc?.coords) {
          sendStudentLocationPing({
            coords: loc.coords,
            studentId,
            studentName,
            studentRollNo,
            vehicleId,
            vehicleNumber,
            token,
            socket: activeSocketRef,
          });
        }
      } catch (hbErr) {
        console.log(`[StudentTracking] Heartbeat tick failed: ${hbErr.message}`);
      }
    }, 15000); // every 15s

    isTrackingActive = true;
    return true;
  } catch (err) {
    console.error(`[StudentTracking] Failed to start tracking: ${err.message}`);
    return false;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Send Single Student Location Ping (HTTP + Socket)
// ─────────────────────────────────────────────────────────────────────────────
const sendStudentLocationPing = async ({
  coords,
  studentId,
  studentName,
  studentRollNo,
  vehicleId,
  vehicleNumber,
  token,
  socket,
}) => {
  if (!coords) return;

  const payload = {
    studentId,
    userId: studentId,
    studentName,
    studentRollNo,
    vehicleId,
    vehicleNumber,
    latitude: coords.latitude,
    longitude: coords.longitude,
    lat: coords.latitude,
    lng: coords.longitude,
    speed: coords.speed != null ? coords.speed : 0,
    heading: coords.heading != null ? coords.heading : 0,
    role: "student",
    timestamp: new Date().toISOString(),
  };

  // Socket emit
  if (socket && socket.connected) {
    socket.emit("studentLocationUpdate", payload);
  }

  // HTTP POST fallback/sync
  try {
    const headers = { "Content-Type": "application/json" };
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    await fetch(`${API_BASE}/api/attendance/student-location`, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.log(`[StudentTracking] HTTP location ping error: ${err.message}`);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// Stop Student Transit Tracking
// ─────────────────────────────────────────────────────────────────────────────
export const stopStudentTracking = async ({ studentId, reason = "Trip Completed", socket } = {}) => {
  console.log(`[StudentTracking] Tracking stopped (reason: ${reason})`);
  isTrackingActive = false;

  if (foregroundHeartbeatInterval) {
    clearInterval(foregroundHeartbeatInterval);
    foregroundHeartbeatInterval = null;
  }

  try {
    const isRegistered = await TaskManager.isTaskRegisteredAsync(STUDENT_LOCATION_TASK);
    if (isRegistered) {
      await Location.stopLocationUpdatesAsync(STUDENT_LOCATION_TASK);
    }
  } catch (err) {
    console.log(`[StudentTracking] Stop location updates error: ${err.message}`);
  }

  await AsyncStorage.removeItem(TRACKING_STATE_KEY);

  const sock = socket || activeSocketRef;
  if (sock && sock.connected && studentId) {
    sock.emit("studentTransitCompleted", {
      studentId,
      reason,
    });
  }

  activeSocketRef = null;
};
