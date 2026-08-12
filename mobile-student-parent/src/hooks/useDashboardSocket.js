import { useEffect, useRef, useState } from "react";
import { Alert } from "react-native";
import { io } from "socket.io-client";
import { API_BASE } from "../api/client";
import { STAGE_META } from "../constants/attendanceStages";
import { mapNotificationToAlert } from "../utils/notificationUtils";

export default function useDashboardSocket({ user, role }) {
  const socketRef = useRef(null);
  const [routeAlerts, setRouteAlerts] = useState([]);
  const [unreadAlerts, setUnreadAlerts] = useState(0);

  useEffect(() => {
    if (!user?.id) return undefined;

    const socket = io(API_BASE);
    socketRef.current = socket;
    socket.emit("joinRoom", role);
    socket.emit("joinUser", user.id);

    socket.on("student_boarded", (data) => {
      if (data?.stage && STAGE_META[data.stage]) {
        Alert.alert("Attendance Updated", STAGE_META[data.stage].label.replace("\n", " "));
      }
    });

    socket.on("routeAlert", (alert) => {
      setRouteAlerts((previous) => {
        if (previous.some((item) => item.id === alert.id)) return previous;
        return [{ ...alert, receivedAt: alert.receivedAt || new Date().toISOString() }, ...previous];
      });
      setUnreadAlerts((count) => count + 1);
    });

    socket.on("new_notification", (notification) => {
      const alert = mapNotificationToAlert(notification);
      setRouteAlerts((previous) => {
        if (previous.some((item) => item.id === alert.id)) return previous;
        return [alert, ...previous];
      });
      setUnreadAlerts((count) => count + 1);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user?.id, role]);

  return {
    socketRef,
    routeAlerts,
    unreadAlerts,
    markAlertsRead: () => {
      setUnreadAlerts(0);
      setRouteAlerts((previous) => previous.map((alert) => ({ ...alert, isRead: true })));
    },
  };
}
