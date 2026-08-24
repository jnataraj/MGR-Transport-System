export const mapNotificationToAlert = (notification) => {
  const created = notification?.createdAt
    ? new Date(notification.createdAt)
    : new Date();

  let parsedData = {};
  try {
    parsedData = typeof notification?.data === "string" ? JSON.parse(notification.data || "{}") : (notification?.data || {});
  } catch { }

  const missingAlertId = parsedData.missingAlertId || parsedData.alertId || parsedData.id || null;

  return {
    id: notification?.id,
    missingAlertId,
    studentId: parsedData.studentId || null,
    studentName: parsedData.studentName || null,
    isRead: !!notification?.isRead,
    notificationType:
      notification?.type === "general"
        ? "General"
        : notification?.type || "General",
    routeName: notification?.title || "Notification",
    title: notification?.title || "Notification",
    effectiveDate: created.toISOString().split("T")[0],
    effectiveTime: created.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    customMessage: notification?.message || "",
    message: notification?.message || "",
    receivedAt: notification?.createdAt || created.toISOString(),
    status: notification?.type === "missing_alert_resolved" ? "RESOLVED" : (notification?.type === "missing_alert" ? "ACTIVE" : undefined),
  };
};
