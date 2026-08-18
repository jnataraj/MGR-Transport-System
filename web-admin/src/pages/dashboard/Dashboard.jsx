import { useState, useEffect, useCallback, useContext } from "react";
import {
  BusFront,
  UserCog,
  GraduationCap,
  AlertTriangle,
  X,
  Bell,
  Calendar,
  Map as MapIcon,
  RefreshCw,
  ChevronRight,
  CheckCircle,
  Clock,
  Wrench,
  Route,
  Car,
} from "lucide-react";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";
import { AuthContext } from "../../context/AuthContext";
import { canSeeCard, hasPermission } from "../config/permissions/permissions";
import "./Dashboard.css";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/Topbar";
import { fetchVehicles, fetchLiveVehicles, fetchUsers, fetchMaintenanceOverview, API_BASE } from "../../api";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x,
  iconUrl: markerIcon,
  shadowUrl: markerShadow,
});

/* ── helpers ────────────────────────────────────────────────────── */
const fmt = (d) => {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const ZONE_COLORS = [
  "#3B82F6",
  "#10B981",
  "#7C3AED",
  "#F59E0B",
  "#EF4444",
  "#06B6D4",
];

/* ── priority badge ──────────────────────────────────────────────── */
const PriBadge = ({ p }) => {
  const map = {
    Critical: ["#DC2626", "#FEE2E2"],
    High: ["#D97706", "#FEF3C7"],
    Medium: ["#2563EB", "#DBEAFE"],
    Low: ["#059669", "#D1FAE5"],
  };
  const [c, bg] = map[p] || ["#64748B", "#F1F5F9"];
  return (
    <span className="db-pill" style={{ background: bg, color: c }}>
      {p}
    </span>
  );
};

const StatusBadge = ({ s }) => {
  const map = {
    open: ["#DC2626", "#FEE2E2"],
    resolved: ["#059669", "#D1FAE5"],
    Pending: ["#D97706", "#FEF3C7"],
    Acknowledged: ["#2563EB", "#DBEAFE"],
    Resolved: ["#059669", "#D1FAE5"],
  };
  const [c, bg] = map[s] || ["#64748B", "#F1F5F9"];
  return (
    <span className="db-pill" style={{ background: bg, color: c }}>
      {s}
    </span>
  );
};

/* ── Modal wrapper ───────────────────────────────────────────────── */
const Modal = ({ title, icon, onClose, children, width = 640 }) => (
  <div className="db-modal-overlay">
    <div className="db-modal" style={{ width }}>
      <div className="db-modal-header">
        <div className="db-modal-title">
          {icon} {title}
        </div>
        <button onClick={onClose} className="db-modal-close">
          <X size={16} />
        </button>
      </div>
      <div className="db-modal-body-pad">{children}</div>
    </div>
  </div>
);

/* ── Stat card ───────────────────────────────────────────────────── */
const StatCard = ({ icon, label, value, sub, color, bg, onClick, pulse }) => (
  <div
    onClick={onClick}
    className="db-stat-card"
    style={{
      border: `1.5px solid ${color}20`,
      cursor: onClick ? "pointer" : "default",
    }}
    onMouseEnter={(e) => {
      if (onClick) e.currentTarget.style.transform = "translateY(-2px)";
      e.currentTarget.style.boxShadow = `0 8px 28px ${color}20`;
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.transform = "translateY(0)";
      e.currentTarget.style.boxShadow = "0 2px 12px rgba(0,0,0,0.06)";
    }}
  >
    <div className="db-stat-icon-wrap" style={{ background: bg }}>
      {icon}
      {pulse && (
        <span className="db-stat-pulse-dot" style={{ background: color }} />
      )}
    </div>
    <div className="db-stat-body">
      <div className="db-stat-label">{label}</div>
      <div className="db-stat-value" style={{ color }}>
        {value}
      </div>
      {sub && <div className="db-stat-sub">{sub}</div>}
    </div>
    {onClick && <ChevronRight size={16} color="#CBD5E1" />}
  </div>
);

/* ═══════════════════════════════════════════════════════════════════
   DASHBOARD PAGE
═══════════════════════════════════════════════════════════════════ */
const Dashboard = () => {
  // ── State ──
  const [stats, setStats] = useState(null);
  const [alertBreak] = useState(null);
  const [zones] = useState([]);
  const [zoneBoarded] = useState({ boarded: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  // Live transit + halt indicators
  const [liveTransit, setLiveTransit] = useState({ inTransit: 0, dropped: 0 });
  const [activeHalts, setActiveHalts] = useState([]);
  const { user } = useContext(AuthContext);

  // Modals
  const [modal, setModal] = useState(null); // 'vehicles'|'drivers'|'issues'|'alerts'|'students'|'notify'

  // Alert tab inside alerts modal
  const [alertTab, setAlertTab] = useState("all"); // all|route|driver|admin

  // Route alerts tab on dashboard panel
  const [routeTab, setRouteTab] = useState("All");

  // Notification modal form
  const [notiForm, setNotiForm] = useState({
    route: "",
    type: "Bus Cancellation",
    from: "",
    to: "",
    message: "",
  });

  const [gpsData, setGpsData] = useState([]);
  const [attendanceMarkers, setAttendanceMarkers] = useState([]);
  const [liveAlerts, setLiveAlerts] = useState([]);

  // Ticking clock used to derive "idle" status during render without
  // calling Date.now() directly inside JSX (React purity rule)
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(iv);
  }, []);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [vehicles, drivers, maintenance, liveList] = await Promise.all([
        fetchVehicles(),
        fetchUsers("driver"),
        fetchMaintenanceOverview(),
        fetchLiveVehicles(),
      ]);

      const vehicleList = Array.isArray(vehicles) ? vehicles : [];
      const driverList = Array.isArray(drivers) ? drivers : [];
      const liveSet = new Set(Array.isArray(liveList) ? liveList : []);

      const isVehicleActive = (v) => {
        if (!v) return false;
        return liveSet.has(v.id) || (v.number && liveSet.has(v.number));
      };

      const isDriverActive = (d) => {
        if (!d) return false;
        return (
          liveSet.has(d.id) ||
          liveSet.has(d.vehicle) ||
          d.vehicleIds?.some((id) => liveSet.has(id)) ||
          (d.vehicles || []).some((v) => liveSet.has(v.id) || liveSet.has(v.number))
        );
      };

      const totalVehicles = vehicleList.length;
      const activeVehicles = vehicleList.filter(isVehicleActive).length;
      const activeDrivers = driverList.filter(isDriverActive).length;

      const openIssuesList = maintenance?.driverIssues || [];
      const maintenanceAlertsList = maintenance?.adminLogs || [];

      setStats({
        activeVehicles,
        totalVehicles,
        activeDrivers,
        systemIssues: openIssuesList.length + maintenanceAlertsList.length,
        driverIssues: openIssuesList.length,
        adminIssues: maintenanceAlertsList.length,
        openIssuesList,
        maintenanceAlertsList,
      });
      setLastRefresh(new Date());
    } catch (e) {
      console.error("Dashboard fetch error", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(fetchAll);
    const iv = setInterval(fetchAll, 30000); // auto-refresh every 30s
    return () => clearInterval(iv);
  }, [fetchAll]);

  // Socket.IO
  useEffect(() => {
    import("../../api").then(({ socket }) => {
      socket.on("busLocationChanged", (d) => {
        // Defensive: ignore anything not explicitly tagged as a driver/vehicle update
        if (d.role && d.role !== "driver") return;
        setGpsData((prev) => {
          const i = prev.findIndex((v) => v.id === (d.vehicleId || d.id));
          if (i !== -1) {
            const u = [...prev];
            u[i] = {
              ...u[i],
              lat: d.lat,
              lng: d.lng,
              lastMove: Date.now(),
              isHalted: d.isHalted,
            };
            return u;
          }
          return [
            ...prev,
            {
              id: d.vehicleId || d.id,
              lat: d.lat,
              lng: d.lng,
              type: "bus",
              lastMove: Date.now(),
              isHalted: false,
            },
          ];
        });
      });
      // Driver stopped GPS/trip — remove their marker from the map
      socket.on("busLocationStopped", (d) => {
        setGpsData((prev) =>
          prev.filter((v) => v.id !== (d.vehicleId || d.id)),
        );
        fetchAll();
      });
      socket.on("newMaintenanceAlert", () => fetchAll());
      socket.on("newIssue", () => fetchAll());
      socket.on("userUpdated", () => fetchAll());
      socket.on("vehicleUpdated", () => fetchAll());
      socket.on("vehicleMembersUpdated", () => fetchAll());
      // Live transit updates — re-fetch stats for accurate student boarded count
      socket.on("studentTransitUpdate", () => fetchAll());
      // Live QR attendance check-ins from drivers
      socket.on("attendance_scanned", (d) => {
        fetchAll();
        if (d.latitude && d.longitude) {
          setAttendanceMarkers((prev) => [
            ...prev,
            {
              id: d.userId + "_" + d.scannedAt,
              userId: d.userId,
              userName: d.userName || "User",
              userRole: d.userRole || "student",
              vehicleId: d.vehicleId,
              scanType: d.scanType,
              stage: d.stage || "UNKNOWN",
              lat: parseFloat(d.latitude),
              lng: parseFloat(d.longitude),
              scannedAt: d.scannedAt,
            }
          ]);
        }

        setLiveAlerts((prev) => [
          {
            id: d.userId + "_" + d.scannedAt,
            message: `+Alert to admin: ${d.userName || "User"} (${(d.userRole || "student").toUpperCase()}) scanned at stage [${d.stage || "UNKNOWN"}] on vehicle ${d.vehicleId}`,
            time: new Date(d.scannedAt).toLocaleTimeString(),
          },
          ...prev.slice(0, 19)
        ]);

        fetchAll();
      });
      // Halt events — update active halts list
      socket.on("vehicleHalted", (halt) => {
        setActiveHalts((prev) => [
          halt,
          ...prev.filter((h) => h.vehicleId !== halt.vehicleId),
        ]);
      });
      socket.on("vehicleResumed", (resume) => {
        setActiveHalts((prev) =>
          prev.filter((h) => h.haltId !== resume.haltId),
        );
      });
      socket.on("initialHalts", (halts) => setActiveHalts(halts || []));
    });
  }, [fetchAll]);

  // Fetch today's transit summary for live indicator
  useEffect(() => {
    const fetchTransit = async () => {
      try {
        const r = await fetch(`${API_BASE}/transit/today`).then((res) =>
          res.json(),
        );
        setLiveTransit({
          inTransit: r.summary?.inTransit || 0,
          dropped: r.summary?.dropped || 0,
        });
      } catch {
        /* empty */
      }
    };
    fetchTransit();
    const iv = setInterval(fetchTransit, 20000);
    return () => clearInterval(iv);
  }, []);

  /* ── derived ── */
  const issuesList = stats
    ? [...(stats.openIssuesList || []), ...(stats.maintenanceAlertsList || [])]
    : [];
  const alertsToday = alertBreak ? alertBreak.totals.total : 0;
  const routeAlerts = alertBreak?.routeAlerts || [];
  const todayRouteTabFiltered =
    routeTab === "All"
      ? routeAlerts
      : routeAlerts.filter((r) => r.notificationType === routeTab);

  /* ── colour helpers for zone bars ── */
  const zoneColor = (i) => ZONE_COLORS[i % ZONE_COLORS.length];

  /* ═══════════════════════════════════════════════════════════════
     MODALS
  ═══════════════════════════════════════════════════════════════ */

  const renderIssuesModal = () => (
    <Modal
      title="System Issues — Live"
      icon={<AlertTriangle size={18} color="#D97706" />}
      onClose={() => setModal(null)}
      width={720}
    >
      <div className="db-tab-row">
        {[
          {
            label: `Driver Issues (${stats?.driverIssues || 0})`,
            key: "driver",
            color: "#DC2626",
            bg: "#FEE2E2",
          },
          {
            label: `Admin Maintenance (${stats?.adminIssues || 0})`,
            key: "admin",
            color: "#D97706",
            bg: "#FEF3C7",
          },
        ].map((t) => (
          <button
            key={t.key}
            onClick={() => setAlertTab(t.key)}
            className="db-tab-btn"
            style={{
              background: alertTab === t.key ? t.color : t.bg,
              color: alertTab === t.key ? "#fff" : t.color,
            }}
          >
            {t.label}
          </button>
        ))}
        <button
          onClick={() => setAlertTab("all")}
          className="db-tab-btn"
          style={{
            background: alertTab === "all" ? "#475569" : "#F1F5F9",
            color: alertTab === "all" ? "#fff" : "#475569",
          }}
        >
          All ({issuesList.length})
        </button>
      </div>

      {/* Driver Issues */}
      {(alertTab === "all" || alertTab === "driver") && (
        <div className="db-section-block">
          <div className="db-section-heading" style={{ color: "#DC2626" }}>
            🚗 Driver-Raised Vehicle Issues
          </div>
          {(stats?.openIssuesList || []).length === 0 ? (
            <div className="db-empty-box">No open driver issues ✅</div>
          ) : (
            (stats?.openIssuesList || []).map((issue) => (
              <div key={issue.id} className="db-issue-row db-issue-row--driver">
                <div>
                  <div className="db-issue-title">{issue.type}</div>
                  <div className="db-issue-desc">{issue.description}</div>
                  <div className="db-issue-meta">
                    🚌 Vehicle: {issue.vehicleId || "N/A"} &nbsp;|&nbsp; 👤{" "}
                    {issue.reportedBy} &nbsp;|&nbsp; 🕐 {fmt(issue.createdAt)}
                  </div>
                </div>
                <StatusBadge s={issue.status} />
              </div>
            ))
          )}
        </div>
      )}

      {/* Admin Maintenance Alerts */}
      {(alertTab === "all" || alertTab === "admin") && (
        <div>
          <div className="db-section-heading" style={{ color: "#D97706" }}>
            🔧 Admin Maintenance Alerts
          </div>
          {(stats?.maintenanceAlertsList || []).length === 0 ? (
            <div className="db-empty-box">No pending maintenance alerts ✅</div>
          ) : (
            (stats?.maintenanceAlertsList || []).map((alert) => (
              <div key={alert.id} className="db-issue-row db-issue-row--admin">
                <div>
                  <div className="db-issue-title">{alert.issueType}</div>
                  <div className="db-issue-desc">{alert.description}</div>
                  <div className="db-issue-meta">
                    🚌 {alert.vehicle} &nbsp;|&nbsp; 👤 {alert.raisedBy}{" "}
                    &nbsp;|&nbsp; 🕐 {fmt(alert.createdAt)}
                  </div>
                </div>
                <div className="db-issue-badges">
                  <PriBadge p={alert.priority} />
                  <StatusBadge s={alert.status} />
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </Modal>
  );

  const renderAlertsModal = () => {
    const tabs = [
      {
        key: "all",
        label: `All (${alertBreak?.totals?.total || 0})`,
        color: "#475569",
      },
      {
        key: "route",
        label: `Route (${alertBreak?.totals?.route || 0})`,
        color: "#B91C1C",
      },
      {
        key: "driver",
        label: `Driver Issues (${alertBreak?.totals?.driver || 0})`,
        color: "#D97706",
      },
      {
        key: "admin",
        label: `Maintenance (${alertBreak?.totals?.admin || 0})`,
        color: "#7C3AED",
      },
    ];
    const today = alertBreak?.today || "—";

    const renderList = (items, emptyMsg, renderRow) =>
      items.length === 0 ? (
        <div className="db-empty-box">{emptyMsg}</div>
      ) : (
        items.map(renderRow)
      );

    return (
      <Modal
        title={`Alerts Raised — Today (${today})`}
        icon={<Bell size={18} color="#B91C1C" />}
        onClose={() => setModal(null)}
        width={760}
      >
        {/* Summary counters */}
        <div className="db-summary-grid">
          {[
            {
              label: "Route Alerts",
              val: alertBreak?.totals?.route || 0,
              color: "#B91C1C",
              bg: "#FEF2F2",
              icon: <Route size={15} />,
            },
            {
              label: "Driver Issues",
              val: alertBreak?.totals?.driver || 0,
              color: "#D97706",
              bg: "#FFFBEB",
              icon: <Car size={15} />,
            },
            {
              label: "Maintenance Logs",
              val: alertBreak?.totals?.admin || 0,
              color: "#7C3AED",
              bg: "#F5F3FF",
              icon: <Wrench size={15} />,
            },
          ].map((c) => (
            <div
              key={c.label}
              className="db-summary-card"
              style={{ background: c.bg, border: `1px solid ${c.color}20` }}
            >
              <div style={{ color: c.color }}>{c.icon}</div>
              <div>
                <div className="db-summary-value" style={{ color: c.color }}>
                  {c.val}
                </div>
                <div className="db-summary-label">{c.label}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div className="db-tab-row">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setAlertTab(t.key)}
              className="db-tab-btn"
              style={{
                background: alertTab === t.key ? t.color : "#F1F5F9",
                color: alertTab === t.key ? "#fff" : t.color,
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Route alerts */}
        {(alertTab === "all" || alertTab === "route") && (
          <section className="db-section-block">
            <div
              className="db-section-heading db-section-heading--sm"
              style={{ color: "#B91C1C" }}
            >
              🗺 Route Alerts (Coordinator/Admin)
            </div>
            {renderList(
              alertBreak?.routeAlerts || [],
              "No route alerts today ✅",
              (r) => (
                <div key={r.id} className="db-alert-row db-alert-row--route">
                  <div className="db-alert-row-top">
                    <div className="db-issue-title">{r.routeName}</div>
                    <span className="db-pill db-pill--solid-red">
                      {r.notificationType}
                    </span>
                  </div>
                  <div className="db-issue-desc db-issue-desc--top4">
                    {r.customMessage || "—"}
                  </div>
                  <div className="db-issue-meta db-issue-meta--top4">
                    📅 {r.effectiveDate} {r.effectiveTime} &nbsp;|&nbsp; 🕐{" "}
                    {fmt(r.createdAt)} &nbsp;|&nbsp; 👥 {r.totalStudents}s{" "}
                    {r.totalParents}p
                  </div>
                </div>
              ),
            )}
          </section>
        )}

        {/* Driver issues */}
        {(alertTab === "all" || alertTab === "driver") && (
          <section className="db-section-block">
            <div
              className="db-section-heading db-section-heading--sm"
              style={{ color: "#D97706" }}
            >
              🚗 Driver-Raised Vehicle Issues
            </div>
            {renderList(
              alertBreak?.driverIssues || [],
              "No driver issues today ✅",
              (d) => (
                <div key={d.id} className="db-alert-row db-alert-row--driver">
                  <div className="db-alert-row-top">
                    <div className="db-issue-title">{d.type}</div>
                    <StatusBadge s={d.status} />
                  </div>
                  <div className="db-issue-desc">{d.description}</div>
                  <div className="db-issue-meta">
                    🚌 {d.vehicleId || "N/A"} &nbsp;|&nbsp; 👤 {d.reportedBy}{" "}
                    &nbsp;|&nbsp; 🕐 {fmt(d.createdAt)}
                  </div>
                </div>
              ),
            )}
          </section>
        )}

        {/* Admin/maintenance alerts */}
        {(alertTab === "all" || alertTab === "admin") && (
          <section>
            <div
              className="db-section-heading db-section-heading--sm"
              style={{ color: "#7C3AED" }}
            >
              🔧 Admin Maintenance Logs
            </div>
            {renderList(
              alertBreak?.adminAlerts || [],
              "No maintenance alerts today ✅",
              (a) => (
                <div key={a.id} className="db-alert-row db-alert-row--admin">
                  <div className="db-alert-row-top">
                    <div className="db-issue-title">
                      {a.issueType} — {a.vehicle}
                    </div>
                    <div className="db-issue-badges">
                      <PriBadge p={a.priority} />
                      <StatusBadge s={a.status} />
                    </div>
                  </div>
                  <div className="db-issue-desc">{a.description}</div>
                  <div className="db-issue-meta">
                    👤 {a.raisedBy} &nbsp;|&nbsp; 🕐 {fmt(a.createdAt)}
                  </div>
                </div>
              ),
            )}
          </section>
        )}
      </Modal>
    );
  };

  const renderStudentsModal = () => (
    <Modal
      title={`Students Boarded Today`}
      icon={<GraduationCap size={18} color="#7E22CE" />}
      onClose={() => setModal(null)}
      width={580}
    >
      <div className="db-students-summary-grid">
        <div className="db-students-summary-card db-students-summary-card--purple">
          <div
            className="db-students-summary-value"
            style={{ color: "#7C3AED" }}
          >
            {zoneBoarded.boarded}
          </div>
          <div className="db-students-summary-label">Boarded Today</div>
        </div>
        <div className="db-students-summary-card db-students-summary-card--green">
          <div
            className="db-students-summary-value"
            style={{ color: "#059669" }}
          >
            {zoneBoarded.total}
          </div>
          <div className="db-students-summary-label">Total Assigned</div>
        </div>
      </div>
      <div className="db-zone-heading">Zone-wise Attendance Breakdown</div>
      {zones.length === 0 ? (
        <div className="db-zone-empty">No zone data available</div>
      ) : (
        zones.map((z, i) => (
          <div key={z.zone} className="db-zone-row">
            <div className="db-zone-row-top">
              <span>
                {z.zone}{" "}
                <span className="db-zone-vehicle-count">
                  ({z.vehicles?.length || 0} vehicles)
                </span>
              </span>
              <span
                className="db-zone-percentage"
                style={{ color: zoneColor(i) }}
              >
                {z.present}/{z.assigned} — {z.percentage}%
              </span>
            </div>
            <div className="db-zone-bar-track">
              <div
                className="db-zone-bar-fill"
                style={{ width: `${z.percentage}%`, background: zoneColor(i) }}
              />
            </div>
          </div>
        ))
      )}
    </Modal>
  );

  const renderNotifyModal = () => (
    <Modal
      title="Raise Route Notification"
      icon={<Bell size={18} color="#B91C1C" />}
      onClose={() => setModal(null)}
      width={560}
    >
      <div className="db-notify-form">
        <div className="db-notify-grid-2">
          <div>
            <label className="db-notify-label">TARGET ROUTE / ZONE</label>
            <select
              value={notiForm.route}
              onChange={(e) =>
                setNotiForm((p) => ({ ...p, route: e.target.value }))
              }
              className="db-notify-select"
            >
              <option value="">All Zones (Tamil Nadu)</option>
              <option>Chennai - Route 1</option>
              <option>Chennai - Route 6 (TAMBARAM)</option>
              <option>Arani - Route 1</option>
              <option>Bangalore - Route 1</option>
            </select>
          </div>
          <div>
            <label className="db-notify-label">ALERT TYPE</label>
            <select
              value={notiForm.type}
              onChange={(e) =>
                setNotiForm((p) => ({ ...p, type: e.target.value }))
              }
              className="db-notify-select"
            >
              {[
                "Bus Cancellation",
                "Delay (Road/Tech)",
                "Vehicle Change (Maintenance)",
                "Driver Reassignment",
              ].map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="db-notify-label db-notify-label--icon">
            <Calendar size={14} /> VALIDITY / DURATION
          </label>
          <div className="db-notify-date-row">
            <input
              type="date"
              value={notiForm.from}
              onChange={(e) =>
                setNotiForm((p) => ({ ...p, from: e.target.value }))
              }
              className="db-notify-date-input"
            />
            <span className="db-notify-date-to">to</span>
            <input
              type="date"
              value={notiForm.to}
              onChange={(e) =>
                setNotiForm((p) => ({ ...p, to: e.target.value }))
              }
              className="db-notify-date-input"
            />
          </div>
        </div>
        <div>
          <label className="db-notify-label">NOTIFICATION MESSAGE</label>
          <textarea
            value={notiForm.message}
            onChange={(e) =>
              setNotiForm((p) => ({ ...p, message: e.target.value }))
            }
            placeholder="Enter the official message for students and parents..."
            className="db-notify-textarea"
          />
        </div>
        <button
          onClick={() => {
            alert("Emergency Broadcast Sent!");
            setModal(null);
          }}
          className="db-notify-send-btn"
        >
          📢 SEND NOTIFICATION TO ALL MEMBERS
        </button>
      </div>
    </Modal>
  );

  /* ═══════════════════════════════════════════════════════════════
     RENDER
  ═══════════════════════════════════════════════════════════════ */
  return (
    <div className="dashboard-layout">
      <Sidebar />
      <main className="main-content">
        <Topbar />
        <section className="page-content db-page-content">
          {/* ── MODALS ── */}
          {modal === "issues" && renderIssuesModal()}
          {modal === "alerts" && renderAlertsModal()}
          {modal === "students" && renderStudentsModal()}
          {modal === "notify" && renderNotifyModal()}

          {/* ── HEADER ── */}
          <div className="db-header">
            <div>
              <h1 className="db-header-title">Dashboard Overview</h1>
              <div className="db-header-sub-row">
                <p className="db-header-sub">
                  Terminal monitoring &amp; emergency fleet control
                </p>
                {lastRefresh && (
                  <span className="db-header-updated">
                    <Clock size={11} /> Updated{" "}
                    {lastRefresh.toLocaleTimeString("en-IN", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                )}
              </div>
            </div>
            <div className="db-header-actions">
              <button onClick={fetchAll} className="db-refresh-btn">
                <RefreshCw
                  size={14}
                  className={loading ? "db-spin" : undefined}
                />{" "}
                Refresh
              </button>
              {hasPermission(user, "broadcastEmergency") && (
                <button
                  onClick={() => setModal("notify")}
                  className="db-notify-btn"
                >
                  <Bell size={16} /> RAISE NOTIFICATION
                </button>
              )}
            </div>
          </div>

          {/* ── STAT CARDS ── */}
          <div className="db-stat-grid">
            {canSeeCard(user, "activeVehicles") && (
              <StatCard
                icon={<BusFront size={22} color="#1D4ED8" />}
                label="Active Vehicles"
                color="#1D4ED8"
                bg="#DBEAFE"
                // value={loading ? "…" : `${stats?.activeVehicles ?? 0}/${stats?.totalVehicles ?? 0}`}
                value={loading ? "…" : `${stats?.activeVehicles ?? 0}/${stats?.totalVehicles ?? 0}`}
                sub="Fleet online"
                onClick={() => (window.location.href = "/vehicles")}
              />
            )}
            {canSeeCard(user, "activeDrivers") && (
              <StatCard
                icon={<UserCog size={22} color="#047857" />}
                label="Active Drivers"
                color="#047857"
                bg="#D1FAE5"
                value={loading ? "…" : (stats?.activeDrivers ?? 0)}
                sub="On duty now"
                onClick={() => (window.location.href = "/drivers")}
              />
            )}
            {canSeeCard(user, "systemIssues") && (
              <StatCard
                icon={<AlertTriangle size={22} color="#D97706" />}
                label="System Issues"
                color="#D97706"
                bg="#FEF3C7"
                value={loading ? "…" : (stats?.systemIssues ?? 0)}
                sub={`${stats?.driverIssues ?? 0} driver • ${stats?.adminIssues ?? 0} admin`}
                onClick={() => { setAlertTab("all"); setModal("issues"); }}
                pulse={stats?.systemIssues > 0}
              />
            )}
            {canSeeCard(user, "alertsRaised") && (
              <StatCard
                icon={<Bell size={22} color="#B91C1C" />}
                label="Alerts Raised"
                color="#B91C1C"
                bg="#FEE2E2"
                value={loading ? "…" : alertsToday}
                sub="Today — tap for split"
                onClick={() => { setAlertTab("all"); setModal("alerts"); }}
                pulse={alertsToday > 0}
              />
            )}
            {canSeeCard(user, "studentsBoarded") && (
              <StatCard
                icon={<GraduationCap size={22} color="#7E22CE" />}
                label="Students Boarded"
                color="#7E22CE"
                bg="#F3E8FF"
                value={loading ? "…" : zoneBoarded.boarded}
                sub={`of ${zoneBoarded.total} assigned`}
                onClick={() => setModal("students")}
              />
            )}
          </div>

          {/* ── LIVE TRANSIT INDICATOR BAR ── */}
          {canSeeCard(user, "liveTransit") &&
            (liveTransit.inTransit > 0 || activeHalts.length > 0) && (
              <div className="db-live-bar">
                {liveTransit.inTransit > 0 && (
                  <div className="db-transit-chip">
                    <span className="db-transit-dot" />
                    <span className="db-transit-count">
                      {liveTransit.inTransit} Students In-Transit
                    </span>
                    <span className="db-transit-dropped">
                      · {liveTransit.dropped} dropped today
                    </span>
                  </div>
                )}
                {activeHalts.length > 0 && (
                  <div className="db-halt-bar">
                    <span className="db-halt-label">
                      ⏸ {activeHalts.length} Active Halt
                      {activeHalts.length !== 1 ? "s" : ""}:
                    </span>
                    {activeHalts.slice(0, 4).map((h) => (
                      <span key={h.haltId || h.id} className="db-halt-chip">
                        🚌 {h.vehicleNumber || h.vehicleId} — {h.haltReason}
                        {h.studentCount > 0 && ` (${h.studentCount} students)`}
                      </span>
                    ))}
                    {activeHalts.length > 4 && (
                      <span className="db-halt-more">
                        +{activeHalts.length - 4} more
                      </span>
                    )}
                    <a href="/settings" className="db-halt-link">
                      View Halt List →
                    </a>
                  </div>
                )}
              </div>
            )}

          {/* ── MAIN CONTENT GRID ── */}
          <div className="db-main-grid">
            {/* ── LEFT: Route Alerts Panel ── */}
            {canSeeCard(user, "routeAlerts") && (
              <div className="db-panel">
                <div className="db-panel-header">
                  <h3 className="db-panel-title db-panel-title--red">
                    <Bell size={18} /> Overall Route Alerts
                  </h3>
                  <div className="db-route-tab-row">
                    {[
                      "All",
                      "RouteChange",
                      "DelayedDeparture",
                      "Closure",
                      "Emergency",
                    ].map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setRouteTab(tab)}
                        className={
                          "db-route-tab-btn" +
                          (routeTab === tab ? " db-route-tab-btn--active" : "")
                        }
                      >
                        {tab === "All"
                          ? "All"
                          : tab.replace(/([A-Z])/g, " $1").trim()}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="db-route-list">
                  {loading ? (
                    <div className="db-route-loading">Loading…</div>
                  ) : todayRouteTabFiltered.length === 0 ? (
                    <div className="db-route-empty">
                      <CheckCircle
                        size={28}
                        color="#CBD5E1"
                        className="db-route-empty-icon"
                      />
                      <p className="db-route-empty-text">
                        No {routeTab === "All" ? "" : routeTab} route alerts
                        today.
                      </p>
                    </div>
                  ) : (
                    todayRouteTabFiltered.map((r) => {
                      const typeColor =
                        r.notificationType === "Closure" ||
                          r.notificationType === "Emergency"
                          ? "#EF4444"
                          : r.notificationType === "DelayedDeparture"
                            ? "#F59E0B"
                            : "#3B82F6";
                      return (
                        <div
                          key={r.id}
                          className="db-route-card"
                          style={{ borderLeft: `5px solid ${typeColor}` }}
                          onMouseEnter={(e) =>
                            (e.currentTarget.style.boxShadow = `0 4px 16px ${typeColor}25`)
                          }
                          onMouseLeave={(e) =>
                          (e.currentTarget.style.boxShadow =
                            "0 2px 6px rgba(0,0,0,0.05)")
                          }
                        >
                          <div className="db-route-card-top">
                            <div
                              className="db-route-card-name"
                              style={{ color: typeColor }}
                            >
                              {r.routeName}
                            </div>
                            <span
                              className="db-route-card-type"
                              style={{ background: typeColor }}
                            >
                              {r.notificationType}
                            </span>
                          </div>
                          <p className="db-route-card-msg">
                            {r.customMessage || "—"}
                          </p>
                          <div className="db-route-card-meta">
                            <Calendar size={11} /> {r.effectiveDate}{" "}
                            {r.effectiveTime}
                            &nbsp;|&nbsp; 👥 {r.totalStudents} students ·{" "}
                            {r.totalParents} parents
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {/* ── RIGHT: Zone Attendance ── */}
            {canSeeCard(user, "studentsBoarded") && (
              <div className="db-panel db-zone-panel">
                <div className="db-zone-panel-header">
                  <h3 className="db-panel-title db-panel-title--blue">
                    <BusFront size={18} /> Zone Attendance Monitor
                  </h3>
                  <button
                    onClick={() => setModal("students")}
                    className="db-details-btn"
                  >
                    Details
                  </button>
                </div>

                {/* Total boarded progress ring summary */}
                <div className="db-progress-summary">
                  <div className="db-progress-ring">
                    <span className="db-progress-ring-text">
                      {zoneBoarded.total > 0
                        ? Math.round(
                          (zoneBoarded.boarded / zoneBoarded.total) * 100,
                        )
                        : 0}
                      %
                    </span>
                  </div>
                  <div>
                    <div className="db-progress-title">
                      {zoneBoarded.boarded} Boarded
                    </div>
                    <div className="db-progress-sub">
                      of {zoneBoarded.total} assigned students today
                    </div>
                  </div>
                </div>

                <div className="db-zone-scroll">
                  {loading ? (
                    <div className="db-zone-loading">Loading attendance…</div>
                  ) : zones.length === 0 ? (
                    <div className="db-zone-empty-small">
                      No zone data available
                    </div>
                  ) : (
                    zones.map((z, i) => (
                      <div key={z.zone}>
                        <div className="db-zone-row-top">
                          <span className="db-zone-name">{z.zone}</span>
                          <span
                            className="db-zone-percentage"
                            style={{ color: zoneColor(i) }}
                          >
                            {z.percentage}%
                          </span>
                        </div>
                        <div className="db-zone-bar-track db-zone-bar-track--sm">
                          <div
                            className="db-zone-bar-fill"
                            style={{
                              width: `${z.percentage}%`,
                              background: zoneColor(i),
                            }}
                          />
                        </div>
                        <div className="db-zone-detail-meta">
                          {z.present}/{z.assigned} &nbsp;·&nbsp;{" "}
                          {z.vehicles?.length || 0} vehicles
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <p className="db-zone-footer-note">
                  Aggregated attendance — <strong>State-wide</strong> fleet
                  operations
                </p>
              </div>
            )}

            {/* ── Fallback when neither panel is visible ── */}
            {!canSeeCard(user, "routeAlerts") && !canSeeCard(user, "studentsBoarded") && (
              <div
                className="db-panel"
                style={{
                  gridColumn: "1 / -1",
                  textAlign: "center",
                  color: "#94A3B8",
                  padding: "40px 0",
                }}
              >
                No panels available for your access level.
              </div>
            )}
          </div>

          {canSeeCard(user, "map") && (
            <div className="db-map-card">
              <div className="db-map-header">
                <h2 className="db-map-title">
                  <MapIcon size={20} color="#2563EB" /> Global Fleet Tracking
                </h2>
                <span className="db-map-live-badge">
                  <span className="db-map-live-dot" />
                  Live Updates Active
                </span>
              </div>
              <div className="db-map-wrap">
                <style>{`
                .leaflet-container { width: 100%; height: 100%; z-index: 1; }
                @keyframes mapPing { 0% { box-shadow: 0 0 0 0 rgba(16,185,129,0.7); } 70% { box-shadow: 0 0 0 10px rgba(16,185,129,0); } 100% { box-shadow: 0 0 0 0 rgba(16,185,129,0); } }
                @keyframes fadeIn { from { opacity:0 } to { opacity:1 } }
                @keyframes scaleIn { from { opacity:0;transform:scale(0.95) } to { opacity:1;transform:scale(1) } }
                @keyframes pulseDot { 0%,100% { transform:scale(1);opacity:0.6 } 50% { transform:scale(1.8);opacity:0 } }
                @keyframes spin { from { transform:rotate(0deg) } to { transform:rotate(360deg) } }
                @keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.5} }
              `}</style>
                <MapContainer
                  center={[13.06, 80.26]}
                  zoom={12}
                  scrollWheelZoom={true}
                >
                  <TileLayer
                    attribution="&copy; OpenStreetMap contributors"
                    url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                  />
                  {gpsData.map((v) => {
                    const idle = now - v.lastMove > 5000;
                    const pinColor = idle ? "#EF4444" : "#10B981";
                    const icon = L.divIcon({
                      className: "custom-vehicle-marker",
                      html: `<div style="display:flex;flex-direction:column;align-items:center;transform:translateY(-10px)"><div style="background:#1F2937;color:#fff;padding:4px 8px;border-radius:4px;font-size:0.75rem;font-weight:800;margin-bottom:6px;box-shadow:0 2px 4px rgba(0,0,0,0.2);white-space:nowrap;font-family:sans-serif">${v.id}</div><div style="width:20px;height:20px;background:${pinColor};border-radius:50%;border:3px solid #fff;animation:${idle ? "none" : "mapPing 1.5s infinite"};box-shadow:0 2px 4px rgba(0,0,0,0.3)"></div></div>`,
                      iconSize: [60, 60],
                      iconAnchor: [30, 30],
                    });
                    return (
                      <Marker key={v.id} position={[v.lat, v.lng]} icon={icon}>
                        <Popup>
                          <strong>Vehicle: {v.id}</strong>
                          <br />
                          Type: {v.type.toUpperCase()}
                          <br />
                          Status:{" "}
                          <strong style={{ color: pinColor }}>
                            {idle ? "IDLE" : "MOVING"}
                          </strong>
                        </Popup>
                      </Marker>
                    );
                  })}
                  {attendanceMarkers.map((marker) => {
                    const isCoord = marker.userRole?.toLowerCase() === "coordinator";
                    const pinColor = isCoord ? "#F59E0B" : "#3B82F6";
                    const label = isCoord ? "Coord" : "Student";
                    const icon = L.divIcon({
                      className: "custom-checkin-marker",
                      html: `<div style="display:flex;flex-direction:column;align-items:center;transform:translateY(-10px)"><div style="background:${pinColor};color:#fff;padding:2px 6px;border-radius:4px;font-size:0.65rem;font-weight:800;margin-bottom:4px;box-shadow:0 1px 3px rgba(0,0,0,0.2);white-space:nowrap;font-family:sans-serif">${marker.userName} (${label})</div><div style="width:12px;height:12px;background:${pinColor};border-radius:50%;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,0.3)"></div></div>`,
                      iconSize: [50, 50],
                      iconAnchor: [25, 25],
                    });
                    return (
                      <Marker key={marker.id} position={[marker.lat, marker.lng]} icon={icon}>
                        <Popup>
                          <strong>{marker.userName} ({label})</strong>
                          <br />
                          Scanned on: <strong>{marker.vehicleId}</strong>
                          <br />
                          Stage: <strong>{marker.stage}</strong>
                          <br />
                          Time: <strong>{new Date(marker.scannedAt).toLocaleTimeString()}</strong>
                        </Popup>
                      </Marker>
                    );
                  })}
                </MapContainer>

                {/* Live Admin Alerts Overlay */}
                <div className="db-map-alerts" style={{
                  position: "absolute",
                  top: "10px",
                  right: "10px",
                  width: "280px",
                  maxHeight: "350px",
                  backgroundColor: "rgba(30, 41, 59, 0.95)",
                  borderRadius: "12px",
                  padding: "14px",
                  color: "#fff",
                  zIndex: 10,
                  display: "flex",
                  flexDirection: "column",
                  boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.3)",
                  border: "1px solid rgba(255, 255, 255, 0.1)",
                  backdropFilter: "blur(4px)",
                  overflow: "hidden"
                }}>
                  <h3 style={{
                    fontSize: "12px",
                    fontWeight: "900",
                    letterSpacing: "0.05em",
                    margin: "0 0 10px 0",
                    color: "#3B82F6",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                    borderBottom: "1px solid rgba(255,255,255,0.1)",
                    paddingBottom: "8px"
                  }}>
                    <span style={{
                      display: "inline-block",
                      width: "8px",
                      height: "8px",
                      backgroundColor: "#EF4444",
                      borderRadius: "50%",
                      animation: "pulseDot 1.5s infinite"
                    }}></span>
                    ⚡ LIVE BOARDING ALERTS
                  </h3>
                  <div style={{
                    flex: 1,
                    overflowY: "auto",
                    display: "flex",
                    flexDirection: "column",
                    gap: "8px",
                    paddingRight: "4px"
                  }} className="vf-hide-scrollbar">
                    {liveAlerts.length === 0 ? (
                      <div style={{
                        fontSize: "11px",
                        color: "#94A3B8",
                        textAlign: "center",
                        padding: "20px 0"
                      }}>
                        Waiting for scan events…
                      </div>
                    ) : (
                      liveAlerts.map((alert) => (
                        <div key={alert.id} style={{
                          backgroundColor: "rgba(255, 255, 255, 0.05)",
                          padding: "8px 10px",
                          borderRadius: "8px",
                          borderLeft: "3px solid #3B82F6",
                          animation: "scaleIn 0.3s ease-out"
                        }}>
                          <p style={{
                            fontSize: "10px",
                            fontWeight: "500",
                            color: "#E2E8F0",
                            margin: "0 0 4px 0",
                            lineHeight: "1.4"
                          }}>
                            {alert.message}
                          </p>
                          <span style={{
                            fontSize: "8px",
                            color: "#64748B",
                            fontWeight: "700"
                          }}>
                            {alert.time}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Map overlay filter */}
                <div className="db-map-filter">
                  <h3 className="db-map-filter-title">🗂 Live Fleet Filter</h3>
                  {["Zone", "Route", "Vehicle"].map((lbl) => (
                    <div key={lbl} className="db-map-filter-field">
                      <label className="db-map-filter-label">{lbl}</label>
                      <select className="db-map-filter-select">
                        <option>All {lbl}s</option>
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
};

export default Dashboard;
