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
      let parsedData = {};
      try {
        parsedData = typeof notification.data === "string" ? JSON.parse(notification.data || "{}") : (notification.data || {});
      } catch {}
      const missingId = parsedData.missingAlertId || parsedData.alertId || parsedData.id;
      const notifStudentId = parsedData.studentId;

      setRouteAlerts((previous) => {
        if (
          alert.notificationType === "missing_alert" ||
          alert.notificationType === "missing_alert_resolved" ||
          notification.type === "missing_alert" ||
          notification.type === "missing_alert_resolved"
        ) {
          const index = previous.findIndex(
            (p) =>
              (missingId && (p.missingAlertId === missingId || p.id === missingId || p.alertId === missingId)) ||
              (p.id === alert.id) ||
              (notifStudentId && p.studentId === notifStudentId)
          );
          if (index !== -1) {
            const updated = [...previous];
            updated[index] = {
              ...updated[index],
              ...alert,
              missingAlertId: missingId || updated[index].missingAlertId,
              studentId: notifStudentId || updated[index].studentId,
            };
            return updated;
          }
        }

        if (previous.some((item) => item.id === alert.id || (missingId && item.missingAlertId === missingId))) return previous;
        setUnreadAlerts((count) => count + 1);
        return [alert, ...previous];
      });
    });

    socket.on("driver_student_missing_alert", (alert) => {
      if (role === "parent" || role === "hod") {
        const studentName = alert.studentName || "Your Child";
        const dist = alert.distanceMeters ?? "10+";
        const alertMsg = `Alert: Student ${studentName} is more than 10 meters (${dist} m) away from assigned vehicle ${alert.vehicleNumber || ""}. Please check student status.`;
        const alertIncidentId = alert.id;

        setRouteAlerts((previous) => {
          const existingIndex = previous.findIndex(
            (p) =>
              p.id === alertIncidentId ||
              p.missingAlertId === alertIncidentId ||
              (p.studentId && alert.studentId && p.studentId === alert.studentId) ||
              (p.notificationType === "missing_alert" && p.studentName === studentName && p.status !== "RESOLVED")
          );

          const updatedCard = {
            id: alertIncidentId || Date.now().toString(),
            missingAlertId: alertIncidentId,
            alertId: alertIncidentId,
            title: "🚨 Student Missing Alert",
            message: alertMsg,
            notificationType: "missing_alert",
            studentId: alert.studentId,
            studentName,
            distanceMeters: dist,
            effectiveDate: new Date().toISOString().split("T")[0],
            effectiveTime: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            receivedAt: new Date().toISOString(),
            status: "ACTIVE",
          };

          if (existingIndex !== -1) {
            const updated = [...previous];
            updated[existingIndex] = { ...updated[existingIndex], ...updatedCard };
            return updated;
          }

          Alert.alert("🚨 Student Missing Alert", alertMsg, [{ text: "OK" }]);
          setUnreadAlerts((count) => count + 1);
          return [updatedCard, ...previous];
        });
      }
    });

    socket.on("student_missing_alert_resolved", (res) => {
      if (role === "parent" || role === "hod") {
        const alertIncidentId = res.id || res.missingAlertId || res.alertId;
        setRouteAlerts((previous) => {
          const existingIdx = previous.findIndex(
            (a) =>
              (alertIncidentId && (a.id === alertIncidentId || a.missingAlertId === alertIncidentId || a.alertId === alertIncidentId)) ||
              (a.studentId && res.studentId && a.studentId === res.studentId)
          );

          if (existingIdx !== -1) {
            const updated = [...previous];
            updated[existingIdx] = {
              ...updated[existingIdx],
              status: "RESOLVED",
              missingAlertId: alertIncidentId || updated[existingIdx].missingAlertId,
              message: `✅ ${updated[existingIdx].studentName || res.studentName || "Student"} — Resolved (${res.resolvedReason || "Closed"}).`,
              resolvedReason: res.resolvedReason,
              resolvedAt: res.resolvedAt,
            };
            return updated;
          }

          return [
            {
              id: alertIncidentId || `res-${Date.now()}`,
              missingAlertId: alertIncidentId,
              studentId: res.studentId,
              studentName: res.studentName,
              notificationType: "missing_alert_resolved",
              title: "✅ Student Missing Alert Resolved",
              message: `✅ ${res.studentName || "Student"} — Resolved (${res.resolvedReason || "Closed"}).`,
              status: "RESOLVED",
              resolvedReason: res.resolvedReason,
              resolvedAt: res.resolvedAt,
              receivedAt: new Date().toISOString(),
            },
            ...previous,
          ];
        });
      }
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
