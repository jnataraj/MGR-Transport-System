import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ShieldCheck,
  Search,
  Filter,
  Download,
  RefreshCw,
  Clock,
  User,
  Smartphone,
  Server,
  Monitor,
  CheckCircle2,
  XCircle,
  Eye,
  X,
  Copy,
  Check,
  AlertTriangle,
  Layers,
  Activity,
  FileSpreadsheet,
  MapPin,
  Navigation,
  Compass,
  Crosshair,
  Bus,
  Route,
  ExternalLink,
} from "lucide-react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/Topbar";
import {
  fetchAuditLogs,
  fetchAuditStats,
  exportAuditLogsCsv,
  socket,
} from "../../api";
import "./AuditLogs.css";

// Configure Leaflet default marker icons safely
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

const MODULE_OPTIONS = [
  { value: "ALL", label: "All Modules" },
  { value: "AUTH", label: "Authentication" },
  { value: "USER_MANAGEMENT", label: "User Management" },
  { value: "BUS_ROUTE_MANAGEMENT", label: "Bus & Route Changes" },
  { value: "VEHICLE_MANAGEMENT", label: "Vehicles & Fleet" },
  { value: "ROUTE_MANAGEMENT", label: "Route Management" },
  { value: "ROUTE_VEHICLE_SWAP", label: "Route Vehicle Swap" },
  { value: "ATTENDANCE", label: "Attendance & Transit" },
  { value: "MAINTENANCE", label: "Maintenance & Issues" },
  { value: "ALERTS", label: "Alerts & Notifications" },
  { value: "SETTINGS", label: "System Settings" },
];

const APP_OPTIONS = [
  { value: "ALL", label: "All Applications" },
  { value: "WEB_ADMIN", label: "Web Admin" },
  { value: "OFFICER_APP", label: "Officer App" },
  { value: "STUDENT_PARENT_APP", label: "Student/Parent App" },
  { value: "SYSTEM_BACKEND", label: "System Backend" },
];

const ROLE_OPTIONS = [
  { value: "ALL", label: "All Roles" },
  { value: "superadmin", label: "Super Admin" },
  { value: "admin", label: "Admin" },
  { value: "deptadmin", label: "Dept Admin" },
  { value: "driver", label: "Driver" },
  { value: "student", label: "Student" },
  { value: "parent", label: "Parent" },
  { value: "coordinator", label: "Coordinator" },
  { value: "hod", label: "HoD" },
];

const formatDate = (dateStr) => {
  if (!dateStr) return "-";
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
};

