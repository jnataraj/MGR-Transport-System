import React, { useState, useEffect, useRef } from "react";
import {
  FlatList,
  Alert,
  Modal,
  SafeAreaView,
  Image,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  TextInput,
  Platform,
  ActivityIndicator,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import * as Location from "expo-location";
import { CameraView, useCameraPermissions } from "expo-camera";
import { io } from "socket.io-client";
import { API_BASE, storeGpsEnabled, loadGpsEnabled } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { registerForPushNotificationsAsync } from "../services/notificationService";
import logo from "../../assets/logo.png";
import BottomTabBar from "../components/BottomTabBar";
import * as ImagePicker from "expo-image-picker";
import jsQR from "jsqr";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

const HOD_STATS = {
  total: 450,
  present: 412,
  absent: 38,
  qrMissed: 12,
  internalLeave: 5,
  busBreakdown: 3,
  medical: 2,
};

const DEPT_VEHICLES = [
  {
    id: "BUS-07",
    route: "Theni via City",
    status: "LIVE",
    students: 42,
    driver: "Rajan Kumar",
  },
  {
    id: "BUS-12",
    route: "Ambattur via Avadi",
    status: "STATIONARY",
    students: 35,
    driver: "Prakash R.",
  },
  {
    id: "BUS-01",
    route: "Koyambedu direct",
    status: "BREAKDOWN",
    students: 28,
    driver: "Murugan G.",
  },
];

const mapBackendRole = (backendRole) => {
  const r = (backendRole || "").toLowerCase();
  if (r === "deptadmin" || r === "hod") return "hod";
  if (r === "maintenance") return "maintenance";
  if (r === "coordinator") return "coordinator";
  return "driver";
};

export default function MainDashboard({ user, token, onLogout }) {
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraMode, setCameraMode] = useState("QR");
  const [qrStatus, setQrStatus] = useState("PENDING"); // PENDING, STARTED, CLOSED
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [timeFilter, setTimeFilter] = useState("W"); // W, M, Y
  const [statusFilter, setStatusFilter] = useState("ALL"); // ALL, DONE, PEND
  const [historyRecords, setHistoryRecords] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [isSelfieConfirmOpen, setIsSelfieConfirmOpen] = useState(false);
  const [tripStatus, setTripStatus] = useState("ACTIVE"); // ACTIVE, CLOSED
  const [isSosActive, setIsSosActive] = useState(false);
  const [blink, setBlink] = useState(true);
  const [role, setRole] = useState(mapBackendRole(user?.role));
  const [gpsEnabled, setGpsEnabled] = useState(false);
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
  const [isMaintLogModalOpen, setIsMaintLogModalOpen] = useState(false);
  const [isLogHistoryModalOpen, setIsLogHistoryModalOpen] = useState(false);
  const [maintChecklist, setMaintChecklist] = useState({});
  const [selfieStatus, setSelfieStatus] = useState("PENDING");
  const [isScanConfirmOpen, setIsScanConfirmOpen] = useState(false);
  const [scannedData, setScannedData] = useState({
    lat: "13.0674 N",
    lng: "80.2376 E",
    timestamp: new Date().toLocaleString(),
  });
  const socketRef = useRef(null);
  const cameraRef = useRef(null);
  const [activeTab, setActiveTab] = useState("home");
  const [showProfileModal, setShowProfileModal] = useState(false);

  // ── Camera permissions (expo-camera v57+ hook-based API) ──
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [maintItems, setMaintItems] = useState([]);
  const [maintLoading, setMaintLoading] = useState(true);
  const [maintOnline, setMaintOnline] = useState(true);
  const [completedLogs, setCompletedLogs] = useState([]);
  const [maintLogPeriod, setMaintLogPeriod] = useState("Day"); // Day | Week | Month | Year
  const [maintLogTab, setMaintLogTab] = useState("Ongoing"); // Ongoing | Completed
  // SOS Alerts received in real-time (maintenance view only)
  const [sosAlerts, setSosAlerts] = useState([]);
  const [unreadSosCount, setUnreadSosCount] = useState(0);

  // Route Alert Notifications
  const [routeAlerts, setRouteAlerts] = useState([]);
  const [showRouteAlertHistory, setShowRouteAlertHistory] = useState(false);
  const [unreadAlerts, setUnreadAlerts] = useState(1);
  const [isBreakdownModalOpen, setIsBreakdownModalOpen] = useState(false);
  const [isAccidentConfirmOpen, setIsAccidentConfirmOpen] = useState(false);
  const [isOthersConfirmOpen, setIsOthersConfirmOpen] = useState(false);
  const [isIssueSuccessOpen, setIsIssueSuccessOpen] = useState(false);
  const [reportedIssueType, setReportedIssueType] = useState("");
  const [isCloseTripConfirmOpen, setIsCloseTripConfirmOpen] = useState(false);

  // SOS alert workflow
  const [isSosConfirmOpen, setIsSosConfirmOpen] = useState(false);
  const [isSosSentOpen, setIsSosSentOpen] = useState(false);
  const [isSosStopConfirmOpen, setIsSosStopConfirmOpen] = useState(false);
  const [isSosStoppedOpen, setIsSosStoppedOpen] = useState(false);

  // Real identity from login — falls back gracefully if a field is missing.
  const userId = user?.id || "unknown-user";
  const userName = user?.name || "Staff Member";
  const userVehicle =
    user?.vehicle ||
    user?.assignedVehicle?.number ||
    user?.vehicleId ||
    "UNASSIGNED";
  const { refreshProfile } = useAuth();
  const handleTabPress = (tab) => {
    setActiveTab(tab);
    if (tab === "settings") setIsSettingsModalOpen(true);
    if (tab === "profile") setShowProfileModal(true);
  };

  // ── Fetch the current user's own attendance history (Driver / Coordinator) ──
  const fetchMyHistory = async () => {
    if (!userId || userId === "unknown-user") return;
    setHistoryLoading(true);
    try {
      const scanType = role === "coordinator" ? "coordinator_scan" : "driver_scan";
      const res = await fetch(
        `${API_BASE}/api/attendance?userId=${userId}&type=${scanType}&limit=100`,
        { headers: authHeaders },
      );
      const data = await res.json();
      if (data.success && Array.isArray(data.attendance)) {
        setHistoryRecords(data.attendance);
      } else {
        setHistoryRecords([]);
      }
    } catch (err) {
      console.log("fetchMyHistory error:", err.message);
      setHistoryRecords([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const generatePDF = async () => {
    try {
      const html = `
      <html>
      <head>
      <style>
      body{
        font-family: Arial;
        padding:20px;
      }

      h2{
        color:#2563EB;
        text-align:center;
      }

      table{
        width:100%;
        border-collapse:collapse;
      }

      th,td{
        border:1px solid #ddd;
        padding:8px;
        font-size:12px;
      }

      th{
        background:#2563EB;
        color:white;
      }
      </style>
      </head>

      <body>

      <h2>Driver History Report</h2>

      <p><b>Driver :</b> ${userName}</p>
      <p><b>Vehicle :</b> ${userVehicle}</p>
      <p><b>Date :</b> ${new Date().toLocaleString()}</p>

      <table>

      <tr>
      <th>Vehicle</th>
      <th>Date</th>
      <th>Status</th>
      </tr>

      ${historyRecords
          .map(
            item => `
          <tr>
            <td>${item.vehicleId || "-"}</td>
            <td>${new Date(item.createdAt).toLocaleString()}</td>
            <td>${item.stage || item.status}</td>
          </tr>
        `
          )
          .join("")}

      </table>

      </body>
      </html>
    `;

      const { uri } = await Print.printToFileAsync({
        html,
      });

      await Sharing.shareAsync(uri);

    } catch (error) {
      Alert.alert("Error", error.message);
    }
  };

  useEffect(() => {
    if (refreshProfile) {
      refreshProfile();
    }
  }, [refreshProfile]);

  const mapNotificationToAlert = (n) => {
    const created = n.createdAt ? new Date(n.createdAt) : new Date();
    return {
      id: n.id,
      notificationType:
        n.type === "general" ? "General" : n.type || "General",
      routeName: n.title || "Notification",
      effectiveDate: created.toISOString().split("T")[0],
      effectiveTime: created.toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
      customMessage: n.message || "",
      receivedAt: n.createdAt || created.toISOString(),
    };
  };

  // Normalizes driver-raised Issues + admin MaintenanceAlerts into one feed
  const mapMaintenanceOverview = (data) => {
    const fromIssues = (data.driverIssues || []).map((i) => ({
      id: i.id,
      source: "issue",
      vehicle: i.vehicleId || "-",
      title: i.type,
      description: i.description,
      severity: "Warning",
      raisedByLabel: `${i.reportedBy ? "Driver Raised" : "Raised"}`,
      createdAt: i.createdAt,
      status: i.status, // open | resolved
    }));

    const fromAlerts = (data.adminLogs || []).map((a) => ({
      id: a.id,
      source: "alert",
      vehicle: a.vehicle,
      title: a.issueType,
      description: a.description,
      severity: a.priority === "Critical" ? "Critical" : a.priority === "High" ? "Critical" : "Warning",
      raisedByLabel:
        a.raisedBy === "Admin" || a.raisedBy === "Super Admin"
          ? "Admin Raised"
          : a.raisedBy?.toLowerCase().includes("coord")
            ? "Coordinator Raised"
            : `${a.raisedBy} Raised`,
      createdAt: a.createdAt,
      status: a.status, // Pending | Acknowledged | Resolved
    }));

    return [...fromIssues, ...fromAlerts].sort(
      (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
    );
  };

  // Filters a log entry's date against the selected Day/Week/Month/Year tab
  const isWithinPeriod = (dateStr, period) => {
    if (!dateStr) return false;
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const dayMs = 24 * 60 * 60 * 1000;

    switch (period) {
      case "Day":
        return diffMs <= dayMs;
      case "Week":
        return diffMs <= dayMs * 7;
      case "Month":
        return diffMs <= dayMs * 31;
      case "Year":
        return diffMs <= dayMs * 366;
      default:
        return true;
    }
  };

  const loadMaintenanceFeed = async () => {
    setMaintLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/maintenance/overview`, {
        headers: authHeaders,
      });
      const data = await res.json();
      setMaintItems(mapMaintenanceOverview(data));
      setCompletedLogs(data.completedLog || []);
      setMaintOnline(true);
    } catch (err) {
      console.log("Maintenance feed error:", err);
      setMaintOnline(false);
    } finally {
      setMaintLoading(false);
    }
  };

  useEffect(() => {
    if (role !== "maintenance") return;
    loadMaintenanceFeed();
    const interval = setInterval(loadMaintenanceFeed, 20000);

    // ── Wire the SOS socket listener for the maintenance view ──
    const attachSosListener = () => {
      if (!socketRef.current) return;
      socketRef.current.off("new_notification"); // avoid duplicate listeners on re-mount
      socketRef.current.on("new_notification", (notif) => {
        if (notif.type === "sos" || notif.type === "sos_resolved") {
          setSosAlerts((prev) => {
            if (prev.some((a) => a.id === notif.id)) return prev;
            return [{ ...notif, acknowledged: false }, ...prev];
          });
          if (notif.type === "sos") {
            setUnreadSosCount((c) => c + 1);
          }
        }
      });
    };

    if (socketRef.current) {
      attachSosListener();
    } else {
      const retryTimer = setTimeout(attachSosListener, 1500);
      return () => {
        clearInterval(interval);
        clearTimeout(retryTimer);
      };
    }

    return () => clearInterval(interval);
  }, [role]);

  const handleAcknowledge = async (item) => {
    if (item.source === "alert") {
      try {
        await fetch(`${API_BASE}/api/maintenance/logs/${item.id}/resolve`, {
          method: "PATCH",
          headers: authHeaders,
          body: JSON.stringify({ acknowledgedBy: userName }),
        });
        setMaintItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? { ...i, status: "Resolved", resolvedAt: new Date().toISOString(), resolvedBy: userName }
              : i,
          ),
        );
      } catch (err) {
        Alert.alert("Error", "Could not acknowledge this alert.");
      }
    } else {
      try {
        await fetch(`${API_BASE}/api/issues/${item.id}/resolve`, {
          method: "PATCH",
          headers: authHeaders,
        });
        setMaintItems((prev) =>
          prev.map((i) =>
            i.id === item.id
              ? { ...i, status: "resolved", resolvedAt: new Date().toISOString(), resolvedBy: userName }
              : i,
          ),
        );
      } catch (err) {
        Alert.alert("Error", "Could not resolve this issue.");
      }
    }
  };

  const ongoingTasks = maintItems.filter(
    (i) => i.status === "Pending" || i.status === "Acknowledged" || i.status === "open",
  );

  useEffect(() => {
    if (token) {
      registerForPushNotificationsAsync(token);

      fetch(`${API_BASE}/api/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success && Array.isArray(data.notifications)) {
            const unread = data.notifications.filter((n) => !n.isRead);
            const mapped = unread.map(mapNotificationToAlert);
            setRouteAlerts((prev) => {
              const existingIds = new Set(prev.map((a) => a.id));
              const newOnes = mapped.filter((a) => !existingIds.has(a.id));
              return [...newOnes, ...prev];
            });
          }
        })
        .catch((err) => console.log("Notifications fetch error:", err));
    }
  }, [token]);

  const authHeaders = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  useEffect(() => {
    let interval;
    if (isSosActive) {
      interval = setInterval(() => setBlink((b) => !b), 600);
    } else {
      setBlink(true);
    }
    return () => clearInterval(interval);
  }, [isSosActive]);

  useEffect(() => {
    (async () => {
      // Explicit Confirmation for GPS
      Alert.alert(
        "Location Access Confirmation",
        "To provide live tracking for students and parents, this app needs to access your GPS location. You can toggle this anytime in Settings.",
        [
          {
            text: "Decline",
            style: "cancel",
            onPress: () => setGpsEnabled(false),
          },
          {
            text: "Accept",
            onPress: async () => {
              await requestCameraPermission();

              const locationStatus =
                await Location.requestForegroundPermissionsAsync();
              if (locationStatus.status === "granted") {
                setGpsEnabled(true);
                storeGpsEnabled(true);
              } else {
                Alert.alert(
                  "Permission Denied",
                  "GPS is required for full functionality.",
                );
                setGpsEnabled(false);
              }
            },
          },
        ],
      );

      socketRef.current = io(API_BASE);

      // Listen for route alert notifications from admin
      socketRef.current.emit("joinRoom", role);
      if (user?.id) {
        socketRef.current.emit("joinUser", user.id);
      }

      socketRef.current.on("routeAlert", (alert) => {
        setRouteAlerts((prev) => {
          if (prev.some((a) => a.id === alert.id)) return prev;
          return [
            {
              ...alert,
              receivedAt: alert.receivedAt || new Date().toISOString(),
            },
            ...prev,
          ];
        });
        setUnreadAlerts((prev) => prev + 1);
      });

      socketRef.current.on("new_notification", (notif) => {
        const alert = mapNotificationToAlert(notif);
        setRouteAlerts((prev) => {
          if (prev.some((a) => a.id === alert.id)) return prev;
          return [alert, ...prev];
        });
        setUnreadAlerts((prev) => prev + 1);
      });
    })();

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, [role, user?.id]);

  useEffect(() => {
    let locationWatcher = null;

    const shouldTrack = role === "driver" && qrStatus === "STARTED" && gpsEnabled;

    if (shouldTrack) {
      (async () => {
        locationWatcher = await Location.watchPositionAsync(
          { accuracy: Location.Accuracy.High, distanceInterval: 10 },
          (loc) => {
            socketRef.current?.emit("driverLocationUpdate", {
              vehicleId: userVehicle,
              lat: loc.coords.latitude,
              lng: loc.coords.longitude,
              timestamp: new Date().toISOString(),
            });
          },
        );
      })();
    } else if (role === "driver") {
      socketRef.current?.emit("driverLocationStopped", {
        vehicleId: userVehicle,
      });
    }

    return () => locationWatcher?.remove();
  }, [qrStatus, gpsEnabled, role]);

  useEffect(() => {
    (async () => {
      const saved = await loadGpsEnabled();
      if (saved) {
        const { status } = await Location.getForegroundPermissionsAsync();
        setGpsEnabled(status === "granted");
      }
    })();
  }, []);

  // ── NEW: restore real on-duty status from backend on mount/refresh ──
  useEffect(() => {
    const fetchDriverStatus = async () => {
      if (!userId || userId === "unknown-user") return;
      try {
        const res = await fetch(`${API_BASE}/api/attendance/driver-status?userId=${userId}`, {
          headers: authHeaders,
        });
        const data = await res.json();
        if (data.success && data.onDuty) {
          setQrStatus("STARTED");
        }
      } catch (err) {
        console.log("Failed to fetch driver status:", err.message);
      }
    };
    fetchDriverStatus();
  }, [userId]);

  const handleQRScan = async (rawCode = null) => {
    const nextStatus = qrStatus === "STARTED" ? "CLOSED" : "STARTED";

    // Get real GPS FIRST, independent of the network call that follows —
    // this way a failed backend request never falls back to fake coordinates.
    let lat = null;
    let lng = null;
    try {
      const loc = await Location.getCurrentPositionAsync({});
      lat = loc.coords.latitude;
      lng = loc.coords.longitude;
    } catch (locErr) {
      console.log("GPS fetch failed:", locErr.message);
    }

    let scannedStudentId = null;
    if (rawCode) {
      try {
        const parsed = typeof rawCode === "string" ? JSON.parse(rawCode) : rawCode;
        scannedStudentId = parsed.studentId || parsed.id || null;
      } catch {
        if (typeof rawCode === "string" && rawCode.trim().length > 0) {
          scannedStudentId = rawCode.trim();
        }
      }
    }

    let resData = {};
    try {
      const response = await fetch(`${API_BASE}/api/attendance`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          studentId: scannedStudentId,
          userId: scannedStudentId || userId,
          vehicleId: userVehicle,
          driverId: userId,
          type: "driver_scan",
          stage: nextStatus,
          latitude: lat,
          longitude: lng,
        }),
      });
      resData = await response.json().catch(() => ({}));
    } catch (err) {
      console.log("QR Scan Error:", err);
      // Backend unreachable — GPS coords above are still real and preserved.
    }

    const nowStr = new Date().toLocaleString("en-US", {
      year: "numeric",
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });

    setScannedData({
      lat: lat != null ? `${lat.toFixed(4)} N` : "GPS unavailable",
      lng: lng != null ? `${lng.toFixed(4)} E` : "GPS unavailable",
      timestamp: resData.timestamp || nowStr,
    });

    setIsScanConfirmOpen(true);
    setQrStatus(nextStatus);

    // Closing the trip should also stop GPS sharing immediately.
    if (nextStatus === "CLOSED") {
      socketRef.current?.emit("driverLocationStopped", { vehicleId: userVehicle });
    }
  };

  const decodeQRFromImageUri = (uri) => {
    return new Promise((resolve, reject) => {
      const img = new window.Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height);
        if (code) resolve(code.data);
        else reject(new Error("No QR code found in image"));
      };
      img.onerror = () => reject(new Error("Failed to load image"));
      img.src = uri;
    });
  };

  const pickQRFromLibrary = async () => {
    if (Platform.OS !== "web") {
      // adjust to whatever your driver app uses for feedback —
      // Alert.alert, a feedback state, etc.
      Alert.alert("Not available", "Image upload scanning is only available on web right now. Please use the live camera.");
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;

      const data = await decodeQRFromImageUri(result.assets[0].uri);
      // Feed it into your EXISTING scan handler exactly the way the
      // live camera does — this reuses all your current validation logic.
      await handleQRScan(data);
    } catch (err) {
      console.log("Image QR decode error:", err.message);
      Alert.alert("Scan failed", "Couldn't find a readable QR code in that image. Try another one.");
    }
  };

  const handleIssueApi = async (type, desc) => {
    setIsBreakdownModalOpen(false);
    setIsAccidentConfirmOpen(false);
    setIsOthersConfirmOpen(false);
    setIsIssueModalOpen(false);

    try {
      await fetch(`${API_BASE}/api/issues`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          type,
          description: desc || `Reported by ${role}: ${userName}`,
          vehicleId: userVehicle,
          reportedBy: userId,
        }),
      });
    } catch (err) {
      console.log("Issue report error:", err);
    } finally {
      setReportedIssueType(type);
      setIsIssueSuccessOpen(true);
    }
  };

  const triggerSOS = async () => {
    setIsSosConfirmOpen(false);
    setIsSosActive(true);

    let lat = null, lng = null;
    try {
      const loc = await Location.getCurrentPositionAsync({});
      lat = loc.coords.latitude;
      lng = loc.coords.longitude;
    } catch (e) { }

    try {
      await fetch(`${API_BASE}/api/notifications/sos`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          vehicleId: userVehicle,
          driverId: userId,
          driverName: userName,
          role,
          latitude: lat,
          longitude: lng,
        }),
      });
    } catch (err) {
      console.log("SOS trigger error:", err.message);
    }

    socketRef.current?.emit("studentSOS", {
      studentId: userId,
      busId: userVehicle,
    });

    setIsSosSentOpen(true);
  };

  const stopSOS = async () => {
    setIsSosStopConfirmOpen(false);
    setIsSosActive(false);

    try {
      await fetch(`${API_BASE}/api/notifications/sos/resolve`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          vehicleId: userVehicle,
          resolvedBy: userName,
        }),
      });
    } catch (err) {
      console.log("SOS resolve error:", err.message);
    }

    socketRef.current?.emit("sosResolved", {
      driverId: userId,
      vehicleId: userVehicle,
    });

    setIsSosStoppedOpen(true);
  };

  const handleNotificationAction = async (alert, actionLabel) => {
    try {
      if (alert.id && !String(alert.id).startsWith("demo-")) {
        await fetch(`${API_BASE}/api/notifications/${alert.id}/read`, {
          method: "PUT",
          headers: authHeaders,
        });
      }
    } catch (err) {
      console.log("Failed to mark notification read:", err);
    } finally {
      setRouteAlerts((prev) => prev.filter((a) => a.id !== alert.id));
      if (actionLabel) {
        Alert.alert(actionLabel, alert.routeName || "Notification updated.");
      }
    }
  };

  const onShutterPress = () => {
    setIsCameraOpen(false);
    if (cameraMode === "QR") {
      handleQRScan();
    } else {
      setSelfieStatus((prev) => (prev === "VERIFIED" ? "CLOSED" : "VERIFIED"));
      setIsSelfieConfirmOpen(true);
    }
  };

  // Opens the camera modal for a given mode, requesting permission first
  // if it hasn't been granted yet (required for expo-camera v57+).
  const openCamera = async (mode) => {
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result.granted) {
        Alert.alert(
          "Permission Denied",
          "Camera access is required to scan the QR code.",
        );
        return;
      }
    }
    setCameraMode(mode);
    setIsCameraOpen(true);
  };

  const confirmLogout = () => {
    if (Platform.OS === "web") {
      const confirm = window.confirm("Are you sure you want to log out?");
      if (confirm) {
        if (onLogout) {
          onLogout();
        }
      }
    } else {
      Alert.alert("Log Out", "Are you sure you want to log out?", [
        { text: "Cancel", style: "cancel" },
        { text: "Log Out", style: "destructive", onPress: onLogout },
      ]);
    }
  };

  // --- HOD DASHBOARD VIEW ---
  if (role === "hod") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        {/* HOD Header */}
        <View
          style={[styles.homeHdr, { backgroundColor: "#7C3AED", height: 120 }]}
        >
          <View style={[styles.profileImgWrap, { borderColor: "#DDD6FE" }]}>
            <Text style={{ fontSize: 28 }}>👨‍🏫</Text>
          </View>
          <View style={styles.hdrMainInfo}>
            <Text style={styles.hdrRole}>Head of Department</Text>
            <Text style={styles.hdrName}>{userName}</Text>
            <Text
              style={{
                fontSize: 10,
                color: "#DDD6FE",
                fontWeight: "700",
                marginTop: 2,
              }}
            >
              {(user?.department || "DEPARTMENT").toUpperCase()} | {user?.email}
            </Text>
          </View>
          <TouchableOpacity
            style={{
              backgroundColor: "rgba(255,255,255,0.2)",
              padding: 8,
              borderRadius: 8,
            }}
            onPress={confirmLogout}
          >
            <Text style={{ color: "#fff", fontSize: 10, fontWeight: "800" }}>
              LOGOUT
            </Text>
          </TouchableOpacity>
        </View>

        <FlatList
          ListHeaderComponent={() => (
            <>
              {/* Analytics Cards */}
              <View style={{ padding: 15 }}>
                <Text style={styles.sectionTitle}>ATTENDANCE ANALYTICS</Text>
                <View style={styles.statsGrid}>
                  <View
                    style={[
                      styles.statCard,
                      { borderLeftColor: "#7C3AED", borderLeftWidth: 4 },
                    ]}
                  >
                    <Text style={styles.statVal}>
                      {HOD_STATS.present}/{HOD_STATS.total}
                    </Text>
                    <Text style={styles.statLab}>Students Present</Text>
                  </View>
                  <View
                    style={[
                      styles.statCard,
                      { borderLeftColor: "#EF4444", borderLeftWidth: 4 },
                    ]}
                  >
                    <Text style={[styles.statVal, { color: "#EF4444" }]}>
                      {HOD_STATS.absent}
                    </Text>
                    <Text style={styles.statLab}>Reported Absent</Text>
                  </View>
                </View>

                <View style={styles.reasonRow}>
                  <ReasonPill
                    label="QR Missed"
                    count={HOD_STATS.qrMissed}
                    color="#F59E0B"
                  />
                  <ReasonPill
                    label="Breakdown"
                    count={HOD_STATS.busBreakdown}
                    color="#EF4444"
                  />
                  <ReasonPill
                    label="Medical"
                    count={HOD_STATS.medical}
                    color="#10B981"
                  />
                </View>
              </View>

              {/* Absentee List Header */}
              <View
                style={{
                  paddingHorizontal: 15,
                  marginBottom: 10,
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Text style={styles.sectionTitle}>GRANULAR ABSENTEE LIST</Text>
                <TouchableOpacity>
                  <Text
                    style={{
                      color: "#7C3AED",
                      fontSize: 11,
                      fontWeight: "800",
                    }}
                  >
                    EXPORT PDF
                  </Text>
                </TouchableOpacity>
              </View>
            </>
          )}
          // data={ABSENTEE_DATA}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.absenteeTile}>
              <View style={{ flex: 1 }}>
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 6 }}
                >
                  <Text style={styles.absName}>{item.name}</Text>
                  <Text style={styles.absId}>({item.id})</Text>
                </View>
                <Text style={styles.absBus}>Assigned: {item.bus}</Text>
                <View style={{ flexDirection: "row", gap: 6, marginTop: 4 }}>
                  <Text
                    style={[
                      styles.absReason,
                      {
                        color:
                          item.reason === "Bus Breakdown"
                            ? "#EF4444"
                            : "#F59E0B",
                      },
                    ]}
                  >
                    {item.reason}
                  </Text>
                  <Text style={styles.absStatus}>{item.status}</Text>
                </View>
              </View>
              <TouchableOpacity
                style={styles.callBtn}
                onPress={() =>
                  Alert.alert(
                    "Calling Parent",
                    `Connecting to ${item.phone}...`,
                  )
                }
              >
                <Text style={{ fontSize: 18 }}>📞</Text>
              </TouchableOpacity>
            </View>
          )}
          ListFooterComponent={() => (
            <View style={{ padding: 15, paddingBottom: 40 }}>
              <Text style={styles.sectionTitle}>
                DEPARTMENT VEHICLE TRACKING
              </Text>
              {DEPT_VEHICLES.map((v) => (
                <View key={v.id} style={styles.vehicleTrackCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.vNum}>
                      {v.id} - {v.route}
                    </Text>
                    <Text style={styles.vDetail}>
                      Driver: {v.driver} | {v.students} Students
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <View
                      style={[
                        styles.vStatusPill,
                        {
                          backgroundColor:
                            v.status === "LIVE"
                              ? "#D1FAE5"
                              : v.status === "BREAKDOWN"
                                ? "#FEE2E2"
                                : "#F3F4F6",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.vStatusText,
                          {
                            color:
                              v.status === "LIVE"
                                ? "#065F46"
                                : v.status === "BREAKDOWN"
                                  ? "#B91C1C"
                                  : "#374151",
                          },
                        ]}
                      >
                        {v.status}
                      </Text>
                    </View>
                    <TouchableOpacity style={{ marginTop: 4 }}>
                      <Text
                        style={{
                          fontSize: 10,
                          color: "#7C3AED",
                          fontWeight: "800",
                        }}
                      >
                        VIEW MAP
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}
        />
      </SafeAreaView>
    );
  }

  // --- MAINTENANCE STAFF VIEW ---
  if (role === "maintenance") {
    return (
      <SafeAreaView style={maintStyles.safeArea}>
        <StatusBar style="dark" />

        {/* University header strip */}
        <View style={{ alignItems: "center", paddingVertical: 8, backgroundColor: "#fff" }}>
          <Image source={logo} style={{ height: 60, width: 200 }} resizeMode="contain" />
        </View>

        {/* Green staff header */}
        <View style={maintStyles.staffHeader}>
          <View style={maintStyles.staffAvatar}>
            <Text style={{ fontSize: 26 }}>🔧</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={maintStyles.staffLabel}>MAINTENANCE STAFF</Text>
            <Text style={maintStyles.staffName}>{userName}</Text>
            <Text style={maintStyles.staffEmp}>
              EMP: {user?.empId || userId?.slice(0, 8).toUpperCase() || "—"}
            </Text>
          </View>
          <TouchableOpacity onPress={confirmLogout} style={maintStyles.logoutPill}>
            <Text style={{ color: "#fff", fontSize: 9, fontWeight: "800" }}>LOGOUT</Text>
          </TouchableOpacity>
        </View>

        {/* Raised Issue Log button */}
        <TouchableOpacity
          style={maintStyles.rowActionBtn}
          onPress={() => { setIsLogHistoryModalOpen(true); loadMaintenanceFeed(); }}
        >
          <Text style={{ color: "#fff", fontWeight: "900", fontSize: 14 }}>
            📄  RAISED ISSUE LOG
          </Text>
        </TouchableOpacity>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 90 }}>

          {/* ── SOS ALERTS SECTION ── */}
          <View style={maintStyles.sectionHeaderRow}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={[maintStyles.sectionHeaderText, { color: "#DC2626" }]}>🚨 SOS ALERTS</Text>
              {unreadSosCount > 0 && (
                <View style={{ backgroundColor: "#EF4444", borderRadius: 10, minWidth: 20, height: 20, paddingHorizontal: 5, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: "#fff", fontSize: 10, fontWeight: "900" }}>
                    {unreadSosCount > 9 ? "9+" : unreadSosCount}
                  </Text>
                </View>
              )}
            </View>
            {sosAlerts.some((a) => a.type === "sos" && !a.acknowledged) && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#EF4444" }} />
                <Text style={{ fontSize: 10, fontWeight: "900", color: "#DC2626" }}>ACTIVE</Text>
              </View>
            )}
          </View>

          {sosAlerts.length === 0 && (
            <Text style={maintStyles.emptyText}>No SOS alerts right now. ✅</Text>
          )}

          {sosAlerts.map((alert) => {
            const isResolved = alert.type === "sos_resolved" || alert.acknowledged;
            let parsedData = {};
            try { parsedData = typeof alert.data === "string" ? JSON.parse(alert.data) : (alert.data || {}); } catch { }
            const lat = parsedData.latitude;
            const lng = parsedData.longitude;

            return (
              <View
                key={alert.id || alert.createdAt}
                style={{
                  marginHorizontal: 12,
                  marginBottom: 10,
                  borderRadius: 14,
                  borderWidth: 2,
                  borderColor: isResolved ? "#A7F3D0" : "#FCA5A5",
                  backgroundColor: isResolved ? "#F0FDF4" : "#FEF2F2",
                  padding: 14,
                  shadowColor: isResolved ? "#10B981" : "#EF4444",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.15,
                  shadowRadius: 4,
                  elevation: 3,
                }}
              >
                {/* Card Header */}
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <Text style={{ fontWeight: "900", fontSize: 14, color: isResolved ? "#065F46" : "#991B1B" }}>
                    {isResolved ? "✅ SOS RESOLVED" : "🚨 SOS EMERGENCY"}
                  </Text>
                  <View style={{
                    backgroundColor: isResolved ? "#10B981" : "#EF4444",
                    borderRadius: 6,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                  }}>
                    <Text style={{ color: "#fff", fontSize: 9, fontWeight: "900" }}>
                      {isResolved ? "RESOLVED" : "ACTIVE"}
                    </Text>
                  </View>
                </View>

                {/* Alert Body */}
                <Text style={{ fontSize: 13, color: isResolved ? "#065F46" : "#7F1D1D", fontWeight: "700", marginBottom: 4 }}>
                  {alert.message}
                </Text>

                <Text style={{ fontSize: 11, color: "#6B7280", marginBottom: 4 }}>
                  From: <Text style={{ fontWeight: "700" }}>{alert.sender || "Unknown"}</Text>
                  {parsedData.vehicleId ? `  ·  Vehicle: ${parsedData.vehicleId}` : ""}
                </Text>

                {lat != null && lng != null && (
                  <Text style={{ fontSize: 11, color: "#2563EB", fontWeight: "700", marginBottom: 4 }}>
                    📍 GPS: {Number(lat).toFixed(5)}, {Number(lng).toFixed(5)}
                  </Text>
                )}

                <Text style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 10 }}>
                  {alert.createdAt ? new Date(alert.createdAt).toLocaleString([], { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Just now"}
                </Text>

                {/* Action */}
                {!isResolved && (
                  <TouchableOpacity
                    style={{
                      backgroundColor: "#DC2626",
                      borderRadius: 8,
                      paddingVertical: 9,
                      alignItems: "center",
                    }}
                    onPress={() => {
                      setSosAlerts((prev) =>
                        prev.map((a) => a.id === alert.id ? { ...a, acknowledged: true } : a)
                      );
                      setUnreadSosCount((c) => Math.max(0, c - 1));
                    }}
                  >
                    <Text style={{ color: "#fff", fontWeight: "900", fontSize: 13 }}>Acknowledge SOS</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}

          {/* ── VEHICLE ISSUE NOTIFICATIONS ── */}
          <View style={maintStyles.sectionHeaderRow}>
            <Text style={maintStyles.sectionHeaderText}>⚠️ VEHICLE ISSUE NOTIFICATIONS</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <View
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 4,
                  backgroundColor: maintOnline ? "#10B981" : "#EF4444",
                }}
              />
              <Text style={{ fontSize: 10, fontWeight: "800", color: maintOnline ? "#059669" : "#DC2626" }}>
                {maintOnline ? "LIVE" : "OFFLINE"}
              </Text>
            </View>
          </View>

          {maintLoading && maintItems.length === 0 && (
            <ActivityIndicator style={{ marginTop: 20 }} color="#2563EB" />
          )}

          {!maintLoading && maintItems.length === 0 && (
            <Text style={maintStyles.emptyText}>No vehicle issues right now. ✅</Text>
          )}

          {maintItems.map((item, idx) => {
            const isResolved = item.status === "Resolved" || item.status === "resolved";
            const isCritical = item.severity === "Critical";
            return (
              <View
                key={item.id}
                style={[
                  maintStyles.issueCard,
                  isResolved
                    ? { borderColor: "#A7F3D0", backgroundColor: "#F0FDF4" }
                    : { borderColor: isCritical ? "#FCA5A5" : "#FDE68A", backgroundColor: isCritical ? "#FEF2F2" : "#FFFBEB" },
                ]}
              >
                <View style={maintStyles.issueCardTop}>
                  <Text style={{ fontWeight: "900", fontSize: 13, color: "#1F2937" }}>
                    ⚙️ VEHICLE ISSUE
                  </Text>
                  <View
                    style={[
                      maintStyles.severityPill,
                      {
                        backgroundColor: isResolved
                          ? "#10B981"
                          : isCritical
                            ? "#EF4444"
                            : "#F59E0B",
                      },
                    ]}
                  >
                    <Text style={maintStyles.severityPillText}>
                      {isResolved ? "RESOLVED" : isCritical ? "CRITICAL" : "WARNING"}
                    </Text>
                  </View>
                </View>

                <Text style={maintStyles.issueMeta}>
                  #{String(idx + 1).padStart(2, "0")} ·{" "}
                  {new Date(item.createdAt).toLocaleString([], {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>

                <Text style={maintStyles.issueTitle}>
                  [{item.vehicle}] — {item.description || item.title}
                </Text>

                <Text style={maintStyles.issueTag}>🔖 {item.raisedByLabel}</Text>

                {isResolved ? (
                  <Text style={maintStyles.resolvedNote}>
                    ✅ Resolved by {item.resolvedBy || "You"}
                    {item.resolvedAt
                      ? ` · ${new Date(item.resolvedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                      : ""}
                  </Text>
                ) : (
                  <TouchableOpacity
                    style={maintStyles.ackBtn}
                    onPress={() => handleAcknowledge(item)}
                  >
                    <Text style={{ color: "#fff", fontWeight: "900", fontSize: 13 }}>
                      Acknowledge
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}

          {/* Current Ongoing Tasks */}
          <View style={[maintStyles.sectionHeaderRow, { marginTop: 10 }]}>
            <Text style={maintStyles.sectionHeaderText}>📋 CURRENT ONGOING TASKS</Text>
          </View>

          {ongoingTasks.length === 0 && (
            <Text style={maintStyles.emptyText}>No ongoing tasks assigned.</Text>
          )}

          {ongoingTasks.map((task) => {
            const inProgress = task.status === "Acknowledged";
            return (
              <View key={`task-${task.id}`} style={maintStyles.taskCard}>
                <View style={{ flex: 1 }}>
                  <Text style={maintStyles.taskTitle}>
                    {task.vehicle} — {task.title}
                  </Text>
                  <Text style={maintStyles.taskSub}>
                    {task.source === "alert"
                      ? `${task.raisedByLabel} · Priority: ${task.severity}`
                      : `Assigned to: You · ${new Date(task.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                  </Text>
                </View>
                <View
                  style={[
                    maintStyles.taskStatusPill,
                    { backgroundColor: inProgress ? "#D1FAE5" : "#FEF3C7" },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 9,
                      fontWeight: "900",
                      color: inProgress ? "#059669" : "#B45309",
                    }}
                  >
                    {inProgress ? "IN PROGRESS" : "PENDING"}
                  </Text>
                </View>
              </View>
            );
          })}
        </ScrollView>

        {/* Floating create-log shortcut */}
        <TouchableOpacity
          style={maintStyles.fab}
          onPress={() => setIsMaintLogModalOpen(true)}
        >
          <Text style={{ color: "#fff", fontSize: 22 }}>＋</Text>
        </TouchableOpacity>

        {/* Reuse existing modals so Create Log / Log History / Settings / Profile still work */}
        <Modal visible={isMaintLogModalOpen} animationType="slide">
          {/* ...unchanged — keep your existing Create Maint. Log modal JSX here... */}
        </Modal>

        {/* <Modal visible={isLogHistoryModalOpen} animationType="slide">
        </Modal> */}
        <Modal visible={isLogHistoryModalOpen} animationType="slide">
          <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
            <View style={styles.modalHdr}>
              <Text style={styles.modalTitle}>Maintenance Logs</Text>
              <TouchableOpacity onPress={() => setIsLogHistoryModalOpen(false)}>
                <Text style={styles.modalCloseText}>CLOSE</Text>
              </TouchableOpacity>
            </View>

            <View style={{ padding: 15, flex: 1 }}>
              {/* Period Tabs */}
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 15 }}>
                {["Day", "Week", "Month", "Year"].map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={{
                      flex: 1,
                      padding: 8,
                      backgroundColor: maintLogPeriod === t ? "#2563EB" : "white",
                      borderRadius: 8,
                      alignItems: "center",
                      borderWidth: 1,
                      borderColor: "#E5E7EB",
                    }}
                    onPress={() => setMaintLogPeriod(t)}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: "800",
                        color: maintLogPeriod === t ? "white" : "#64748B",
                      }}
                    >
                      {t.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Status Tabs */}
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 15 }}>
                {["Ongoing", "Completed"].map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={{
                      flex: 1,
                      padding: 10,
                      backgroundColor: maintLogTab === s ? "#10B981" : "#F3F4F6",
                      borderRadius: 8,
                      alignItems: "center",
                    }}
                    onPress={() => setMaintLogTab(s)}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: "800",
                        color: maintLogTab === s ? "white" : "#64748B",
                      }}
                    >
                      {s.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <ScrollView>
                {maintLogTab === "Ongoing" ? (
                  <>
                    {maintItems
                      .filter(
                        (i) =>
                          i.status !== "Resolved" &&
                          i.status !== "resolved" &&
                          isWithinPeriod(i.createdAt, maintLogPeriod),
                      )
                      .map((item) => {
                        const isCritical = item.severity === "Critical";
                        return (
                          <View
                            key={item.id}
                            style={{
                              backgroundColor: isCritical ? "#FEF2F2" : "white",
                              padding: 15,
                              borderRadius: 12,
                              marginBottom: 10,
                              borderWidth: 1,
                              borderColor: isCritical ? "#EF4444" : "#E5E7EB",
                            }}
                          >
                            <View
                              style={{
                                flexDirection: "row",
                                justifyContent: "space-between",
                                alignItems: "flex-start",
                                marginBottom: 5,
                              }}
                            >
                              <Text
                                style={{ fontWeight: "800", fontSize: 14, flex: 1, marginRight: 8 }}
                              >
                                {item.vehicle} {item.title}
                              </Text>
                              <Text
                                style={{
                                  fontSize: 10,
                                  color: isCritical ? "#EF4444" : "#F59E0B",
                                  fontWeight: "800",
                                  backgroundColor: isCritical ? "#FEE2E2" : "#FEF3C7",
                                  borderColor: isCritical ? "#EF4444" : "transparent",
                                  borderWidth: isCritical ? 1 : 0,
                                  paddingHorizontal: 6,
                                  paddingVertical: 2,
                                  borderRadius: 4,
                                  overflow: "hidden",
                                }}
                              >
                                {isCritical ? "CRITICAL" : "ONGOING"}
                              </Text>
                            </View>

                            <Text
                              style={{
                                fontSize: 9,
                                alignSelf: "flex-start",
                                backgroundColor: isCritical ? "#ef4444" : "#e0e7ff",
                                color: isCritical ? "white" : "#4338ca",
                                paddingHorizontal: 6,
                                paddingVertical: 2,
                                borderRadius: 4,
                                overflow: "hidden",
                                marginBottom: 8,
                              }}
                            >
                              {item.raisedByLabel}
                            </Text>

                            <Text
                              style={{
                                fontSize: 11,
                                color: isCritical ? "#B91C1C" : "#64748B",
                                marginBottom: 10,
                              }}
                            >
                              {item.description}
                            </Text>

                            <TouchableOpacity
                              onPress={() =>
                                Alert.alert("View", "Viewing paper log attachment")
                              }
                            >
                              <Text
                                style={{ fontSize: 11, color: "#2563EB", fontWeight: "800" }}
                              >
                                📎 View Paper Log
                              </Text>
                            </TouchableOpacity>
                          </View>
                        );
                      })}

                    {maintItems.filter(
                      (i) =>
                        i.status !== "Resolved" &&
                        i.status !== "resolved" &&
                        isWithinPeriod(i.createdAt, maintLogPeriod),
                    ).length === 0 && (
                        <Text
                          style={{
                            textAlign: "center",
                            color: "#9CA3AF",
                            fontSize: 12,
                            marginTop: 30,
                          }}
                        >
                          No ongoing logs for this period.
                        </Text>
                      )}
                  </>
                ) : (
                  <>
                    {completedLogs
                      .filter((row) => isWithinPeriod(row.resolvedAt, maintLogPeriod))
                      .map((row) => (
                        <View
                          key={row.id}
                          style={{
                            backgroundColor: "#F0FDF4",
                            padding: 15,
                            borderRadius: 12,
                            marginBottom: 10,
                            borderWidth: 1,
                            borderColor: "#A7F3D0",
                          }}
                        >
                          <View
                            style={{
                              flexDirection: "row",
                              justifyContent: "space-between",
                              alignItems: "flex-start",
                              marginBottom: 5,
                            }}
                          >
                            <Text
                              style={{ fontWeight: "800", fontSize: 14, flex: 1, marginRight: 8 }}
                            >
                              {row.vehicle} — {row.issueType}
                            </Text>
                            <Text
                              style={{
                                fontSize: 10,
                                color: "#059669",
                                fontWeight: "800",
                                backgroundColor: "#D1FAE5",
                                paddingHorizontal: 6,
                                paddingVertical: 2,
                                borderRadius: 4,
                                overflow: "hidden",
                              }}
                            >
                              RESOLVED
                            </Text>
                          </View>

                          <Text style={{ fontSize: 11, color: "#64748B", marginBottom: 6 }}>
                            Raised by {row.raisedBy} · Priority: {row.priority}
                          </Text>

                          <Text style={{ fontSize: 11, color: "#059669", fontWeight: "700" }}>
                            ✅ Resolved by {row.resolvedBy}
                            {row.resolvedAt
                              ? ` · ${new Date(row.resolvedAt).toLocaleString([], {
                                day: "2-digit",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}`
                              : ""}
                          </Text>
                        </View>
                      ))}

                    {completedLogs.filter((row) =>
                      isWithinPeriod(row.resolvedAt, maintLogPeriod),
                    ).length === 0 && (
                        <Text
                          style={{
                            textAlign: "center",
                            color: "#9CA3AF",
                            fontSize: 12,
                            marginTop: 30,
                          }}
                        >
                          No completed logs for this period.
                        </Text>
                      )}
                  </>
                )}
              </ScrollView>
            </View>
          </SafeAreaView>
        </Modal>

        <Modal visible={isSettingsModalOpen} transparent animationType="slide">
          {/* ...unchanged — keep your existing Settings modal JSX here... */}
        </Modal>

        <BottomTabBar activeTab={activeTab} onTabPress={handleTabPress} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      {/* Logo */}
      <View style={{ alignItems: "center", marginBottom: 10 }}>
        <Image
          source={logo}
          style={{ height: 90, width: 250 }}
          resizeMode="contain"
        />
      </View>

      {/* Header Section */}
      <View style={styles.homeHdr}>
        <View style={styles.profileImgWrap}>
          <Text style={{ fontSize: 28 }}>
            {role === "maintenance"
              ? "🔧"
              : role === "coordinator"
                ? "📋"
                : "👨‍✈️"}
          </Text>
        </View>
        <View style={styles.hdrMainInfo}>
          <View style={styles.hdrCatRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.hdrRole}>{role.toUpperCase()}</Text>
              <Text style={styles.hdrName}>{userName}</Text>
              <Text
                style={{
                  fontSize: 9,
                  fontWeight: "800",
                  color: "rgba(255,255,255,0.7)",
                  marginTop: 2,
                }}
                numberOfLines={1}
              >
                {user?.email}
                {userVehicle !== "UNASSIGNED" ? ` · ${userVehicle}` : ""}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 6 }}>
              {role !== "maintenance" && (
                <>
                  <Text
                    style={{
                      fontSize: 9,
                      fontWeight: "900",
                      backgroundColor:
                        qrStatus === "STARTED" ? "#10B981" : "#EF4444",
                      paddingVertical: 4,
                      paddingHorizontal: 10,
                      borderRadius: 4,
                      color: "#fff",
                      minWidth: 80,
                      textAlign: "center",
                      overflow: "hidden",
                    }}
                  >
                    {qrStatus === "STARTED" ? "QR: START" : "QR: CLOSE"}
                  </Text>
                  <Text
                    style={{
                      fontSize: 9,
                      fontWeight: "900",
                      backgroundColor:
                        selfieStatus === "VERIFIED" ? "#10B981" : "#EF4444",
                      paddingVertical: 4,
                      paddingHorizontal: 10,
                      borderRadius: 4,
                      color: "#fff",
                      minWidth: 80,
                      textAlign: "center",
                      overflow: "hidden",
                    }}
                  >
                    {selfieStatus === "VERIFIED"
                      ? "SELFIE: START"
                      : "SELFIE: CLOSE"}
                  </Text>
                </>
              )}
              <TouchableOpacity
                style={{
                  backgroundColor: "rgba(255,255,255,0.2)",
                  paddingVertical: 4,
                  paddingHorizontal: 10,
                  borderRadius: 4,
                }}
                onPress={confirmLogout}
              >
                <Text style={{ color: "#fff", fontSize: 9, fontWeight: "800" }}>
                  LOGOUT
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>

      {/* Main Dashboard Layout */}
      <View style={styles.dashboard}>
        {/* Left Column: Actions */}
        <View style={styles.actionColumn}>
          {role !== "maintenance" && (
            <ActionButton
              icon="📷"
              title={"SCAN QR\nATTENDANCE"}
              onPress={() => openCamera("QR")}
            />
          )}
          {role !== "maintenance" && (
            <ActionButton
              icon="⚠️"
              title={"RAISE\nISSUE"}
              onPress={() => setIsIssueModalOpen(true)}
            />
          )}
          {role === "driver" && (
            <ActionButton
              icon="🤳"
              title={"START / HALT\nRECORD"}
              onPress={() => openCamera("SELFIE")}
            />
          )}
          {role === "maintenance" && (
            <ActionButton
              icon="📝"
              title={"CREATE\nMAINT. LOG"}
              onPress={() => setIsMaintLogModalOpen(true)}
            />
          )}
          {role === "maintenance" && (
            <ActionButton
              icon="📜"
              title={"LOG\nHISTORY"}
              onPress={() => setIsLogHistoryModalOpen(true)}
            />
          )}
          {role !== "maintenance" && (
            <ActionButton
              icon="📜"
              title={"MY\nHISTORY"}
              onPress={() => {
                setIsHistoryModalOpen(true);
                fetchMyHistory();
              }}
            />
          )}
          {/* Route Alert Notifications Button */}
          {role !== "maintenance" && (
            <View style={{ position: "relative" }}>
              <ActionButton
                icon="🔔"
                title={"ROUTE\nALERTS"}
                onPress={() => {
                  setShowRouteAlertHistory(true);
                  setUnreadAlerts(0);
                }}
              />
              {unreadAlerts > 0 && (
                <View
                  style={{
                    position: "absolute",
                    top: 6,
                    right: 6,
                    backgroundColor: "#EF4444",
                    borderRadius: 10,
                    width: 20,
                    height: 20,
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 10,
                  }}
                >
                  <Text
                    style={{ color: "#fff", fontSize: 11, fontWeight: "900" }}
                  >
                    {unreadAlerts > 9 ? "9+" : unreadAlerts}
                  </Text>
                </View>
              )}
            </View>
          )}
          {/* <ActionButton
            icon="⚙️"
            title={"APP\nSETTINGS"}
            onPress={() => setIsSettingsModalOpen(true)}
          /> */}
        </View>

        {/* Right Column: Notifications */}
        <View style={styles.notifColumn}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <Text style={styles.notifTitle}>Notification</Text>
            {routeAlerts.length > 0 && (
              <View
                style={{
                  backgroundColor: "#EF4444",
                  borderRadius: 10,
                  minWidth: 20,
                  height: 20,
                  paddingHorizontal: 5,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: "#fff", fontSize: 10, fontWeight: "900" }}>
                  {routeAlerts.length > 9 ? "9+" : routeAlerts.length}
                </Text>
              </View>
            )}
          </View>

          <FlatList
            data={routeAlerts}
            ListEmptyComponent={
              <Text
                style={{
                  fontSize: 11,
                  color: "#9CA3AF",
                  textAlign: "center",
                  marginTop: 20,
                }}
              >
                No notifications right now.
              </Text>
            }
            renderItem={({ item }) => {
              const isAlertType =
                item.notificationType === "maintenance" ||
                item.notificationType === "halt" ||
                item.notificationType === "broadcast" ||
                item.notificationType === "RouteDelayed" ||
                item.notificationType === "RouteCancelled";

              return (
                <View
                  style={[
                    styles.notifTile,
                    isAlertType && {
                      backgroundColor: "#FFFBEB",
                      borderColor: "#FDE68A",
                    },
                  ]}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginBottom: 8,
                      borderBottomWidth: 1,
                      borderBottomColor: "#F3F4F6",
                      paddingBottom: 6,
                    }}
                  >
                    <Text style={{ fontSize: 12, marginRight: 5 }}>
                      {isAlertType ? "⚠️" : "🚌"}
                    </Text>
                    <Text
                      style={{
                        fontSize: 8,
                        fontWeight: "900",
                        color: isAlertType ? "#B45309" : "#2563EB",
                        letterSpacing: 0.5,
                      }}
                    >
                      {isAlertType ? "VEHICLE ALERT" : "DR. MGR TRANSPORT"}
                    </Text>
                  </View>

                  <Text style={styles.notifText}>
                    {item.customMessage || item.routeName}
                  </Text>

                  {isAlertType ? (
                    <TouchableOpacity
                      style={[styles.smallBtn, { backgroundColor: "#F59E0B" }]}
                      onPress={() => handleNotificationAction(item)}
                    >
                      <Text style={styles.smallBtnText}>Acknowledge</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.notifBtns}>
                      <TouchableOpacity
                        style={[styles.smallBtn, styles.btnBlue]}
                        onPress={() => handleNotificationAction(item, "Accepted")}
                      >
                        <Text style={styles.smallBtnText}>Accept</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.smallBtn, styles.btnGray]}
                        onPress={() => handleNotificationAction(item, "Declined")}
                      >
                        <Text style={styles.smallBtnText}>Decline</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            }}
            keyExtractor={(item) => String(item.id)}
          />
        </View>
      </View>

      {/* Footer Panel */}
      <View style={styles.bottomArea}>
        <View
          style={[
            styles.tripStatusCard,
            tripStatus === "CLOSED" && {
              backgroundColor: "#DCFCE7",
              borderColor: "#22C55E",
              borderWidth: 1,
            },
          ]}
        >
          <Text style={styles.tripLabel}>1. Current trip:</Text>
          <Text
            style={[
              styles.tripValue,
              tripStatus === "CLOSED" && { color: "#15803D" },
            ]}
          >
            {tripStatus === "CLOSED"
              ? "No Current Trip"
              : user?.route || user?.assignedRoute || user?.routeName || user?.assignedVehicle?.route
                ? (user?.route || user?.assignedRoute || user?.routeName || user?.assignedVehicle?.route)
                : userVehicle !== "UNASSIGNED"
                  ? `${userVehicle} Route`
                  : "Unassigned Route"}
          </Text>
        </View>

        <TouchableOpacity
          style={[
            styles.closeTripBtn,
            qrStatus !== "STARTED" && { backgroundColor: "#22C55E" },
          ]}
          onPress={() => openCamera("QR")}
        >
          <Text style={styles.btnMainText}>
            {qrStatus !== "STARTED"
              ? role === "driver"
                ? "Start New Trip"
                : "Start New Task"
              : "CLOSE CURRENT TRIP"}
          </Text>
        </TouchableOpacity>

        {(role === "driver" || role === "coordinator") && (
          <TouchableOpacity
            style={[
              styles.sosBtn,
              isSosActive &&
              blink && { backgroundColor: "#FEE2E2", borderColor: "#EF4444" },
            ]}
            onPress={() => {
              if (isSosActive) {
                setIsSosStopConfirmOpen(true);
              } else {
                setIsSosConfirmOpen(true);
              }
            }}
          >
            <Text style={[styles.sosText, isSosActive && { color: "#EF4444" }]}>
              <Text
                style={[
                  styles.sosIcon,
                  isSosActive && { backgroundColor: "#EF4444", color: "white" },
                ]}
              >
                {isSosActive ? "ACTIVE" : "SOS"}
              </Text>
              {isSosActive ? " STOP EMERGENCY" : " TRIGGER SOS"}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Modals */}
      <Modal visible={isCameraOpen} animationType="slide">
        <View style={styles.cameraContainer}>
          <CameraView style={styles.camera} ref={cameraRef} facing="back">
            <View style={styles.cameraFrame}>
              <Text style={styles.cameraTitle}>
                {cameraMode === "QR"
                  ? qrStatus === "STARTED" ? "Close Attendance (QR Scan)" : "Initial Scan (Start Work)"
                  : selfieStatus === "VERIFIED" ? "Close/Hault Vehicle Verification" : "Vehicle Verification Selfie (Start)"}
              </Text>
              <View style={cameraMode === "QR" ? styles.wrapperQR : styles.wrapperFace} />
              <Text style={styles.cameraHint}>
                {cameraMode === "QR" ? "Align QR Code" : "Include yourself & vehicle in frame"}
              </Text>
            </View>
          </CameraView>
          <View style={styles.cameraControls}>
            <TouchableOpacity style={styles.shutter} onPress={onShutterPress}>
              <View style={styles.shutterInner} />
            </TouchableOpacity>

            {/* NEW — moved here, only shows during QR mode on web */}
            {Platform.OS === "web" && cameraMode === "QR" && (
              <TouchableOpacity
                onPress={() => {
                  setIsCameraOpen(false);
                  pickQRFromLibrary();
                }}
                style={{
                  marginTop: 16,
                  paddingHorizontal: 18,
                  paddingVertical: 10,
                  borderRadius: 10,
                  borderWidth: 1.5,
                  borderColor: "rgba(255,255,255,0.6)",
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>
                  📁 Upload QR Image Instead
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={isIssueModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.issueCard}>
            <Text style={styles.modalTitle}>Report Issue</Text>
            <Text style={{ fontSize: 12, color: "#6B7280", marginTop: -14, marginBottom: 16 }}>
              Select a category below
            </Text>
            <View style={styles.issueGrid}>
              <IssueTile
                icon="🚗"
                label={"Vehicle\nBreakdown"}
                onPress={() => setIsBreakdownModalOpen(true)}
              />
              <IssueTile
                icon="🚑"
                label={"Vehicle\nAccident"}
                onPress={() => setIsAccidentConfirmOpen(true)}
              />
              <IssueTile
                icon="🗺️"
                label={"Route /\nSocial"}
                onPress={() => handleIssueApi("ROUTE", `Route/Social issue reported by ${userName}`)}
              />
              <IssueTile
                icon="📝"
                label="Others"
                onPress={() => setIsOthersConfirmOpen(true)}
              />
            </View>
            <TouchableOpacity onPress={() => setIsIssueModalOpen(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Vehicle Breakdown — sub-type picker */}
      <Modal visible={isBreakdownModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.issueCard}>
            <Text style={styles.modalTitle}>Vehicle Breakdown</Text>
            <Text style={{ fontSize: 12, color: "#6B7280", marginTop: -14, marginBottom: 16, alignSelf: "flex-start" }}>
              Select specific issue type:
            </Text>

            <TouchableOpacity
              style={subModalStyles.optionBtn}
              onPress={() => handleIssueApi("BREAKDOWN", "Puncture reported")}
            >
              <Text style={subModalStyles.optionBtnText}>Puncture</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={subModalStyles.optionBtn}
              onPress={() => handleIssueApi("BREAKDOWN", "Low pickup / engine power loss")}
            >
              <Text style={subModalStyles.optionBtnText}>Low Pickup</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[subModalStyles.optionBtn, subModalStyles.optionBtnPrimary]}
              onPress={() => handleIssueApi("BREAKDOWN", "Other breakdown issue")}
            >
              <Text style={subModalStyles.optionBtnPrimaryText}>Others</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setIsBreakdownModalOpen(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Vehicle Accident — emergency confirm */}
      <Modal visible={isAccidentConfirmOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.issueCard}>
            <Text style={styles.modalTitle}>⚠️ ACCIDENT ALERT</Text>
            <Text style={{ fontSize: 13, color: "#6B7280", textAlign: "center", marginBottom: 20 }}>
              Confirm Emergency Accident Alert? This will send your GPS location to Admin immediately.
            </Text>

            <TouchableOpacity
              style={[subModalStyles.optionBtn, subModalStyles.optionBtnPrimary, { width: "100%" }]}
              onPress={() => handleIssueApi("ACCIDENT", "CRITICAL ALERT — Emergency accident reported with GPS location")}
            >
              <Text style={subModalStyles.optionBtnPrimaryText}>CONFIRM & NOTIFY</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[subModalStyles.optionBtn, { width: "100%" }]}
              onPress={() => setIsAccidentConfirmOpen(false)}
            >
              <Text style={subModalStyles.optionBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Others — free-form report confirm */}
      <Modal visible={isOthersConfirmOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.issueCard}>
            <Text style={styles.modalTitle}>Other Issue</Text>
            <Text style={{ fontSize: 13, color: "#6B7280", textAlign: "center", marginBottom: 20 }}>
              Report custom issue to the administration?
            </Text>

            <TouchableOpacity
              style={[subModalStyles.optionBtn, subModalStyles.optionBtnPrimary, { width: "100%" }]}
              onPress={() => handleIssueApi("OTHERS", `Custom issue reported by ${userName}`)}
            >
              <Text style={subModalStyles.optionBtnPrimaryText}>SEND REPORT</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[subModalStyles.optionBtn, { width: "100%" }]}
              onPress={() => setIsOthersConfirmOpen(false)}
            >
              <Text style={subModalStyles.optionBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Shared success confirmation */}
      <Modal visible={isIssueSuccessOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.issueCard}>
            <Text style={styles.modalTitle}>Issue Reported</Text>
            <Text style={{ fontSize: 13, color: "#6B7280", textAlign: "center", marginBottom: 20 }}>
              Issue "{reportedIssueType}" reported to admin successfully.
            </Text>
            <TouchableOpacity
              style={[subModalStyles.optionBtn, subModalStyles.optionBtnPrimary, { width: "100%" }]}
              onPress={() => setIsIssueSuccessOpen(false)}
            >
              <Text style={subModalStyles.optionBtnPrimaryText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* SOS Trigger Confirm — matches "SOS EMERGENCY" screenshot */}
      <Modal visible={isSosConfirmOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.issueCard}>
            <Text style={styles.modalTitle}>SOS EMERGENCY</Text>
            <Text style={{ fontSize: 13, color: "#6B7280", textAlign: "center", marginBottom: 20 }}>
              Are you sure you want to trigger the University Emergency Team?
            </Text>

            <TouchableOpacity
              style={[subModalStyles.optionBtn, subModalStyles.optionBtnPrimary, { width: "100%" }]}
              onPress={triggerSOS}
            >
              <Text style={subModalStyles.optionBtnPrimaryText}>TRIGGER NOW</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[subModalStyles.optionBtn, { width: "100%" }]}
              onPress={() => setIsSosConfirmOpen(false)}
            >
              <Text style={subModalStyles.optionBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* SOS Sent — matches "SOS Sent" screenshot */}
      <Modal visible={isSosSentOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.issueCard}>
            <Text style={styles.modalTitle}>SOS Sent</Text>
            <Text style={{ fontSize: 13, color: "#6B7280", textAlign: "center", marginBottom: 20 }}>
              Emergency alert has been broadcasted to the maintenance team.
            </Text>
            <TouchableOpacity
              style={[subModalStyles.optionBtn, { width: "100%" }]}
              onPress={() => setIsSosSentOpen(false)}
            >
              <Text style={subModalStyles.optionBtnText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Stop Emergency Confirm */}
      <Modal visible={isSosStopConfirmOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.issueCard}>
            <Text style={styles.modalTitle}>Stop Emergency</Text>
            <Text style={{ fontSize: 13, color: "#6B7280", textAlign: "center", marginBottom: 20 }}>
              Are you sure you want to cancel the active SOS alert?
            </Text>

            <TouchableOpacity
              style={[subModalStyles.optionBtn, subModalStyles.optionBtnPrimary, { width: "100%", backgroundColor: "#EF4444" }]}
              onPress={stopSOS}
            >
              <Text style={subModalStyles.optionBtnPrimaryText}>STOP</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[subModalStyles.optionBtn, { width: "100%" }]}
              onPress={() => setIsSosStopConfirmOpen(false)}
            >
              <Text style={subModalStyles.optionBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Emergency Stopped confirmation */}
      <Modal visible={isSosStoppedOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.issueCard}>
            <Text style={styles.modalTitle}>Emergency Stopped</Text>
            <Text style={{ fontSize: 13, color: "#6B7280", textAlign: "center", marginBottom: 20 }}>
              The maintenance team has been notified that this emergency is resolved.
            </Text>
            <TouchableOpacity
              style={[subModalStyles.optionBtn, { width: "100%" }]}
              onPress={() => setIsSosStoppedOpen(false)}
            >
              <Text style={subModalStyles.optionBtnText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={isSelfieConfirmOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.issueCard}>
            <Text style={styles.modalTitle}>Selfie Recorded</Text>
            <View
              style={{
                width: "100%",
                marginBottom: 15,
                borderRadius: 12,
                overflow: "hidden",
                borderWidth: 2,
                borderColor: "#E5E7EB",
              }}
            >
              <Image
                source={{
                  uri: "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=300&q=80",
                }}
                style={{ width: "100%", height: 160 }}
              />
            </View>
            <Text
              style={{
                fontSize: 13,
                color: "#6B7280",
                lineHeight: 20,
                textAlign: "center",
                marginBottom: 20,
              }}
            >
              Image & GPS Location (13.06, 80.21) successfully logged to server
              and verified.
            </Text>
            <TouchableOpacity
              style={[
                styles.actionBtn,
                { height: 45, width: "100%", backgroundColor: "#2563EB" },
              ]}
              onPress={() => setIsSelfieConfirmOpen(false)}
            >
              <Text style={{ color: "white", fontWeight: "800", fontSize: 14 }}>
                OK
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={isSettingsModalOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.issueCard}>
            <Text style={styles.modalTitle}>App Settings</Text>

            <View style={{ width: "100%", marginBottom: 20 }}>
              <Text
                style={{
                  fontSize: 13,
                  color: "#4B5563",
                  fontWeight: "700",
                  marginBottom: 10,
                }}
              >
                GPS Tracking Control
              </Text>
              <TouchableOpacity
                style={[
                  styles.actionBtn,
                  {
                    height: 55,
                    width: "100%",
                    backgroundColor: gpsEnabled ? "#10B981" : "#EF4444",
                    borderWidth: 0,
                    marginBottom: 5,
                  },
                ]}
                onPress={() => {
                  const next = !gpsEnabled;
                  setGpsEnabled(next);
                  storeGpsEnabled(next);
                }}
              >
                <Text
                  style={{ color: "white", fontWeight: "900", fontSize: 14 }}
                >
                  {gpsEnabled ? "GPS ACCESS: PROVIDED" : "GPS ACCESS: DECLINED"}
                </Text>
              </TouchableOpacity>
              <Text
                style={{ fontSize: 10, color: "#9CA3AF", textAlign: "center" }}
              >
                Toggle this to manually stop or start live GPS sharing with the
                university hub.
              </Text>
            </View>

            <View
              style={{
                width: "100%",
                marginBottom: 20,
                borderTopWidth: 1,
                borderTopColor: "#F3F4F6",
                paddingTop: 20,
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  color: "#4B5563",
                  fontWeight: "700",
                  marginBottom: 10,
                }}
              >
                Notification Alerts
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Text style={{ fontSize: 12, color: "#6B7280" }}>
                  Sound & Vibration
                </Text>
                <Text
                  style={{ fontSize: 10, fontWeight: "800", color: "#2563EB" }}
                >
                  ENABLED
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={{
                backgroundColor: "#FEF2F2",
                borderWidth: 1.5,
                borderColor: "#FCA5A5",
                borderRadius: 10,
                padding: 12,
                width: "100%",
                alignItems: "center",
                marginBottom: 10,
              }}
              onPress={() => {
                setIsSettingsModalOpen(false);
                confirmLogout();
              }}
            >
              <Text
                style={{ color: "#DC2626", fontWeight: "900", fontSize: 13 }}
              >
                LOG OUT
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{ padding: 15, width: "100%", alignItems: "center" }}
              onPress={() => setIsSettingsModalOpen(false)}
            >
              <Text style={{ color: "#2563EB", fontWeight: "800" }}>
                Close Settings
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={isHistoryModalOpen} animationType="slide">
        <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
          {/* ── Header ── */}
          <View style={[styles.blueHeader, { minHeight: 80, paddingTop: 20, paddingHorizontal: 16 }]}>
            <View>
              <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 10, fontWeight: "700", letterSpacing: 1 }}>
                {role.toUpperCase()} · {userName}
              </Text>
              <Text style={{ color: "white", fontSize: 20, fontWeight: "900", marginTop: 2 }}>
                My History
              </Text>
            </View>
          </View>

          <View style={{ padding: 10, flex: 1 }}>
            {/* ── Status filter (ALL / ON DUTY / COMPLETED) ── */}
            <View
              style={{
                flexDirection: "row",
                backgroundColor: "#E2E8F0",
                padding: 2,
                borderRadius: 8,
                marginBottom: 8,
              }}
            >
              {[
                { l: "ALL", v: "ALL" },
                { l: "ON DUTY", v: "STARTED" },
                { l: "COMPLETED", v: "CLOSED" },
              ].map((t) => (
                <TouchableOpacity
                  key={t.v}
                  onPress={() => setStatusFilter(t.v)}
                  style={{
                    flex: 1,
                    padding: 5,
                    backgroundColor:
                      statusFilter === t.v ? "white" : "transparent",
                    borderRadius: 6,
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 8,
                      fontWeight: "900",
                      color: statusFilter === t.v ? "#2563EB" : "#64748B",
                    }}
                  >
                    {t.l}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* ── Time filter (W / M / Y) ── */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                marginBottom: 10,
              }}
            >
              <View style={{ flexDirection: "row", gap: 4 }}>
                {[
                  { label: "W", days: 7 },
                  { label: "M", days: 31 },
                  { label: "Y", days: 366 },
                ].map((t) => (
                  <TouchableOpacity
                    key={t.label}
                    onPress={() => setTimeFilter(t.label)}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 13,
                      borderWidth: 1,
                      borderColor: timeFilter === t.label ? "#2563EB" : "#CBD5E1",
                      backgroundColor: timeFilter === t.label ? "#EFF6FF" : "white",
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 9,
                        fontWeight: "900",
                        color: timeFilter === t.label ? "#2563EB" : "#64748B",
                      }}
                    >
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View
                style={{
                  flex: 1,
                  paddingVertical: 5,
                  paddingHorizontal: 10,
                  borderWidth: 1,
                  borderColor: "#E2E8F0",
                  borderRadius: 20,
                  backgroundColor: "white",
                }}
              >
                <Text
                  style={{
                    fontSize: 9,
                    fontWeight: "800",
                    color: "#64748B",
                    textAlign: "center",
                  }}
                >
                  {timeFilter === "W"
                    ? `Last 7 days`
                    : timeFilter === "M"
                      ? "Last 30 days"
                      : "Last 12 months"}
                </Text>
              </View>
              <TouchableOpacity
                onPress={fetchMyHistory}
                style={{
                  backgroundColor: "#2563EB",
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "900", fontSize: 9 }}>↻ REFRESH</Text>
              </TouchableOpacity>
            </View>

            {/* ── Table Header ── */}
            <View
              style={{
                flexDirection: "row",
                backgroundColor: "#F1F5F9",
                padding: 8,
                borderTopLeftRadius: 8,
                borderTopRightRadius: 8,
                borderBottomWidth: 1,
                borderBottomColor: "#E2E8F0",
              }}
            >
              <Text style={{ flex: 1.5, fontSize: 9, fontWeight: "900", color: "#475569" }}>
                Route / OnDuty
              </Text>
              <Text style={{ flex: 1.4, fontSize: 9, fontWeight: "900", color: "#475569" }}>
                Date / Time
              </Text>
              <Text style={{ flex: 0.7, fontSize: 9, fontWeight: "900", color: "#475569", textAlign: "right" }}>
                Status
              </Text>
            </View>

            {/* ── Table Body ── */}
            <View
              style={{
                backgroundColor: "white",
                borderBottomLeftRadius: 8,
                borderBottomRightRadius: 8,
                borderWidth: 1,
                borderTopWidth: 0,
                borderColor: "#E2E8F0",
                flex: 1,
              }}
            >
              {historyLoading ? (
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10 }}>
                  <ActivityIndicator color="#2563EB" size="small" />
                  <Text style={{ fontSize: 11, color: "#9CA3AF" }}>Loading history…</Text>
                </View>
              ) : (() => {
                const nowMs = Date.now();
                const dayMs = 24 * 60 * 60 * 1000;
                const cutoffMs = timeFilter === "W" ? 7 * dayMs
                  : timeFilter === "M" ? 31 * dayMs
                    : 366 * dayMs;

                const filtered = historyRecords.filter((rec) => {
                  const recMs = new Date(rec.scannedAt).getTime();
                  const withinTime = (nowMs - recMs) <= cutoffMs;
                  const matchStatus =
                    statusFilter === "ALL" ||
                    rec.stage === statusFilter;
                  return withinTime && matchStatus;
                });

                if (filtered.length === 0) {
                  return (
                    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 20 }}>
                      <Text style={{ fontSize: 32, marginBottom: 10 }}>📭</Text>
                      <Text style={{ fontWeight: "800", color: "#6B7280", fontSize: 13, textAlign: "center" }}>
                        No records found
                      </Text>
                      <Text style={{ color: "#9CA3AF", fontSize: 11, textAlign: "center", marginTop: 4 }}>
                        {historyRecords.length === 0
                          ? "No duty history available yet."
                          : "Try a different filter or time range."}
                      </Text>
                    </View>
                  );
                }

                return (
                  <ScrollView>
                    {filtered.map((rec, i) => {
                      const isStarted = rec.stage === "STARTED";
                      const isClosed = rec.stage === "CLOSED";
                      const statusLabel = isStarted ? "ON DUTY" : isClosed ? "COMPLETED" : (rec.stage || "—");
                      const statusColor = isStarted ? "#10B981" : isClosed ? "#2563EB" : "#F59E0B";
                      const vehicleLabel = rec.vehicleId || userVehicle || "—";
                      const routeLabel =
                        user?.route || user?.assignedRoute || user?.routeName ||
                        user?.assignedVehicle?.route || vehicleLabel;
                      const dt = new Date(rec.scannedAt);
                      const dateStr = dt.toLocaleDateString([], {
                        day: "2-digit",
                        month: "short",
                      });
                      const timeStr = dt.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: true,
                      });
                      return (
                        <View
                          key={rec.id || i}
                          style={{
                            flexDirection: "row",
                            paddingVertical: 7,
                            paddingHorizontal: 8,
                            borderBottomWidth: i === filtered.length - 1 ? 0 : 1,
                            borderBottomColor: "#F1F5F9",
                            alignItems: "center",
                            backgroundColor: isStarted ? "#F0FDF4" : "white",
                          }}
                        >
                          <Text
                            style={{
                              flex: 1.5,
                              fontSize: 9,
                              fontWeight: "700",
                              color: "#1E293B",
                            }}
                            numberOfLines={2}
                          >
                            {routeLabel}
                          </Text>
                          <Text
                            style={{
                              flex: 1.4,
                              fontSize: 8,
                              fontWeight: "600",
                              color: "#64748B",
                            }}
                          >
                            {dateStr}{"\n"}{timeStr}
                          </Text>
                          <View
                            style={{
                              flex: 0.7,
                              alignItems: "flex-end",
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 8,
                                fontWeight: "900",
                                color: statusColor,
                                backgroundColor: isStarted ? "#DCFCE7" : isClosed ? "#DBEAFE" : "#FEF3C7",
                                paddingHorizontal: 4,
                                paddingVertical: 2,
                                borderRadius: 4,
                                overflow: "hidden",
                                textAlign: "center",
                              }}
                            >
                              {statusLabel}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </ScrollView>
                );
              })()}
            </View>

            {/* ── Bottom Action Buttons ── */}
            <View
              style={{
                marginTop: 16,
                flexDirection: "row",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              {/* Download PDF */}
              <TouchableOpacity
                style={{
                  flex: 1,
                  height: 52,
                  backgroundColor: "#2563EB",
                  borderRadius: 14,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  elevation: 3,
                  shadowColor: "#000",
                  shadowOpacity: 0.15,
                  shadowRadius: 4,
                }}
                onPress={generatePDF}
              >
                <Text style={{ fontSize: 18, marginRight: 8 }}>📄</Text>
                <Text
                  style={{
                    color: "#FFF",
                    fontSize: 14,
                    fontWeight: "700",
                  }}
                >
                  Download PDF
                </Text>
              </TouchableOpacity>

              {/* Close */}
              <TouchableOpacity
                style={{
                  flex: 1,
                  height: 52,
                  backgroundColor: "#F1F5F9",
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: "#CBD5E1",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                onPress={() => setIsHistoryModalOpen(false)}
              >
                <Text style={{ fontSize: 18, marginRight: 8 }}>✖</Text>
                <Text
                  style={{
                    color: "#334155",
                    fontSize: 14,
                    fontWeight: "700",
                  }}
                >
                  Close
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Route Alert Notification History Modal */}
      <Modal visible={showRouteAlertHistory} animationType="slide">
        <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
          <View style={styles.modalHdr}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
            >
              <Text style={{ fontSize: 18 }}>🔔</Text>
              <Text style={styles.modalTitle}>Route Alerts</Text>
            </View>
            <TouchableOpacity onPress={() => setShowRouteAlertHistory(false)}>
              <Text style={styles.modalCloseText}>CLOSE</Text>
            </TouchableOpacity>
          </View>

          {routeAlerts.length === 0 ? (
            <View
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: 40, marginBottom: 12 }}>🔕</Text>
              <Text
                style={{ fontWeight: "800", color: "#6B7280", fontSize: 14 }}
              >
                No route alerts yet
              </Text>
              <Text style={{ color: "#9CA3AF", fontSize: 12, marginTop: 4 }}>
                Alerts from admin will appear here
              </Text>
            </View>
          ) : (
            <ScrollView style={{ flex: 1, padding: 16 }}>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "700",
                  color: "#9CA3AF",
                  letterSpacing: 1,
                  marginBottom: 12,
                  textTransform: "uppercase",
                }}
              >
                {routeAlerts.length} Alert{routeAlerts.length !== 1 ? "s" : ""}
              </Text>
              {routeAlerts.map((alert, idx) => {
                const typeMap = {
                  RouteDelayed: {
                    emoji: "⏰",
                    label: "Route Delayed",
                    bgColor: "#FFFBEB",
                    leftColor: "#D97706",
                    tagBg: "#FEF3C7",
                    tagText: "#92400E",
                  },
                  RouteCancelled: {
                    emoji: "❌",
                    label: "Route Cancelled",
                    bgColor: "#FEF2F2",
                    leftColor: "#DC2626",
                    tagBg: "#FEE2E2",
                    tagText: "#991B1B",
                  },
                  NewPath: {
                    emoji: "🔀",
                    label: "New Path / Diversion",
                    bgColor: "#EFF6FF",
                    leftColor: "#2563EB",
                    tagBg: "#DBEAFE",
                    tagText: "#1D4ED8",
                  },
                  General: {
                    emoji: "📢",
                    label: "Notice",
                    bgColor: "#EFF6FF",
                    leftColor: "#2563EB",
                    tagBg: "#DBEAFE",
                    tagText: "#1D4ED8",
                  },
                };
                const t = typeMap[alert.notificationType] || {
                  emoji: "📢",
                  label: alert.notificationType,
                  bgColor: "#F9FAFB",
                  leftColor: "#6B7280",
                  tagBg: "#F3F4F6",
                  tagText: "#374151",
                };
                const dt = new Date(alert.receivedAt || alert.timestamp);
                const isToday = dt.toDateString() === new Date().toDateString();
                const timeStr = dt.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                const dateStr = isToday
                  ? "Today"
                  : dt.toLocaleDateString([], { day: "numeric", month: "short" });
                return (
                  <View
                    key={alert.id || idx}
                    style={{
                      backgroundColor: t.bgColor,
                      borderRadius: 16,
                      marginBottom: 14,
                      borderLeftWidth: 5,
                      borderLeftColor: t.leftColor,
                      shadowColor: "#000",
                      shadowOpacity: 0.05,
                      shadowRadius: 5,
                      elevation: 2,
                      overflow: "hidden",
                    }}
                  >
                    <View style={{ padding: 14 }}>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginBottom: 10,
                        }}
                      >
                        <View
                          style={{
                            backgroundColor: t.tagBg,
                            borderRadius: 8,
                            paddingHorizontal: 10,
                            paddingVertical: 4,
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 5,
                          }}
                        >
                          <Text style={{ fontSize: 14 }}>{t.emoji}</Text>
                          <Text
                            style={{ fontWeight: "900", fontSize: 12, color: t.tagText }}
                          >
                            {t.label}
                          </Text>
                        </View>
                        <Text
                          style={{ fontSize: 10, color: "#9CA3AF", fontWeight: "600" }}
                        >
                          {dateStr} {timeStr}
                        </Text>
                      </View>
                      <Text
                        style={{
                          fontSize: 15,
                          fontWeight: "900",
                          color: "#111827",
                          marginBottom: 4,
                        }}
                      >
                        {alert.routeName}
                      </Text>
                      <Text
                        style={{
                          fontSize: 12,
                          color: "#6B7280",
                          fontWeight: "600",
                          marginBottom: 8,
                        }}
                      >
                        Effective: {alert.effectiveDate} at {alert.effectiveTime}
                        {alert.duration ? `  ·  ${alert.duration}` : ""}
                      </Text>
                      {(alert.customMessage || alert.updatedRoute) && (
                        <View
                          style={{
                            backgroundColor: "rgba(255,255,255,0.8)",
                            borderRadius: 8,
                            padding: 10,
                            borderLeftWidth: 2,
                            borderLeftColor: t.leftColor,
                          }}
                        >
                          <Text
                            style={{ fontSize: 13, color: "#374151", lineHeight: 20 }}
                          >
                            {alert.customMessage || alert.updatedRoute}
                          </Text>
                        </View>
                      )}
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          marginTop: 10,
                          gap: 6,
                        }}
                      >
                        <View
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: 4,
                            backgroundColor: "#10B981",
                          }}
                        />
                        <Text
                          style={{ fontSize: 10, color: "#059669", fontWeight: "700" }}
                        >
                          Sent by Transport Admin ·{" "}
                          {alert.totalAffected
                            ? `${alert.totalAffected} notified`
                            : "All route members notified"}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })}
              <View style={{ height: 20 }} />
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>

      <Modal visible={isMaintLogModalOpen} animationType="slide">
        <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
          <View style={styles.modalHdr}>
            <Text style={styles.modalTitle}>Create Maint. Log</Text>
            <TouchableOpacity onPress={() => setIsMaintLogModalOpen(false)}>
              <Text style={styles.modalCloseText}>CLOSE</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={{ padding: 20, flex: 1 }}>
            <Text style={{ fontWeight: "800", marginBottom: 5 }}>
              Vehicle ID
            </Text>
            <TextInput
              style={{
                borderWidth: 1,
                borderColor: "#E5E7EB",
                borderRadius: 8,
                padding: 12,
                marginBottom: 20,
                backgroundColor: "white",
              }}
              placeholder="e.g. BUS-07"
            />

            <Text
              style={{ fontWeight: "900", marginBottom: 10, color: "#1e293b" }}
            >
              ⚙️ Engine Section
            </Text>
            <View
              style={{
                backgroundColor: "white",
                borderRadius: 10,
                padding: 15,
                marginBottom: 20,
                borderWidth: 1,
                borderColor: "#e2e8f0",
                flexDirection: "row",
                flexWrap: "wrap",
              }}
            >
              {["oil", "filters", "belts", "coolant"].map((item) => (
                <TouchableOpacity
                  key={item}
                  style={{
                    width: "50%",
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: 10,
                  }}
                  onPress={() =>
                    setMaintChecklist((prev) => ({
                      ...prev,
                      [item]: !prev[item],
                    }))
                  }
                >
                  <View
                    style={{
                      width: 18,
                      height: 18,
                      borderWidth: 1,
                      borderColor: "#94a3b8",
                      borderRadius: 4,
                      marginRight: 8,
                      backgroundColor: maintChecklist[item]
                        ? "#2563eb"
                        : "white",
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    {maintChecklist[item] && (
                      <Text
                        style={{
                          color: "white",
                          fontSize: 12,
                          fontWeight: "bold",
                        }}
                      >
                        ✓
                      </Text>
                    )}
                  </View>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "700",
                      color: "#475569",
                      textTransform: "capitalize",
                    }}
                  >
                    {item}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text
              style={{ fontWeight: "900", marginBottom: 10, color: "#1e293b" }}
            >
              🛑 Brakes Section
            </Text>
            <View
              style={{
                backgroundColor: "white",
                borderRadius: 10,
                padding: 15,
                marginBottom: 20,
                borderWidth: 1,
                borderColor: "#e2e8f0",
                flexDirection: "row",
                flexWrap: "wrap",
              }}
            >
              {["frontPads", "rearPads", "fluid", "rotors"].map((item) => (
                <TouchableOpacity
                  key={item}
                  style={{
                    width: "50%",
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: 10,
                  }}
                  onPress={() =>
                    setMaintChecklist((prev) => ({
                      ...prev,
                      [item]: !prev[item],
                    }))
                  }
                >
                  <View
                    style={{
                      width: 18,
                      height: 18,
                      borderWidth: 1,
                      borderColor: "#94a3b8",
                      borderRadius: 4,
                      marginRight: 8,
                      backgroundColor: maintChecklist[item]
                        ? "#2563eb"
                        : "white",
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    {maintChecklist[item] && (
                      <Text
                        style={{
                          color: "white",
                          fontSize: 12,
                          fontWeight: "bold",
                        }}
                      >
                        ✓
                      </Text>
                    )}
                  </View>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "700",
                      color: "#475569",
                    }}
                  >
                    {item === "frontPads"
                      ? "Front Pads"
                      : item === "rearPads"
                        ? "Rear Pads"
                        : item === "fluid"
                          ? "Fluid Level"
                          : "Rotors"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={{ fontWeight: "800", marginBottom: 5 }}>
              Manual Issue Entry
            </Text>
            <TextInput
              style={{
                borderWidth: 1,
                borderColor: "#E5E7EB",
                borderRadius: 8,
                padding: 12,
                marginBottom: 20,
                backgroundColor: "white",
                minHeight: 80,
                textAlignVertical: "top",
              }}
              placeholder="Describe any additional manual issues..."
              multiline
            />

            <TouchableOpacity
              style={{
                backgroundColor: "#F0FDFA",
                padding: 20,
                borderRadius: 12,
                alignItems: "center",
                marginBottom: 20,
                borderWidth: 2,
                borderColor: "#99F6E4",
                borderStyle: "dashed",
              }}
              onPress={() =>
                Alert.alert("Upload", "Paper log uploaded successfully (Mock)")
              }
            >
              <Text style={{ fontSize: 24, marginBottom: 5 }}>📄</Text>
              <Text
                style={{ color: "#0F766E", fontWeight: "900", fontSize: 14 }}
              >
                UPLOAD PAPER LOG
              </Text>
              <Text
                style={{
                  color: "#14B8A6",
                  fontWeight: "600",
                  fontSize: 10,
                  marginTop: 3,
                }}
              >
                Tap to scan or select photo
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                backgroundColor: "#2563EB",
                padding: 15,
                borderRadius: 10,
                alignItems: "center",
                marginBottom: 40,
              }}
              onPress={() => {
                Alert.alert("Success", "Maintenance Log Created");
                setMaintChecklist({});
                setIsMaintLogModalOpen(false);
              }}
            >
              <Text style={{ color: "white", fontWeight: "900", fontSize: 14 }}>
                SUBMIT MAINTENANCE LOG
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>


      <Modal visible={isCloseTripConfirmOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.issueCard}>
            <Text style={styles.modalTitle}>Close Trip</Text>
            <Text style={{ fontSize: 13, color: "#6B7280", textAlign: "center", marginBottom: 20 }}>
              Confirm and close current session?
            </Text>

            <TouchableOpacity
              style={[subModalStyles.optionBtn, subModalStyles.optionBtnPrimary, { width: "100%" }]}
              onPress={() => {
                setQrStatus("CLOSED");
                setSelfieStatus("CLOSED");
                setTripStatus("CLOSED");
                setIsCloseTripConfirmOpen(false);
              }}
            >
              <Text style={subModalStyles.optionBtnPrimaryText}>CLOSE TRIP</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[subModalStyles.optionBtn, { width: "100%" }]}
              onPress={() => setIsCloseTripConfirmOpen(false)}
            >
              <Text style={subModalStyles.optionBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── ATTENDANCE LOGGED MODAL ── */}
      <Modal
        visible={isScanConfirmOpen}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setIsScanConfirmOpen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            alignItems: "center",
            padding: 24,
          }}
        >
          <View
            style={{
              width: "100%",
              maxWidth: 360,
              backgroundColor: "#FFFFFF",
              borderRadius: 28,
              padding: 24,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.15,
              shadowRadius: 20,
              elevation: 8,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: 20,
                fontWeight: "900",
                color: "#1E293B",
                textAlign: "center",
                marginBottom: 20,
              }}
            >
              Attendance Logged{"\n"}[{qrStatus === "STARTED" ? "START" : "STOP"}]
            </Text>

            {/* Inner Details Box */}
            <View
              style={{
                width: "100%",
                backgroundColor: "#F8FAFC",
                borderRadius: 18,
                padding: 18,
                marginBottom: 24,
                borderWidth: 1,
                borderColor: "#F1F5F9",
              }}
            >
              {/* Geo Coordinates */}
              <View style={{ flexDirection: "row", marginBottom: 14 }}>
                <Text style={{ fontSize: 18, marginRight: 10 }}>📍</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: "800", color: "#334155" }}>
                    Geo-Coordinates:
                  </Text>
                  <Text style={{ fontSize: 12, color: "#64748B", fontWeight: "600", marginTop: 2 }}>
                    Lat: {scannedData.lat}, Lng: {scannedData.lng}
                  </Text>
                </View>
              </View>

              {/* Timestamp */}
              <View style={{ flexDirection: "row", marginBottom: 14 }}>
                <Text style={{ fontSize: 18, marginRight: 10 }}>⏰</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: "800", color: "#334155" }}>
                    Timestamp:
                  </Text>
                  <Text style={{ fontSize: 12, color: "#64748B", fontWeight: "600", marginTop: 2 }}>
                    {scannedData.timestamp}
                  </Text>
                </View>
              </View>

              {/* Data Sync */}
              <View style={{ flexDirection: "row" }}>
                <Text style={{ fontSize: 18, marginRight: 10 }}>📡</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: "800", color: "#334155", marginBottom: 4 }}>
                    Data Sync:
                  </Text>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: "#10B981", marginBottom: 2 }}>
                    ✓ Saved to Central DB
                  </Text>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: "#10B981", marginBottom: 2 }}>
                    ✓ Sent to Route Coordinator
                  </Text>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: "#10B981" }}>
                    ✓ Sent to Admin Dashboard
                  </Text>
                </View>
              </View>
            </View>

            {/* Acknowledge Button */}
            <TouchableOpacity
              style={{
                width: "100%",
                backgroundColor: "#2563EB",
                borderRadius: 14,
                paddingVertical: 16,
                alignItems: "center",
                justifyContent: "center",
                shadowColor: "#2563EB",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
                elevation: 4,
              }}
              onPress={() => setIsScanConfirmOpen(false)}
            >
              <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "800" }}>
                Acknowledge
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <BottomTabBar activeTab={activeTab} onTabPress={handleTabPress} />

      {/* ── FULL PROFILE MODAL ── */}
      <Modal
        visible={showProfileModal}
        animationType="slide"
        onRequestClose={() => setShowProfileModal(false)}
      >
        <View style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
          <SafeAreaView style={{ flex: 1 }}>
            <ScrollView
              contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
              showsVerticalScrollIndicator={false}
            >
              {/* Avatar + Header */}
              <View style={{ alignItems: "center", marginBottom: 20 }}>
                <View style={profileStyles.avatarRing}>
                  <Text style={{ fontSize: 40 }}>
                    {role === "maintenance"
                      ? "🔧"
                      : role === "coordinator"
                        ? "📋"
                        : "👨‍✈️"}
                  </Text>
                </View>
                <Text
                  style={{
                    fontSize: 22,
                    fontWeight: "900",
                    color: "#0F172A",
                    marginTop: 12,
                  }}
                >
                  {userName}
                </Text>
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "900",
                    color: "#2563EB",
                    letterSpacing: 1,
                    marginTop: 4,
                  }}
                >
                  OFFICIAL {role.toUpperCase()}
                </Text>
              </View>

              {/* Employee Details Card */}
              <View style={profileStyles.card}>
                <Text style={profileStyles.cardTitle}>📇 EMPLOYEE DETAILS</Text>
                <View style={profileStyles.row}>
                  <View style={profileStyles.col}>
                    <Text style={profileStyles.label}>EMP ID</Text>
                    <Text style={profileStyles.value}>
                      {user?.empId || userId?.slice(0, 8).toUpperCase() || "—"}
                    </Text>
                  </View>
                  <View style={profileStyles.col}>
                    <Text style={profileStyles.label}>NAME</Text>
                    <Text style={profileStyles.value}>{userName}</Text>
                  </View>
                </View>
                <View style={[profileStyles.row, { marginTop: 14 }]}>
                  <View style={profileStyles.col}>
                    <Text style={profileStyles.label}>DEPARTMENT</Text>
                    <Text style={profileStyles.value}>
                      {user?.department || "Transport Ops"}
                    </Text>
                  </View>
                  <View style={profileStyles.col}>
                    <Text style={profileStyles.label}>BLOOD GROUP</Text>
                    <Text style={[profileStyles.value, { color: "#EF4444" }]}>
                      {user?.bloodGroup || "—"}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Current Assignments Card */}
              <View style={profileStyles.card}>
                <Text style={profileStyles.cardTitle}>🚍 CURRENT ASSIGNMENTS</Text>
                <View
                  style={{
                    backgroundColor: "#F8FAFC",
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 14,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 6,
                    }}
                  >
                    <Text style={profileStyles.label}>DEFAULT ROUTE</Text>
                    <View
                      style={{
                        backgroundColor: "#D1FAE5",
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: 10,
                      }}
                    >
                      <Text
                        style={{ fontSize: 10, fontWeight: "900", color: "#059669" }}
                      >
                        ACTIVE
                      </Text>
                    </View>
                  </View>
                  <Text style={profileStyles.value}>
                    {user?.route ||
                      user?.assignedRoute ||
                      user?.assignedVehicle?.route ||
                      "—"}
                  </Text>
                </View>
                <View style={profileStyles.row}>
                  <View style={profileStyles.col}>
                    <Text style={profileStyles.label}>VEHICLE REG</Text>
                    <Text style={profileStyles.value}>
                      {user?.vehicleRegNo || userVehicle}
                    </Text>
                  </View>
                  <View style={profileStyles.col}>
                    <Text style={profileStyles.label}>SHIFT TYPE</Text>
                    <Text style={profileStyles.value}>
                      {user?.shiftType || "Morning/Evening"}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Emergency Contact Card */}
              <View style={profileStyles.card}>
                <Text style={profileStyles.cardTitle}>📞 EMERGENCY CONTACT</Text>
                <View style={profileStyles.row}>
                  <View style={profileStyles.col}>
                    <Text style={profileStyles.label}>PRIMARY KIN</Text>
                    <Text style={profileStyles.value}>
                      {user?.emergencyContactName || "—"}
                    </Text>
                  </View>
                  <View style={profileStyles.col}>
                    <Text style={profileStyles.label}>CONTACT NO.</Text>
                    <Text style={profileStyles.value}>
                      {user?.emergencyContactPhone || "—"}
                    </Text>
                  </View>
                </View>
              </View>
            </ScrollView>
          </SafeAreaView>

          <BottomTabBar
            activeTab="profile"
            onTabPress={(tab) => {
              if (tab === "home") setShowProfileModal(false);
              if (tab === "settings") {
                setShowProfileModal(false);
                setIsSettingsModalOpen(true);
              }
              setActiveTab(tab);
            }}
          />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const ActionButton = ({ title, icon, onPress }) => (
  <TouchableOpacity style={styles.actionBtn} onPress={onPress}>
    <Text style={{ fontSize: 22, marginBottom: 5 }}>{icon}</Text>
    <Text style={styles.actionBtnText}>{title}</Text>
  </TouchableOpacity>
);

