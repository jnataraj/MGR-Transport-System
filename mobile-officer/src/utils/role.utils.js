export const mapBackendRole = (backendRole) => {
  const role = (backendRole || "").toLowerCase();

  if (role === "deptadmin" || role === "hod") return "hod";
  if (role === "maintenance") return "maintenance";
  if (role === "coordinator") return "coordinator";

  return "driver";
};

const ROLE_CAPABILITIES = {
  driver: {
    icon: "👨‍✈️",
    showDutyBadges: true,
    canScanQR: true,
    canRaiseIssue: true,
    canSelfie: true,
    canCreateMaintLog: false,
    canViewLogHistory: false,
    canViewMyHistory: true,
    canViewRouteAlerts: true,
    canTriggerSOS: true,
    canTrackGPS: true,
    loadsMaintenanceFeed: false,
  },
  coordinator: {
    icon: "📋",
    showDutyBadges: true,
    canScanQR: true,
    canRaiseIssue: true,
    canSelfie: false,
    canCreateMaintLog: false,
    canViewLogHistory: false,
    canViewMyHistory: true,
    canViewRouteAlerts: true,
    canTriggerSOS: true,
    canTrackGPS: false,
    loadsMaintenanceFeed: false,
  },
  maintenance: {
    icon: "🔧",
    showDutyBadges: false,
    canScanQR: false,
    canRaiseIssue: false,
    canSelfie: false,
    canCreateMaintLog: true,
    canViewLogHistory: true,
    canViewMyHistory: false,
    canViewRouteAlerts: false,
    canTriggerSOS: false,
    canTrackGPS: false,
    loadsMaintenanceFeed: true,
  },
  hod: {
    icon: "👨‍✈️",
    showDutyBadges: true,
    canScanQR: true,
    canRaiseIssue: true,
    canSelfie: false,
    canCreateMaintLog: false,
    canViewLogHistory: false,
    canViewMyHistory: true,
    canViewRouteAlerts: true,
    canTriggerSOS: false,
    canTrackGPS: false,
    loadsMaintenanceFeed: false,
  },
};

export const getRoleCapabilities = (role) =>
  ROLE_CAPABILITIES[role] || ROLE_CAPABILITIES.driver;