const getRelativeTime = (dateStr) => {
  if (!dateStr) return "";
  const now = new Date();
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return "";
  const diffSec = Math.floor((now - date) / 1000);
  if (diffSec < 60) return `${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDays = Math.floor(diffHour / 24);
  return `${diffDays}d ago`;
};

const AuditLogs = () => {
  // Logs & Stats State
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({
    totalEvents: 0,
    todayEvents: 0,
    successEvents: 0,
    failedEvents: 0,
  });
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [newLogIds, setNewLogIds] = useState(new Set());

  // Filter State
  const [search, setSearch] = useState("");
  const [appFilter, setAppFilter] = useState("ALL");
  const [moduleFilter, setModuleFilter] = useState("ALL");
  const [roleFilter, setRoleFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // Pagination State
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [pagination, setPagination] = useState({
    total: 0,
    totalPages: 1,
    page: 1,
    pageSize: 25,
  });

  // Modal / Details State
  const [selectedLog, setSelectedLog] = useState(null);
  const [mapModalLog, setMapModalLog] = useState(null);
  const [copiedId, setCopiedId] = useState(false);

  // Fetch Stats
  const loadStats = useCallback(async () => {
    try {
      const res = await fetchAuditStats();
      if (res && res.success && res.stats) {
        setStats({
          totalEvents: res.stats.totalEvents ?? 0,
          todayEvents: res.stats.todayEvents ?? 0,
          successEvents: res.stats.successEvents ?? res.stats.successCount ?? 0,
          failedEvents: res.stats.failedEvents ?? res.stats.failedCount ?? 0,
        });
      }
    } catch (err) {
      console.warn("Failed to load audit stats:", err.message);
    }
  }, []);

  // Fetch Logs
  const loadLogs = useCallback(
    async (currentPage = page, isBackground = false) => {
      if (!isBackground) setLoading(true);
      try {
        const params = {
          page: currentPage,
          pageSize,
          ...(search ? { search: search.trim() } : {}),
          ...(appFilter !== "ALL" ? { appName: appFilter } : {}),
          ...(moduleFilter !== "ALL" ? { module: moduleFilter } : {}),
          ...(roleFilter !== "ALL" ? { userRole: roleFilter } : {}),
          ...(statusFilter !== "ALL" ? { status: statusFilter } : {}),
          ...(dateFrom ? { dateFrom } : {}),
          ...(dateTo ? { dateTo } : {}),
        };

        const res = await fetchAuditLogs(params);
        if (res && res.success) {
          setLogs(res.data);
          setPagination(res.pagination);
        }
      } catch (err) {
        console.error("Failed to load audit logs:", err);
      } finally {
        if (!isBackground) setLoading(false);
      }
    },
    [page, pageSize, search, appFilter, moduleFilter, roleFilter, statusFilter, dateFrom, dateTo]
  );

  // Initial Load
  useEffect(() => {
    loadLogs(page);
    loadStats();
  }, [loadLogs, loadStats, page]);

  // Real-time Socket.IO listener for live audit events
  useEffect(() => {
    if (!socket) return;

    const handleNewAuditLog = (newLog) => {
      if (page === 1) {
        setLogs((prev) => [newLog, ...prev.slice(0, pageSize - 1)]);
        setNewLogIds((prev) => new Set([...prev, newLog.id]));
        setTimeout(() => {
          setNewLogIds((prev) => {
            const next = new Set(prev);
            next.delete(newLog.id);
            return next;
          });
        }, 3000);
      }
      loadStats();
    };

    socket.on("audit_log_created", handleNewAuditLog);

    return () => {
      socket.off("audit_log_created", handleNewAuditLog);
    };
  }, [page, pageSize, loadStats]);

  // Export CSV
  const handleExportCsv = async () => {
    try {
      setExporting(true);
      const params = {
        ...(search ? { search: search.trim() } : {}),
        ...(appFilter !== "ALL" ? { appName: appFilter } : {}),
        ...(moduleFilter !== "ALL" ? { module: moduleFilter } : {}),
        ...(roleFilter !== "ALL" ? { userRole: roleFilter } : {}),
        ...(statusFilter !== "ALL" ? { status: statusFilter } : {}),
        ...(dateFrom ? { dateFrom } : {}),
        ...(dateTo ? { dateTo } : {}),
      };
      await exportAuditLogsCsv(params);
    } catch (err) {
      alert(err.message || "Failed to export audit logs");
    } finally {
      setExporting(false);
    }
  };

  // Reset Filters
  const handleResetFilters = () => {
    setSearch("");
    setAppFilter("ALL");
    setModuleFilter("ALL");
    setRoleFilter("ALL");
    setStatusFilter("ALL");
    setDateFrom("");
    setDateTo("");
    setPage(1);
  };

  // Copy to clipboard
  const handleCopyEventId = (eventId) => {
    if (!eventId) return;
    navigator.clipboard.writeText(eventId);
    setCopiedId(true);
    setTimeout(() => setCopiedId(false), 2000);
  };

  // App badge renderer
  const renderAppBadge = (appName) => {
    const norm = (appName || "SYSTEM_BACKEND").toUpperCase();
    if (norm === "WEB_ADMIN") {
      return (
        <span className="app-pill web_admin">
          <Monitor size={12} /> Web Admin
        </span>
      );
    }
    if (norm === "OFFICER_APP") {
      return (
        <span className="app-pill officer_app">
          <Smartphone size={12} /> Officer App
        </span>
      );
    }
    if (norm === "STUDENT_PARENT_APP") {
      return (
        <span className="app-pill student_parent_app">
          <Smartphone size={12} /> Student/Parent App
        </span>
      );
    }
    return (
      <span className="app-pill system_backend">
        <Server size={12} /> Backend
      </span>
    );
  };

  const hasLocation = (log) => {
    return (
      log &&
      log.latitude !== null &&
      log.latitude !== undefined &&
      log.longitude !== null &&
      log.longitude !== undefined &&
      !isNaN(parseFloat(log.latitude)) &&
      !isNaN(parseFloat(log.longitude))
    );
  };

  return (
    <div className="audit-page-container">
      <Sidebar />
      <div className="audit-main-content">
        <Topbar />
        <div className="audit-content-area">
          {/* Header */}
          <div className="audit-header">
            <div className="audit-title-block">
              <h1>
                <ShieldCheck size={28} color="#0284c7" /> System Audit Logs
              </h1>
              <p>
                Track every action across CTMS — who did it, when, from where, GPS location, and what changed.
              </p>
            </div>
            <div className="audit-header-actions">
              <div className="live-pulse-badge">
                <span className="pulse-dot"></span> Live Stream Active
              </div>
              <button
                className="btn-audit-export"
                onClick={handleExportCsv}
                disabled={exporting}
              >
                <Download size={16} />
                {exporting ? "Exporting CSV..." : "Export CSV"}
              </button>
              <button
                className={`btn-audit-refresh ${loading ? "spinning" : ""}`}
                onClick={() => {
                  loadLogs(page);
                  loadStats();
                }}
                disabled={loading}
                title="Refresh Audit Logs"
              >
                <RefreshCw size={16} />
              </button>
            </div>
          </div>

          {/* KPI Summary Cards */}
          {/* <div className="audit-stats-grid">
            <div className="audit-stat-card">
              <div className="stat-icon-wrapper total">
                <ShieldCheck size={24} />
              </div>
              <div className="stat-content">
                <span className="stat-label">Total Events</span>
                <span className="stat-number">
                  {(stats?.totalEvents ?? 0).toLocaleString()}
                </span>
              </div>
            </div>

            <div className="audit-stat-card">
              <div className="stat-icon-wrapper today">
                <Clock size={24} />
              </div>
              <div className="stat-content">
                <span className="stat-label">Today's Activity</span>
                <span className="stat-number">
                  {(stats?.todayEvents ?? 0).toLocaleString()}
                </span>
              </div>
            </div>

            <div className="audit-stat-card">
              <div className="stat-icon-wrapper success">
                <CheckCircle2 size={24} />
              </div>
              <div className="stat-content">
                <span className="stat-label">Successful Actions</span>
                <span className="stat-number">
                  {(stats?.successEvents ?? 0).toLocaleString()}
                </span>
              </div>
            </div>

            <div className="audit-stat-card">
              <div className="stat-icon-wrapper failed">
                <AlertTriangle size={24} />
              </div>
              <div className="stat-content">
                <span className="stat-label">Failed / Flagged</span>
                <span className="stat-number">
                  {(stats?.failedEvents ?? 0).toLocaleString()}
                </span>
              </div>
            </div>
          </div> */}

          {/* Filters Bar */}
          <div className="audit-filter-card">
            <div className="filter-grid">
              {/* Search */}
              <div className="filter-item">
                <label>Search Logs</label>
                <div className="search-input-group">
                  <Search size={15} />
                  <input
                    type="text"
                    className="filter-input"
                    placeholder="Event ID, User, Action, Entity, Bus..."
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(1);
                    }}
                  />
                </div>
              </div>

              {/* App Source */}
              <div className="filter-item">
                <label>Application</label>
                <select
                  className="filter-select"
                  value={appFilter}
                  onChange={(e) => {
                    setAppFilter(e.target.value);
                    setPage(1);
                  }}
                >
                  {APP_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Module */}
              <div className="filter-item">
                <label>Module</label>
                <select
                  className="filter-select"
                  value={moduleFilter}
                  onChange={(e) => {
                    setModuleFilter(e.target.value);
                    setPage(1);
                  }}
                >
                  {MODULE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* User Role */}
              <div className="filter-item">
                <label>User Role</label>
                <select
                  className="filter-select"
                  value={roleFilter}
                  onChange={(e) => {
                    setRoleFilter(e.target.value);
                    setPage(1);
                  }}
                >
                  {ROLE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              {/* Status */}
              <div className="filter-item">
                <label>Status</label>
                <select
                  className="filter-select"
                  value={statusFilter}
                  onChange={(e) => {
                    setStatusFilter(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="ALL">All Statuses</option>
                  <option value="SUCCESS">SUCCESS</option>
                  <option value="FAILED">FAILED</option>
                </select>
              </div>

              {/* Date From */}
              <div className="filter-item">
                <label>Date From</label>
                <input
                  type="date"
                  className="filter-input"
                  value={dateFrom}
                  onChange={(e) => {
                    setDateFrom(e.target.value);
                    setPage(1);
                  }}
                />
              </div>

              {/* Date To */}
              <div className="filter-item">
                <label>Date To</label>
                <input
                  type="date"
                  className="filter-input"
                  value={dateTo}
                  onChange={(e) => {
                    setDateTo(e.target.value);
                    setPage(1);
                  }}
                />
              </div>

              {/* Reset */}
              <div className="filter-actions">
                <button className="btn-filter-reset" onClick={handleResetFilters}>
                  Clear Filters
                </button>
              </div>
            </div>
          </div>

          {/* Audit Logs Table */}
          <div className="audit-table-card">
            <div className="table-responsive">
              <table className="audit-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>User & Role</th>
                    <th>App Source</th>
                    <th>Action</th>
                    <th>Module / Entity</th>
                    <th>Location</th>
                    <th>Description</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && logs.length === 0 ? (
                    <tr>
                      <td colSpan="9" style={{ textAlign: "center", padding: "40px" }}>
                        <RefreshCw size={24} className="spinning" style={{ margin: "0 auto 8px" }} />
                        <div>Loading audit records...</div>
                      </td>
                    </tr>
                  ) : logs.length === 0 ? (
                    <tr>
                      <td colSpan="9" style={{ textAlign: "center", padding: "40px", color: "#64748b" }}>
                        <ShieldCheck size={36} style={{ margin: "0 auto 8px", opacity: 0.5 }} />
                        <div>No audit records match the current filters.</div>
                      </td>
                    </tr>
                  ) : (
                    logs.map((log) => {
                      const isNew = newLogIds.has(log.id);
                      const roleClass = (log.userRole || "unknown").toLowerCase();
                      const hasLoc = hasLocation(log);

                      return (
                        <tr key={log.id} className={isNew ? "new-event-flash" : ""}>
                          {/* Timestamp */}
                          <td>
                            <div className="timestamp-block">
                              <span className="time-main">{formatDate(log.createdAt)}</span>
                              <span className="time-sub">{getRelativeTime(log.createdAt)}</span>
                            </div>
                          </td>

                          {/* User */}
                          <td>
                            <div className="user-cell">
                              <div className="user-avatar-initials">
                                {(log.userName || "U").charAt(0).toUpperCase()}
                              </div>
                              <div className="user-info-text">
                                <span className="user-name">{log.userName || "System"}</span>
                                <span className={`user-role-badge ${roleClass}`}>
                                  {log.userRole || "SYSTEM"}
                                </span>
                              </div>
                            </div>
                          </td>

                          {/* App */}
                          <td>{renderAppBadge(log.appName)}</td>

                          {/* Action */}
                          <td>
                            <span className="action-chip">{log.action}</span>
                          </td>

                          {/* Module / Entity */}
                          <td>
                            <div className="module-tag">{log.module || "SYSTEM"}</div>
                            {log.entityType && (
                              <div className="entity-tag">
                                {log.entityType}: {log.entityId ? String(log.entityId).slice(0, 8) : "-"}
                              </div>
                            )}
                            {log.vehicleNumber && (
                              <div className="bus-tag">
                                <Bus size={11} /> {log.vehicleNumber}
                              </div>
                            )}
                          </td>

                          {/* Location Column */}
                          <td>
                            {hasLoc ? (
                              <div className="location-cell">
                                <span className="location-coords" title={`Lat: ${log.latitude}, Lng: ${log.longitude}`}>
                                  {Number(log.latitude).toFixed(4)}, {Number(log.longitude).toFixed(4)}
                                </span>
                                <button
                                  className="btn-map-mini"
                                  onClick={() => setMapModalLog(log)}
                                  title="View on Interactive Map"
                                >
                                  <MapPin size={12} /> Map
                                </button>
                              </div>
                            ) : (
                              <span className="location-na">N/A</span>
                            )}
                          </td>

                          {/* Description */}
                          <td style={{ maxWidth: "260px" }}>
                            <div
                              style={{
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                              }}
                              title={log.description}
                            >
                              {log.description || "-"}
                            </div>
                          </td>

                          {/* Status */}
                          <td>
                            {log.status === "SUCCESS" ? (
                              <span className="status-indicator success">
                                <CheckCircle2 size={13} /> SUCCESS
                              </span>
                            ) : (
                              <span className="status-indicator failed">
                                <XCircle size={13} /> FAILED
                              </span>
                            )}
                          </td>

                          {/* Action button */}
                          <td>
                            <button
                              className="btn-inspect"
                              onClick={() => setSelectedLog(log)}
                              title="Inspect full audit record"
                            >
                              <Eye size={14} /> Inspect
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="audit-pagination-footer">
              <div className="pagination-info">
                Showing {pagination.total > 0 ? (page - 1) * pageSize + 1 : 0} to{" "}
                {Math.min(page * pageSize, pagination.total)} of {pagination.total} records
              </div>

              <div className="pagination-controls">
                <select
                  className="pagination-select"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    setPage(1);
                  }}
                >
                  <option value={25}>25 per page</option>
                  <option value={50}>50 per page</option>
                  <option value={100}>100 per page</option>
                </select>

                <button
                  className="btn-page-nav"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Previous
                </button>

                <span className="page-num-display">
                  Page {page} of {pagination.totalPages || 1}
                </span>

                <button
                  className="btn-page-nav"
                  disabled={page >= pagination.totalPages}
                  onClick={() => setPage((p) => Math.min(pagination.totalPages, p + 1))}
                >
                  Next
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Details Inspector Modal */}
      {selectedLog && (
        <div className="audit-modal-overlay" onClick={() => setSelectedLog(null)}>
          <div className="audit-modal-content" onClick={(e) => e.stopPropagation()}>
            {/* Header */}
            <div className="modal-header">
              <div className="modal-header-title">
                <ShieldCheck size={22} color="#0284c7" />
                <h3>Audit Record Inspector</h3>
                <span className="event-id-badge" style={{ fontSize: "0.85rem" }}>
                  {selectedLog.eventId || selectedLog.id}
                </span>
                <button
                  className="btn-inspect"
                  style={{ padding: "3px 8px" }}
                  onClick={() => handleCopyEventId(selectedLog.eventId || selectedLog.id)}
                >
                  {copiedId ? <Check size={12} color="#059669" /> : <Copy size={12} />}
                  {copiedId ? "Copied" : "Copy"}
                </button>
              </div>
              <button className="modal-close-btn" onClick={() => setSelectedLog(null)}>
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="modal-body">
              {/* Context Summary Grid */}
              <div className="detail-grid">
                <div className="detail-item">
                  <span className="detail-lbl">Timestamp</span>
                  <span className="detail-val">{formatDate(selectedLog.createdAt)}</span>
                </div>

                <div className="detail-item">
                  <span className="detail-lbl">Initiated By</span>
                  <span className="detail-val">
                    {selectedLog.userName || "Unknown"} ({selectedLog.userRole || "N/A"})
                  </span>
                </div>

                <div className="detail-item">
                  <span className="detail-lbl">Application Source</span>
                  <span className="detail-val">{renderAppBadge(selectedLog.appName)}</span>
                </div>

                <div className="detail-item">
                  <span className="detail-lbl">Action</span>
                  <span className="detail-val action-chip">{selectedLog.action}</span>
                </div>

                <div className="detail-item">
                  <span className="detail-lbl">Module</span>
                  <span className="detail-val">{selectedLog.module}</span>
                </div>

                <div className="detail-item">
                  <span className="detail-lbl">Entity Target</span>
                  <span className="detail-val">
                    {selectedLog.entityType || "N/A"}{" "}
                    {selectedLog.entityId ? `[${selectedLog.entityId}]` : ""}
                  </span>
                </div>

                <div className="detail-item">
                  <span className="detail-lbl">Client IP Address</span>
                  <span className="detail-val">{selectedLog.ipAddress || "Unknown"}</span>
                </div>

                <div className="detail-item">
                  <span className="detail-lbl">Status</span>
                  <span className="detail-val">
                    {selectedLog.status === "SUCCESS" ? (
                      <span className="status-indicator success">
                        <CheckCircle2 size={12} /> SUCCESS
                      </span>
                    ) : (
                      <span className="status-indicator failed">
                        <XCircle size={12} /> FAILED
                      </span>
                    )}
                  </span>
                </div>
              </div>

              {/* LOCATION & GPS SECTION */}
              <div className="gps-inspector-card">
                <div className="gps-card-header">
                  <div className="gps-header-title">
                    <MapPin size={18} color="#0284c7" />
                    <h4>Geographic Location & Device GPS</h4>
                  </div>
                  {hasLocation(selectedLog) && (
                    <button
                      className="btn-view-on-map"
                      onClick={() => setMapModalLog(selectedLog)}
                    >
                      <Navigation size={14} /> View on Map
                    </button>
                  )}
                </div>

                {hasLocation(selectedLog) ? (
                  <div className="gps-details-grid">
                    <div className="gps-field">
                      <span className="gps-field-lbl">Latitude</span>
                      <span className="gps-field-val highlight">{Number(selectedLog.latitude).toFixed(6)}</span>
                    </div>

                    <div className="gps-field">
                      <span className="gps-field-lbl">Longitude</span>
                      <span className="gps-field-val highlight">{Number(selectedLog.longitude).toFixed(6)}</span>
                    </div>

                    <div className="gps-field">
                      <span className="gps-field-lbl">GPS Accuracy</span>
                      <span className="gps-field-val">
                        {selectedLog.gpsAccuracy !== null && selectedLog.gpsAccuracy !== undefined
                          ? `±${Number(selectedLog.gpsAccuracy).toFixed(1)} m`
                          : "Approximate"}
                      </span>
                    </div>

                    <div className="gps-field">
                      <span className="gps-field-lbl">Fix Quality</span>
                      <span className={`quality-badge ${(selectedLog.locationQuality || "MEDIUM").toLowerCase()}`}>
                        {selectedLog.locationQuality || "MEDIUM"}
                      </span>
                    </div>

                    <div className="gps-field">
                      <span className="gps-field-lbl">Device GPS Time</span>
                      <span className="gps-field-val">
                        {formatDate(selectedLog.gpsTimestamp || selectedLog.createdAt)}
                      </span>
                    </div>

                    <div className="gps-field">
                      <span className="gps-field-lbl">Server Received</span>
                      <span className="gps-field-val">
                        {formatDate(selectedLog.serverReceivedAt || selectedLog.createdAt)}
                      </span>
                    </div>

                    {selectedLog.vehicleNumber && (
                      <div className="gps-field">
                        <span className="gps-field-lbl">Associated Vehicle</span>
                        <span className="gps-field-val bus-val">
                          <Bus size={13} /> {selectedLog.vehicleNumber}
                        </span>
                      </div>
                    )}

                    {selectedLog.routeName && (
                      <div className="gps-field">
                        <span className="gps-field-lbl">Assigned Route</span>
                        <span className="gps-field-val route-val">
                          <Route size={13} /> {selectedLog.routeName}
                        </span>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="gps-empty-state">
                    <Crosshair size={24} color="#94a3b8" />
                    <span>No GPS coordinates were captured for this backend or administrative event.</span>
                  </div>
                )}
              </div>

              {/* Narrative Description */}
              <div
                className="detail-item"
                style={{
                  background: "#f8fafc",
                  padding: "12px",
                  borderRadius: "8px",
                  border: "1px solid #e2e8f0",
                }}
              >
                <span className="detail-lbl">Event Narrative</span>
                <span className="detail-val" style={{ marginTop: "4px", fontSize: "0.95rem" }}>
                  {selectedLog.description}
                </span>
              </div>

              {/* Failure Reason */}
              {selectedLog.failureReason && (
                <div className="failure-alert-box">
                  <AlertTriangle size={18} />
                  <div>
                    <strong>Failure Reason:</strong> {selectedLog.failureReason}
                  </div>
                </div>
              )}

              {/* Old Values vs New Values Comparison */}
              {(selectedLog.oldValues || selectedLog.newValues) && (
                <div>
                  <h4
                    style={{
                      margin: "0 0 8px 0",
                      fontSize: "0.85rem",
                      textTransform: "uppercase",
                      color: "#475569",
                    }}
                  >
                    State & Data Modification Diff
                  </h4>
                  <div className="diff-container">
                    {/* Old Values */}
                    <div className="diff-card old">
                      <div className="diff-card-header">
                        <XCircle size={14} /> Previous State (Old Values)
                      </div>
                      <pre className="diff-code-view">
                        {selectedLog.oldValues
                          ? JSON.stringify(selectedLog.oldValues, null, 2)
                          : "None (Initial Creation)"}
                      </pre>
                    </div>

                    {/* New Values */}
                    <div className="diff-card new">
                      <div className="diff-card-header">
                        <CheckCircle2 size={14} /> Updated State (New Values)
                      </div>
                      <pre className="diff-code-view">
                        {selectedLog.newValues
                          ? JSON.stringify(selectedLog.newValues, null, 2)
                          : "None (Deleted / No Change)"}
                      </pre>
                    </div>
                  </div>
                </div>
              )}


            </div>

            {/* Footer */}
            <div className="modal-footer">
              <button className="btn-modal-close" onClick={() => setSelectedLog(null)}>
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Standalone Interactive Map Modal */}
      {mapModalLog && hasLocation(mapModalLog) && (
        <div className="audit-modal-overlay" onClick={() => setMapModalLog(null)}>
          <div
            className="audit-map-modal-content"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Map Modal Header */}
            <div className="modal-header">
              <div className="modal-header-title">
                <MapPin size={22} color="#0284c7" />
                <h3>Event Location Map</h3>
                <span className="action-chip" style={{ marginLeft: "8px" }}>
                  {mapModalLog.action}
                </span>
                <span className="location-coords" style={{ marginLeft: "8px" }}>
                  {Number(mapModalLog.latitude).toFixed(6)}, {Number(mapModalLog.longitude).toFixed(6)}
                </span>
              </div>
              <button className="modal-close-btn" onClick={() => setMapModalLog(null)}>
                <X size={20} />
              </button>
            </div>

            {/* Map Container */}
            <div className="map-view-container">
              <MapContainer
                center={[parseFloat(mapModalLog.latitude), parseFloat(mapModalLog.longitude)]}
                zoom={16}
                scrollWheelZoom={true}
                style={{ width: "100%", height: "450px", borderRadius: "0 0 12px 12px" }}
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                <Marker position={[parseFloat(mapModalLog.latitude), parseFloat(mapModalLog.longitude)]}>
                  <Popup>
                    <div className="map-popup-card">
                      <div className="popup-title">{mapModalLog.action}</div>
                      <div className="popup-user">
                        <strong>User:</strong> {mapModalLog.userName} ({mapModalLog.userRole || "N/A"})
                      </div>
                      <div className="popup-app">
                        <strong>App:</strong> {mapModalLog.appName}
                      </div>
                      {mapModalLog.vehicleNumber && (
                        <div className="popup-bus">
                          <strong>Bus:</strong> {mapModalLog.vehicleNumber}
                        </div>
                      )}
                      {mapModalLog.routeName && (
                        <div className="popup-route">
                          <strong>Route:</strong> {mapModalLog.routeName}
                        </div>
                      )}
                      <div className="popup-time">
                        <strong>Timestamp:</strong> {formatDate(mapModalLog.createdAt)}
                      </div>
                      {mapModalLog.gpsAccuracy && (
                        <div className="popup-acc">
                          <strong>Accuracy:</strong> ±{Number(mapModalLog.gpsAccuracy).toFixed(1)} m
                        </div>
                      )}
                    </div>
                  </Popup>
                </Marker>
              </MapContainer>
            </div>

            {/* Map Modal Footer */}
            <div className="modal-footer" style={{ justifyContent: "space-between" }}>
              <div className="map-footer-hint">
                <span>
                  <strong>Recorded:</strong> {formatDate(mapModalLog.createdAt)} via {mapModalLog.appName}
                </span>
              </div>
              <button className="btn-modal-close" onClick={() => setMapModalLog(null)}>
                Close Map
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AuditLogs;
