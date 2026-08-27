import { io } from "socket.io-client";

export const BASE_URL = import.meta.env.VITE_API_URL;
export const API_BASE = `${BASE_URL}/api`;
export const SOCKET_URL =
  import.meta.env.VITE_SOCKET_URL || BASE_URL;

const handleResponse = async (response) => {
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = payload?.error || response.statusText || "API request failed";
    throw new Error(error);
  }
  return payload;
};

const buildQuery = (params) => {
  const query = new URLSearchParams();
  Object.entries(params)
    .filter(
      ([, value]) => value !== undefined && value !== null && value !== "",
    )
    .forEach(([key, value]) => query.append(key, value));
  return query.toString() ? `?${query.toString()}` : "";
};

export const fetchUsers = async (role) => {
  const url = `${API_BASE}/users${buildQuery({ role })}`;
  const response = await fetch(url);
  return handleResponse(response);
};

// Returns unique, eligible departments derived from students with bus assignments
export const fetchHoDDepartments = async () => {
  const response = await fetch(`${API_BASE}/users/departments`);
  return handleResponse(response);
};

export const createUser = async (data) => {
  const response = await fetch(`${API_BASE}/users`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse(response);
};

export const updateUser = async (id, data) => {
  const response = await fetch(`${API_BASE}/users/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse(response);
};

export const deleteUser = async (id) => {
  const response = await fetch(`${API_BASE}/users/${id}`, {
    method: "DELETE",
  });
  return handleResponse(response);
};

export const fetchVehicles = async () => {
  const response = await fetch(`${API_BASE}/vehicles`);
  return handleResponse(response);
};

export const fetchLiveVehicles = async () => {
  try {
    const response = await fetch(`${API_BASE}/attendance/live-vehicles`);
    const data = await handleResponse(response);
    return data.liveVehicles || [];
  } catch (e) {
    console.error("fetchLiveVehicles error:", e);
    return [];
  }
};

export const createVehicle = async (data) => {
  const response = await fetch(`${API_BASE}/vehicles`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse(response);
};

export const updateVehicle = async (id, data) => {
  const response = await fetch(`${API_BASE}/vehicles/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse(response);
};

export const fetchVehicleMembers = async (vehicleId) => {
  const response = await fetch(`${API_BASE}/vehicles/${vehicleId}/members`);
  return handleResponse(response);
};

export const assignVehicleMembers = async (vehicleId, payload) => {
  const response = await fetch(`${API_BASE}/vehicles/${vehicleId}/assign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return handleResponse(response);
};

export const removeVehicleMember = async (vehicleId, type, memberId) => {
  const response = await fetch(
    `${API_BASE}/vehicles/${vehicleId}/members${buildQuery({ type, memberId })}`,
    { method: "DELETE" },
  );
  return handleResponse(response);
};

export const fetchRoutes = async (params = {}) => {
  const url = `${API_BASE}/routes${buildQuery(params)}`;
  const response = await fetch(url);
  return handleResponse(response);
};

export const createRoute = async (data) => {
  const response = await fetch(`${API_BASE}/routes`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse(response);
};

export const updateRoute = async (id, data) => {
  const response = await fetch(`${API_BASE}/routes/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse(response);
};

// Soft delete: sets isActive=false and stamps removedAt/removedBy,
// matching the RouteVehicleAssignment schema instead of hard-deleting.
export const deactivateRoute = async (id, removedBy = "admin") => {
  const response = await fetch(`${API_BASE}/routes/${id}/deactivate`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ removedBy }),
  });
  return handleResponse(response);
};

// Hard delete: permanently removes the route record from the database.
export const deleteRoute = async (id) => {
  const response = await fetch(`${API_BASE}/routes/${id}`, {
    method: "DELETE",
  });
  return handleResponse(response);
};

export const fetchNotifications = async (token) => {
  const response = await fetch(`${API_BASE}/notifications`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  return handleResponse(response);
};

export const sendNotification = async (data, token) => {
  const response = await fetch(`${API_BASE}/notifications/send`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(data),
  });
  return handleResponse(response);
};