const IssueTile = ({ icon, label, onPress }) => (
  <TouchableOpacity style={styles.issueTile} onPress={onPress}>
    <Text style={{ fontSize: 24 }}>{icon}</Text>
    <Text style={styles.issueTileLabel}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F3F4F6" },

  homeHdr: {
    minHeight: 70,
    backgroundColor: "#2563EB",
    paddingHorizontal: 15,
    paddingVertical: 10,
    paddingTop: 15,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  profileImgWrap: {
    width: 55,
    height: 55,
    borderRadius: 27.5,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.4)",
    marginRight: 12,
  },
  hdrMainInfo: { flex: 1, justifyContent: "center" },
  hdrCatRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  hdrRole: {
    fontSize: 9,
    color: "rgba(255,255,255,0.7)",
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  hdrName: { fontSize: 16, fontWeight: "800", color: "#fff", marginTop: 2 },
  hdrStatusPill: {
    fontSize: 9,
    fontWeight: "800",
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 4,
    overflow: "hidden",
  },

  dashboard: { flexDirection: "row", padding: 15, flex: 1 },
  actionColumn: { width: 135, paddingRight: 10 },
  actionBtn: {
    backgroundColor: "white",
    borderColor: "#E5E7EB",
    borderWidth: 1.5,
    borderRadius: 12,
    height: 75,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 10,
    padding: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  actionBtnText: {
    fontSize: 8,
    fontWeight: "900",
    textAlign: "center",
    color: "#374151",
    textTransform: "uppercase",
  },
  notifColumn: {
    flex: 1,
    backgroundColor: "white",
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    padding: 8,
  },
  notifTitle: {
    fontSize: 11,
    color: "#9CA3AF",
    fontWeight: "800",
    marginBottom: 8,
    textTransform: "uppercase",
  },
  notifTile: {
    backgroundColor: "#fff",
    padding: 10,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#F3F4F6",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  notifText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#1F2937",
    marginBottom: 8,
    lineHeight: 14,
  },
  notifBtns: { flexDirection: "row", gap: 8 },
  smallBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
  },
  btnBlue: { backgroundColor: "#2563EB" },
  btnGray: { backgroundColor: "#F3F4F6" },
  smallBtnText: { color: "white", fontSize: 10, fontWeight: "800" },
  bottomArea: { padding: 12 },
  tripStatusCard: {
    backgroundColor: "#E2E8F0",
    padding: 10,
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
  },
  tripLabel: { fontSize: 10, color: "#6B7280", fontWeight: "800" },
  tripValue: { fontSize: 13, color: "#1F2937", fontWeight: "800" },
  closeTripBtn: {
    backgroundColor: "#EF4444",
    padding: 14,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    alignItems: "center",
    marginBottom: 10,
  },
  btnMainText: { color: "white", fontSize: 14, fontWeight: "800" },
  sosBtn: {
    backgroundColor: "white",
    padding: 12,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: "#F3F4F6",
    alignItems: "center",
  },
  sosText: { color: "#374151", fontSize: 13, fontWeight: "800" },
  sosIcon: {
    color: "#EF4444",
    borderWidth: 1.5,
    borderColor: "#EF4444",
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  cameraContainer: { flex: 1, backgroundColor: "black" },
  camera: { flex: 1 },
  cameraFrame: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  cameraTitle: {
    position: "absolute",
    top: 50,
    color: "white",
    fontSize: 18,
    fontWeight: "900",
    textAlign: "center",
    width: "100%",
    zIndex: 10,
  },
  wrapperQR: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: "white",
    borderRadius: 20,
  },
  wrapperFace: {
    width: 280,
    height: 350,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.8)",
    borderRadius: 20,
    borderStyle: "dashed",
  },
  cameraHint: { color: "white", marginTop: 20, fontWeight: "bold" },
  cameraControls: {
    position: "absolute",
    bottom: 50,
    width: "100%",
    alignItems: "center",
  },
  shutter: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 5,
    borderColor: "white",
    padding: 4,
  },
  shutterInner: { flex: 1, backgroundColor: "white", borderRadius: 35 },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    padding: 30,
  },
  issueCard: {
    backgroundColor: "white",
    borderRadius: 24,
    padding: 30,
    alignItems: "center",
  },
  modalTitle: { fontSize: 18, fontWeight: "900", color: "white" },
  issueGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    width: "100%",
  },
  issueTile: {
    width: "48%",
    backgroundColor: "#F9FAFB",
    padding: 15,
    borderRadius: 16,
    alignItems: "center",
    marginBottom: 15,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  issueTileLabel: { fontSize: 11, fontWeight: "800", marginTop: 8 },
  cancelText: { color: "#6B7280", fontWeight: "bold", marginTop: 10 },

  // HOD Styles
  sectionTitle: {
    fontSize: 11,
    fontWeight: "900",
    color: "#6B7280",
    letterSpacing: 1,
    marginBottom: 12,
    textTransform: "uppercase",
  },
  statsGrid: { flexDirection: "row", gap: 12, marginBottom: 15 },
  statCard: {
    flex: 1,
    backgroundColor: "white",
    padding: 15,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  statVal: { fontSize: 22, fontWeight: "900", color: "#1F2937" },
  statLab: { fontSize: 10, color: "#6B7280", fontWeight: "600", marginTop: 2 },
  reasonRow: { flexDirection: "row", gap: 8, marginBottom: 20 },
  pill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
  },
  pillText: { fontSize: 10, fontWeight: "800", color: "white" },
  absenteeTile: {
    backgroundColor: "white",
    marginHorizontal: 15,
    marginBottom: 10,
    padding: 15,
    borderRadius: 16,
    flexDirection: "row",
    alignItems: "center",
    borderLeftWidth: 4,
    borderLeftColor: "#7C3AED",
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  absName: { fontSize: 14, fontWeight: "800", color: "#1F2937" },
  absId: { fontSize: 10, color: "#9CA3AF", fontWeight: "600" },
  absBus: { fontSize: 11, color: "#6B7280", marginTop: 2, fontWeight: "600" },
  absReason: { fontSize: 10, fontWeight: "900", textTransform: "uppercase" },
  absStatus: { fontSize: 10, color: "#9CA3AF", fontWeight: "700" },
  callBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
  },
  vehicleTrackCard: {
    backgroundColor: "white",
    padding: 15,
    borderRadius: 12,
    marginBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#F3F4F6",
  },
  vNum: { fontSize: 13, fontWeight: "800", color: "#1F2937" },
  vDetail: { fontSize: 10, color: "#6B7280", marginTop: 2 },
  vStatusPill: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 },
  vStatusText: { fontSize: 9, fontWeight: "900" },
  modalHdr: {
    minHeight: 70,
    backgroundColor: "#2563EB",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  modalCloseText: { color: "white", fontWeight: "900", fontSize: 12 },
  blueHeader: {
    backgroundColor: "#2563EB",
    paddingHorizontal: 20,
    justifyContent: "center",
  },
});

