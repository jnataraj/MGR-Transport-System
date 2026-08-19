import { StatusBar } from "expo-status-bar";
import React, { useState, useEffect, useRef } from "react";
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Image,
  Modal,
  SafeAreaView,
  ScrollView,
  Platform,
} from "react-native";
import * as Location from "expo-location";
import { io } from "socket.io-client";
import { API_BASE } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { registerForPushNotificationsAsync } from "../services/notificationService";
import logo from "../../assets/logo.png";
import { CameraView, useCameraPermissions } from "expo-camera";
import BottomTabBar from "../components/BottomTabBar";
import LiveBusTrackingModal from "../components/LiveBusTrackingModal";
import * as ImagePicker from "expo-image-picker";
import jsQR from "jsqr";
import { ProfileAvatar, avatarStyles } from "../screens/dashboard/modals/ProfileModal";
import {
  GraduationCap,
  MapPin,
  QrCode,
  History,
  Navigation,
  Bell,
  Bus,
  Landmark,
  Home,
  AlertTriangle,
  BellOff,
  Clock,
  XCircle,
  Shuffle,
  Megaphone,
  AlertCircle,
  ChevronRight,
  FileText,
  X,
  Inbox,
  UserX,
  BarChart2,
  Download,
  Upload,
  User,
  Phone,
  CheckCircle,
} from "lucide-react-native";

const STAGE = {
  PICKUP: "PICKUP",
  TO_COLLEGE: "TO_COLLEGE",
  AT_COLLEGE: "AT_COLLEGE",
  TO_HOME: "TO_HOME",
  AT_HOME: "AT_HOME",
};

const STAGE_META = {
  PICKUP: { label: "WAITING FOR\nMORNING PICKUP", Icon: QrCode, color: "#F59E0B" },
  TO_COLLEGE: { label: "ONGOING:\nTRANSIT TO COLLEGE", Icon: Navigation, color: "#10B981" },
  AT_COLLEGE: { label: "ARRIVED:\nCOLLEGE", Icon: Landmark, color: "#2563EB" },
  TO_HOME: { label: "ONGOING:\nTRANSIT BACK HOME", Icon: Navigation, color: "#10B981" },
  AT_HOME: { label: "ARRIVED:\nHOME DESTINATION", Icon: Home, color: "#475569" },
};

// Quick-action theme palette
const ACTION_THEMES = {
  qr: { bg: "#EFF6FF", fg: "#2563EB" },
  history: { bg: "#FFF7ED", fg: "#F97316" },
  tracking: { bg: "#ECFDF5", fg: "#10B981" },
  alerts: { bg: "#FEF2F2", fg: "#EF4444" },
};

const mapBackendRole = (backendRole) => {
  const r = (backendRole || "").toLowerCase();
  if (r === "deptadmin" || r === "hod") return "hod";
  if (r === "parent") return "parent";
  return "student";
};

