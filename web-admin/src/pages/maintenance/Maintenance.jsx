import { useEffect, useState } from "react";
import {
    fetchMaintenanceOverview,
    createMaintenanceLog,
    fetchVehicles,
    socket,
} from "../../api";
import "./Maintenance.css";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/Topbar";

const ISSUE_TYPES = [
    "Engine/Mechanical",
    "Brakes",
    "Electrical",
    "Tyres",
    "AC/Cooling",
    "Body/Interior",
    "Other",
];

const PRIORITIES = ["Low", "Medium", "High", "Critical"];

const emptyForm = {
    vehicle: "",
    issueType: ISSUE_TYPES[0],
    priority: "Medium",
    raisedBy: "Super Admin",
    description: "",
    notify: {
        driver: true,
        students: true,
        parents: true,
        coordinator: false,
        hod: false,
    },
};

export default function Maintenance() {
    const [overview, setOverview] = useState({
        driverIssues: [],
        adminLogs: [],
        completedLog: [],
        summary: { openCount: 0, criticalCount: 0 },
    });
    const [vehicles, setVehicles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [lastUpdated, setLastUpdated] = useState(new Date());
    const [showDialog, setShowDialog] = useState(false);
    const [form, setForm] = useState(emptyForm);
    const [submitting, setSubmitting] = useState(false);
    const [logRange, setLogRange] = useState("daily");
    const [error, setError] = useState("");

    // ── SOS alerts, received live via socket ──
    const [sosAlerts, setSosAlerts] = useState([]);

    const loadOverview = async () => {
        setLoading(true);
        try {
            const data = await fetchMaintenanceOverview();
            setOverview(data);
            setLastUpdated(new Date());
        } catch (err) {
            console.error("Failed to load maintenance overview:", err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadOverview();
        fetchVehicles()
            .then(setVehicles)
            .catch((err) => console.error("Failed to load vehicles:", err));
    }, []);

    // ── Join the "maintenance" room and listen for SOS notifications ──
    useEffect(() => {
        socket.emit("joinRoom", "maintenance");

        const handleNewNotification = (notif) => {
            if (notif.type === "sos" || notif.type === "sos_resolved") {
                setSosAlerts((prev) => {
                    if (prev.some((a) => a.id === notif.id)) return prev;
                    return [notif, ...prev];
                });
            }
        };

        socket.on("new_notification", handleNewNotification);

        return () => {
            socket.off("new_notification", handleNewNotification);
        };
    }, []);

    const acknowledgeSos = (id) => {
        setSosAlerts((prev) =>
            prev.map((a) => (a.id === id ? { ...a, acknowledged: true } : a)),
        );
    };

    const openDialog = (prefill = {}) => {
        setForm({ ...emptyForm, ...prefill });
        setError("");
        setShowDialog(true);
    };

    const closeDialog = () => {
        if (submitting) return;
        setShowDialog(false);
    };

    const toggleNotify = (key) => {
        setForm((f) => ({ ...f, notify: { ...f.notify, [key]: !f.notify[key] } }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.vehicle || !form.description.trim()) {
            setError("Vehicle and description are required.");
            return;
        }
        setSubmitting(true);
        setError("");
        try {
            await createMaintenanceLog(form);
            setShowDialog(false);
            await loadOverview();
        } catch (err) {
            setError(err.message || "Failed to create maintenance log");
        } finally {
            setSubmitting(false);
        }
    };

    const filteredCompletedLog = overview.completedLog; // range filtering can hook in here later

    return (
        <div className="dashboard-layout">
            <Sidebar />
            <main className="main-content">
                <Topbar />
                <section className="page-content">
                    <div className="maintenance-page">
                        <div className="maintenance-header">
                            <h1>Maintenance &amp; Issues</h1>
                            <div className="maintenance-header-actions">
                                <span className="live-dot">
                                    <span className="dot" /> Live
                                </span>
                                <span className="last-updated">
                                    {lastUpdated.toLocaleTimeString([], {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                    })}
                                </span>
                                <button className="btn btn-light" onClick={loadOverview} disabled={loading}>
                                    ↻ Refresh
                                </button>
                                <button className="btn btn-alert" onClick={() => openDialog()}>
                                    🔔 Raise Alert
                                </button>
                            </div>
                        </div>

                        <div className="maintenance-subheader">
                            <div>
                                <h2>Maintenance &amp; Issues</h2>
                                <p className="subtitle">
                                    {overview.summary.openCount} open issues ·{" "}
                                    {overview.summary.criticalCount} critical
                                </p>
                            </div>
                            <button className="btn btn-primary" onClick={() => openDialog()}>
                                + Create Maintenance Log
                            </button>
                        </div>

                        {/* ── SOS ALERTS PANEL ── */}
                        {sosAlerts.length > 0 && (
                            <div className="panel" style={{ marginBottom: "1.5rem" }}>
                                <h3 className="panel-title" style={{ color: "#DC2626" }}>
                                    🚨 SOS ALERTS
                                </h3>
                                {sosAlerts.map((alert) => {
                                    const isResolved = alert.type === "sos_resolved" || alert.acknowledged;
                                    let parsed = {};
                                    try {
                                        parsed = typeof alert.data === "string" ? JSON.parse(alert.data) : (alert.data || {});
                                    } catch { }

                                    return (
                                        <div
                                            key={alert.id}
                                            style={{
                                                borderRadius: 10,
                                                border: `1.5px solid ${isResolved ? "#A7F3D0" : "#FCA5A5"}`,
                                                background: isResolved ? "#F0FDF4" : "#FEF2F2",
                                                padding: "12px 14px",
                                                marginBottom: 10,
                                            }}
                                        >
                                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                                                <strong style={{ color: isResolved ? "#065F46" : "#991B1B" }}>
                                                    {isResolved ? "✅ SOS RESOLVED" : "🚨 SOS EMERGENCY"}
                                                </strong>
                                                <span
                                                    style={{
                                                        fontSize: "0.7rem",
                                                        fontWeight: 700,
                                                        padding: "2px 8px",
                                                        borderRadius: 6,
                                                        color: "#fff",
                                                        background: isResolved ? "#10B981" : "#EF4444",
                                                    }}
                                                >
                                                    {isResolved ? "RESOLVED" : "ACTIVE"}
                                                </span>
                                            </div>

                                            <p style={{ margin: "0 0 6px 0", fontSize: "0.9rem", color: "#374151" }}>
                                                {alert.message}
                                            </p>

                                            <div style={{ fontSize: "0.8rem", color: "#6B7280", marginBottom: 6 }}>
                                                From: <strong>{alert.sender || "Unknown"}</strong>
                                                {parsed.vehicleId ? ` · Vehicle: ${parsed.vehicleId}` : ""}
                                            </div>

                                            {parsed.latitude != null && parsed.longitude != null && (
                                                <div style={{ fontSize: "0.8rem", color: "#2563EB", fontWeight: 600, marginBottom: 6 }}>
                                                    📍 GPS: {Number(parsed.latitude).toFixed(5)}, {Number(parsed.longitude).toFixed(5)}
                                                </div>
                                            )}

                                            <div style={{ fontSize: "0.75rem", color: "#9CA3AF", marginBottom: 8 }}>
                                                {alert.createdAt
                                                    ? new Date(alert.createdAt).toLocaleString([], {
                                                        day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                                                    })
                                                    : "Just now"}
                                            </div>

                                            {!isResolved && (
                                                <button
                                                    className="btn"
                                                    style={{
                                                        background: "#DC2626",
                                                        color: "#fff",
                                                        border: "none",
                                                        borderRadius: 8,
                                                        padding: "8px 14px",
                                                        fontWeight: 700,
                                                        cursor: "pointer",
                                                    }}
                                                    onClick={() => acknowledgeSos(alert.id)}
                                                >
                                                    Acknowledge SOS
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        <div className="maintenance-panels">
                            <div className="panel">
                                <h3 className="panel-title driver">🚛 Driver-Raised Issues</h3>
                                {overview.driverIssues.length === 0 && (
                                    <p className="empty-state">No open driver-raised issues.</p>
                                )}
                                {overview.driverIssues.map((issue) => (
                                    <div key={issue.id} className="issue-card">
                                        <div className="issue-card-top">
                                            <strong>{issue.type}</strong>
                                            <span className="badge badge-open">{issue.status}</span>
                                        </div>
                                        <p className="issue-desc">{issue.description}</p>
                                        <p className="issue-meta">
                                            🚌 {issue.vehicleId || "-"} · Driver: {issue.reportedBy}
                                        </p>
                                    </div>
                                ))}
                            </div>

                            <div className="panel">
                                <h3 className="panel-title admin">🔧 Admin Maintenance Logs</h3>
                                {overview.adminLogs.length === 0 && (
                                    <p className="empty-state">No active maintenance logs.</p>
                                )}
                                {overview.adminLogs.map((log) => (
                                    <div key={log.id} className="issue-card">
                                        <div className="issue-card-top">
                                            <strong>
                                                {log.issueType} — {log.vehicle}
                                            </strong>
                                        </div>
                                        <p className="issue-desc">{log.description}</p>
                                        <div className="issue-meta-row">
                                            <span>👤 {log.raisedBy}</span>
                                            <span className={`badge badge-priority-${log.priority?.toLowerCase()}`}>
                                                {log.priority}
                                            </span>
                                            <span className={`badge badge-status-${log.status?.toLowerCase()}`}>
                                                {log.status}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="panel completed-log-panel">
                            <div className="completed-log-header">
                                <h3 className="panel-title completed">✅ Completed Maintenance Log</h3>
                                <div className="log-controls">
                                    {["daily", "weekly", "yearly"].map((r) => (
                                        <button
                                            key={r}
                                            className={`btn btn-toggle ${logRange === r ? "active" : ""}`}
                                            onClick={() => setLogRange(r)}
                                        >
                                            {r.charAt(0).toUpperCase() + r.slice(1)}
                                        </button>
                                    ))}
                                    <button className="btn btn-download">⬇ Download CSV</button>
                                </div>
                            </div>
                            <table className="completed-log-table">
                                <thead>
                                    <tr>
                                        <th>Issue Type</th>
                                        <th>Vehicle</th>
                                        <th>Raised By</th>
                                        <th>Priority</th>
                                        <th>Resolved By</th>
                                        <th>Resolved At</th>
                                        <th>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredCompletedLog.map((row) => (
                                        <tr key={row.id}>
                                            <td>{row.issueType}</td>
                                            <td>{row.vehicle}</td>
                                            <td>{row.raisedBy}</td>
                                            <td>
                                                <span className={`badge badge-priority-${row.priority?.toLowerCase()}`}>
                                                    {row.priority}
                                                </span>
                                            </td>
                                            <td>{row.resolvedBy}</td>
                                            <td>
                                                {row.resolvedAt
                                                    ? new Date(row.resolvedAt).toLocaleString([], {
                                                        day: "2-digit",
                                                        month: "short",
                                                        hour: "2-digit",
                                                        minute: "2-digit",
                                                    })
                                                    : "-"}
                                            </td>
                                            <td>
                                                <span className="badge badge-resolved">{row.status}</span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {showDialog && (
                            <div className="modal-overlay" onClick={closeDialog}>
                                <div className="modal-box" onClick={(e) => e.stopPropagation()}>
                                    <div className="modal-header">
                                        <h3>🔧 Create Maintenance Log</h3>
                                        <button className="modal-close" onClick={closeDialog}>
                                            ✕
                                        </button>
                                    </div>

                                    <form onSubmit={handleSubmit} className="modal-form">
                                        <div className="form-row">
                                            <div className="form-group">
                                                <label>VEHICLE</label>
                                                <select
                                                    value={form.vehicle}
                                                    onChange={(e) => setForm({ ...form, vehicle: e.target.value })}
                                                    required
                                                >
                                                    <option value="">Select vehicle</option>
                                                    {vehicles.map((v) => (
                                                        <option key={v.id} value={v.number}>
                                                            {v.number}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div className="form-group">
                                                <label>ISSUE TYPE</label>
                                                <select
                                                    value={form.issueType}
                                                    onChange={(e) => setForm({ ...form, issueType: e.target.value })}
                                                >
                                                    {ISSUE_TYPES.map((t) => (
                                                        <option key={t} value={t}>
                                                            {t}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>

                                        <div className="form-row">
                                            <div className="form-group">
                                                <label>PRIORITY</label>
                                                <select
                                                    value={form.priority}
                                                    onChange={(e) => setForm({ ...form, priority: e.target.value })}
                                                >
                                                    {PRIORITIES.map((p) => (
                                                        <option key={p} value={p}>
                                                            {p}
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            <div className="form-group">
                                                <label>RAISED BY</label>
                                                <input
                                                    type="text"
                                                    value={form.raisedBy}
                                                    onChange={(e) => setForm({ ...form, raisedBy: e.target.value })}
                                                />
                                            </div>
                                        </div>

                                        <div className="form-group">
                                            <label>DESCRIPTION</label>
                                            <textarea
                                                rows={3}
                                                placeholder="Describe the issue in detail..."
                                                value={form.description}
                                                onChange={(e) => setForm({ ...form, description: e.target.value })}
                                                required
                                            />
                                        </div>

                                        <div className="form-group">
                                            <label>NOTIFY MEMBERS</label>
                                            <div className="notify-checkboxes">
                                                {[
                                                    ["driver", "Driver"],
                                                    ["students", "Students"],
                                                    ["parents", "Parents"],
                                                    ["coordinator", "Coordinator"],
                                                    ["hod", "HoD"],
                                                ].map(([key, label]) => (
                                                    <label key={key} className="checkbox-label">
                                                        <input
                                                            type="checkbox"
                                                            checked={form.notify[key]}
                                                            onChange={() => toggleNotify(key)}
                                                        />
                                                        {label}
                                                    </label>
                                                ))}
                                            </div>
                                        </div>

                                        {error && <p className="form-error">{error}</p>}

                                        <button type="submit" className="btn btn-submit" disabled={submitting}>
                                            {submitting ? "Creating..." : "🔧 CREATE MAINTENANCE LOG"}
                                        </button>
                                    </form>
                                </div>
                            </div>
                        )}
                    </div>
                </section>
            </main>
        </div>
    );
}