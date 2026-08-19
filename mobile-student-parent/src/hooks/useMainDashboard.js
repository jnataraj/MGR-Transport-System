import { useCallback, useEffect, useState } from "react";
import { Alert, Platform } from "react-native";
import { useAuth } from "../context/AuthContext";
import { API_BASE } from "../api/client";
import { normalizeRole } from "../utils/roleUtils";
import { registerForPushNotificationsAsync } from "../services/notificationService";
import useAttendanceScanner from "./useAttendanceScanner";
import useTravelHistory from "./useTravelHistory";
import useDepartmentAttendance from "./useDepartmentAttendance";
import useDashboardSocket from "./useDashboardSocket";

export default function useMainDashboard({ user, token, onLogout }) {
  const userRole = normalizeRole(user?.role);
  const { refreshProfile } = useAuth();
  const [activeTab, setActiveTab] = useState("home");
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [profileVisible, setProfileVisible] = useState(false);
  const [routeAlertsVisible, setRouteAlertsVisible] = useState(false);
  const [travelHistoryVisible, setTravelHistoryVisible] = useState(false);
  const [boardingQRVisible, setBoardingQRVisible] = useState(false);
  const [liveMapVisible, setLiveMapVisible] = useState(false);
  const [notifications, setNotifications] = useState([]);

  const attendance = useAttendanceScanner({ user, token, enabled: userRole === "student" });
  const travelHistory = useTravelHistory({ user, token, role: userRole });
  const department = useDepartmentAttendance({ user, token, enabled: userRole === "hod" });
  const realtime = useDashboardSocket({ user, role: userRole });

  useEffect(() => {
    refreshProfile?.();
  }, [refreshProfile]);

  useEffect(() => {
    if (!token) return;
    registerForPushNotificationsAsync(token).catch((error) =>
      console.log("Push notification registration failed:", error.message),
    );
    fetch(`${API_BASE}/api/notifications`, { headers: { Authorization: `Bearer ${token}` } })
      .then((response) => response.json())
      .then((data) => {
        if (data.success && Array.isArray(data.notifications)) setNotifications(data.notifications);
      })
      .catch((error) => console.log("Student notifications fetch error:", error));
  }, [token]);

  const handleTabPress = useCallback((tab) => {
    setActiveTab(tab);
    if (tab === "settings") setSettingsVisible(true);
    if (tab === "profile") {
      refreshProfile?.();
      setProfileVisible(true);
    }
  }, [refreshProfile]);

  const openTravelHistory = useCallback(async () => {
    setTravelHistoryVisible(true);
    await travelHistory.fetch();
  }, [travelHistory.fetch]);

  const openRouteAlerts = useCallback(() => {
    setRouteAlertsVisible(true);
    realtime.markAlertsRead();
  }, [realtime]);

  const confirmLogout = useCallback(async () => {
    if (Platform.OS === "web") {
      if (window.confirm("Are you sure you want to log out?")) await onLogout?.();
      return;
    }
    Alert.alert("Log Out", "Are you sure you want to log out?", [
      { text: "Cancel", style: "cancel" },
      { text: "Log Out", style: "destructive", onPress: () => onLogout?.() },
    ]);
  }, [onLogout]);

  return {
    user,
    token,
    userRole,
    activeTab,
    setActiveTab,
    handleTabPress,
    settings: { visible: settingsVisible, gpsEnabled: attendance.gpsEnabled },
    profile: { visible: profileVisible },
    routeAlerts: { visible: routeAlertsVisible, items: realtime.routeAlerts, unreadCount: realtime.unreadAlerts },
    travelHistory: { visible: travelHistoryVisible, ...travelHistory },
    boardingQR: { visible: boardingQRVisible, ...attendance },
    liveMapVisible,
    setLiveMapVisible,
    notifications,
    socketRef: realtime.socketRef,
    attendance,
    department,
    openSettings: () => setSettingsVisible(true),
    closeSettings: () => setSettingsVisible(false),
    openProfile: () => setProfileVisible(true),
    closeProfile: () => setProfileVisible(false),
    openRouteAlerts,
    closeRouteAlerts: () => setRouteAlertsVisible(false),
    openTravelHistory,
    closeTravelHistory: () => setTravelHistoryVisible(false),
    openBoardingQR: () => setBoardingQRVisible(true),
    closeBoardingQR: () => {
      setBoardingQRVisible(false);
      attendance.closeScanner();
    },
    viewLiveLocation: () => setLiveMapVisible(true),
    confirmLogout,
  };
}
