import { useState, useEffect, useCallback, useMemo } from "react";
import {
  ArrowLeftRight,
  ArrowRight,
  Bus,
  CheckCircle2,
  Clock,
  Filter,
  GraduationCap,
  MapPin,
  QrCode,
  RefreshCw,
  Search,
  Shuffle,
  User,
  Users,
} from "lucide-react";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/Topbar";
import {
  fetchRoutes,
  fetchVehicles,
  fetchBusChanges,
  createBusChange,
  fetchBusRouteChangeHistory,
  socket,
} from "../../api";

const fmt = (d) =>
  new Date(d).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

const BusChange = () => {
  const [activeTab, setActiveTab] = useState("student_qr"); // "student_qr" | "route_swap"

  // Route Swap State
  const [routes, setRoutes] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState("");
  const [newVehicleId, setNewVehicleId] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Student QR Bus Change State
  const [studentHistory, setStudentHistory] = useState([]);
  const [studentLoading, setStudentLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [lastLiveChange, setLastLiveChange] = useState(null);

  // Load Route Swap data
  const loadRouteData = useCallback(async () => {
    setLoading(true);
    try {
      const [routesData, vehiclesData, historyData] = await Promise.all([
        fetchRoutes({ isActive: true }).catch(() => []),
        fetchVehicles().catch(() => []),
        fetchBusChanges().catch(() => []),
      ]);
      setRoutes(Array.isArray(routesData) ? routesData : []);
      setVehicles(Array.isArray(vehiclesData) ? vehiclesData : []);
      setHistory(Array.isArray(historyData) ? historyData : []);
    } catch (e) {
      console.error("BusChange load error", e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load Student QR change history
  const loadStudentHistory = useCallback(async () => {
    setStudentLoading(true);
    try {
      const res = await fetchBusRouteChangeHistory({
        search: searchQuery || undefined,
        status: statusFilter !== "ALL" ? statusFilter : undefined,
      });
      if (res?.data) {
        setStudentHistory(res.data);
      }
    } catch (e) {
      console.error("fetchBusRouteChangeHistory error", e);
    } finally {
      setStudentLoading(false);
    }
  }, [searchQuery, statusFilter]);

  useEffect(() => {
    loadRouteData();
    loadStudentHistory();
  }, [loadRouteData, loadStudentHistory]);

  // Real-time socket listener for live student bus changes
  useEffect(() => {
    if (!socket) return;

    const handleBusChangeConfirmed = (data) => {
      if (data) {
        setLastLiveChange(data);
        loadStudentHistory();
      }
    };

    socket.on("bus_route_change_confirmed", handleBusChangeConfirmed);
    socket.on("bus_change_audit", handleBusChangeConfirmed);

    return () => {
      socket.off("bus_route_change_confirmed", handleBusChangeConfirmed);
      socket.off("bus_change_audit", handleBusChangeConfirmed);
    };
  }, [loadStudentHistory]);

  const currentVehicle = vehicles.find((v) => v.id === selectedVehicleId);
  const newVehicle = vehicles.find((v) => v.id === newVehicleId);
  const vehicleOptions = vehicles.filter((v) => v.id !== selectedVehicleId);
  const matchingRoute = routes.find((r) => r.vehicleId === selectedVehicleId);

  const handleSubmitRouteSwap = async () => {
    setError("");
    if (!currentVehicle || !newVehicle) {
      setError("Pick a current vehicle and the replacement vehicle.");
      return;
    }
    setSubmitting(true);
    try {
      await createBusChange({
        routeId: matchingRoute?.id || null,
        routeName: matchingRoute?.routeName || currentVehicle.route,
        oldVehicleId: currentVehicle.id,
        oldVehicleNumber: currentVehicle.number,
        newVehicleId: newVehicle.id,
        newVehicleNumber: newVehicle.number,
        reason,
        changedBy: "admin",
      });
      setSelectedVehicleId("");
      setNewVehicleId("");
      setReason("");
      loadRouteData();
    } catch (e) {
      setError(e.message || "Failed to record bus change");
    } finally {
      setSubmitting(false);
    }
  };

  // Filter student history based on search
  const filteredStudentHistory = useMemo(() => {
    return studentHistory.filter((item) => {
      if (statusFilter !== "ALL" && item.status !== statusFilter) return false;
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        item.studentName?.toLowerCase().includes(q) ||
        item.studentRollNo?.toLowerCase().includes(q) ||
        item.referenceNumber?.toLowerCase().includes(q) ||
        item.oldBusNumber?.toLowerCase().includes(q) ||
        item.newBusNumber?.toLowerCase().includes(q) ||
        item.driverName?.toLowerCase().includes(q)
      );
    });
  }, [studentHistory, searchQuery, statusFilter]);

  const todayCount = useMemo(() => {
    const today = new Date().toDateString();
    return studentHistory.filter((h) => new Date(h.createdAt).toDateString() === today).length;
  }, [studentHistory]);

  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="main-content">
        <Topbar />
        <section className="page-content" style={{ maxWidth: 1200, margin: "0 auto" }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
            <div>
              <h1 style={{ display: "flex", alignItems: "center", gap: 10, margin: 0, fontSize: 24, fontWeight: 800, color: "#0F172A" }}>
                <ArrowLeftRight size={24} color="#2563EB" /> Bus & Route Management
              </h1>
              <p style={{ color: "#64748B", margin: "4px 0 0 0", fontSize: 14 }}>
                Track student Common QR bus changes and manage route vehicle allocations.
              </p>
            </div>

            {/* Tab Navigation */}
            <div style={{ display: "flex", background: "#E2E8F0", padding: 3, borderRadius: 10, gap: 2 }}>
              <button
                onClick={() => setActiveTab("student_qr")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: "none",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                  background: activeTab === "student_qr" ? "#FFFFFF" : "transparent",
                  color: activeTab === "student_qr" ? "#2563EB" : "#64748B",
                  boxShadow: activeTab === "student_qr" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                  transition: "all 0.15s ease",
                }}
              >
                <Shuffle size={15} /> Student QR Changes ({studentHistory.length})
              </button>
              <button
                onClick={() => setActiveTab("route_swap")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  padding: "8px 16px",
                  borderRadius: 8,
                  border: "none",
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: "pointer",
                  background: activeTab === "route_swap" ? "#FFFFFF" : "transparent",
                  color: activeTab === "route_swap" ? "#2563EB" : "#64748B",
                  boxShadow: activeTab === "route_swap" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                  transition: "all 0.15s ease",
                }}
              >
                <Bus size={15} /> Route Vehicle Swap
              </button>
            </div>
          </div>

          {/* TAB 1: STUDENT QR BUS / ROUTE CHANGE AUDIT TRAIL */}
          {activeTab === "student_qr" && (
            <div>
              {/* Metric Highlights */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16, marginBottom: 20 }}>
                <div style={{ background: "#FFFFFF", borderRadius: 12, padding: "16px 20px", border: "1px solid #E2E8F0", display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: "#EFF6FF", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Shuffle size={22} color="#2563EB" />
                  </div>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "#0F172A" }}>{studentHistory.length}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#64748B" }}>Total QR Changes Recorded</div>
                  </div>
                </div>

                <div style={{ background: "#FFFFFF", borderRadius: 12, padding: "16px 20px", border: "1px solid #E2E8F0", display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: "#ECFDF5", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <CheckCircle2 size={22} color="#10B981" />
                  </div>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "#0F172A" }}>{todayCount}</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#64748B" }}>Transferred Today</div>
                  </div>
                </div>

                <div style={{ background: "#FFFFFF", borderRadius: 12, padding: "16px 20px", border: "1px solid #E2E8F0", display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 10, background: "#F3E8FF", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <QrCode size={22} color="#8B5CF6" />
                  </div>
                  <div>
                    <div style={{ fontSize: 22, fontWeight: 800, color: "#0F172A" }}>Common QR</div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#64748B" }}>Multi-Student Ready</div>
                  </div>
                </div>
              </div>

              {/* Filters Bar */}
              <div style={{ background: "#FFFFFF", borderRadius: 12, padding: "14px 18px", border: "1px solid #E2E8F0", marginBottom: 16, display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 260 }}>
                  <div style={{ position: "relative", flex: 1 }}>
                    <Search size={16} color="#94A3B8" style={{ position: "absolute", left: 10, top: 10 }} />
                    <input
                      type="text"
                      placeholder="Search student, roll no, bus number, or ref ID…"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      style={{ width: "100%", padding: "8px 12px 8px 34px", borderRadius: 8, border: "1px solid #CBD5E1", fontSize: 13, outline: "none" }}
                    />
                  </div>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #CBD5E1", fontSize: 13, background: "#fff" }}
                  >
                    <option value="ALL">All Statuses</option>
                    <option value="COMPLETED">Completed</option>
                    <option value="PENDING">Pending</option>
                    <option value="CANCELLED">Cancelled</option>
                  </select>
                </div>

                <button
                  onClick={loadStudentHistory}
                  disabled={studentLoading}
                  style={{ display: "flex", alignItems: "center", gap: 6, background: "#F1F5F9", border: "1px solid #E2E8F0", padding: "8px 14px", borderRadius: 8, fontSize: 13, fontWeight: 700, color: "#475569", cursor: "pointer" }}
                >
                  <RefreshCw size={14} className={studentLoading ? "spin" : ""} /> Refresh
                </button>
              </div>

              {/* Live change toast notification banner */}
              {lastLiveChange && (
                <div style={{ background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: 10, padding: "10px 16px", marginBottom: 16, display: "flex", alignItems: "center", gap: 10 }}>
                  <CheckCircle2 size={18} color="#059669" />
                  <div style={{ fontSize: 13, color: "#065F46", flex: 1 }}>
                    <strong>Live Update:</strong> {lastLiveChange.studentName} ({lastLiveChange.studentRollNo || "Student"}) switched from <strong>{lastLiveChange.oldBusNumber}</strong> to <strong>{lastLiveChange.newBusNumber}</strong>. Ref: <code>{lastLiveChange.referenceNumber}</code>
                  </div>
                  <button onClick={() => setLastLiveChange(null)} style={{ background: "transparent", border: "none", color: "#059669", cursor: "pointer", fontWeight: 800 }}>✕</button>
                </div>
              )}

              {/* History Table */}
              <div style={{ background: "#FFFFFF", borderRadius: 12, border: "1px solid #E2E8F0", overflow: "hidden" }}>
                {studentLoading ? (
                  <div style={{ padding: 40, textAlign: "center", color: "#64748B" }}>
                    <RefreshCw size={24} className="spin" style={{ marginBottom: 8 }} />
                    <div>Loading bus change records...</div>
                  </div>
                ) : filteredStudentHistory.length === 0 ? (
                  <div style={{ padding: 48, textAlign: "center", color: "#94A3B8" }}>
                    <Shuffle size={36} color="#CBD5E1" style={{ marginBottom: 12 }} />
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#475569" }}>No Bus / Route Changes Found</div>
                    <div style={{ fontSize: 13, marginTop: 4 }}>Students scanning the Driver Common QR will appear here in real-time.</div>
                  </div>
                ) : (
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", textAlign: "left", fontSize: 13 }}>
                      <thead>
                        <tr style={{ background: "#F8FAFC", borderBottom: "1px solid #E2E8F0", color: "#475569", fontWeight: 700 }}>
                          <th style={{ padding: "12px 16px" }}>Reference</th>
                          <th style={{ padding: "12px 16px" }}>Student</th>
                          <th style={{ padding: "12px 16px" }}>Previous Assignment</th>
                          <th style={{ padding: "12px 16px" }}></th>
                          <th style={{ padding: "12px 16px" }}>New Assignment</th>
                          <th style={{ padding: "12px 16px" }}>Driver</th>
                          <th style={{ padding: "12px 16px" }}>Status</th>
                          <th style={{ padding: "12px 16px" }}>Date & Time</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredStudentHistory.map((row) => (
                          <tr key={row.id} style={{ borderBottom: "1px solid #F1F5F9" }}>
                            {/* Ref ID */}
                            <td style={{ padding: "14px 16px", fontFamily: "monospace", fontWeight: 700, color: "#8B5CF6" }}>
                              {row.referenceNumber}
                            </td>

                            {/* Student */}
                            <td style={{ padding: "14px 16px" }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                <div style={{ width: 32, height: 32, borderRadius: 16, background: "#EFF6FF", color: "#2563EB", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12 }}>
                                  {row.studentName?.charAt(0) || "S"}
                                </div>
                                <div>
                                  <div style={{ fontWeight: 700, color: "#0F172A" }}>{row.studentName}</div>
                                  <div style={{ fontSize: 11, color: "#64748B" }}>{row.studentRollNo || "—"}</div>
                                </div>
                              </div>
                            </td>

                            {/* Old Bus */}
                            <td style={{ padding: "14px 16px" }}>
                              <div style={{ fontWeight: 700, color: "#334155" }}>{row.oldBusNumber || "Not Assigned"}</div>
                              <div style={{ fontSize: 11, color: "#64748B" }}>{row.oldRouteName || "—"}</div>
                            </td>

                            {/* Arrow */}
                            <td style={{ padding: "14px 4px", color: "#8B5CF6", textAlign: "center" }}>
                              <ArrowRight size={16} />
                            </td>

                            {/* New Bus */}
                            <td style={{ padding: "14px 16px" }}>
                              <div style={{ fontWeight: 800, color: "#059669" }}>{row.newBusNumber}</div>
                              <div style={{ fontSize: 11, color: "#047857" }}>{row.newRouteName}</div>
                            </td>

                            {/* Driver */}
                            <td style={{ padding: "14px 16px", color: "#334155", fontWeight: 600 }}>
                              {row.driverName || "Driver"}
                            </td>

                            {/* Status */}
                            <td style={{ padding: "14px 16px" }}>
                              <span
                                style={{
                                  display: "inline-block",
                                  padding: "3px 8px",
                                  borderRadius: 6,
                                  fontSize: 11,
                                  fontWeight: 800,
                                  background: row.status === "COMPLETED" ? "#ECFDF5" : "#FEF2F2",
                                  color: row.status === "COMPLETED" ? "#059669" : "#DC2626",
                                }}
                              >
                                {row.status}
                              </span>
                            </td>

                            {/* Time */}
                            <td style={{ padding: "14px 16px", color: "#64748B", fontSize: 12 }}>
                              {fmt(row.confirmedAt || row.createdAt)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: ROUTE VEHICLE SWAP */}
          {activeTab === "route_swap" && (
            <div>
              <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: 20, maxWidth: 560, marginBottom: 32 }}>
                <h3 style={{ margin: "0 0 14px 0", fontSize: 16, fontWeight: 800, color: "#0F172A" }}>
                  Swap Vehicle for Route
                </h3>
                <label style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>CURRENT VEHICLE</label>
                <select
                  value={selectedVehicleId}
                  onChange={(e) => setSelectedVehicleId(e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", marginTop: 4, marginBottom: 14, borderRadius: 8, border: "1px solid #CBD5E1" }}
                >
                  <option value="">Select current vehicle…</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.number} — {v.route}
                    </option>
                  ))}
                </select>

                <label style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>NEW VEHICLE</label>
                <select
                  value={newVehicleId}
                  onChange={(e) => setNewVehicleId(e.target.value)}
                  disabled={!currentVehicle}
                  style={{ width: "100%", padding: "8px 10px", marginTop: 4, marginBottom: 14, borderRadius: 8, border: "1px solid #CBD5E1" }}
                >
                  <option value="">Select replacement vehicle…</option>
                  {vehicleOptions.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.number} {v.model ? `— ${v.model}` : ""}
                    </option>
                  ))}
                </select>

                <label style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>REASON (optional)</label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g. Breakdown, scheduled maintenance…"
                  style={{ width: "100%", padding: "8px 10px", marginTop: 4, marginBottom: 14, borderRadius: 8, border: "1px solid #CBD5E1", minHeight: 60 }}
                />

                {error && <div style={{ color: "#DC2626", fontSize: 13, marginBottom: 10 }}>{error}</div>}

                <button
                  onClick={handleSubmitRouteSwap}
                  disabled={submitting || !currentVehicle || !newVehicle}
                  style={{
                    background: "#1D4ED8",
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    padding: "10px 18px",
                    fontWeight: 700,
                    cursor: "pointer",
                    opacity: submitting || !currentVehicle || !newVehicle ? 0.6 : 1,
                  }}
                >
                  {submitting ? "Saving…" : "Confirm Bus Change"}
                </button>
              </div>

              <h3 style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                <Bus size={18} /> Route Swap History
              </h3>
              {loading ? (
                <div>Loading…</div>
              ) : history.length === 0 ? (
                <div style={{ color: "#94A3B8" }}>No route swaps recorded yet.</div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {history.map((h) => (
                    <div key={h.id} style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 10, padding: "12px 16px" }}>
                      <div style={{ fontWeight: 700 }}>
                        {h.routeName || "Route"}: {h.oldVehicleNumber} → {h.newVehicleNumber}
                      </div>
                      {h.reason && <div style={{ color: "#64748B", fontSize: 13 }}>{h.reason}</div>}
                      <div style={{ color: "#94A3B8", fontSize: 12, marginTop: 4 }}>
                        {h.changedBy} · {fmt(h.createdAt)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default BusChange;