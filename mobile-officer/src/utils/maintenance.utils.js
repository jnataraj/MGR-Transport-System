export const isWithinPeriod = (dateStr, period) => {
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

export const mapMaintenanceOverview = (data) => {
  const fromIssues = (data.driverIssues || []).map((issue) => ({
    id: issue.id,
    source: "issue",
    vehicle: issue.vehicleId || "-",
    title: issue.type,
    description: issue.description,
    severity: "Warning",
    raisedByLabel: `${issue.reportedBy ? "Driver Raised" : "Raised"}`,
    createdAt: issue.createdAt,
    status: issue.status,
  }));

  const fromAlerts = (data.adminLogs || []).map((alert) => ({
    id: alert.id,
    source: "alert",
    vehicle: alert.vehicle,
    title: alert.issueType,
    description: alert.description,
    severity:
      alert.priority === "Critical" || alert.priority === "High"
        ? "Critical"
        : "Warning",
    raisedByLabel:
      alert.raisedBy === "Admin" || alert.raisedBy === "Super Admin"
        ? "Admin Raised"
        : alert.raisedBy?.toLowerCase().includes("coord")
          ? "Coordinator Raised"
          : `${alert.raisedBy} Raised`,
    createdAt: alert.createdAt,
    status: alert.status,
  }));

  return [...fromIssues, ...fromAlerts].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt),
  );
};