export const markNotificationRead = async (id, token) => {
  const response = await fetch(`${API_BASE}/notifications/${id}/read`, {
    method: "PUT",
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  return handleResponse(response);
};

export const socket = io(SOCKET_URL, {
  autoConnect: true,
});

// ── Admin Sections ──
export const fetchAdminSections = async () => {
  const response = await fetch(`${API_BASE}/admin-sections`);
  return handleResponse(response);
};

export const createAdminSection = async (data) => {
  const response = await fetch(`${API_BASE}/admin-sections`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse(response);
};

export const updateAdminSection = async (id, data) => {
  const response = await fetch(`${API_BASE}/admin-sections/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse(response);
};

export const deleteAdminSection = async (id) => {
  const response = await fetch(`${API_BASE}/admin-sections/${id}`, {
    method: "DELETE",
  });
  return handleResponse(response);
};

export const setAdminSectionIncharge = async (id, userId) => {
  const response = await fetch(`${API_BASE}/admin-sections/${id}/incharge`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ userId }),
  });
  return handleResponse(response);
};

export const removeAdminSectionIncharge = async (id) => {
  const response = await fetch(`${API_BASE}/admin-sections/${id}/incharge`, {
    method: "DELETE",
  });
  return handleResponse(response);
};

// ── Admins ──
export const fetchAdmins = async () => {
  const response = await fetch(`${API_BASE}/admins`);
  return handleResponse(response);
};

export const createAdmin = async (data) => {
  const response = await fetch(`${API_BASE}/admins`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse(response);
};

export const updateAdmin = async (id, data) => {
  const response = await fetch(`${API_BASE}/admins/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse(response);
};

export const deleteAdmin = async (id) => {
  const response = await fetch(`${API_BASE}/admins/${id}`, {
    method: "DELETE",
  });
  return handleResponse(response);
};

export const fetchMaintenanceOverview = async () => {
  const response = await fetch(`${API_BASE}/maintenance/overview`);
  return handleResponse(response);
};

export const createMaintenanceLog = async (data) => {
  const response = await fetch(`${API_BASE}/maintenance/logs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse(response);
};

export const resolveMaintenanceLog = async (id, acknowledgedBy = "Maintenance Team") => {
  const response = await fetch(`${API_BASE}/maintenance/logs/${id}/resolve`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ acknowledgedBy }),
  });
  return handleResponse(response);
};

export const fetchBusChanges = async (params = {}) => {
  const url = `${API_BASE}/bus-change${buildQuery(params)}`;
  const response = await fetch(url);
  return handleResponse(response);
};

export const createBusChange = async (data) => {
  const response = await fetch(`${API_BASE}/bus-change`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse(response);
};

export const assignStudentBus = async (studentId, vehicleNumber) => {
  const response = await fetch(`${API_BASE}/vehicles/students/assign`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ studentId, vehicleNumber }),
  });
  return handleResponse(response);
};

export const deleteVehicle = async (id) => {
  const response = await fetch(`${API_BASE}/vehicles/${id}`, {
    method: "DELETE",
  });
  return handleResponse(response);
};

export const fetchSettings = async () => {
  const response = await fetch(`${API_BASE}/settings`);
  return handleResponse(response);
};

export const updateGpsSettings = async (data) => {
  const response = await fetch(`${API_BASE}/settings/gps`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse(response);
};

export const updateSystemSettings = async (data) => {
  const response = await fetch(`${API_BASE}/settings/system`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse(response);
};

export const fetchDashboardBoardingSummary = async () => {
  try {
    const response = await fetch(`${API_BASE}/attendance/dashboard-summary`);
    return handleResponse(response);
  } catch (e) {
    console.error("fetchDashboardBoardingSummary error:", e);
    return { boarded: 0, total: 0, zones: [] };
  }
};

export const fetchRouteAlerts = async (params = {}) => {
  try {
    const url = `${API_BASE}/notifications/route-alerts${buildQuery(params)}`;
    const response = await fetch(url);
    return handleResponse(response);
  } catch (e) {
    console.error("fetchRouteAlerts error:", e);
    return { success: false, routeAlerts: [], totals: { total: 0, route: 0, driver: 0, admin: 0 } };
  }
};

export const fetchMissingAlerts = async (params = {}) => {
  try {
    const url = `${API_BASE}/notifications/missing-alerts${buildQuery(params)}`;
    const response = await fetch(url);
    return handleResponse(response);
  } catch (e) {
    console.error("fetchMissingAlerts error:", e);
    return { success: false, missingAlerts: [], count: 0, activeCount: 0 };
  }
};

export const fetchActiveMissingAlerts = async () => {
  try {
    const url = `${API_BASE}/notifications/missing-alerts/active`;
    const response = await fetch(url);
    return handleResponse(response);
  } catch (e) {
    console.error("fetchActiveMissingAlerts error:", e);
    return { success: false, activeAlerts: [], count: 0 };
  }
};

export const resolveMissingAlert = async (id, reason) => {
  const response = await fetch(`${API_BASE}/notifications/missing-alerts/${id}/resolve`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
  return handleResponse(response);
};

export const createRouteAlert = async (data) => {
  const response = await fetch(`${API_BASE}/notifications/route-alerts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse(response);
};


export default {
  socket,
  fetchUsers,
  fetchHoDDepartments,
  createUser,
  updateUser,
  deleteUser,
  fetchVehicles,
  createVehicle,
  updateVehicle,
  deleteVehicle,
  fetchVehicleMembers,
  assignVehicleMembers,
  removeVehicleMember,
  fetchRoutes,
  createRoute,
  updateRoute,
  deactivateRoute,
  deleteRoute,
  fetchNotifications,
  sendNotification,
  markNotificationRead,
  fetchRouteAlerts,
  createRouteAlert,
  fetchAdminSections,
  createAdminSection,
  updateAdminSection,
  deleteAdminSection,
  setAdminSectionIncharge,
  removeAdminSectionIncharge,
  fetchAdmins,
  createAdmin,
  updateAdmin,
  deleteAdmin,
  fetchMaintenanceOverview,
  createMaintenanceLog,
  resolveMaintenanceLog,
  fetchBusChanges,
  createBusChange,
  assignStudentBus,
  fetchSettings,
  updateGpsSettings,
  updateSystemSettings,
};
