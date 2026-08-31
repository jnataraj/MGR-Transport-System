export const SUPERADMIN_ROLES = ["superadmin", "admin"];

export const PERMISSION_ROUTES = {
    driverStaffManagement: ["/drivers"],
    vehicleManagement: ["/vehicles"],
    vehicleManagementAssignedOnly: ["/vehicles"],
    routeManagement: ["/routes"],
    studentManagement: ["/students"],
    parentManagement: ["/parents"],
    coordinatorManagement: ["/coordinators"],
    hodManagement: ["/hods"],
    maintenanceManagement: ["/issues"],
    busChangeManagement: ["/bus-change"],
};

// Routes every logged-in admin can see regardless of permissions.
export const ALWAYS_VISIBLE_ROUTES = ["/dashboard", "/settings"];

// Routes only a superadmin may ever see, even with full permissions —
// creating/editing other admin accounts is a privilege-escalation risk.
export const SUPERADMIN_ONLY_ROUTES = ["/admins"];

// Which permission unlocks which dashboard stat card / panel.
export const PERMISSION_DASHBOARD_CARDS = {
    vehicleManagement: ["activeVehicles", "map", "liveTransit", "studentBusLoaded"],
    vehicleManagementAssignedOnly: ["activeVehicles", "map", "liveTransit", "studentBusLoaded"],
    driverStaffManagement: ["activeDrivers"],
    maintenanceManagement: ["systemIssues"],
    routeManagement: ["routeAlerts", "alertsRaised", "notifyButton"],
    zoneAttendanceMonitor: ["studentsBoarded", "studentBusLoaded"],
    studentManagement: ["studentBusLoaded", "studentsBoarded"],
};

// ── Sector defaults ──────────────────────────────────────────────────────
// Keyed by the AdminSection.name exactly as it appears in "Admin Sections".
// Selecting a sector in the Add/Edit Admin form auto-fills these, and the
// Administrative Powers checklist only shows the options relevant to the
// chosen sector.
export const SECTOR_DEFAULT_PERMISSIONS = {
    "Driver Admin": [
        "dashboard",
        "driverStaffManagement",
        "vehicleManagementAssignedOnly",
        "routeManagement",
    ],
    "Vehicles Admin": [
        "vehicleManagement",
        "routeManagement",
        "maintenanceManagement",
        "busChangeManagement",
    ],
    "Student Admin": ["studentManagement"],
    "Parents Admin": ["parentManagement"],
    "Coordinators Admin": ["coordinatorManagement"],
    "HoDs Admin": ["dashboard", "zoneAttendanceMonitor", "hodManagement"],
    "Maintenance Admin": ["maintenanceManagement", "busChangeManagement"],
};

export const isSuperAdmin = (user) =>
    !!user && SUPERADMIN_ROLES.includes((user.role || "").toLowerCase());

export const hasPermission = (user, permissionKey) => {
    if (isSuperAdmin(user)) return true;
    if (!user || !permissionKey) return false;
    return (user.permissions || []).includes(permissionKey);
};

export const canAccessPath = (user, path) => {
    if (!user) return false;
    if (isSuperAdmin(user)) return true;
    if (SUPERADMIN_ONLY_ROUTES.includes(path)) return false;
    if (ALWAYS_VISIBLE_ROUTES.includes(path)) return true;

    const perms = user.permissions || [];
    return Object.entries(PERMISSION_ROUTES).some(
        ([key, paths]) => perms.includes(key) && paths.includes(path),
    );
};

export const canSeeCard = (user, cardKey) => {
    if (isSuperAdmin(user)) return true;
    if (!user) return false;
    const perms = user.permissions || [];
    return Object.entries(PERMISSION_DASHBOARD_CARDS).some(
        ([key, cards]) => perms.includes(key) && cards.includes(cardKey),
    );
};
