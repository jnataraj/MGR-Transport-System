export const mapNotificationToAlert = (notification) => {
  const created = notification.createdAt
    ? new Date(notification.createdAt)
    : new Date();

  return {
    id: notification.id,
    notificationType:
      notification.type === "general" ? "General" : notification.type || "General",
    routeName: notification.title || "Notification",
    effectiveDate: created.toISOString().split("T")[0],
    effectiveTime: created.toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    }),
    customMessage: notification.message || "",
    receivedAt: notification.createdAt || created.toISOString(),
  };
};
