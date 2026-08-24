import { useEffect, useRef, useState } from "react";
import { Alert, Platform } from "react-native";
import * as Location from "expo-location";
import { useCameraPermissions } from "expo-camera";
import { io } from "socket.io-client";
import * as ImagePicker from "expo-image-picker";
import jsQR from "jsqr";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { API_BASE, storeGpsEnabled, loadGpsEnabled } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { registerForPushNotificationsAsync } from "../services/notificationService";
import {
  startDriverTracking,
  stopDriverTracking,
  requestDriverLocationPermissions,
} from "../services/driverTrackingService";
import { mapBackendRole, getRoleCapabilities } from "../utils/role.utils";
import { isWithinPeriod, mapMaintenanceOverview } from "../utils/maintenance.utils";
import { mapNotificationToAlert } from "../utils/notification.utils";

export function useMainDashboard({ user, token, onLogout }) {
  const [qrStatus, setQrStatus] = useState("PENDING");
  const [tripStatus, setTripStatus] = useState("ACTIVE");
  const [isSosActive, setIsSosActive] = useState(false);
  const [blink, setBlink] = useState(true);
  const [role, setRole] = useState(mapBackendRole(user?.role));
  const caps = getRoleCapabilities(role);
  const [gpsEnabled, setGpsEnabled] = useState(false);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [cameraMode, setCameraMode] = useState("QR");
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isIssueModalOpen, setIsIssueModalOpen] = useState(false);
  const [isMaintLogModalOpen, setIsMaintLogModalOpen] = useState(false);
  const [isLogHistoryModalOpen, setIsLogHistoryModalOpen] = useState(false);
  const [isSelfieConfirmOpen, setIsSelfieConfirmOpen] = useState(false);
  const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
  const [historyRecords, setHistoryRecords] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [timeFilter, setTimeFilter] = useState("W");
  const [maintChecklist, setMaintChecklist] = useState({});
  const [selfieStatus, setSelfieStatus] = useState("PENDING");
  const [isScanConfirmOpen, setIsScanConfirmOpen] = useState(false);
  const [scannedData, setScannedData] = useState({
    lat: "Fetching GPS...",
    lng: "Fetching GPS...",
    timestamp: "Pending",
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
  const [routeAlertHistory, setRouteAlertHistory] = useState([]);
  const [showRouteAlertHistory, setShowRouteAlertHistory] = useState(false);
  const [unreadAlerts, setUnreadAlerts] = useState(0);
  const inFlightReadIdsRef = useRef(new Set());
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
    if (!caps.loadsMaintenanceFeed) return;
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

  const fetchAllNotifications = async () => {
    if (!token) return;
    try {
      const [notifRes, historyRes] = await Promise.all([
        fetch(`${API_BASE}/api/notifications`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`${API_BASE}/api/notifications/route-alerts`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const notifData = await notifRes.json().catch(() => ({}));
      if (notifData.success && Array.isArray(notifData.notifications)) {
        const unread = notifData.notifications.filter((n) => !n.isRead);
        const mapped = unread.map(mapNotificationToAlert);

        // Deduplicate notifications by stable identifier
        const dedupedAlerts = [];
        const seenKeys = new Set();

        for (const item of mapped) {
          let uniqueKey = item.id;
          if (item.notificationType === "missing_alert" || item.notificationType === "missing_alert_resolved") {
            uniqueKey = item.missingAlertId ? `missing_${item.missingAlertId}` : (item.studentId ? `missing_student_${item.studentId}` : item.id);
          }

          if (!seenKeys.has(uniqueKey)) {
            seenKeys.add(uniqueKey);
            dedupedAlerts.push(item);
          }
        }

        setRouteAlerts(dedupedAlerts);
        setUnreadAlerts(dedupedAlerts.length);
      }

      const historyData = await historyRes.json().catch(() => ({}));
      if (historyData.success) {
        const combinedHistory = [
          ...(historyData.routeAlerts || []).map((r) => ({
            ...r,
            notificationType: r.notificationType || "RouteChange",
            isRead: true,
          })),
          ...(historyData.missingAlerts || []).map((m) => ({
            id: m.id,
            missingAlertId: m.id,
            notificationType: m.status === "RESOLVED" ? "missing_alert_resolved" : "missing_alert",
            routeName: m.status === "RESOLVED" ? "✅ Student Missing Alert Resolved" : "🚨 Student Missing Alert",
            customMessage: m.status === "RESOLVED" ? `Student ${m.studentName} resolved (${m.resolvedReason || "Rejoined"}).` : `Student ${m.studentName} is ${m.distanceMeters || "10+"}m away.`,
            effectiveDate: m.alertTime ? new Date(m.alertTime).toISOString().split("T")[0] : "",
            effectiveTime: m.alertTime ? new Date(m.alertTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "",
            receivedAt: m.alertTime || m.createdAt,
            status: m.status,
            isRead: m.status === "RESOLVED",
          })),
        ];

        // Deduplicate history by id / missingAlertId
        const dedupedHistory = [];
        const seenHistory = new Set();
        for (const item of combinedHistory) {
          const key = item.missingAlertId || item.id;
          if (!seenHistory.has(key)) {
            seenHistory.add(key);
            dedupedHistory.push(item);
          }
        }

        dedupedHistory.sort((a, b) => new Date(b.receivedAt || b.createdAt || 0) - new Date(a.receivedAt || a.createdAt || 0));
        setRouteAlertHistory(dedupedHistory);
      }
    } catch (err) {
      console.log("Notifications fetch error:", err);
    }
  };

  useEffect(() => {
    if (token) {
      registerForPushNotificationsAsync(token);
      fetchAllNotifications();
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
              const perm = await requestDriverLocationPermissions();
              if (perm.granted) {
                setGpsEnabled(true);
                storeGpsEnabled(true);
              } else {
                Alert.alert(
                  "Permission Denied",
                  "GPS location is required for live tracking.",
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
          const newAlert = {
            ...alert,
            receivedAt: alert.receivedAt || new Date().toISOString(),
          };
          setUnreadAlerts((c) => c + 1);
          return [newAlert, ...prev];
        });
        setRouteAlertHistory((prev) => {
          if (prev.some((a) => a.id === alert.id)) return prev;
          return [{ ...alert, receivedAt: alert.receivedAt || new Date().toISOString() }, ...prev];
        });
      });

      socketRef.current.on("new_notification", (notif) => {
        const alert = mapNotificationToAlert(notif);
        let parsedData = {};
        try {
          parsedData = typeof notif.data === "string" ? JSON.parse(notif.data || "{}") : (notif.data || {});
        } catch { }
        const missingId = parsedData.missingAlertId || parsedData.alertId || parsedData.id;
        const notifStudentId = parsedData.studentId;

        setRouteAlerts((prev) => {
          // If this is a missing alert, deduplicate by missingAlertId, alertId, or studentId
          if (
            alert.notificationType === "missing_alert" ||
            alert.notificationType === "missing_alert_resolved" ||
            notif.type === "missing_alert" ||
            notif.type === "missing_alert_resolved"
          ) {
            const index = prev.findIndex(
              (p) =>
                (missingId && (p.missingAlertId === missingId || p.id === missingId || p.alertId === missingId)) ||
                (p.id === alert.id) ||
                (notifStudentId && p.studentId === notifStudentId)
            );
            if (index !== -1) {
              const updated = [...prev];
              updated[index] = {
                ...updated[index],
                ...alert,
                missingAlertId: missingId || updated[index].missingAlertId,
                studentId: notifStudentId || updated[index].studentId,
              };
              return updated;
            }
          }

          if (prev.some((a) => a.id === alert.id || (missingId && a.missingAlertId === missingId))) return prev;
          setUnreadAlerts((prevCount) => prevCount + 1);
          return [alert, ...prev];
        });

        setRouteAlertHistory((prev) => {
          if (prev.some((a) => a.id === alert.id || (missingId && a.missingAlertId === missingId))) return prev;
          return [alert, ...prev];
        });
      });

      // ── Real-Time Student Missing Alert for Driver / Coordinator ──
      socketRef.current.on("driver_student_missing_alert", (alert) => {
        const studentName = alert.studentName || "Student";
        const dist = alert.distanceMeters ?? "10+";
        const alertMsg = `Student: ${studentName}\nDistance: ${dist} m\nPlease check the student's location.`;
        const alertIncidentId = alert.id;

        const updatedCard = {
          id: alertIncidentId,
          missingAlertId: alertIncidentId,
          alertId: alertIncidentId,
          title: "🚨 Student Missing Alert",
          routeName: "🚨 Student Missing Alert",
          message: alertMsg,
          customMessage: alertMsg,
          notificationType: "missing_alert",
          studentId: alert.studentId,
          studentName,
          distanceMeters: dist,
          effectiveDate: new Date().toISOString().split("T")[0],
          effectiveTime: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          receivedAt: new Date().toISOString(),
          status: "ACTIVE",
        };

        setRouteAlerts((prev) => {
          const existingIndex = prev.findIndex(
            (p) =>
              p.id === alertIncidentId ||
              p.missingAlertId === alertIncidentId ||
              (p.studentId && alert.studentId && p.studentId === alert.studentId) ||
              (p.notificationType === "missing_alert" && p.studentName === studentName && p.status !== "RESOLVED")
          );

          if (existingIndex !== -1) {
            // Update existing alert card in place
            const updated = [...prev];
            updated[existingIndex] = { ...updated[existingIndex], ...updatedCard };
            return updated;
          }

          Alert.alert("🚨 Student Missing Alert", alertMsg, [{ text: "OK" }]);
          setUnreadAlerts((c) => c + 1);
          return [updatedCard, ...prev];
        });

        setRouteAlertHistory((prev) => {
          const existingIndex = prev.findIndex((p) => p.id === alertIncidentId || p.missingAlertId === alertIncidentId);
          if (existingIndex !== -1) {
            const updated = [...prev];
            updated[existingIndex] = { ...updated[existingIndex], ...updatedCard };
            return updated;
          }
          return [updatedCard, ...prev];
        });
      });

      socketRef.current.on("student_missing_alert_resolved", (res) => {
        const resolvedTitle = "✅ Student Missing Alert Resolved";
        const resolvedMsg = `Student ${res.studentName || "Student"} has rejoined the vehicle / resolved (${res.resolvedReason || "Closed"}).`;
        const alertIncidentId = res.id || res.missingAlertId || res.alertId;

        setRouteAlerts((prev) => {
          const existingIdx = prev.findIndex(
            (a) =>
              (alertIncidentId && (a.id === alertIncidentId || a.missingAlertId === alertIncidentId || a.alertId === alertIncidentId)) ||
              (a.studentId && res.studentId && a.studentId === res.studentId)
          );
          if (existingIdx !== -1) {
            const updated = [...prev];
            updated[existingIdx] = {
              ...updated[existingIdx],
              status: "RESOLVED",
              missingAlertId: alertIncidentId || updated[existingIdx].missingAlertId,
              notificationType: "missing_alert_resolved",
              routeName: resolvedTitle,
              title: resolvedTitle,
              customMessage: resolvedMsg,
              message: resolvedMsg,
              resolvedReason: res.resolvedReason,
              resolvedAt: res.resolvedAt,
            };
            return updated;
          }

          const newResolved = {
            id: alertIncidentId || `res-${Date.now()}`,
            missingAlertId: alertIncidentId,
            studentId: res.studentId,
            studentName: res.studentName,
            title: resolvedTitle,
            routeName: resolvedTitle,
            message: resolvedMsg,
            customMessage: resolvedMsg,
            notificationType: "missing_alert_resolved",
            effectiveDate: new Date().toISOString().split("T")[0],
            effectiveTime: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            receivedAt: new Date().toISOString(),
            status: "RESOLVED",
          };
          setUnreadAlerts((c) => c + 1);
          return [newResolved, ...prev];
        });

        setRouteAlertHistory((prev) => {
          const existingIdx = prev.findIndex(
            (a) =>
              (alertIncidentId && (a.id === alertIncidentId || a.missingAlertId === alertIncidentId || a.alertId === alertIncidentId)) ||
              (a.studentId && res.studentId && a.studentId === res.studentId)
          );
          if (existingIdx !== -1) {
            const updated = [...prev];
            updated[existingIdx] = {
              ...updated[existingIdx],
              status: "RESOLVED",
              missingAlertId: alertIncidentId || updated[existingIdx].missingAlertId,
              notificationType: "missing_alert_resolved",
              routeName: resolvedTitle,
              title: resolvedTitle,
              customMessage: resolvedMsg,
              message: resolvedMsg,
              resolvedReason: res.resolvedReason,
              resolvedAt: res.resolvedAt,
            };
            return updated;
          }
          return [
            {
              id: alertIncidentId || `res-${Date.now()}`,
              missingAlertId: alertIncidentId,
              routeName: resolvedTitle,
              title: resolvedTitle,
              customMessage: resolvedMsg,
              message: resolvedMsg,
              notificationType: "missing_alert_resolved",
              status: "RESOLVED",
              receivedAt: new Date().toISOString(),
            },
            ...prev,
          ];
        });
      });
    })();

    return () => {
      if (socketRef.current) socketRef.current.disconnect();
    };
  }, [role, user?.id]);

  useEffect(() => {
    const shouldTrack = caps.canTrackGPS && qrStatus === "STARTED" && gpsEnabled;

    if (shouldTrack) {
      startDriverTracking({
        user,
        vehicleId: userVehicle,
        vehicleNumber: userVehicle,
        token,
        socket: socketRef.current,
      });
    } else if (caps.canTrackGPS) {
      stopDriverTracking({
        vehicleId: userVehicle,
        driverId: userId,
        socket: socketRef.current,
      });
    }

    return () => {
      // Driver tracking service manages its own background/foreground lifecycle
    };
  }, [qrStatus, gpsEnabled, role, caps.canTrackGPS, userVehicle, userId, token, user]);

  useEffect(() => {
    (async () => {
      const saved = await loadGpsEnabled();
      if (saved) {
        const { status } = await Location.getForegroundPermissionsAsync();
        setGpsEnabled(status === "granted");
      }

      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === "granted") {
          const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
          if (loc?.coords) {
            setScannedData({
              lat: `${loc.coords.latitude.toFixed(5)}° N`,
              lng: `${loc.coords.longitude.toFixed(5)}° E`,
              timestamp: new Date(loc.timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              }),
            });
          }
        }
      } catch (e) {
        console.log("Auto-fetch initial GPS note:", e.message);
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
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      lat = loc.coords.latitude;
      lng = loc.coords.longitude;
    } catch (locErr) {
      console.log("[GPS DEBUG][DRIVER] GPS fetch failed:", locErr.message);
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
      lat: lat != null ? `${lat.toFixed(5)}° N` : "GPS unavailable",
      lng: lng != null ? `${lng.toFixed(5)}° E` : "GPS unavailable",
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
    if (!alert || !alert.id) return;
    const alertId = alert.id;

    // Prevent duplicate in-flight requests for the same notification
    if (inFlightReadIdsRef.current.has(alertId)) return;
    inFlightReadIdsRef.current.add(alertId);

    // Save previous state for rollback if request fails
    const previousRouteAlerts = [...routeAlerts];
    const previousUnreadCount = unreadAlerts;

    // Optimistic UI updates: immediately remove from unread and decrement count
    setRouteAlerts((prev) => prev.filter((a) => a.id !== alertId));
    setUnreadAlerts((c) => Math.max(0, c - 1));
    setRouteAlertHistory((prev) =>
      prev.map((a) => (a.id === alertId ? { ...a, isRead: true } : a))
    );

    try {
      if (!String(alertId).startsWith("demo-")) {
        const response = await fetch(`${API_BASE}/api/notifications/${alertId}/read`, {
          method: "PUT",
          headers: authHeaders,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.success === false) {
          throw new Error(data.message || "Failed to mark notification as read");
        }
      }
      if (actionLabel) {
        Alert.alert(actionLabel, alert.routeName || alert.title || "Notification marked as read.");
      }
    } catch (err) {
      console.log("Failed to mark notification read in backend:", err.message);
      // Rollback optimistic update
      setRouteAlerts(previousRouteAlerts);
      setUnreadAlerts(previousUnreadCount);
      Alert.alert("Error", "Could not mark notification as read. Please check your connection.");
    } finally {
      inFlightReadIdsRef.current.delete(alertId);
    }
  };

  const markAllNotificationsAsRead = async () => {
    if (routeAlerts.length === 0) return;

    const previousRouteAlerts = [...routeAlerts];
    const previousUnreadCount = unreadAlerts;

    // Optimistically clear all unread
    setRouteAlerts([]);
    setUnreadAlerts(0);
    setRouteAlertHistory((prev) => prev.map((a) => ({ ...a, isRead: true })));

    try {
      await Promise.all(
        previousRouteAlerts.map(async (alert) => {
          if (alert.id && !String(alert.id).startsWith("demo-")) {
            await fetch(`${API_BASE}/api/notifications/${alert.id}/read`, {
              method: "PUT",
              headers: authHeaders,
            });
          }
        })
      );
    } catch (err) {
      console.log("Error marking all notifications read:", err.message);
      setRouteAlerts(previousRouteAlerts);
      setUnreadAlerts(previousUnreadCount);
      Alert.alert("Error", "Could not mark all notifications as read.");
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
    const doLogout = async () => {
      try {
        await stopDriverTracking({
          vehicleId: userVehicle,
          driverId: userId,
          socket: socketRef.current,
        });
      } catch (err) {
        console.log("Error stopping tracking on logout:", err.message);
      }
      if (onLogout) {
        onLogout();
      }
    };

    if (Platform.OS === "web") {
      const confirm = window.confirm("Are you sure you want to log out?");
      if (confirm) {
        doLogout();
      }
    } else {
      Alert.alert("Log Out", "Are you sure you want to log out?", [
        { text: "Cancel", style: "cancel" },
        { text: "Log Out", style: "destructive", onPress: doLogout },
      ]);
    }
  };

  return {
    // Identity / auth
    user,
    token,
    onLogout,
    userId,
    userName,
    userVehicle,
    role,
    caps,
    authHeaders,

    // Navigation / profile
    activeTab,
    setActiveTab,
    handleTabPress,
    showProfileModal,
    setShowProfileModal,
    isSettingsModalOpen,
    setIsSettingsModalOpen,
    confirmLogout,

    // Camera / attendance
    isCameraOpen,
    setIsCameraOpen,
    cameraMode,
    setCameraMode,
    cameraPermission,
    requestCameraPermission,
    cameraRef,
    openCamera,
    onShutterPress,
    qrStatus,
    setQrStatus,
    selfieStatus,
    setSelfieStatus,
    isSelfieConfirmOpen,
    setIsSelfieConfirmOpen,
    isScanConfirmOpen,
    setIsScanConfirmOpen,
    scannedData,
    setScannedData,
    isCloseTripConfirmOpen,
    setIsCloseTripConfirmOpen,
    handleQRScan,
    pickQRFromLibrary,

    // GPS / trip
    gpsEnabled,
    setGpsEnabled,
    storeGpsEnabled,
    tripStatus,
    setTripStatus,
    blink,
    isSosActive,
    setIsSosActive,

    // Attendance history
    isHistoryModalOpen,
    setIsHistoryModalOpen,
    historyRecords,
    historyLoading,
    statusFilter,
    setStatusFilter,
    timeFilter,
    setTimeFilter,
    fetchMyHistory,
    generatePDF,

    // Issue workflow
    isIssueModalOpen,
    setIsIssueModalOpen,
    isBreakdownModalOpen,
    setIsBreakdownModalOpen,
    isAccidentConfirmOpen,
    setIsAccidentConfirmOpen,
    isOthersConfirmOpen,
    setIsOthersConfirmOpen,
    isIssueSuccessOpen,
    setIsIssueSuccessOpen,
    reportedIssueType,
    handleIssueApi,

    // SOS workflow
    isSosConfirmOpen,
    setIsSosConfirmOpen,
    isSosSentOpen,
    setIsSosSentOpen,
    isSosStopConfirmOpen,
    setIsSosStopConfirmOpen,
    isSosStoppedOpen,
    setIsSosStoppedOpen,
    triggerSOS,
    stopSOS,

    // Notifications
    routeAlerts,
    setRouteAlerts,
    routeAlertHistory,
    setRouteAlertHistory,
    unreadAlerts,
    setUnreadAlerts,
    showRouteAlertHistory,
    setShowRouteAlertHistory,
    handleNotificationAction,
    markAllNotificationsAsRead,
    fetchAllNotifications,

    // Maintenance
    isMaintLogModalOpen,
    setIsMaintLogModalOpen,
    isLogHistoryModalOpen,
    setIsLogHistoryModalOpen,
    maintChecklist,
    setMaintChecklist,
    maintItems,
    setMaintItems,
    maintLoading,
    maintOnline,
    completedLogs,
    maintLogPeriod,
    setMaintLogPeriod,
    maintLogTab,
    setMaintLogTab,
    sosAlerts,
    setSosAlerts,
    unreadSosCount,
    setUnreadSosCount,
    loadMaintenanceFeed,
    handleAcknowledge,
    ongoingTasks,
    isWithinPeriod,
  };
}