const profileStyles = StyleSheet.create({
  avatarRing: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "#EFF6FF",
    borderWidth: 4,
    borderColor: "#DBEAFE",
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    shadowColor: "#000",
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: "900",
    color: "#2563EB",
    letterSpacing: 0.5,
    marginBottom: 14,
  },
  row: { flexDirection: "row" },
  col: { flex: 1 },
  label: {
    fontSize: 10,
    fontWeight: "800",
    color: "#94A3B8",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  value: {
    fontSize: 14,
    fontWeight: "800",
    color: "#0F172A",
  },
});

const ReasonPill = ({ label, count, color }) => (
  <View style={[styles.pill, { backgroundColor: color }]}>
    <Text style={styles.pillText}>
      {label}: {count}
    </Text>
  </View>
);

const maintStyles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F3F4F6" },
  staffHeader: {
    backgroundColor: "#0F766E",
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    gap: 14,
  },
  staffAvatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: "rgba(255,255,255,0.15)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.4)",
  },
  staffLabel: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  staffName: { color: "#fff", fontSize: 18, fontWeight: "900", marginTop: 2 },
  staffEmp: { color: "rgba(255,255,255,0.75)", fontSize: 11, fontWeight: "700", marginTop: 2 },
  logoutPill: {
    backgroundColor: "rgba(255,255,255,0.2)",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  rowActionBtn: {
    backgroundColor: "#2563EB",
    margin: 14,
    marginBottom: 6,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
  },
  sectionHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 8,
  },
  sectionHeaderText: {
    fontSize: 11,
    fontWeight: "900",
    color: "#374151",
    letterSpacing: 0.5,
  },
  emptyText: {
    fontSize: 12,
    color: "#9CA3AF",
    textAlign: "center",
    paddingVertical: 14,
  },
  issueCard: {
    marginHorizontal: 14,
    marginBottom: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    padding: 14,
  },
  issueCardTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  severityPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  severityPillText: { color: "#fff", fontSize: 9, fontWeight: "900" },
  issueMeta: { fontSize: 10, color: "#6B7280", fontWeight: "700", marginBottom: 4 },
  issueTitle: { fontSize: 13, fontWeight: "800", color: "#1F2937", marginBottom: 6 },
  issueTag: { fontSize: 10, color: "#6B7280", fontWeight: "700", marginBottom: 10 },
  ackBtn: {
    backgroundColor: "#EF4444",
    borderRadius: 10,
    paddingVertical: 11,
    alignItems: "center",
  },
  taskCard: {
    marginHorizontal: 14,
    marginBottom: 10,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  taskTitle: { fontSize: 13, fontWeight: "800", color: "#1F2937" },
  taskSub: { fontSize: 10, color: "#6B7280", fontWeight: "600", marginTop: 3 },
  taskStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 80,
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#0F766E",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  resolvedNote: {
    fontSize: 11,
    fontWeight: "700",
    color: "#059669",
    marginTop: 2,
  },
});

const subModalStyles = StyleSheet.create({
  optionBtn: {
    width: "100%",
    backgroundColor: "#F3F4F6",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginBottom: 10,
  },
  optionBtnText: {
    fontSize: 14,
    fontWeight: "800",
    color: "#374151",
  },
  optionBtnPrimary: {
    backgroundColor: "#2563EB",
  },
  optionBtnPrimaryText: {
    fontSize: 14,
    fontWeight: "900",
    color: "#fff",
  },
});
