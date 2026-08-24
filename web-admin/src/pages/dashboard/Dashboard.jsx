import { useState, useEffect, useCallback, useContext, useMemo } from "react";
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
  UserX,
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
import {
  fetchVehicles,
  fetchLiveVehicles,
  fetchUsers,
  fetchMaintenanceOverview,
  fetchDashboardBoardingSummary,
  fetchRouteAlerts,
  fetchMissingAlerts,
  createRouteAlert,
  API_BASE,
} from "../../api";

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
    ACTIVE: ["#DC2626", "#FEE2E2"],
    resolved: ["#059669", "#D1FAE5"],
    RESOLVED: ["#059669", "#D1FAE5"],
    CLOSED: ["#475569", "#F1F5F9"],
    Pending: ["#D97706", "#FEF3C7"],
    Acknowledged: ["#2563EB", "#DBEAFE"],
    Resolved: ["#059669", "#D1FAE5"],
  };
  const [c, bg] = map[s] || ["#64748B", "#F1F5F9"];
  const isPulse = s === "ACTIVE" || s === "open";
  return (
    <span
      className={`db-pill ${isPulse ? "db-pill--pulse-red" : ""}`}
      style={{ background: bg, color: c }}
    >
      {s === "ACTIVE" ? "🚨 ACTIVE MISSING" : s}
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
  const [alertBreak, setAlertBreak] = useState(null);
  const [zones, setZones] = useState([]);
  const [zoneBoarded, setZoneBoarded] = useState({ boarded: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [lastRefresh, setLastRefresh] = useState(null);
  // Live transit + halt indicators
  const [liveTransit, setLiveTransit] = useState({ inTransit: 0, dropped: 0 });
  const [activeHalts, setActiveHalts] = useState([]);
  const { user } = useContext(AuthContext);
  const [vehiclesList, setVehiclesList] = useState([]);
  const [filterZone, setFilterZone] = useState("All");
  const [filterRoute, setFilterRoute] = useState("All");
  const [filterVehicle, setFilterVehicle] = useState("All");

  // Modals
  const [modal, setModal] = useState(null); // 'vehicles'|'drivers'|'issues'|'alerts'|'students'|'notify'

  // Alert tab inside alerts modal
  const [alertTab, setAlertTab] = useState("all"); // all|route|driver|admin

  // Route alerts tab on dashboard panel
  const [routeTab, setRouteTab] = useState("All");

  // Notification modal form
  const [notiForm, setNotiForm] = useState({
    route: "",
    type: "RouteChange",
    from: "",
    to: "",
    message: "",
  });
  const [notiSending, setNotiSending] = useState(false);

  const [gpsData, setGpsData] = useState([]);
  const [attendanceMarkers, setAttendanceMarkers] = useState([]);
  const [liveAlerts, setLiveAlerts] = useState([]);
  const [missingAlerts, setMissingAlerts] = useState([]);

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
      const [vehicles, drivers, maintenance, liveList, boardingSummary, alertData] = await Promise.all([
        fetchVehicles().catch(() => []),
        fetchUsers("driver").catch(() => []),
        fetchMaintenanceOverview().catch(() => ({})),
        fetchLiveVehicles().catch(() => []),
        fetchDashboardBoardingSummary().catch(() => ({ boarded: 0, total: 0, zones: [] })),
        fetchRouteAlerts({ today: true }).catch(() => ({ success: true, routeAlerts: [], totals: { total: 0, route: 0, driver: 0, admin: 0, missing: 0 } })),
      ]);

      const vehicleList = Array.isArray(vehicles) ? vehicles : [];
      setVehiclesList(vehicleList);
      const driverList = Array.isArray(drivers) ? drivers : [];
      const liveSet = new Set(Array.isArray(liveList) ? liveList : []);

      const isVehicleActive = (v) => {
        if (!v) return false;
        return liveSet.has(v.id) || (v.number && liveSet.has(v.number));
      };

      const isDriverActive = (d) => {
        if (!d) return false;
        return (
          d.isOnline === true ||
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

      if (alertData && alertData.success !== false) {
        setAlertBreak(alertData);
        const rawAlerts = alertData.missingAlerts || [];
        const seenActive = new Set();
        const dedupedAlerts = [];
        for (const m of rawAlerts) {
          if (m.status === "ACTIVE") {
            const key = `${m.studentId}_${m.vehicleId || m.vehicleNumber}`;
            if (!seenActive.has(key)) {
              seenActive.add(key);
              dedupedAlerts.push(m);
            }
          } else {
            dedupedAlerts.push(m);
          }
        }
        setMissingAlerts(dedupedAlerts);
      } else {
        setAlertBreak({ routeAlerts: [], totals: { total: 0, route: 0, driver: 0, admin: 0, missing: 0 } });
        setMissingAlerts([]);
      }

      // ── Boarding summary (Students Boarded Today + Zone Attendance) ──────────
      if (boardingSummary && boardingSummary.success !== false) {
        setZoneBoarded({
          boarded: boardingSummary.boarded ?? 0,
          total: boardingSummary.total ?? 0,
        });
        setZones(Array.isArray(boardingSummary.zones) ? boardingSummary.zones : []);
      }

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
      socket.on("new_route_alert", () => fetchAll());
      socket.on("new_notification", () => fetchAll());
      // Real-Time Student Missing Alerts
      socket.on("student_missing_alert", (alert) => {
        setMissingAlerts((prev) => {
          const index = prev.findIndex(
            (a) => a.id === alert.id || (a.studentId && alert.studentId && a.studentId === alert.studentId)
          );
          if (index !== -1) {
            const updated = [...prev];
            updated[index] = { ...updated[index], ...alert };
            return updated;
          }
          return [alert, ...prev];
        });
      });
      socket.on("new_missing_alert", (alert) => {
        setMissingAlerts((prev) => {
          const index = prev.findIndex(
            (a) => a.id === alert.id || (a.studentId && alert.studentId && a.studentId === alert.studentId)
          );
          if (index !== -1) {
            const updated = [...prev];
            updated[index] = { ...updated[index], ...alert };
            return updated;
          }
          return [alert, ...prev];
        });
      });
      socket.on("student_missing_alert_resolved", (res) => {
        setMissingAlerts((prev) =>
          prev.map((a) =>
            a.id === res.id || (a.studentId && res.studentId && a.studentId === res.studentId)
              ? { ...a, status: "RESOLVED", resolvedReason: res.resolvedReason, resolvedAt: res.resolvedAt }
              : a
          )
        );
      });
      socket.on("missing_alert_closed", (res) => {
        setMissingAlerts((prev) =>
          prev.map((a) =>
            a.id === res.id || (a.studentId && res.studentId && a.studentId === res.studentId)
              ? { ...a, status: "RESOLVED", resolvedReason: res.resolvedReason, resolvedAt: res.resolvedAt }
              : a
          )
        );
      });
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
  const routeAlerts = alertBreak?.routeAlerts || [];
  const alertsToday = routeAlerts.length;

  const matchesRouteTab = (notificationType, tab) => {
    if (tab === "All") return true;
    if (!notificationType) return false;
    const normType = String(notificationType).toLowerCase().replace(/[\s_\-()]/g, "");
    const normTab = String(tab).toLowerCase().replace(/[\s_\-()]/g, "");

    if (normTab === "routechange") {
      return (
        normType.includes("routechange") ||
        normType.includes("change") ||
        normType.includes("diversion") ||
        normType.includes("reassign")
      );
    }
    if (normTab === "delayeddeparture") {
      return (
        normType.includes("delayeddeparture") ||
        normType.includes("delay") ||
        normType.includes("routedelayed") ||
        normType.includes("late")
      );
    }
    if (normTab === "closure") {
      return (
        normType.includes("closure") ||
        normType.includes("cancel") ||
        normType.includes("routecancelled") ||
        normType.includes("shutdown") ||
        normType.includes("cancellation")
      );
    }
    if (normTab === "emergency") {
      return (
        normType.includes("emergency") ||
        normType.includes("sos") ||
        normType.includes("broadcast")
      );
    }
    return normType === normTab;
  };

  const todayRouteTabFiltered = routeAlerts.filter((r) =>
    matchesRouteTab(r.notificationType, routeTab)
  );

  const vehicleByKey = useMemo(() => {
    const map = {};
    vehiclesList.forEach((v) => {
      if (v.id) map[v.id] = v;
      if (v.number) map[v.number] = v;
    });
    return map;
  }, [vehiclesList]);

  const routeOptions = useMemo(() => {
    const set = new Set(vehiclesList.map((v) => v.route).filter(Boolean));
    return Array.from(set).sort();
  }, [vehiclesList]);

  const zoneOptions = useMemo(() => zones.map((z) => z.zone), [zones]);

  const vehicleOptions = useMemo(() => {
    return vehiclesList.map((v) => v.number || v.id).filter(Boolean).sort();
  }, [vehiclesList]);

  const filteredGpsData = useMemo(() => {
    return gpsData.filter((v) => {
      const info = vehicleByKey[v.id];

      if (filterVehicle !== "All") {
        const displayKey = info?.number || info?.id || v.id;
        if (displayKey !== filterVehicle) return false;
      }

      if (filterRoute !== "All" && info?.route !== filterRoute) return false;

      if (filterZone !== "All") {
        const zoneEntry = zones.find((z) => z.zone === filterZone);
        const inZone = zoneEntry?.vehicles?.some(
          (zv) => zv === v.id || zv?.id === v.id || zv?.number === v.id
        );
        if (!inZone) return false;
      }
      return true;
    });
  }, [gpsData, vehicleByKey, filterVehicle, filterRoute, filterZone, zones]);

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
    const seenActive = new Set();
    const dedupedMissingAlerts = [];
    for (const m of missingAlerts) {
      if (m.status === "ACTIVE") {
        const key = `${m.studentId}_${m.vehicleId || m.vehicleNumber}`;
        if (!seenActive.has(key)) {
          seenActive.add(key);
          dedupedMissingAlerts.push(m);
        }
      } else {
        dedupedMissingAlerts.push(m);
      }
    }
    const activeMissingCount = dedupedMissingAlerts.filter((m) => m.status === "ACTIVE").length;

    const tabs = [
      {
        key: "all",
        label: `All (${alertBreak?.totals?.total || (dedupedMissingAlerts.length + routeAlerts.length + (alertBreak?.totals?.driver || 0) + (alertBreak?.totals?.admin || 0))})`,
        color: "#475569",
      },
      {
        key: "missing",
        label: `Student Missing (${dedupedMissingAlerts.length})`,
        color: "#DC2626",
        badge: activeMissingCount > 0 ? `${activeMissingCount} ACTIVE` : null,
      },
      {
        key: "route",
        label: `Route (${alertBreak?.totals?.route || routeAlerts.length})`,
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
        width={780}
      >
        {/* Summary counters */}
        <div className="db-summary-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
          {[
            {
              label: "Student Missing",
              val: dedupedMissingAlerts.length,
              activeText: activeMissingCount > 0 ? `${activeMissingCount} Active` : null,
              color: "#DC2626",
              bg: "#FEF2F2",
              icon: <UserX size={15} />,
              tabKey: "missing",
            },
            {
              label: "Route Alerts",
              val: routeAlerts.length,
              color: "#B91C1C",
              bg: "#FEF2F2",
              icon: <Route size={15} />,
              tabKey: "route",
            },
            {
              label: "Driver Issues",
              val: alertBreak?.totals?.driver || 0,
              color: "#D97706",
              bg: "#FFFBEB",
              icon: <Car size={15} />,
              tabKey: "driver",
            },
            {
              label: "Maintenance Logs",
              val: alertBreak?.totals?.admin || 0,
              color: "#7C3AED",
              bg: "#F5F3FF",
              icon: <Wrench size={15} />,
              tabKey: "admin",
            },
          ].map((c) => (
            <div
              key={c.label}
              onClick={() => setAlertTab(c.tabKey)}
              className="db-summary-card"
              style={{ background: c.bg, border: `1px solid ${c.color}20`, cursor: "pointer" }}
            >
              <div style={{ color: c.color }}>{c.icon}</div>
              <div>
                <div className="db-summary-value" style={{ color: c.color }}>
                  {c.val}
                  {c.activeText && (
                    <span style={{ fontSize: "0.65rem", marginLeft: 6, padding: "2px 6px", background: "#DC2626", color: "#fff", borderRadius: 10 }}>
                      {c.activeText}
                    </span>
                  )}
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
                display: "inline-flex",
                alignItems: "center",
                gap: "6px",
              }}
            >
              {t.label}
              {t.badge && (
                <span className="db-pill db-pill--solid-red" style={{ fontSize: "0.6rem", padding: "1px 5px" }}>
                  {t.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Student Missing Alerts */}
        {(alertTab === "all" || alertTab === "missing") && (
          <section className="db-section-block">
            <div
              className="db-section-heading db-section-heading--sm"
              style={{ color: "#DC2626", display: "flex", alignItems: "center", justifyContent: "space-between" }}
            >
              <span>🚨 Student Missing Alerts (Distance &gt; 10m from Driver)</span>
              {activeMissingCount > 0 && (
                <span className="db-pill db-pill--pulse-red">
                  {activeMissingCount} ACTIVE
                </span>
              )}
            </div>
            {renderList(
              dedupedMissingAlerts,
              "No student missing alerts today ✅",
              (m) => {
                const isActive = m.status === "ACTIVE";
                const borderLeftColor = isActive ? "#DC2626" : "#64748B";
                const bg = isActive ? "#FEF2F2" : "#F8FAFC";
                return (
                  <div
                    key={m.id}
                    className="db-missing-alert-card"
                    style={{
                      borderLeft: `5px solid ${borderLeftColor}`,
                      background: bg,
                      border: `1px solid ${borderLeftColor}30`,
                    }}
                  >
                    <div className="db-missing-card-top">
                      <div className="db-missing-student-header">
                        <div className="db-missing-student-name">
                          👤 {m.studentName}
                        </div>
                        <span className="db-missing-student-id">
                          ID: {m.studentRollNo || m.studentId || "N/A"}
                        </span>
                      </div>
                      <StatusBadge s={m.status} />
                    </div>

                    <div className="db-missing-grid">
                      <div className="db-missing-grid-item">
                        <span className="db-missing-k">Assigned Driver:</span>
                        <span className="db-missing-v font-bold">👮 {m.driverName || "Driver"}</span>
                      </div>
                      <div className="db-missing-grid-item">
                        <span className="db-missing-k">Vehicle Number:</span>
                        <span className="db-missing-v font-bold">🚌 {m.vehicleNumber || m.vehicleId || "N/A"}</span>
                      </div>
                      <div className="db-missing-grid-item">
                        <span className="db-missing-k">Distance:</span>
                        <span className={`db-missing-v ${isActive ? "db-missing-distance-alert" : ""}`}>
                          📏 {m.distanceMeters} m {isActive ? "(> 10m limit)" : ""}
                        </span>
                      </div>
                      <div className="db-missing-grid-item">
                        <span className="db-missing-k">Alert Time:</span>
                        <span className="db-missing-v">🕐 {fmt(m.alertTime || m.createdAt)}</span>
                      </div>
                      <div className="db-missing-grid-item">
                        <span className="db-missing-k">Driver Location:</span>
                        <span className="db-missing-v">
                          📍 {m.driverLocation || `${m.driverLat}, ${m.driverLng}`}
                          {m.driverLat && m.driverLng && (
                            <a
                              href={`https://www.google.com/maps?q=${m.driverLat},${m.driverLng}`}
                              target="_blank"
                              rel="noreferrer"
                              className="db-missing-map-link"
                            >
                              Maps ↗
                            </a>
                          )}
                        </span>
                      </div>
                      <div className="db-missing-grid-item">
                        <span className="db-missing-k">Student Location:</span>
                        <span className="db-missing-v">
                          📍 {m.studentLocation || `${m.studentLat}, ${m.studentLng}`}
                          {m.studentLat && m.studentLng && (
                            <a
                              href={`https://www.google.com/maps?q=${m.studentLat},${m.studentLng}`}
                              target="_blank"
                              rel="noreferrer"
                              className="db-missing-map-link"
                            >
                              Maps ↗
                            </a>
                          )}
                        </span>
                      </div>
                    </div>

                    {!isActive && (m.resolvedReason || m.resolvedAt) && (
                      <div className="db-missing-resolved-info">
                        ✅ <strong>Closed / Resolved:</strong> {m.resolvedReason || "Journey Completed"}{" "}
                        {m.resolvedAt && `· ${fmt(m.resolvedAt)}`}
                      </div>
                    )}
                  </div>
                );
              }
            )}
          </section>
        )}


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
              routeAlerts,
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
                    📅 {r.effectiveDate} {r.effectiveTime || ""} &nbsp;|&nbsp; 🕐{" "}
                    {fmt(r.createdAt)} &nbsp;|&nbsp; 👥 {r.totalStudents ?? 0}s{" "}
                    {r.totalParents ?? 0}p
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
      <div className="db-zone-heading">Route-wise Attendance Breakdown</div>
      {zones.length === 0 ? (
        <div className="db-zone-empty">No Route data available</div>
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

  const handleSendRouteNotification = async (e) => {
    e.preventDefault();
    if (!notiForm.message.trim()) {
      alert("Please enter a notification message.");
      return;
    }

    try {
      setNotiSending(true);
      await createRouteAlert({
        routeName: notiForm.route || "All Zones (Tamil Nadu)",
        notificationType: notiForm.type || "RouteChange",
        effectiveDate: notiForm.from || undefined,
        duration: notiForm.to ? `${notiForm.from} to ${notiForm.to}` : null,
        customMessage: notiForm.message,
        adminName: user?.name || "Super Admin",
      });

      alert("Route notification broadcasted successfully!");
      setNotiForm({
        route: "",
        type: "RouteChange",
        from: "",
        to: "",
        message: "",
      });
      setModal(null);
      fetchAll();
    } catch (err) {
      console.error("Error creating route notification:", err);
      alert(err.message || "Failed to broadcast notification.");
    } finally {
      setNotiSending(false);
    }
  };

  const renderNotifyModal = () => (
    <Modal
      title="Raise Route Notification"
      icon={<Bell size={18} color="#B91C1C" />}
      onClose={() => setModal(null)}
      width={560}
    >
      <form onSubmit={handleSendRouteNotification} className="db-notify-form">
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
              {routeOptions.length > 0
                ? routeOptions.map((r) => <option key={r} value={r}>{r}</option>)
                : [
                  "Chennai - Route 1",
                  "Chennai - Route 6 (TAMBARAM)",
                  "Arani - Route 1",
                  "Bangalore - Route 1",
                ].map((r) => <option key={r} value={r}>{r}</option>)}
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
              <option value="RouteChange">Route Change</option>
              <option value="DelayedDeparture">Delayed Departure</option>
              <option value="Closure">Closure / Cancellation</option>
              <option value="Emergency">Emergency</option>
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
            required
          />
        </div>
        <button
          type="submit"
          disabled={notiSending}
          className="db-notify-send-btn"
        >
          {notiSending ? "BROADCASTING…" : "📢 SEND NOTIFICATION TO ALL MEMBERS"}
        </button>
      </form>
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
            {canSeeCard(user, "alertsRaised") && (() => {
              const activeMissingCount = missingAlerts.filter(
                (m) => m.status === "ACTIVE"
              ).length;

              const alertsRaisedCount = alertsToday + activeMissingCount;
              const hasActiveMissing = activeMissingCount > 0;

              return (
                <StatCard
                  icon={
                    <Bell
                      size={22}
                      color={hasActiveMissing ? "#DC2626" : "#B91C1C"}
                    />
                  }
                  label="Alerts Raised"
                  color={hasActiveMissing ? "#DC2626" : "#B91C1C"}
                  bg="#FEE2E2"
                  value={loading ? "…" : alertsRaisedCount}
                  sub={
                    hasActiveMissing
                      ? `🚨 ${activeMissingCount} student missing!`
                      : "Today — tap for split"
                  }
                  onClick={() => {
                    setAlertTab(hasActiveMissing ? "missing" : "all");
                    setModal("alerts");
                  }}
                  pulse={alertsRaisedCount > 0}
                />
              );
            })()}
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

          {/* ── ACTIVE STUDENT MISSING EMERGENCY BANNER ── */}
          {missingAlerts.some((m) => m.status === "ACTIVE") && (
            <div className="db-missing-emergency-banner">
              <div className="db-missing-emergency-left">
                <span className="db-missing-pulse-icon">🚨</span>
                <div>
                  <div className="db-missing-emergency-title">
                    CRITICAL: {missingAlerts.filter((m) => m.status === "ACTIVE").length} Student Missing Alert(s) Active!
                  </div>
                  <div className="db-missing-emergency-sub">
                    {missingAlerts
                      .filter((m) => m.status === "ACTIVE")
                      .map((m) => `${m.studentName} (Distance: ${m.distanceMeters}m from Bus ${m.vehicleNumber})`)
                      .join("  •  ")}
                  </div>
                </div>
              </div>
              <button
                onClick={() => {
                  setAlertTab("missing");
                  setModal("alerts");
                }}
                className="db-missing-emergency-btn"
              >
                VIEW MISSING ALERTS →
              </button>
            </div>
          )}

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
                        No {routeTab === "All" ? "" : `${routeTab.replace(/([A-Z])/g, " $1").trim()} `}route alerts
                        today.
                      </p>
                    </div>
                  ) : (
                    todayRouteTabFiltered.map((r) => {
                      const isRed =
                        matchesRouteTab(r.notificationType, "Closure") ||
                        matchesRouteTab(r.notificationType, "Emergency");
                      const isYellow = matchesRouteTab(r.notificationType, "DelayedDeparture");
                      const typeColor = isRed
                        ? "#EF4444"
                        : isYellow
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
                            {r.effectiveTime || ""}
                            &nbsp;|&nbsp; 👥 {r.totalStudents ?? 0} students ·{" "}
                            {r.totalParents ?? 0} parents
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
                  {/* {gpsData.map((v) => { */}
                  {filteredGpsData.map((v) => {
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
                            {idle ? "STOP" : "MOVING"}
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

                {/* Map overlay filter */}
                <div className="db-map-filter">
                  <h3 className="db-map-filter-title">🗂 Live Fleet Filter</h3>
                  {/* <div className="db-map-filter-field">
                    <label className="db-map-filter-label">Zone</label>
                    <select
                      className="db-map-filter-select"
                      value={filterZone}
                      onChange={(e) => setFilterZone(e.target.value)}
                    >
                      <option value="All">All Zones</option>
                      {zoneOptions.map((z) => (
                        <option key={z} value={z}>{z}</option>
                      ))}
                    </select>
                  </div> */}

                  <div className="db-map-filter-field">
                    <label className="db-map-filter-label">Route</label>
                    <select
                      className="db-map-filter-select"
                      value={filterRoute}
                      onChange={(e) => setFilterRoute(e.target.value)}
                    >
                      <option value="All">All Routes</option>
                      {routeOptions.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </div>

                  <div className="db-map-filter-field">
                    <label className="db-map-filter-label">Vehicle</label>
                    <select
                      className="db-map-filter-select"
                      value={filterVehicle}
                      onChange={(e) => setFilterVehicle(e.target.value)}
                    >
                      <option value="All">All Vehicles</option>
                      {vehicleOptions.map((v) => (
                        <option key={v} value={v}>{v}</option>
                      ))}
                    </select>
                  </div>
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