export default function MainDashboard({ user, token, onLogout }) {
  const [boardStatus, setBoardStatus] = useState(STAGE.PICKUP);
  const [currentVehicleNumber, setCurrentVehicleNumber] = useState(
    user?.vehicle || null
  );
  const inTransit = boardStatus === STAGE.TO_COLLEGE || boardStatus === STAGE.TO_HOME;
  // const [boardStatus, setBoardStatus] = useState("NOT_BOARDED");
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [showRouteModal, setShowRouteModal] = useState(false);
  const [stuTimeFilter, setStuTimeFilter] = useState("W");
  const [stuStatusFilter, setStuStatusFilter] = useState("ALL"); // ALL, BOARDED, MISSED
  // Travel History — real data from backend
  const [travelHistory, setTravelHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  // For Parent role: the linked student's resolved ID and name
  const [linkedStudentId, setLinkedStudentId] = useState(null);
  const [linkedStudentName, setLinkedStudentName] = useState(null);
  // For Parent role: the linked student's full profile + live board status
  const [childProfile, setChildProfile] = useState(null);        // { name, vehicle, route, driverName, ... }
  const [childBoardStatus, setChildBoardStatus] = useState(STAGE.PICKUP);
  const childInTransit = childBoardStatus === STAGE.TO_COLLEGE || childBoardStatus === STAGE.TO_HOME;
  // Live Bus Tracking map
  const [showLiveMapModal, setShowLiveMapModal] = useState(false);
  // Driven by the logged-in user's role rather than a demo toggle.
  const [userRole] = useState(mapBackendRole(user?.role));
  const isHoD = userRole === "hod";
  const [gpsEnabled, setGpsEnabled] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [showAbsentModal, setShowAbsentModal] = useState(false);
  const [hodTimeFilter, setHodTimeFilter] = useState("W");
  const [notifications, setNotifications] = useState([]);
  const [isBoardingQRModalOpen, setIsBoardingQRModalOpen] = useState(false);
  // const [qrDirection, setQrDirection] = useState("COLLEGE_TO_INROUTE");
  const [activeTab, setActiveTab] = useState("home");
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [scanFeedback, setScanFeedback] = useState(null);
  const [assignedVehicles, setAssignedVehicles] = useState([]);
  const [scanEnabled, setScanEnabled] = useState(false);
  const isMorningLeg = boardStatus === STAGE.PICKUP || boardStatus === STAGE.TO_COLLEGE;
  const nextStageAfterScan = {
    [STAGE.PICKUP]: STAGE.TO_COLLEGE,
    [STAGE.TO_COLLEGE]: STAGE.AT_COLLEGE,
    [STAGE.AT_COLLEGE]: STAGE.TO_HOME,
    [STAGE.TO_HOME]: STAGE.AT_HOME,
    [STAGE.AT_HOME]: STAGE.PICKUP, // next day resets
  }[boardStatus];

  const scanDirection = isMorningLeg ? "COLLEGE_TO_INROUTE" : "INROUTE_TO_HOME";

  // Real identity from login
  const userId = user?.id || "unknown-user";
  const userName = user?.name || "Portal User";
  const userDept = user?.department || null;
  const { refreshProfile } = useAuth();
  const qrPayload = JSON.stringify({
    id: userId,
    userId,
    role: "student",
    name: userName,
    route: user?.route || "Route 7",
    issuedAt: new Date().toISOString(),
  });
  const handleTabPress = (tab) => {
    setActiveTab(tab);
    if (tab === "settings") setIsSettingsModalOpen(true);
    if (tab === "profile") setShowProfileModal(true);
  };

  // ── Fetch travel history: Student sees own records, Parent sees linked student's records ──
  const fetchTravelHistory = async () => {
    if (!userId || userId === "unknown-user") return;
    setHistoryLoading(true);
    setTravelHistory([]);
    try {
      let targetUserId = userId;
      let targetStudentName = null;

      if (userRole === "parent") {
        // Resolve the linked student by finding a student whose parentId === this parent's userId
        let resolvedId = linkedStudentId;
        let resolvedName = linkedStudentName;
        if (!resolvedId) {
          const res = await fetch(
            `${API_BASE}/api/users?role=student`,
            { headers: authHeaders },
          );
          const data = await res.json();
          const students = Array.isArray(data) ? data : (data.users || []);
          const myStudent = students.find((s) => s.parentId === userId);
          if (myStudent) {
            resolvedId = myStudent.id;
            resolvedName = myStudent.name;
            setLinkedStudentId(resolvedId);
            setLinkedStudentName(resolvedName);
          }
        }
        if (!resolvedId) {
          // Fallback: use studentName / studentRollNo from parent's own user object
          setTravelHistory([]);
          setHistoryLoading(false);
          return;
        }
        targetUserId = resolvedId;
        targetStudentName = resolvedName;
      }

      const res = await fetch(
        `${API_BASE}/api/attendance?userId=${targetUserId}&type=student_scan&limit=100`,
        { headers: authHeaders },
      );
      const data = await res.json();
      if (data.success && Array.isArray(data.attendance)) {
        setTravelHistory(data.attendance);
      } else {
        setTravelHistory([]);
      }
    } catch (err) {
      console.log("fetchTravelHistory error:", err.message);
      setTravelHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  };
  useEffect(() => {
    if (refreshProfile) {
      refreshProfile();
    }
  }, [refreshProfile]);

  // ── Fetch linked student profile + board status for Parent ──
  useEffect(() => {
    if (userRole !== "parent" || !userId || userId === "unknown-user") return;

    const fetchChildData = async () => {
      try {
        // Step 1: find the student linked to this parent
        const res = await fetch(`${API_BASE}/api/users?role=student`, {
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        });
        const data = await res.json();
        const students = Array.isArray(data) ? data : (data.users || []);
        const myStudent = students.find((s) => s.parentId === userId);

        console.log("PARENT USER ID:", userId);
        console.log("PARENT LINKED STUDENT:", myStudent);
        // if (!myStudent) return;
        //  // No linked student found

        if (!myStudent) {
          setLinkedStudentId(null);
          setLinkedStudentName(null);
          setChildProfile(null);
          setChildBoardStatus(STAGE.PICKUP);
          return;
        }

        setLinkedStudentId(myStudent.id);
        setLinkedStudentName(myStudent.name);
        console.log("PARENT LINKED STUDENT:", myStudent);

        // Fetch the student's individual record to guarantee fresh driver data.
        // The bulk /api/users?role=student list may not always have nested driver
        // populated; the individual endpoint uses the same formatUser() with the
        // full Prisma include, so it is the most reliable source.
        let studentRecord = myStudent;
        try {
          const singleRes = await fetch(`${API_BASE}/api/users/${myStudent.id}`, {
            headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          });
          if (singleRes.ok) {
            const singleData = await singleRes.json();
            // /api/users/:id returns the user object directly (not wrapped)
            if (singleData && singleData.id) {
              studentRecord = singleData;
              console.log("[Parent] fetched individual student record:", studentRecord);
            }
          }
        } catch (fetchErr) {
          console.log("[Parent] individual student fetch failed, using list data:", fetchErr.message);
        }

        const assignedVehicles = Array.isArray(studentRecord.vehicles)
          ? studentRecord.vehicles
          : (Array.isArray(myStudent.vehicles) ? myStudent.vehicles : []);

        const assignedVehicle = assignedVehicles[0] || null;

        // Resolve driverName from multiple sources, in priority order
        const resolvedDriverName =
          assignedVehicle?.driver?.name ||      // vehicle nested driver (most reliable)
          studentRecord.driverName ||            // top-level driverName from formatUser
          myStudent.driverName ||                // fallback to list data
          null;

        console.log("[Parent] resolved driverName:", resolvedDriverName, {
          vehicleDriverName: assignedVehicle?.driver?.name,
          studentRecordDriverName: studentRecord.driverName,
          myStudentDriverName: myStudent.driverName,
        });

        setChildProfile({
          id: myStudent.id,
          name: myStudent.name,

          vehicle:
            assignedVehicle?.number ||
            studentRecord.vehicleNumbers?.[0] ||
            studentRecord.vehicle ||
            myStudent.vehicleNumbers?.[0] ||
            myStudent.vehicle ||
            null,

          vehicleId:
            assignedVehicle?.id ||
            studentRecord.vehicleIds?.[0] ||
            studentRecord.vehicleId ||
            myStudent.vehicleIds?.[0] ||
            myStudent.vehicleId ||
            null,

          route:
            assignedVehicle?.route ||
            studentRecord.route ||
            myStudent.route ||
            null,

          driverName: resolvedDriverName,

          pickupTime:
            studentRecord.pickupTime ||
            myStudent.pickupTime ||
            null,

          vehicles: assignedVehicles,
        });

        // Step 2: fetch the student's current board status
        try {
          const statusRes = await fetch(
            `${API_BASE}/api/attendance/current?userId=${myStudent.id}`,
            { headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) } },
          );
          const statusData = await statusRes.json();
          if (statusData.success) {
            if (statusData.stage && STAGE_META[statusData.stage]) {
              setChildBoardStatus(statusData.stage);
            }

            if (statusData.vehicleId) {
              setChildProfile((prev) =>
                prev
                  ? {
                    ...prev,
                    vehicle: statusData.vehicleId,
                  }
                  : prev
              );
            }
          }
        } catch { /* silently fall back to PICKUP */ }

      } catch (err) {
        console.log("[Parent] fetchChildData error:", err.message);
      }
    };

    fetchChildData();
  }, [userRole, userId, token]);

  useEffect(() => {
    if (userRole !== "student" || !userId || userId === "unknown-user") return;

    const loadAssignedVehicles = async () => {
      try {
        const res = await fetch(
          `${API_BASE}/api/users?role=student`,
          { headers: authHeaders }
        );

        const data = await res.json();
        const students = Array.isArray(data)
          ? data
          : (data.users || []);

        const currentStudent = students.find(
          (s) => String(s.id) === String(userId)
        );

        if (!currentStudent) return;

        const vehicles = Array.isArray(currentStudent.vehicle)
          ? currentStudent.vehicle
          : String(
            currentStudent.vehicle ||
            currentStudent.vehicleNumber ||
            ""
          )
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean);

        setAssignedVehicles(vehicles);
      } catch (err) {
        console.log("Load assigned vehicles error:", err.message);
      }
    };

    loadAssignedVehicles();
  }, [userRole, userId, token]);

  useEffect(() => {
    if (isBoardingQRModalOpen) {
      setScanned(false);
      setScanEnabled(false);
      setScanFeedback(null);

      if (!cameraPermission?.granted) {
        requestCameraPermission();
      }

      if (refreshProfile) {
        refreshProfile();
      }
    }
  }, [isBoardingQRModalOpen]);

  // Shared by BOTH the live camera scan and the uploaded-image scan
  const processScannedQRData = async (data) => {
    console.log("QR detected:", data);

    let parsed;
    try {
      parsed = JSON.parse(data);
    } catch {
      setScanFeedback({ type: "error", message: "That doesn't look like a bus QR code. Try again." });
      setTimeout(() => setScanned(false), 1500);
      return;
    }

    if (parsed.type !== "vehicle_qr") {
      setScanFeedback({ type: "error", message: "This isn't a bus boarding QR code." });
      setTimeout(() => setScanned(false), 1500);
      return;
    }

    const assignedVehicleId = user?.vehicleId;

    const assignedVehicleNumbers =
      assignedVehicles.length > 0
        ? assignedVehicles
        : String(user?.vehicle || "")
          .split(",")
          .map((v) => v.trim())
          .filter(Boolean);

    const scannedVehicleNumber = String(
      parsed.vehicleNumber || ""
    ).trim();

    const matches =
      (assignedVehicleId &&
        parsed.vehicleId &&
        String(parsed.vehicleId).trim() ===
        String(assignedVehicleId).trim()) ||
      assignedVehicleNumbers.some(
        (vehicle) => vehicle === scannedVehicleNumber
      );

    if (!matches) {
      setScanFeedback({
        type: "error",
        message: `Wrong bus — this is ${parsed.vehicleNumber || "another vehicle"
          }. Your assigned buses are ${assignedVehicleNumbers.length
            ? assignedVehicleNumbers.join(", ")
            : "not set"
          }.`,
      });

      if (refreshProfile) {
        refreshProfile();
      }

      setTimeout(() => setScanned(false), 2000);
      return;
    }

    setScanFeedback({ type: "pending", message: `Verified ${parsed.vehicleNumber}! Marking attendance…` });
    await handleScanQR(parsed.vehicleNumber);
  };

  const [deptSummary, setDeptSummary] = useState({
    totalStudents: 0, presentCount: 0, absentCount: 0, presentList: [], absentList: [],
  });
  const [deptHistory, setDeptHistory] = useState({
    dayWise: [], avgAttendanceRate: "0.0%", totalAbsent: 0, daysTracked: 0,
  });

  const fetchDeptSummary = async () => {
    if (!userDept) return;
    try {
      const res = await fetch(
        `${API_BASE}/api/attendance/department-summary?department=${encodeURIComponent(userDept)}`,
        { headers: authHeaders },
      );
      const data = await res.json();
      if (data.success) setDeptSummary(data);
    } catch (err) {
      console.log("fetchDeptSummary error:", err.message);
    }
  };

  const fetchDeptHistory = async (days = 7) => {
    if (!userDept) return;
    try {
      const res = await fetch(
        `${API_BASE}/api/attendance/department-history?department=${encodeURIComponent(userDept)}&days=${days}`,
        { headers: authHeaders },
      );
      const data = await res.json();
      if (data.success) setDeptHistory(data);
    } catch (err) {
      console.log("fetchDeptHistory error:", err.message);
    }
  };

  useEffect(() => {
    if (isHoD && userDept) {
      fetchDeptSummary();
      fetchDeptHistory(hodTimeFilter === "W" ? 7 : hodTimeFilter === "M" ? 30 : 365);
    }
  }, [isHoD, userDept, hodTimeFilter]);

  // Live camera scan just delegates to the shared function
  const handleVehicleQRScanned = async ({ data }) => {
    if (scanned) return;
    setScanned(true);
    setScanEnabled(false);
    await processScannedQRData(data);
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
      setScanFeedback({
        type: "error",
        message: "Image upload scanning is only available on web right now. Please use the live camera.",
      });
      setTimeout(() => setScanFeedback(null), 2500);
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;

      setScanned(true);
      setScanEnabled(false);
      setScanFeedback({ type: "pending", message: "Reading QR code from image…" });

      const data = await decodeQRFromImageUri(result.assets[0].uri);
      await processScannedQRData(data);
    } catch (err) {
      console.log("Image QR decode error:", err.message);
      setScanFeedback({ type: "error", message: "Couldn't find a readable QR code in that image. Try another one." });
      setTimeout(() => {
        setScanFeedback(null);
        setScanned(false);
      }, 2000);
    }
  };

  const handleScanQR = async (vehicleNumber) => {
    const targetStage = nextStageAfterScan;

    let latitude = null, longitude = null;
    try {
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      latitude = loc.coords.latitude;
      longitude = loc.coords.longitude;
      console.log("[handleScanQR] 📡 Student GPS acquired:", {
        latitude,
        longitude,
        accuracy: loc.coords.accuracy,   // metres — lower is better
        altitude: loc.coords.altitude,
        timestamp: new Date(loc.timestamp).toISOString(),
      });
    } catch (gpsErr) {
      console.warn("[handleScanQR] ⚠️ GPS unavailable:", gpsErr?.message);
      /* backend will reject with STUDENT_GPS_MISSING */
    }

    console.log("[handleScanQR] 📤 Sending attendance request:", {
      userId,
      // vehicleId: user?.vehicle || null,
      vehicleId: vehicleNumber || null,
      type: "student_scan",
      direction: scanDirection,
      stage: targetStage,
      studentLat: latitude,
      studentLng: longitude,
    });

    let response, data;
    try {
      response = await fetch(`${API_BASE}/api/attendance`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          userId,
          // vehicleId: user?.vehicle || null,
          vehicleId: vehicleNumber || null,
          type: "student_scan",
          direction: scanDirection,
          stage: targetStage,
          latitude,
          longitude,
        }),
      });
      data = await response.json();
      console.log("[handleScanQR] 📥 Server response:", {
        httpStatus: response.status,
        success: data.success,
        code: data.code || "—",
        message: data.message,
        // Live vehicle GPS echoed back by the server
        vehicleLocation: data.vehicleLocation
          ? {
            vehicleLat: data.vehicleLocation.latitude,
            vehicleLng: data.vehicleLocation.longitude,
            vehicleUpdatedAt: data.vehicleLocation.updatedAt,
          }
          : "not returned",
        // Distance info (only present on TOO_FAR_FROM_VEHICLE)
        distanceMeters: data.distanceMeters ?? "—",
        limitMeters: data.limitMeters ?? "—",
        attendanceId: data.attendance?.id ?? "—",
      });
    } catch {
      // Network/server unreachable
      setScanFeedback({
        type: "error",
        message: "⚠️ Could not reach the server. Check your internet connection and try again.",
      });
      setTimeout(() => setScanned(false), 3000);
      return;
    }

    // ── Handle server-side rejections (proximity check, GPS errors, etc.) ──
    if (!response.ok || !data.success) {
      console.warn("[handleScanQR] ❌ Attendance rejected:", {
        code: data.code,
        message: data.message,
        distanceMeters: data.distanceMeters,
        limitMeters: data.limitMeters,
      });
      let userMessage = data?.message || "Attendance could not be recorded. Please try again.";

      // Tailor icons/prefix for known error codes
      if (data?.code === "TOO_FAR_FROM_VEHICLE") {
        userMessage = `📍 ${userMessage}`;
      } else if (data?.code === "VEHICLE_OFFLINE") {
        userMessage = `🚌 ${userMessage}`;
      } else if (data?.code === "STUDENT_GPS_MISSING") {
        userMessage = `📡 ${userMessage}`;
      }

      setScanFeedback({ type: "error", message: userMessage });
      setTimeout(() => setScanned(false), 3500);
      return;
    }

    // ── Success: advance the board status ──
    console.log("[handleScanQR] ✅ Attendance marked successfully:", {
      newStage: targetStage,
      attendanceId: data.attendance?.id,
      vehicleLocation: data.vehicleLocation,
      autoEnrolled: data.autoEnrolled,
    });
    setBoardStatus(targetStage);

    // Show the attendance confirmation INSIDE the camera modal
    setScanFeedback({
      type: "success",
      message: `✅ ATTENDANCE MARKED\n${STAGE_META[targetStage].label.replace("\n", " ")}\nBus: ${vehicleNumber || user?.vehicle || ""}`,
    });

    // Give the person a moment to actually see the confirmation before closing
    setTimeout(() => {
      setIsBoardingQRModalOpen(false);
    }, 1800);
  };


  // into the shape the Route Alerts UI expects (routeName/customMessage/etc.)
  const mapNotificationToAlert = (n) => {
    const created = n.createdAt ? new Date(n.createdAt) : new Date();
    return {
      id: n.id,
      isRead: !!n.isRead,
      notificationType: n.type === "general" ? "General" : n.type || "General",
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

  useEffect(() => {
    if (token) {
      registerForPushNotificationsAsync(token);

      fetch(`${API_BASE}/api/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success && Array.isArray(data.notifications)) {
            const mapped = data.notifications.map(mapNotificationToAlert);
            setNotifications(data.notifications);
            setRouteAlerts((prev) => {
              const existingIds = new Set(prev.map((a) => a.id));
              const newOnes = mapped.filter((a) => !existingIds.has(a.id));
              if (newOnes.length > 0) {
                setUnreadAlerts((count) => count + newOnes.length);
              }
              return [...newOnes, ...prev];
            });
          }
        })
        .catch((err) => console.log("Student notifications fetch error:", err));
    }
  }, [token]);

  // ── NEW: restore real current stage on mount/refresh ──
  useEffect(() => {
    const fetchCurrentStatus = async () => {
      if (!userId || userId === "unknown-user") return;
      try {
        const res = await fetch(`${API_BASE}/api/attendance/current?userId=${userId}`, {
          headers: authHeaders,
        });
        const data = await res.json();
        // if (data.success && data.stage && STAGE_META[data.stage]) {
        //   setBoardStatus(data.stage);
        // }
        if (data.success) {
          if (data.stage && STAGE_META[data.stage]) {
            setBoardStatus(data.stage);
          }
          if (data.vehicleId) {
            setCurrentVehicleNumber(data.vehicleId);
          }
        }
      } catch (err) {
        console.log("Failed to fetch current attendance status:", err.message);
      }
    };
    fetchCurrentStatus();
  }, [userId]);

  const authHeaders = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  // Route Alert Notifications
  const socketRef = useRef(null);
  const [routeAlerts, setRouteAlerts] = useState([]);
  const [showRouteAlertsModal, setShowRouteAlertsModal] = useState(false);
  const [unreadAlerts, setUnreadAlerts] = useState(2);

  React.useEffect(() => {
    (async () => {
      // Confirmation for GPS Access
      Alert.alert(
        "Location Access Permission",
        "We need your GPS location to help you find your bus in real-time. You can toggle this access in Settings.",
        [
          {
            text: "Decline",
            style: "cancel",
            onPress: () => setGpsEnabled(false),
          },
          {
            text: "Accept",
            onPress: async () => {
              const { status } =
                await Location.requestForegroundPermissionsAsync();
              if (status === "granted") {
                setGpsEnabled(true);
              } else {
                setGpsEnabled(false);
                Alert.alert(
                  "Permission Denied",
                  "Live tracking will be unavailable.",
                );
              }
            },
          },
        ],
      );
    })();
  }, []);

  useEffect(() => {
    try {
      socketRef.current = io(API_BASE);
      // join role-specific room & user room
      socketRef.current.emit("joinRoom", userRole);
      if (userId) {
        socketRef.current.emit("joinUser", userId);
      }
      socketRef.current.on("student_boarded", (data) => {
        if (data.stage && STAGE_META[data.stage]) {
          setBoardStatus(data.stage);
          Alert.alert("Attendance Updated", STAGE_META[data.stage].label.replace("\n", " "));
        }
        setIsBoardingQRModalOpen(false);
      });
      socketRef.current.on("routeAlert", (alert) => {
        setRouteAlerts((prev) => {
          if (prev.some((a) => a.id === alert.id)) return prev; // already present, skip
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
    } catch { }
    return () => {
      try {
        socketRef.current?.disconnect();
      } catch { }
    };
  }, [userRole, userId]);

  const viewLiveLocation = () => {
    setShowLiveMapModal(true);
  };

  const getDriverForVehicle = (vehicleNumber) => {
    // Primary: look up from the per-vehicle drivers array returned by the backend
    if (vehicleNumber && Array.isArray(user?.drivers) && user.drivers.length > 0) {
      const driver = user.drivers.find(
        (d) => String(d.vehicleNumber).trim() === String(vehicleNumber).trim()
      );
      if (driver?.driverName) return driver.driverName;
    }

    // Fallback 1: single driverName on the user object (from login/profile response)
    if (user?.driverName) return user.driverName;

    // Fallback 2: for parent role, use childProfile.driverName
    if (userRole === "parent" && childProfile?.driverName) return childProfile.driverName;

    return null;
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
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Log Out",
          style: "destructive",
          onPress: async () => {
            console.log("Logout button clicked");
            console.log("onLogout =", onLogout);

            if (onLogout) {
              await onLogout();
              console.log("Logout completed");
            }
          },
        },
      ]);
    }
  };

  return (
    <>
      <View style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
        <ScrollView
          style={{ flex: 1, backgroundColor: "#F8FAFC" }}
          contentContainerStyle={{ paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Logo */}
          <View style={{ alignItems: "center", marginBottom: 10 }}>
            <Image
              source={logo}
              style={{ height: 90, width: 250 }}
              resizeMode="contain"
            />
          </View>

          {/* Top Header Card (Blue Card Matching Mockup) */}
          <View
            style={{
              backgroundColor: "#1D4ED8",
              borderRadius: 22,
              padding: 18,
              margin: 16,
              shadowColor: "#1D4ED8",
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.25,
              shadowRadius: 10,
              elevation: 6,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              {/* Avatar Circle */}
              <View
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: 27,
                  backgroundColor: "#FFFFFF",
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: 14,
                  shadowColor: "#000",
                  shadowOpacity: 0.12,
                  shadowRadius: 6,
                  elevation: 3,
                }}
              >
                <GraduationCap size={26} color="#1D4ED8" strokeWidth={2.2} />
              </View>

              {/* User Info */}
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: "900",
                    color: "#93C5FD",
                    letterSpacing: 1,
                    textTransform: "uppercase",
                  }}
                >
                  {userRole.toUpperCase()}
                </Text>
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: "900",
                    color: "#FFFFFF",
                    marginTop: 2,
                  }}
                  numberOfLines={1}
                >
                  You - {userName}
                </Text>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "700",
                    color: "#BFDBFE",
                    marginTop: 2,
                  }}
                >
                  ROLL:{" "}
                  {user?.year
                    ? `${user.year}`
                    : user?.id
                      ? user.id.slice(0, 8).toUpperCase()
                      : "AR12234"}
                </Text>
              </View>

              {/* Right Status Badge & Assigned Route */}
              <View style={{ alignItems: "flex-end" }}>
                <View
                  style={{
                    // backgroundColor:
                    //   boardStatus === "IN_ATTENDANCE" ? "#10B981" : "#EF4444",
                    backgroundColor: inTransit ? "#10B981" : "#EF4444",
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: 6,
                  }}
                >
                  <Text
                    style={{ fontSize: 10, fontWeight: "900", color: "#FFFFFF" }}
                  >
                    {/* {boardStatus === "IN_ATTENDANCE" ? "IN TRANSIT" : "IDLE"} */}
                    {inTransit ? "IN TRANSIT" : "IDLE"}
                  </Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8 }}>
                  <MapPin size={11} color="#93C5FD" strokeWidth={2.5} />
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: "800",
                      color: "#FFFFFF",
                      textAlign: "right",
                    }}
                    numberOfLines={1}
                  >
                    {(user?.route || "ROUTE 7 (THENI)").toUpperCase()}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {isHoD && (
            <View style={{ flexDirection: "row", marginHorizontal: 16, marginBottom: 16, gap: 8 }}>
              <View style={[styles.hodStat, { borderColor: "#fecaca" }]}>
                <Text style={[styles.hodStatNum, { color: "#EF4444" }]}>{deptSummary.absentCount}</Text>
                <Text style={styles.hodStatLabel}>Absent Today</Text>
              </View>
              <View style={[styles.hodStat, { borderColor: "#dcfce7" }]}>
                <Text style={[styles.hodStatNum, { color: "#10B981" }]}>{deptSummary.presentCount}</Text>
                <Text style={styles.hodStatLabel}>Present</Text>
              </View>
              <View style={[styles.hodStat, { borderColor: "#ddd6fe" }]}>
                <Text style={[styles.hodStatNum, { color: "#7C3AED" }]}>{deptSummary.totalStudents}</Text>
                <Text style={styles.hodStatLabel}>Total Dept</Text>
              </View>
            </View>
          )}

          {/* QUICK ACTIONS */}
          <Text style={{
            fontSize: 11, fontWeight: "900", color: "#94A3B8",
            letterSpacing: 1.4, marginHorizontal: 16,
            marginBottom: 10, marginTop: 6,
          }}></Text>

          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              justifyContent: "flex-start",
              paddingHorizontal: 20,
              paddingLeft: 30,
              marginBottom: 10,
              columnGap: 12,
              rowGap: 8,
            }}
          >

            {/* Boarding QR */}
            {userRole === "student" && (
              <View style={{ width: "46%", position: "relative" }}>
                <TouchableOpacity
                  style={[styles.sqBtn, { alignItems: "flex-start" }]}
                  onPress={() => setIsBoardingQRModalOpen(true)}
                  activeOpacity={0.75}
                >
                  {/* Icon bg */}
                  <View style={{ width: 48, height: 48, borderRadius: 15, backgroundColor: ACTION_THEMES.qr.bg, alignItems: "center", justifyContent: "center" }}>
                    <QrCode size={24} color={ACTION_THEMES.qr.fg} strokeWidth={2.2} />
                  </View>
                  {/* Label */}
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "flex-end",
                      justifyContent: "space-between",
                      width: "100%",
                      marginTop: 8,
                    }}
                  >
                    <Text style={styles.sqBtnText}>
                      Boarding{"\n"}QR Code
                    </Text>

                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        backgroundColor: ACTION_THEMES.qr.bg,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <ChevronRight
                        size={17}
                        color={ACTION_THEMES.qr.fg}
                        strokeWidth={2.5}
                      />
                    </View>
                  </View>
                </TouchableOpacity>
              </View>
            )}

            {/* Travel History */}
            {!isHoD && (
              <View style={{ width: "46%", position: "relative" }}>
                <TouchableOpacity
                  style={[styles.sqBtn, { alignItems: "flex-start" }]}
                  onPress={() => { setShowHistoryModal(true); fetchTravelHistory(); }}
                  activeOpacity={0.75}
                >
                  <View style={{ width: 48, height: 48, borderRadius: 15, backgroundColor: ACTION_THEMES.history.bg, alignItems: "center", justifyContent: "center" }}>
                    <History size={24} color={ACTION_THEMES.history.fg} strokeWidth={2.2} />
                  </View>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "flex-end",
                      justifyContent: "space-between",
                      width: "100%",
                      marginTop: 8,
                    }}
                  >
                    <Text style={styles.sqBtnText}>
                      Travel{"\n"}History
                    </Text>

                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        backgroundColor: ACTION_THEMES.history.bg,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <ChevronRight
                        size={17}
                        color={ACTION_THEMES.history.fg}
                        strokeWidth={2.5}
                      />
                    </View>
                  </View>
                </TouchableOpacity>
              </View>
            )}

            {/* Live Bus Tracking */}
            {!isHoD && (
              <View style={{ width: "46%", position: "relative" }}>
                <TouchableOpacity
                  style={[styles.sqBtn, { alignItems: "flex-start", opacity: inTransit ? 1 : 0.88 }]}
                  onPress={viewLiveLocation}
                  activeOpacity={0.75}
                >
                  <View style={{ width: 48, height: 48, borderRadius: 15, backgroundColor: ACTION_THEMES.tracking.bg, alignItems: "center", justifyContent: "center" }}>
                    <MapPin size={24} color={ACTION_THEMES.tracking.fg} strokeWidth={2.2} />
                  </View>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "flex-end",
                      justifyContent: "space-between",
                      width: "100%",
                      marginTop: 8,
                    }}
                  >
                    <Text style={styles.sqBtnText}>
                      Live Bus{"\n"}Tracking
                    </Text>

                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        backgroundColor: ACTION_THEMES.tracking.bg,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <ChevronRight
                        size={17}
                        color={ACTION_THEMES.tracking.fg}
                        strokeWidth={2.5}
                      />
                    </View>
                  </View>
                </TouchableOpacity>
              </View>
            )}

            {/* Route Alerts */}
            {!isHoD && (
              <View style={{ width: "46%", position: "relative" }}>
                <TouchableOpacity
                  style={[styles.sqBtn, {
                    alignItems: "flex-start",
                    borderColor: unreadAlerts > 0 ? "#FCA5A5" : "#F1F5F9",
                    backgroundColor: unreadAlerts > 0 ? "#FEF2F2" : "#FFF",
                  }]}
                  onPress={() => {
                    setShowRouteAlertsModal(true);
                    setUnreadAlerts(0);
                    const unreadOnes = routeAlerts.filter((a) => !a.isRead && !String(a.id).startsWith("demo-"));
                    unreadOnes.forEach((alert) => {
                      fetch(`${API_BASE}/api/notifications/${alert.id}/read`, { method: "PUT", headers: authHeaders })
                        .catch((err) => console.log("mark read error:", err));
                    });
                    setRouteAlerts((prev) => prev.map((a) => ({ ...a, isRead: true })));
                  }}
                  activeOpacity={0.75}
                >
                  <View style={{ width: 48, height: 48, borderRadius: 15, backgroundColor: ACTION_THEMES.alerts.bg, alignItems: "center", justifyContent: "center" }}>
                    <Bell size={24} color={ACTION_THEMES.alerts.fg} strokeWidth={2.2} />
                  </View>
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "flex-end",
                      justifyContent: "space-between",
                      width: "100%",
                      marginTop: 8,
                    }}
                  >
                    <Text
                      style={[
                        styles.sqBtnText,
                        {
                          textAlign: "left",
                          color: unreadAlerts > 0 ? "#DC2626" : "#475569",
                        },
                      ]}
                    >
                      Route{"\n"}Alerts
                    </Text>

                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        backgroundColor: ACTION_THEMES.alerts.bg,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <ChevronRight
                        size={17}
                        color={ACTION_THEMES.alerts.fg}
                        strokeWidth={2.5}
                      />
                    </View>
                  </View>
                </TouchableOpacity>
                {unreadAlerts > 0 && (
                  <View style={{ position: "absolute", top: 8, right: 8, backgroundColor: "#EF4444", borderRadius: 10, minWidth: 20, height: 20, alignItems: "center", justifyContent: "center", paddingHorizontal: 4, elevation: 4 }}>
                    <Text style={{ color: "#fff", fontSize: 10, fontWeight: "900" }}>{unreadAlerts > 9 ? "9+" : unreadAlerts}</Text>
                  </View>
                )}
              </View>
            )}
          </View>

          {/* ── YOUR ASSIGNED BUS Card ── (student only) */}
          {!isHoD && userRole === "student" && user?.vehicle && user?.route && (
            <View
              style={{
                backgroundColor: "#1E40AF",
                borderRadius: 22,
                padding: 20,
                marginHorizontal: 16,
                marginBottom: 14,
                overflow: "hidden",
                elevation: 6,
                shadowColor: "#1E40AF",
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.35,
                shadowRadius: 12,
              }}
            >
              {/* Top row: info + badge */}
              <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
                <View style={{ flex: 1, zIndex: 2 }}>
                  {/* Label */}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
                    <Bus size={10} color="#93C5FD" strokeWidth={2.4} />
                    <Text style={{ fontSize: 10, fontWeight: "900", color: "#93C5FD", letterSpacing: 1.2 }}>YOUR ASSIGNED BUS</Text>
                  </View>
                  {/* Bus number */}
                  <Text style={{ fontSize: 22, fontWeight: "900", color: "#FFFFFF", letterSpacing: 0.5 }} numberOfLines={1}>
                    {/* {user?.vehicle} */}
                    {currentVehicleNumber || user?.vehicle || "Not Assigned"}
                  </Text>
                  {/* Route */}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 }}>
                    <MapPin size={11} color="#93C5FD" strokeWidth={2.4} />
                    <Text style={{ fontSize: 13, fontWeight: "700", color: "#BFDBFE" }} numberOfLines={1}>
                      {user?.route}
                    </Text>
                  </View>
                  {/* Driver */}
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 }}>
                    <User size={11} color="#BFDBFE" strokeWidth={2.2} />
                    <Text style={{ fontSize: 12, fontWeight: "600", color: "#DBEAFE" }}>Driver: {getDriverForVehicle(currentVehicleNumber) || "—"}</Text>
                  </View>
                </View>
                {/* ON ROUTE pill */}
                <View style={{ backgroundColor: "#10B981", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, zIndex: 2, alignSelf: "flex-start" }}>
                  <Text style={{ fontSize: 10, fontWeight: "900", color: "#FFFFFF", letterSpacing: 0.5 }}>ON ROUTE</Text>
                </View>
              </View>
              {/* Watermark bus */}
              <View style={{ position: "absolute", right: -8, bottom: -12, opacity: 0.12, zIndex: 1 }}>
                <Bus size={90} color="#FFFFFF" strokeWidth={1.2} />
              </View>
            </View>
          )}

          {/* ── LIVE TRANSIT MONITOR Card ── (student only) */}
          {!isHoD && userRole === "student" && user?.vehicle && user?.route && (
            <View
              style={{
                backgroundColor: "#FFFFFF",
                borderRadius: 22,
                padding: 18,
                marginHorizontal: 16,
                marginBottom: 14,
                borderWidth: 2,
                borderColor: STAGE_META[boardStatus].color,
                elevation: 3,
                shadowColor: STAGE_META[boardStatus].color,
                shadowOpacity: 0.15,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 4 },
              }}
            >
              {(() => {
                const meta = STAGE_META[boardStatus];
                const StageIcon = meta.Icon;
                return (
                  <>
                    {/* Header row */}
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      {/* Stage icon bg */}
                      <View style={{
                        width: 52, height: 52, borderRadius: 16,
                        backgroundColor: meta.color + "18",
                        alignItems: "center", justifyContent: "center", marginRight: 14,
                        borderWidth: 1.5, borderColor: meta.color + "30",
                      }}>
                        <StageIcon size={24} color={meta.color} strokeWidth={2.2} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 9, fontWeight: "900", color: meta.color, letterSpacing: 1.5, marginBottom: 3 }}>
                          LIVE TRANSIT MONITOR
                        </Text>
                        <Text style={{ fontSize: 14, fontWeight: "900", color: meta.color, lineHeight: 19 }}>
                          {meta.label}
                        </Text>
                      </View>
                      {/* Animated status dot */}
                      <View style={{ alignItems: "center", gap: 3 }}>
                        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: meta.color }} />
                        <Text style={{ fontSize: 7, fontWeight: "800", color: meta.color, letterSpacing: 0.5 }}>LIVE</Text>
                      </View>
                    </View>
                    {/* Reminder bar */}
                    <View style={{
                      backgroundColor: "#FEF2F2", borderRadius: 10, paddingVertical: 10,
                      paddingHorizontal: 12, marginTop: 14,
                      borderLeftWidth: 3, borderLeftColor: "#EF4444",
                      flexDirection: "row", alignItems: "center", gap: 8,
                    }}>
                      <AlertTriangle size={13} color="#EF4444" strokeWidth={2.4} />
                      <Text style={{ fontSize: 11, fontWeight: "700", color: "#DC2626", flex: 1 }}>
                        Scan QR before{" "}
                        <Text style={{ fontWeight: "900" }}>Entry & Drop</Text>
                      </Text>
                    </View>
                  </>
                );
              })()}
            </View>
          )}

          {/* ── ROUTE PROGRESS TRACKING Card ── (student only) */}
          {!isHoD && userRole === "student" && user?.vehicle && user?.route && (
            <View
              style={{
                backgroundColor: "#FFFFFF",
                borderRadius: 22,
                paddingTop: 18,
                paddingBottom: 24,
                paddingHorizontal: 20,
                marginHorizontal: 16,
                marginBottom: 16,
                borderWidth: 1,
                borderColor: "#F1F5F9",
                elevation: 3,
                shadowColor: "#0F172A",
                shadowOpacity: 0.05,
                shadowRadius: 8,
                shadowOffset: { width: 0, height: 2 },
              }}
            >
              {/* Title */}
              <Text style={{ fontSize: 11, fontWeight: "900", color: "#94A3B8", letterSpacing: 1.2, marginBottom: 24 }}>
                ROUTE PROGRESS — {isMorningLeg ? "MORNING" : "EVENING"} LEG
              </Text>

              {(() => {
                const legStops = isMorningLeg
                  ? [
                    { key: STAGE.PICKUP, label: "PICKUP", Icon: Bus },
                    { key: STAGE.TO_COLLEGE, label: "IN-ROUTE", Icon: Navigation },
                    { key: STAGE.AT_COLLEGE, label: "COLLEGE", Icon: Landmark },
                  ]
                  : [
                    { key: STAGE.AT_COLLEGE, label: "COLLEGE", Icon: Landmark },
                    { key: STAGE.TO_HOME, label: "IN-ROUTE", Icon: Navigation },
                    { key: STAGE.AT_HOME, label: "HOME", Icon: Home },
                  ];

                const stepIndex = legStops.findIndex((s) => s.key === boardStatus);
                const activeIdx = stepIndex === -1 ? 0 : stepIndex;
                const activeColor = STAGE_META[boardStatus].color;

                /* Track width: "0%", "50%", "100%" */
                const trackFill = activeIdx === 0 ? "0%" : activeIdx === 1 ? "50%" : "100%";

                return (
                  <View style={{ position: "relative" }}>
                    {/* Grey base track */}
                    <View style={{
                      position: "absolute", top: 21, left: 21, right: 21,
                      height: 4, backgroundColor: "#E2E8F0", borderRadius: 2,
                    }} />
                    {/* Colored fill track */}
                    <View style={{
                      position: "absolute", top: 21, left: 21,
                      width: trackFill, height: 4,
                      backgroundColor: activeColor, borderRadius: 2,
                    }} />

                    {/* Stop nodes */}
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      {legStops.map((stop, i) => {
                        const done = i <= activeIdx;
                        const StatusText = i < activeIdx ? "Done" : i === activeIdx ? "Active" : "Next";
                        const StopIconComp = stop.Icon;
                        return (
                          <View key={stop.key} style={{ alignItems: "center", flex: 1 }}>
                            {/* Circle icon */}
                            <View style={{
                              width: 44, height: 44, borderRadius: 22,
                              backgroundColor: done ? activeColor : "#F1F5F9",
                              alignItems: "center", justifyContent: "center",
                              borderWidth: done ? 0 : 2,
                              borderColor: "#E2E8F0",
                              elevation: done ? 4 : 1,
                              shadowColor: done ? activeColor : "#000",
                              shadowOpacity: done ? 0.25 : 0.04,
                              shadowRadius: done ? 6 : 2,
                              shadowOffset: { width: 0, height: done ? 3 : 1 },
                            }}>
                              <StopIconComp size={18} color={done ? "#FFF" : "#CBD5E1"} strokeWidth={2.2} />
                            </View>
                            {/* Label */}
                            <Text style={{
                              fontSize: 10, fontWeight: "900", marginTop: 8,
                              color: done ? "#1E293B" : "#94A3B8",
                            }}>{stop.label}</Text>
                            {/* Sub status */}
                            <View style={{
                              marginTop: 3, paddingHorizontal: 6, paddingVertical: 2,
                              borderRadius: 6,
                              backgroundColor: i === activeIdx ? activeColor + "18" : "transparent",
                            }}>
                              <Text style={{
                                fontSize: 8, fontWeight: "800",
                                color: i === activeIdx ? activeColor : "#CBD5E1",
                              }}>{StatusText}</Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                );
              })()}
            </View>
          )}

          {/* ══════════════════════════════════════════════════════════
               PARENT VIEW — CHILD TRANSIT CARDS
               Visible only when userRole === "parent" and a linked
               student with an assigned bus is found.
          ══════════════════════════════════════════════════════════ */}
          {/* {userRole === "parent" && childProfile?.vehicle && childProfile?.route && (() => { */}
          {userRole === "parent" && childProfile?.id && (() => {
            const childMeta = STAGE_META[childBoardStatus];
            const ChildStageIcon = childMeta.Icon;
            const childIsMorning = childBoardStatus === STAGE.PICKUP || childBoardStatus === STAGE.TO_COLLEGE;
            const childLegStops = childIsMorning
              ? [
                { key: STAGE.PICKUP, label: "PICKUP", Icon: Bus },
                { key: STAGE.TO_COLLEGE, label: "IN-ROUTE", Icon: Navigation },
                { key: STAGE.AT_COLLEGE, label: "COLLEGE", Icon: Landmark },
              ]
              : [
                { key: STAGE.AT_COLLEGE, label: "COLLEGE", Icon: Landmark },
                { key: STAGE.TO_HOME, label: "IN-ROUTE", Icon: Navigation },
                { key: STAGE.AT_HOME, label: "HOME", Icon: Home },
              ];
            const childActiveIdx = Math.max(0, childLegStops.findIndex((s) => s.key === childBoardStatus));
            const childTrackFill = childActiveIdx === 0 ? "0%" : childActiveIdx === 1 ? "50%" : "100%";
            const childActiveColor = childMeta.color;

            return (
              <>
                {/* ── Child Assigned Bus Card ── */}
                <View
                  style={{
                    backgroundColor: "#1E40AF",
                    borderRadius: 22,
                    padding: 20,
                    marginHorizontal: 16,
                    marginBottom: 14,
                    overflow: "hidden",
                    elevation: 6,
                    shadowColor: "#1E40AF",
                    shadowOffset: { width: 0, height: 8 },
                    shadowOpacity: 0.35,
                    shadowRadius: 12,
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
                    <View style={{ flex: 1, zIndex: 2 }}>
                      {/* Label with child icon */}
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
                        <Bus size={10} color="#93C5FD" strokeWidth={2.4} />
                        <Text style={{ fontSize: 10, fontWeight: "900", color: "#93C5FD", letterSpacing: 1.2 }}>CHILD'S ASSIGNED BUS</Text>
                      </View>
                      {/* Bus number */}
                      <Text style={{ fontSize: 22, fontWeight: "900", color: "#FFFFFF", letterSpacing: 0.5 }} numberOfLines={1}>
                        {childProfile.vehicle}
                        {/* {user?.vehicle} */}
                      </Text>
                      {/* Route */}
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 }}>
                        <MapPin size={11} color="#93C5FD" strokeWidth={2.4} />
                        <Text style={{ fontSize: 13, fontWeight: "700", color: "#BFDBFE" }} numberOfLines={1}>
                          {childProfile.route}
                        </Text>
                      </View>
                      {/* Driver */}
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 }}>
                        <User size={11} color="#BFDBFE" strokeWidth={2.2} />
                        <Text style={{ fontSize: 12, fontWeight: "600", color: "#DBEAFE" }}>
                          Driver: {childProfile.driverName || "—"}
                        </Text>
                      </View>
                      {childProfile.pickupTime && (
                        <Text style={{ fontSize: 11, fontWeight: "600", color: "#DBEAFE", marginTop: 2, marginLeft: 16 }}>
                          Dep. {childProfile.pickupTime}
                        </Text>
                      )}
                      {/* Child name tag */}
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 8 }}>
                        <User size={10} color="#60A5FA" strokeWidth={2} />
                        <Text style={{ fontSize: 11, fontWeight: "700", color: "#93C5FD" }}>
                          Child: {childProfile.name}
                        </Text>
                      </View>
                    </View>
                    {/* Status pill */}
                    <View style={{
                      backgroundColor: childInTransit ? "#10B981" : "#F59E0B",
                      paddingHorizontal: 12, paddingVertical: 6,
                      borderRadius: 20, zIndex: 2, alignSelf: "flex-start",
                    }}>
                      <Text style={{ fontSize: 10, fontWeight: "900", color: "#FFFFFF", letterSpacing: 0.5 }}>
                        {childInTransit ? "ON ROUTE" : "IDLE"}
                      </Text>
                    </View>
                  </View>
                  {/* Watermark */}
                  <View style={{ position: "absolute", right: -8, bottom: -12, opacity: 0.12, zIndex: 1 }}>
                    <Bus size={90} color="#FFFFFF" strokeWidth={1.2} />
                  </View>
                </View>

                {/* ── Live Child Transit Monitor Card ── */}
                <View
                  style={{
                    backgroundColor: "#FFFFFF",
                    borderRadius: 22,
                    padding: 18,
                    marginHorizontal: 16,
                    marginBottom: 14,
                    borderWidth: 2,
                    borderColor: childActiveColor,
                    elevation: 3,
                    shadowColor: childActiveColor,
                    shadowOpacity: 0.15,
                    shadowRadius: 8,
                    shadowOffset: { width: 0, height: 4 },
                  }}
                >
                  {/* Header row */}
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <View style={{
                      width: 52, height: 52, borderRadius: 16,
                      backgroundColor: childActiveColor + "18",
                      alignItems: "center", justifyContent: "center", marginRight: 14,
                      borderWidth: 1.5, borderColor: childActiveColor + "30",
                    }}>
                      <ChildStageIcon size={24} color={childActiveColor} strokeWidth={2.2} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 9, fontWeight: "900", color: childActiveColor, letterSpacing: 1.5, marginBottom: 2 }}>
                        LIVE CHILD TRANSIT MONITOR
                      </Text>
                      <Text style={{ fontSize: 14, fontWeight: "900", color: childActiveColor, lineHeight: 19 }}>
                        {childMeta.label}
                      </Text>
                    </View>
                    {/* Live dot */}
                    <View style={{ alignItems: "center", gap: 3 }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: childActiveColor }} />
                      <Text style={{ fontSize: 7, fontWeight: "800", color: childActiveColor, letterSpacing: 0.5 }}>LIVE</Text>
                    </View>
                  </View>

                  {/* Child name strip */}
                  <View style={{
                    flexDirection: "row", alignItems: "center", gap: 8,
                    backgroundColor: childActiveColor + "10",
                    borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12,
                    marginTop: 14,
                  }}>
                    <User size={13} color={childActiveColor} strokeWidth={2.2} />
                    <Text style={{ fontSize: 12, fontWeight: "800", color: childActiveColor }}>
                      Child: {childProfile.name}
                    </Text>
                  </View>

                  {/* Route progress tracker */}
                  <View style={{ marginTop: 18, position: "relative" }}>
                    {/* Grey track */}
                    <View style={{ position: "absolute", top: 21, left: 21, right: 21, height: 4, backgroundColor: "#E2E8F0", borderRadius: 2 }} />
                    {/* Colored fill */}
                    <View style={{ position: "absolute", top: 21, left: 21, width: childTrackFill, height: 4, backgroundColor: childActiveColor, borderRadius: 2 }} />
                    {/* Stops */}
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      {childLegStops.map((stop, i) => {
                        const done = i <= childActiveIdx;
                        const StatusText = i < childActiveIdx ? "Done" : i === childActiveIdx ? "Active" : "Next";
                        const StopIconComp = stop.Icon;
                        return (
                          <View key={stop.key} style={{ alignItems: "center", flex: 1 }}>
                            <View style={{
                              width: 44, height: 44, borderRadius: 22,
                              backgroundColor: done ? childActiveColor : "#F1F5F9",
                              alignItems: "center", justifyContent: "center",
                              borderWidth: done ? 0 : 2,
                              borderColor: "#E2E8F0",
                              elevation: done ? 4 : 1,
                              shadowColor: done ? childActiveColor : "#000",
                              shadowOpacity: done ? 0.25 : 0.04,
                              shadowRadius: done ? 6 : 2,
                              shadowOffset: { width: 0, height: done ? 3 : 1 },
                            }}>
                              <StopIconComp size={18} color={done ? "#FFF" : "#CBD5E1"} strokeWidth={2.2} />
                            </View>
                            <Text style={{ fontSize: 10, fontWeight: "900", marginTop: 8, color: done ? "#1E293B" : "#94A3B8" }}>
                              {stop.label}
                            </Text>
                            <View style={{
                              marginTop: 3, paddingHorizontal: 6, paddingVertical: 2,
                              borderRadius: 6,
                              backgroundColor: i === childActiveIdx ? childActiveColor + "18" : "transparent",
                            }}>
                              <Text style={{ fontSize: 8, fontWeight: "800", color: i === childActiveIdx ? childActiveColor : "#CBD5E1" }}>
                                {StatusText}
                              </Text>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  </View>

                  {/* Trip direction footer */}
                  <View style={{
                    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
                    marginTop: 16, paddingTop: 12,
                    borderTopWidth: 1, borderTopColor: "#F1F5F9",
                  }}>
                    <Text style={{ fontSize: 10, fontWeight: "700", color: "#94A3B8", letterSpacing: 0.5 }}>
                      TRIP: {childIsMorning ? "TO COLLEGE" : "TO HOME"}
                    </Text>
                    <View style={{
                      backgroundColor: childInTransit ? "#10B981" : "#EF4444",
                      paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
                    }}>
                      <Text style={{ fontSize: 9, fontWeight: "900", color: "#FFF" }}>
                        {childInTransit ? "ON BUS" : "NOT BOARDED"}
                      </Text>
                    </View>
                  </View>
                </View>
              </>
            );
          })()}

          {/* Map Modal */}
          <Modal
            visible={showRouteModal}
            animationType="slide"
            onRequestClose={() => setShowRouteModal(false)}
          >
            <View style={styles.modalContainer}>
              <Text style={styles.modalTitle}>Bus Route Map</Text>
              <Image
                source={{
                  uri: "https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&q=80&w=800",
                }}
                style={styles.mapImage}
                resizeMode="cover"
              />
              <View style={styles.routeDetails}>
                <Text style={styles.routeText}>
                  <Text style={{ fontWeight: "bold" }}>Route Number:</Text> R1
                </Text>
                <Text style={styles.routeText}>
                  <Text style={{ fontWeight: "bold" }}>Starting Point:</Text> Main
                  Campus
                </Text>
                <Text style={styles.routeText}>
                  <Text style={{ fontWeight: "bold" }}>Destination:</Text> Downtown
                  Central
                </Text>
              </View>
              <TouchableOpacity
                style={styles.btnClose}
                onPress={() => setShowRouteModal(false)}
              >
                <Text style={styles.btnText}>Close Map</Text>
              </TouchableOpacity>
            </View>
          </Modal>

          {/* Settings Modal */}
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
                    GPS Tracking Status
                  </Text>
                  <TouchableOpacity
                    style={[
                      styles.btnPrimary,
                      {
                        backgroundColor: gpsEnabled ? "#10B981" : "#EF4444",
                        borderWidth: 0,
                        marginBottom: 5,
                      },
                    ]}
                    onPress={() => setGpsEnabled(!gpsEnabled)}
                  >
                    <Text style={styles.btnText}>
                      {gpsEnabled ? "GPS ACCESS: PROVIDED" : "GPS ACCESS: DECLINED"}
                    </Text>
                  </TouchableOpacity>
                  <Text
                    style={{ fontSize: 10, color: "#9CA3AF", textAlign: "center" }}
                  >
                    Manually control whether your location is used for live bus
                    tracking.
                  </Text>
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
                  style={{
                    marginTop: 10,
                    padding: 15,
                    width: "100%",
                    alignItems: "center",
                  }}
                  onPress={() => setIsSettingsModalOpen(false)}
                >
                  <Text style={{ color: "#2563EB", fontWeight: "800" }}>
                    Close Settings
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          {/* Route Alert Notification History Modal */}
          <Modal visible={showRouteAlertsModal} animationType="slide">
            <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
              <View
                style={{
                  backgroundColor: "#DC2626",
                  padding: 10,
                  paddingTop: 40,
                  minHeight: 60,
                  justifyContent: "space-between",
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 16,
                }}
              >
                <View
                  style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
                >
                  <Bell size={20} color="#FFFFFF" strokeWidth={2.2} />
                  <Text style={{ color: "white", fontSize: 16, fontWeight: "900" }}>
                    Route Alerts
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setShowRouteAlertsModal(false)}>
                  <Text
                    style={{
                      color: "rgba(255,255,255,0.8)",
                      fontWeight: "800",
                      fontSize: 12,
                    }}
                  >
                    CLOSE
                  </Text>
                </TouchableOpacity>
              </View>

              <ScrollView style={{ flex: 1, padding: 16 }}>
                {routeAlerts.length === 0 ? (
                  <View
                    style={{
                      flex: 1,
                      alignItems: "center",
                      justifyContent: "center",
                      paddingTop: 80,
                    }}
                  >
                    <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
                      <BellOff size={32} color="#94A3B8" strokeWidth={1.8} />
                    </View>
                    <Text
                      style={{ fontWeight: "800", color: "#6B7280", fontSize: 15 }}
                    >
                      No alerts for your route
                    </Text>
                    <Text
                      style={{
                        color: "#9CA3AF",
                        fontSize: 13,
                        marginTop: 6,
                        textAlign: "center",
                      }}
                    >
                      When admin sends a route alert, it will{"\n"}appear here instantly
                    </Text>
                  </View>
                ) : (
                  <>
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: "700",
                        color: "#9CA3AF",
                        letterSpacing: 1,
                        marginBottom: 14,
                        textTransform: "uppercase",
                      }}
                    >
                      {routeAlerts.length} Alert
                      {routeAlerts.length !== 1 ? "s" : ""} — Most Recent First
                    </Text>
                    {routeAlerts.map((alert, idx) => {
                      const typeMap = {
                        RouteDelayed: {
                          Icon: Clock,
                          label: "Route Delayed",
                          bgColor: "#FFFBEB",
                          leftColor: "#D97706",
                          tagBg: "#FEF3C7",
                          tagText: "#92400E",
                        },
                        RouteCancelled: {
                          Icon: XCircle,
                          label: "Route Cancelled",
                          bgColor: "#FEF2F2",
                          leftColor: "#DC2626",
                          tagBg: "#FEE2E2",
                          tagText: "#991B1B",
                        },
                        NewPath: {
                          Icon: Shuffle,
                          label: "New Path / Diversion",
                          bgColor: "#EFF6FF",
                          leftColor: "#2563EB",
                          tagBg: "#DBEAFE",
                          tagText: "#1D4ED8",
                        },
                        General: {
                          Icon: Megaphone,
                          label: "Notice",
                          bgColor: "#EFF6FF",
                          leftColor: "#2563EB",
                          tagBg: "#DBEAFE",
                          tagText: "#1D4ED8",
                        },
                      };
                      const t = typeMap[alert.notificationType] || {
                        Icon: AlertCircle,
                        label: alert.notificationType,
                        bgColor: "#F9FAFB",
                        leftColor: "#6B7280",
                        tagBg: "#F3F4F6",
                        tagText: "#374151",
                      };
                      const dt = new Date(alert.receivedAt || alert.timestamp);
                      const isToday =
                        dt.toDateString() === new Date().toDateString();
                      const timeStr = dt.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      });
                      const dateStr = isToday
                        ? "Today"
                        : dt.toLocaleDateString([], {
                          day: "numeric",
                          month: "short",
                        });
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
                                  flexDirection: "row",
                                  alignItems: "center",
                                  gap: 8,
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
                                  <t.Icon size={13} color={t.tagText} strokeWidth={2.2} />
                                  <Text
                                    style={{
                                      fontWeight: "900",
                                      fontSize: 12,
                                      color: t.tagText,
                                    }}
                                  >
                                    {t.label}
                                  </Text>
                                </View>
                              </View>
                              <Text
                                style={{
                                  fontSize: 10,
                                  color: "#9CA3AF",
                                  fontWeight: "600",
                                }}
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
                              Effective: {alert.effectiveDate} at{" "}
                              {alert.effectiveTime}
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
                                  style={{
                                    fontSize: 13,
                                    color: "#374151",
                                    lineHeight: 20,
                                  }}
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
                                style={{
                                  fontSize: 10,
                                  color: "#059669",
                                  fontWeight: "700",
                                }}
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
                  </>
                )}
              </ScrollView>
            </SafeAreaView>
          </Modal>

          {/* Travel History Modal (Student / Parent) */}
          <Modal visible={showHistoryModal && !isHoD} animationType="slide">
            <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>

              {/* ── Header ── */}
              <View
                style={{
                  backgroundColor: "#2563EB",
                  padding: 16,
                  paddingTop: 40,
                  minHeight: 70,
                  justifyContent: "space-between",
                  flexDirection: "row",
                  alignItems: "center",
                }}
              >
                <View>
                  <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 10, fontWeight: "700", letterSpacing: 1 }}>
                    {userRole.toUpperCase()} · {userName}
                    {userRole === "parent" && (linkedStudentName || user?.studentName)
                      ? ` → ${linkedStudentName || user?.studentName}`
                      : ""}
                  </Text>
                  <Text style={{ color: "white", fontSize: 18, fontWeight: "900", marginTop: 2 }}>
                    Travel History
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setShowHistoryModal(false)}
                  style={{ backgroundColor: "rgba(255,255,255,0.2)", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8 }}
                >
                  <Text style={{ color: "#fff", fontWeight: "800", fontSize: 11 }}>CLOSE</Text>
                </TouchableOpacity>
              </View>

              <View style={{ padding: 10, flex: 1 }}>

                {/* ── Status Filter: ALL / BOARDED / MISSED ── */}
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
                    { l: "BOARDED", v: "BOARDED" },
                    { l: "MISSED", v: "MISSED" },
                  ].map((t) => (
                    <TouchableOpacity
                      key={t.v}
                      onPress={() => setStuStatusFilter(t.v)}
                      style={{
                        flex: 1,
                        padding: 5,
                        backgroundColor:
                          stuStatusFilter === t.v ? "white" : "transparent",
                        borderRadius: 6,
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 8,
                          fontWeight: "900",
                          color: stuStatusFilter === t.v ? "#2563EB" : "#64748B",
                        }}
                      >
                        {t.l}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* ── Time Filter W / M / Y ── */}
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    marginBottom: 10,
                  }}
                >
                  <View style={{ flexDirection: "row", gap: 4 }}>
                    {["W", "M", "Y"].map((t) => (
                      <TouchableOpacity
                        key={t}
                        onPress={() => setStuTimeFilter(t)}
                        style={{
                          width: 26,
                          height: 26,
                          borderRadius: 13,
                          borderWidth: 1,
                          borderColor: stuTimeFilter === t ? "#2563EB" : "#CBD5E1",
                          backgroundColor:
                            stuTimeFilter === t ? "#EFF6FF" : "white",
                          justifyContent: "center",
                          alignItems: "center",
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 9,
                            fontWeight: "900",
                            color: stuTimeFilter === t ? "#2563EB" : "#64748B",
                          }}
                        >
                          {t}
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
                      {stuTimeFilter === "W" ? "Last 7 days"
                        : stuTimeFilter === "M" ? "Last 30 days"
                          : "Last 12 months"}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={fetchTravelHistory}
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
                    const cutoffMs = stuTimeFilter === "W" ? 7 * dayMs
                      : stuTimeFilter === "M" ? 31 * dayMs
                        : 366 * dayMs;

                    // Determine "boarded" stages from the student attendance model
                    const boardedStages = ["TO_COLLEGE", "AT_COLLEGE", "TO_HOME", "AT_HOME"];

                    const filtered = travelHistory.filter((rec) => {
                      const recMs = new Date(rec.scannedAt).getTime();
                      const withinTime = (nowMs - recMs) <= cutoffMs;
                      const isBoarded = boardedStages.includes(rec.stage);
                      const matchStatus =
                        stuStatusFilter === "ALL" ||
                        (stuStatusFilter === "BOARDED" && isBoarded) ||
                        (stuStatusFilter === "MISSED" && !isBoarded);
                      return withinTime && matchStatus;
                    });

                    if (filtered.length === 0) {
                      return (
                        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 20 }}>
                          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: "#F1F5F9", alignItems: "center", justifyContent: "center", marginBottom: 12 }}>
                            <Inbox size={28} color="#94A3B8" strokeWidth={1.8} />
                          </View>
                          <Text style={{ fontWeight: "800", color: "#6B7280", fontSize: 13, textAlign: "center" }}>
                            No records found
                          </Text>
                          <Text style={{ color: "#9CA3AF", fontSize: 11, textAlign: "center", marginTop: 4 }}>
                            {travelHistory.length === 0
                              ? userRole === "parent"
                                ? "No travel records found for the linked student."
                                : "No travel history available yet."
                              : "Try a different filter or time range."}
                          </Text>
                        </View>
                      );
                    }

                    return (
                      <ScrollView>
                        {filtered.map((rec, i) => {
                          const stage = rec.stage || "";
                          const isBoarded = boardedStages.includes(stage);
                          const stageLabels = {
                            PICKUP: "Waiting Pickup",
                            TO_COLLEGE: "Transit → College",
                            AT_COLLEGE: "Arrived College",
                            TO_HOME: "Transit → Home",
                            AT_HOME: "Arrived Home",
                          };
                          const statusLabel = stageLabels[stage] || stage || "—";
                          const statusColor = isBoarded ? "#10B981" : "#EF4444";
                          const statusBg = isBoarded ? "#DCFCE7" : "#FEE2E2";
                          const vehicleLabel = rec.vehicleId || user?.vehicle || "—";
                          const routeLabel =
                            user?.route ||
                            user?.assignedRoute ||
                            (linkedStudentName ? `${vehicleLabel}` : vehicleLabel);
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
                                backgroundColor: isBoarded ? "#F0FDF4" : "white",
                              }}
                            >
                              <Text
                                style={{ flex: 1.5, fontSize: 9, fontWeight: "700", color: "#1E293B" }}
                                numberOfLines={2}
                              >
                                {routeLabel}
                              </Text>
                              <Text
                                style={{ flex: 1.4, fontSize: 8, fontWeight: "600", color: "#64748B" }}
                              >
                                {dateStr}{"\n"}{timeStr}
                              </Text>
                              <View style={{ flex: 0.7, alignItems: "flex-end" }}>
                                <Text
                                  style={{
                                    fontSize: 7,
                                    fontWeight: "900",
                                    color: statusColor,
                                    backgroundColor: statusBg,
                                    paddingHorizontal: 4,
                                    paddingVertical: 2,
                                    borderRadius: 4,
                                    overflow: "hidden",
                                    textAlign: "center",
                                  }}
                                  numberOfLines={2}
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

                {/* ── Bottom Actions ── */}
                <View style={{ marginTop: 14, flexDirection: "row", gap: 10 }}>
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      height: 48,
                      backgroundColor: "#2563EB",
                      borderRadius: 12,
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                      elevation: 2,
                    }}
                    onPress={() => {
                      Alert.alert("Generating PDF…", "Preparing your travel history…");
                      setTimeout(
                        () => Alert.alert("Export Success", "PDF Travel Report saved."),
                        1500,
                      );
                    }}
                  >
                    <FileText size={16} color="#fff" strokeWidth={2} style={{ marginRight: 6 }} />
                    <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>PDF Report</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={{
                      flex: 1,
                      height: 48,
                      backgroundColor: "#F1F5F9",
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: "#CBD5E1",
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                    onPress={() => setShowHistoryModal(false)}
                  >
                    <X size={16} color="#334155" strokeWidth={2.2} style={{ marginRight: 6 }} />
                    <Text style={{ color: "#334155", fontWeight: "700", fontSize: 13 }}>Close</Text>
                  </TouchableOpacity>
                </View>

              </View>
            </SafeAreaView>
          </Modal>

          {/* ================= CAMERA SCAN MODAL ================= */}
          <Modal
            visible={isBoardingQRModalOpen}
            animationType="slide"
            transparent={false}
            onRequestClose={() => setIsBoardingQRModalOpen(false)}
          >
            <SafeAreaView style={{ flex: 1, backgroundColor: "#000" }}>

              {!cameraPermission ? (
                <View
                  style={{
                    flex: 1,
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: "#fff" }}>
                    Checking camera permission...
                  </Text>
                </View>
              ) : !cameraPermission.granted ? (
                <View
                  style={{
                    flex: 1,
                    justifyContent: "center",
                    alignItems: "center",
                    padding: 20,
                  }}
                >
                  <Text
                    style={{
                      color: "#fff",
                      fontSize: 18,
                      marginBottom: 20,
                      textAlign: "center",
                    }}
                  >
                    Camera permission is required.
                  </Text>

                  <TouchableOpacity
                    style={{
                      backgroundColor: "#2563EB",
                      paddingHorizontal: 30,
                      paddingVertical: 14,
                      borderRadius: 10,
                    }}
                    onPress={requestCameraPermission}
                  >
                    <Text
                      style={{
                        color: "#fff",
                        fontWeight: "bold",
                      }}
                    >
                      Grant Camera Permission
                    </Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <CameraView
                  style={{ flex: 1 }}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                  onBarcodeScanned={scanEnabled && !scanned ? handleVehicleQRScanned : undefined}
                >
                  <View
                    style={{
                      flex: 1,
                      justifyContent: "space-between",
                      alignItems: "center",
                      paddingVertical: 35,
                      backgroundColor: "rgba(0,0,0,0.25)",
                    }}
                  >
                    {/* Title */}
                    <Text style={{ color: "#fff", fontSize: 22, fontWeight: "bold" }}>
                      Initial Scan (Start Work)
                    </Text>

                    {/* NEW: Feedback banner — shows verification / attendance result */}
                    {scanFeedback && (
                      <View
                        style={{
                          backgroundColor:
                            scanFeedback.type === "success" ? "rgba(16,185,129,0.95)"
                              : scanFeedback.type === "error" ? "rgba(239,68,68,0.95)"
                                : "rgba(245,158,11,0.95)", // pending
                          paddingHorizontal: 20,
                          paddingVertical: 14,
                          borderRadius: 14,
                          marginHorizontal: 24,
                          alignItems: "center",
                        }}
                      >
                        <Text style={{ color: "#fff", fontWeight: "900", fontSize: 15, textAlign: "center", lineHeight: 20 }}>
                          {scanFeedback.message}
                        </Text>
                      </View>
                    )}

                    {/* QR Frame */}
                    <View
                      style={{
                        width: 260,
                        height: 260,
                        borderRadius: 20,
                        borderWidth: 3,
                        borderColor:
                          scanFeedback?.type === "success" ? "#10B981"
                            : scanFeedback?.type === "error" ? "#EF4444"
                              : scanFeedback?.type === "pending" ? "#F59E0B"
                                : "#fff",
                      }}
                    />

                    {/* Instruction */}
                    <Text style={{ color: "#fff", fontSize: 17, fontWeight: "600" }}>
                      {scanFeedback ? " " : "Align QR within frame"}
                    </Text>

                    {/* Scan Button */}
                    <TouchableOpacity
                      onPress={() => {
                        setScanned(false);
                        setScanFeedback(null);
                        setScanEnabled(true);
                      }}
                      style={{
                        width: 85, height: 85, borderRadius: 42.5,
                        backgroundColor: "#fff", justifyContent: "center", alignItems: "center",
                        borderWidth: 4, borderColor: "#d1d5db",
                      }}
                    >
                      <View style={{ width: 65, height: 65, borderRadius: 32.5, backgroundColor: "#f3f4f6" }} />
                    </TouchableOpacity>

                    {/* NEW: Upload QR Image (web testing fallback) */}
                    {Platform.OS === "web" && (
                      <TouchableOpacity
                        onPress={pickQRFromLibrary}
                        style={{
                          marginTop: 4,
                          paddingHorizontal: 18,
                          paddingVertical: 10,
                          borderRadius: 10,
                          borderWidth: 1.5,
                          borderColor: "rgba(255,255,255,0.6)",
                        }}
                      >
                        <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                          <Upload size={14} color="#fff" strokeWidth={2} />
                          <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>Upload QR Image</Text>
                        </View>
                      </TouchableOpacity>
                    )}

                    {/* Cancel */}
                    <TouchableOpacity
                      onPress={() => {
                        setScanEnabled(false);
                        setScanned(false);
                        setScanFeedback(null);
                        setIsBoardingQRModalOpen(false);
                      }}
                    >
                      <Text style={{ color: "#fff", fontWeight: "bold", fontSize: 17, textDecorationLine: "underline" }}>
                        CANCEL
                      </Text>
                    </TouchableOpacity>
                  </View>
                </CameraView>
              )}

            </SafeAreaView>
          </Modal>

          {/* HoD Attendance History Modal */}
          <Modal visible={showHistoryModal && isHoD} animationType="slide">
            <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
              <View
                style={{
                  backgroundColor: "#7C3AED",
                  padding: 10,
                  paddingTop: 40,
                  minHeight: 60,
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    color: "rgba(255,255,255,0.7)",
                    fontSize: 9,
                    fontWeight: "800",
                    paddingLeft: 10,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                  }}
                >
                  HoD Analytics
                </Text>
                <Text
                  style={{
                    color: "white",
                    fontSize: 16,
                    fontWeight: "800",
                    paddingLeft: 10,
                  }}
                >
                  Attendance History
                </Text>
              </View>

              <ScrollView style={{ padding: 10, flex: 1 }}>
                <View style={{ flexDirection: "row", gap: 6, marginBottom: 10 }}>
                  {["W", "M", "Y"].map((t) => (
                    <TouchableOpacity
                      key={t}
                      onPress={() => setHodTimeFilter(t)}
                      style={{
                        width: 28,
                        height: 28,
                        borderRadius: 14,
                        borderWidth: 1.5,
                        borderColor: hodTimeFilter === t ? "#7C3AED" : "#CBD5E1",
                        backgroundColor: hodTimeFilter === t ? "#F5F3FF" : "white",
                        justifyContent: "center",
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: "900",
                          color: hodTimeFilter === t ? "#7C3AED" : "#64748B",
                        }}
                      >
                        {t}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* Stats */}
                <View style={{ flexDirection: "row", gap: 8, marginBottom: 12 }}>
                  <View style={[styles.hodStat, { borderColor: "#dcfce7" }]}>
                    <Text
                      style={[
                        styles.hodStatNum,
                        { color: "#10B981", fontSize: 18 },
                      ]}
                    >
                      94.9%
                    </Text>
                    <Text style={styles.hodStatLabel}>Avg Att.</Text>
                  </View>
                  <View style={[styles.hodStat, { borderColor: "#fecaca" }]}>
                    <Text
                      style={[
                        styles.hodStatNum,
                        { color: "#EF4444", fontSize: 18 },
                      ]}
                    >
                      38
                    </Text>
                    <Text style={styles.hodStatLabel}>Total Absent</Text>
                  </View>
                  <View style={[styles.hodStat, { borderColor: "#ddd6fe" }]}>
                    <Text
                      style={[
                        styles.hodStatNum,
                        { color: "#7C3AED", fontSize: 18 },
                      ]}
                    >
                      5
                    </Text>
                    <Text style={styles.hodStatLabel}>Days</Text>
                  </View>
                </View>

                {/* Day-wise Table */}
                <View
                  style={{
                    backgroundColor: "#F8FAFC",
                    padding: 8,
                    borderTopLeftRadius: 8,
                    borderTopRightRadius: 8,
                    borderBottomWidth: 1,
                    borderBottomColor: "#E2E8F0",
                  }}
                >
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    <BarChart2 size={12} color="#7C3AED" strokeWidth={2.2} />
                    <Text style={{ fontSize: 10, fontWeight: "900", color: "#475569" }}>
                      Day-Wise Absence Log
                    </Text>
                  </View>
                </View>
                <View
                  style={{
                    flexDirection: "row",
                    backgroundColor: "#FAF5FF",
                    padding: 6,
                    borderBottomWidth: 1,
                    borderBottomColor: "#E2E8F0",
                  }}
                >
                  <Text
                    style={{
                      flex: 1.5,
                      fontSize: 8,
                      fontWeight: "900",
                      color: "#7C3AED",
                    }}
                  >
                    Date
                  </Text>
                  <Text
                    style={{
                      flex: 0.8,
                      fontSize: 8,
                      fontWeight: "900",
                      color: "#10B981",
                      textAlign: "center",
                    }}
                  >
                    Present
                  </Text>
                  <Text
                    style={{
                      flex: 0.8,
                      fontSize: 8,
                      fontWeight: "900",
                      color: "#EF4444",
                      textAlign: "center",
                    }}
                  >
                    Absent
                  </Text>
                  <Text
                    style={{
                      flex: 0.6,
                      fontSize: 8,
                      fontWeight: "900",
                      color: "#64748B",
                      textAlign: "right",
                    }}
                  >
                    Rate
                  </Text>
                </View>
                <View
                  style={{
                    backgroundColor: "white",
                    borderBottomLeftRadius: 8,
                    borderBottomRightRadius: 8,
                    borderWidth: 1,
                    borderColor: "#E2E8F0",
                    marginBottom: 15,
                  }}
                >
                  {deptHistory.dayWise.map((row, i) => (
                    <View key={i} style={{ flexDirection: "row", padding: 6, borderBottomWidth: 1, borderBottomColor: "#F8FAFC" }}>
                      <Text style={{ flex: 1.5, fontSize: 9, fontWeight: "800", color: "#1E293B" }}>{row.label}</Text>
                      <Text style={{ flex: 0.8, fontSize: 10, fontWeight: "800", color: "#10B981", textAlign: "center" }}>{row.present}</Text>
                      <Text style={{ flex: 0.8, fontSize: 10, fontWeight: "800", color: "#EF4444", textAlign: "center" }}>{row.absent}</Text>
                      <Text style={{ flex: 0.6, fontSize: 9, fontWeight: "800", color: "#64748B", textAlign: "right" }}>{row.rate}</Text>
                    </View>
                  ))}
                </View>

                <TouchableOpacity
                  style={{
                    marginTop: 5,
                    backgroundColor: "white",
                    borderRadius: 12,
                    borderStyle: "dashed",
                    borderWidth: 1.5,
                    borderColor: "#DDD6FE",
                    padding: 10,
                    alignItems: "center",
                  }}
                  onPress={() =>
                    Alert.alert("Export", "Generating HoD Attendance Report PDF...")
                  }
                >
                  <Download size={16} color="#7C3AED" strokeWidth={2} style={{ marginBottom: 4 }} />
                  <Text
                    style={{ fontSize: 10, fontWeight: "900", color: "#7C3AED" }}
                  >
                    EXPORT ATTENDANCE REPORT
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={{
                    marginTop: 10,
                    marginBottom: 30,
                    backgroundColor: "#334155",
                    padding: 12,
                    borderRadius: 10,
                    alignItems: "center",
                  }}
                  onPress={() => setShowHistoryModal(false)}
                >
                  <Text style={{ color: "white", fontWeight: "800", fontSize: 13 }}>
                    Back to Dashboard
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            </SafeAreaView>
          </Modal>

          {/* HoD Absent Students Modal */}
          <Modal visible={showAbsentModal} animationType="slide">
            <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
              <View
                style={{
                  backgroundColor: "#7C3AED",
                  padding: 10,
                  paddingTop: 40,
                  minHeight: 60,
                  justifyContent: "center",
                }}
              >
                <Text
                  style={{
                    color: "rgba(255,255,255,0.7)",
                    fontSize: 9,
                    fontWeight: "800",
                    paddingLeft: 10,
                    textTransform: "uppercase",
                    letterSpacing: 1,
                  }}
                >
                  Department Report
                </Text>
                <Text
                  style={{
                    color: "white",
                    fontSize: 16,
                    fontWeight: "800",
                    paddingLeft: 10,
                  }}
                >
                  Students Absent on Bus
                </Text>
              </View>

              <ScrollView style={{ padding: 10, flex: 1 }}>
                {deptSummary.absentList.map((s, i) => (
                  <View key={s.id || i} style={{ flexDirection: "row", alignItems: "center", backgroundColor: "white", padding: 12, marginBottom: 6, borderRadius: 10, borderWidth: 1, borderColor: "#f1f5f9" }}>
                    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: "#FEF2F2", justifyContent: "center", alignItems: "center", marginRight: 10 }}>
                      <UserX size={15} color="#EF4444" strokeWidth={2.2} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 11, fontWeight: "800", color: "#1E293B" }}>
                        {s.name} <Text style={{ color: "#94A3AF", fontWeight: "600" }}>({s.rollNumber || "—"})</Text>
                      </Text>
                      <Text style={{ fontSize: 9, color: "#64748B", fontWeight: "600" }}>
                        {userDept} {s.year ? `• ${s.year}` : ""} • {s.route}
                      </Text>
                    </View>
                    <View style={{ backgroundColor: "#FEE2E2", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 4 }}>
                      <Text style={{ fontSize: 8, fontWeight: "800", color: "#B91C1C" }}>ABSENT</Text>
                    </View>
                  </View>
                ))}

                <Text style={[styles.hodStatNum, { color: "#10B981", fontSize: 18 }]}>{deptHistory.avgAttendanceRate}</Text>
                ...
                <Text style={[styles.hodStatNum, { color: "#EF4444", fontSize: 18 }]}>{deptHistory.totalAbsent}</Text>
                ...
                <Text style={[styles.hodStatNum, { color: "#7C3AED", fontSize: 18 }]}>{deptHistory.daysTracked}</Text>

                <TouchableOpacity
                  style={{
                    marginTop: 15,
                    marginBottom: 30,
                    backgroundColor: "#334155",
                    padding: 12,
                    borderRadius: 10,
                    alignItems: "center",
                  }}
                  onPress={() => setShowAbsentModal(false)}
                >
                  <Text style={{ color: "white", fontWeight: "800", fontSize: 13 }}>
                    Back to Dashboard
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            </SafeAreaView>
          </Modal>

          <StatusBar style="auto" />
        </ScrollView>
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
                <View style={avatarStyles.heroCard}>
                  <ProfileAvatar user={user} />
                  <Text style={avatarStyles.heroName}>{user?.name || "—"}</Text>
                  <Text style={avatarStyles.heroRole}>{user?.role ? `${user.role.toUpperCase()} ACCOUNT` : "ACCOUNT"}</Text>

                </View>

                {/* Personal Details Card */}
                <View style={profileStyles.card}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 14 }}>
                    <User size={14} color="#2563EB" strokeWidth={2.2} />
                    <Text style={[profileStyles.cardTitle, { marginBottom: 0 }]}>PERSONAL DETAILS</Text>
                  </View>
                  <View style={profileStyles.row}>
                    <View style={profileStyles.col}>
                      <Text style={profileStyles.label}>ROLL NUMBER</Text>
                      <Text style={profileStyles.value}>
                        {user?.rollNumber || user?.id?.slice(0, 8).toUpperCase() || "—"}
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
                        {userDept
                          ? `${userDept}${user?.year ? ` (${user.year})` : ""}`
                          : "—"}
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

                {/* Transit Subscription Card */}
                <View style={profileStyles.card}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 14 }}>
                    <Bus size={14} color="#2563EB" strokeWidth={2.2} />
                    <Text style={[profileStyles.cardTitle, { marginBottom: 0 }]}>TRANSIT SUBSCRIPTION</Text>
                  </View>
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
                      <Text style={profileStyles.label}>ROUTE / BUS NO.</Text>
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
                          ACTIVE VALIDITY
                        </Text>
                      </View>
                    </View>
                    <Text style={profileStyles.value}>
                      {user?.route || "Route 7 (Theni - Campus)"}
                    </Text>
                  </View>
                  <View style={profileStyles.row}>
                    <View style={profileStyles.col}>
                      <Text style={profileStyles.label}>PICKUP POINT</Text>
                      <Text style={profileStyles.value}>
                        {user?.pickupPoint || "—"}
                      </Text>
                    </View>
                    <View style={profileStyles.col}>
                      <Text style={profileStyles.label}>EST. TIME</Text>
                      <Text style={profileStyles.value}>{user?.pickupTime || "—"}</Text>
                    </View>
                  </View>
                </View>

                {/* Emergency / Parent Contact Card */}
                <View style={profileStyles.card}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 14 }}>
                    <Phone size={14} color="#2563EB" strokeWidth={2.2} />
                    <Text style={[profileStyles.cardTitle, { marginBottom: 0 }]}>EMERGENCY / PARENT CONTACT</Text>
                  </View>
                  <View style={profileStyles.row}>
                    <View style={profileStyles.col}>
                      <Text style={profileStyles.label}>FATHER NAME</Text>
                      <Text style={profileStyles.value}>{user?.fatherName || "—"}</Text>
                    </View>
                    <View style={profileStyles.col}>
                      <Text style={profileStyles.label}>CONTACT NO.</Text>
                      <Text style={profileStyles.value}>
                        {user?.fatherContact || "—"}
                      </Text>
                    </View>
                  </View>
                  <View style={[profileStyles.row, { marginTop: 14 }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={profileStyles.label}>MOTHER NAME & CONTACT</Text>
                      <Text style={profileStyles.value}>
                        {user?.motherName || "—"}
                        {user?.motherContact ? ` (${user.motherContact})` : ""}
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
      </View>

      {!isHoD && (
        <LiveBusTrackingModal
          visible={showLiveMapModal}
          onClose={() => setShowLiveMapModal(false)}
          user={user}
          token={token}
          socketRef={socketRef}
          userRole={userRole}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F3F4F6",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: "bold",
    marginBottom: 40,
    color: "#111827",
    textAlign: "center",
  },
  btnPrimary: {
    backgroundColor: "#2563EB",
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 8,
    width: "100%",
    marginBottom: 15,
    alignItems: "center",
  },
  btnScan: {
    backgroundColor: "#10B981",
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 8,
    width: "100%",
    marginBottom: 15,
    alignItems: "center",
  },
  danger: {
    backgroundColor: "#EF4444",
    marginTop: 30,
  },
  btnText: {
    color: "#FFF",
    fontWeight: "bold",
    fontSize: 16,
  },
  successBox: {
    padding: 15,
    backgroundColor: "#D1FAE5",
    borderRadius: 8,
    width: "100%",
    marginBottom: 15,
    alignItems: "center",
  },
  successText: {
    color: "#047857",
    fontWeight: "bold",
  },
  modalContainer: {
    flex: 1,
    padding: 20,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
  },
  modalTitle: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 20,
    color: "#1f2937",
  },
  mapImage: {
    width: "100%",
    height: 350,
    borderRadius: 12,
    marginBottom: 20,
  },
  routeDetails: {
    width: "100%",
    padding: 15,
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
    marginBottom: 30,
  },
  routeText: {
    fontSize: 16,
    color: "#4b5563",
    marginBottom: 5,
  },
  btnClose: {
    backgroundColor: "#4b5563",
    paddingVertical: 15,
    paddingHorizontal: 30,
    borderRadius: 8,
    width: "100%",
    alignItems: "center",
  },

  sqBtn: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 18,
    marginBottom: 8,

    height: 135,
    minHeight: 135,

    borderWidth: 1,
    borderColor: "#F1F5F9",

    elevation: 3,
    shadowColor: "#0F172A",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,

    // IMPORTANT
    justifyContent: "flex-start",
  },

  sqBtnText: {
    fontSize: 12,
    fontWeight: "800",
    color: "#17213D",
    textAlign: "left",
    lineHeight: 16,
  },
  sqBtnIcon: { fontSize: 28, marginBottom: 8 },
  // sqBtnText: {
  //   fontSize: 11,
  //   fontWeight: "800",
  //   color: "#475569",
  //   textAlign: "center",
  // },
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
  hodStat: {
    flex: 1,
    backgroundColor: "white",
    borderRadius: 12,
    padding: 12,
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: "#F1F5F9",
  },
  hodStatNum: { fontSize: 22, fontWeight: "900" },
  hodStatLabel: {
    fontSize: 8,
    fontWeight: "800",
    color: "#64748B",
    textTransform: "uppercase",
    marginTop: 4,
  },
});
const profileStyles = StyleSheet.create({
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
