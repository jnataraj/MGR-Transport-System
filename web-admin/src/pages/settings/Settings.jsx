import { useState, useEffect, useCallback, useContext } from "react";
import {
    Settings as SettingsIcon,
    Radar,
    RefreshCw,
    Save,
    Globe,
    Database,
    Bell,
    Satellite,
    Mail,
    Lock,
} from "lucide-react";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/Topbar";
import { AuthContext } from "../../context/AuthContext";
import { fetchSettings, updateGpsSettings, updateSystemSettings, socket } from "../../api";
import "./Settings.css";

const TABS = [
    { key: "gps", label: "GPS Config", icon: <Radar size={16} /> },
    { key: "system", label: "System", icon: <SettingsIcon size={16} /> },
];

const Settings = () => {
    const { user, token } = useContext(AuthContext);
    // const isSuperAdmin = (user?.role || "").toLowerCase() === "superadmin";
    const isAdmin = ["superadmin", "admin"].includes(
        (user?.role || "").toLowerCase()
    );

    const [tab, setTab] = useState("gps");
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [lastRefresh, setLastRefresh] = useState(null);
    const [socketConnected, setSocketConnected] = useState(socket.connected);

    // GPS form
    const [gpsMismatchRadius, setGpsMismatchRadius] = useState(50);
    const [gpsLogInterval, setGpsLogInterval] = useState(10);
    const [googleMapsApiKey, setGoogleMapsApiKey] = useState("");

    // System form
    const [systemEmail, setSystemEmail] = useState("");

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const data = await fetchSettings(token);
            const s = data?.settings || {};
            setGpsMismatchRadius(s.gpsMismatchRadius ?? 50);
            setGpsLogInterval(s.gpsLogInterval ?? 10);
            setGoogleMapsApiKey(s.googleMapsApiKey ?? "");
            // Fall back to the logged-in admin's own email until a system email is explicitly saved
            setSystemEmail(s.systemEmail || user?.email || "");
            setLastRefresh(new Date());
        } catch (e) {
            console.error("Failed to load settings", e);
        } finally {
            setLoading(false);
        }
    }, [user?.email, token]);

    useEffect(() => {
        load();
    }, [load]);

    // Track live socket status for the "Live" badge
    useEffect(() => {
        const onConnect = () => setSocketConnected(true);
        const onDisconnect = () => setSocketConnected(false);
        socket.on("connect", onConnect);
        socket.on("disconnect", onDisconnect);
        return () => {
            socket.off("connect", onConnect);
            socket.off("disconnect", onDisconnect);
        };
    }, []);

    const saveGpsConfig = async () => {
        setSaving(true);
        try {
            await updateGpsSettings(
                {
                    gpsMismatchRadius: Number(gpsMismatchRadius),
                    gpsLogInterval: Number(gpsLogInterval),
                    googleMapsApiKey,
                },
                token,
            );
            setLastRefresh(new Date());
        } catch (e) {
            console.error("Failed to save GPS config", e);
            alert("Failed to save GPS config. Please try again.");
        } finally {
            setSaving(false);
        }
    };

    const saveSystemConfig = async () => {
        if (!isAdmin) return;
        setSaving(true);
        try {
            await updateSystemSettings({ systemEmail }, token);
            setLastRefresh(new Date());
        } catch (e) {
            console.error("Failed to save system config", e);
            alert("Failed to save system config. Please try again.");
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="dashboard-layout">
            <Sidebar />
            <main className="main-content">
                <Topbar />
                <section className="page-content st-page-content">
                    {/* ── HEADER ── */}
                    <div className="st-header">
                        <div>
                            <h1 className="st-header-title">System Settings</h1>
                            <p className="st-header-sub">
                                GPS configuration, halt management, and system preferences
                            </p>
                        </div>
                        <div className="st-header-actions">
                            <span className="st-live-badge">
                                <span
                                    className="st-live-dot"
                                    style={{ background: socketConnected ? "#10B981" : "#EF4444" }}
                                />
                                {socketConnected ? "Live" : "Offline"}
                            </span>
                            {lastRefresh && (
                                <span className="st-updated-time">
                                    {lastRefresh.toLocaleTimeString("en-IN", {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                        second: "2-digit",
                                    })}
                                </span>
                            )}
                            <button onClick={load} className="st-refresh-btn">
                                <RefreshCw size={14} className={loading ? "st-spin" : undefined} />
                                Refresh
                            </button>
                        </div>
                    </div>

                    {/* ── TABS ── */}
                    <div className="st-tab-row">
                        {TABS.map((t) => (
                            <button
                                key={t.key}
                                onClick={() => setTab(t.key)}
                                className={"st-tab-btn" + (tab === t.key ? " st-tab-btn--active" : "")}
                            >
                                {t.icon}
                                {t.label}
                            </button>
                        ))}
                    </div>

                    {/* ── GPS CONFIG TAB ── */}
                    {tab === "gps" && (
                        <div className="st-card">
                            <div className="st-card-header">
                                <Satellite size={17} color="#2563EB" />
                                <span>GPS Tracking Configuration</span>
                            </div>
                            <div className="st-card-body">
                                <div className="st-field">
                                    <label className="st-label">GPS MISMATCH ALERT RADIUS (METERS)</label>
                                    <div className="st-slider-row">
                                        <input
                                            type="number"
                                            min={0}
                                            max={500}
                                            value={gpsMismatchRadius}
                                            onChange={(e) => setGpsMismatchRadius(e.target.value)}
                                            className="st-number-input"
                                        />
                                        <input
                                            type="range"
                                            min={0}
                                            max={500}
                                            value={gpsMismatchRadius}
                                            onChange={(e) => setGpsMismatchRadius(e.target.value)}
                                            className="st-slider"
                                        />
                                    </div>
                                    <p className="st-hint">
                                        Alert if student scans QR but is beyond this radius from the vehicle GPS.
                                    </p>
                                </div>

                                <div className="st-field">
                                    <label className="st-label">GPS DB LOG INTERVAL (SECONDS)</label>
                                    <input
                                        type="number"
                                        min={1}
                                        value={gpsLogInterval}
                                        onChange={(e) => setGpsLogInterval(e.target.value)}
                                        className="st-number-input st-number-input--wide"
                                    />
                                    <p className="st-hint">Seconds between DB writes per vehicle.</p>
                                </div>

                                <div className="st-field">
                                    <label className="st-label">GOOGLE MAPS API KEY (OPTIONAL)</label>
                                    <input
                                        type="text"
                                        placeholder="AIzaSyA..."
                                        value={googleMapsApiKey}
                                        onChange={(e) => setGoogleMapsApiKey(e.target.value)}
                                        className="st-text-input"
                                    />
                                </div>

                                <button
                                    onClick={saveGpsConfig}
                                    disabled={saving}
                                    className="st-save-btn st-save-btn--blue"
                                >
                                    <Save size={15} />
                                    {saving ? "Saving…" : "Save GPS Config"}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* ── SYSTEM TAB ── */}
                    {tab === "system" && (
                        <div className="st-card">
                            <div className="st-card-header">
                                <SettingsIcon size={17} color="#475569" />
                                <span>System Preferences</span>
                            </div>
                            <div className="st-card-body">
                                <div className="st-field">
                                    <label className="st-label">
                                        SYSTEM EMAIL
                                        {!isAdmin && (
                                            <span className="st-lock-note">
                                                <Lock size={11} /> Super Admin only
                                            </span>
                                        )}
                                    </label>
                                    <div className="st-input-with-icon">
                                        <Mail size={15} color="#94A3B8" />
                                        <input
                                            type="email"
                                            placeholder="admin@ctms.edu"
                                            value={systemEmail}
                                            onChange={(e) => setSystemEmail(e.target.value)}
                                            disabled={!isAdmin}
                                            readOnly={!isAdmin}
                                            className="st-text-input st-text-input--icon"
                                        />
                                    </div>
                                    {!isAdmin && (
                                        <p className="st-hint">
                                            This is your current login email. Only a Super Admin can change the system email.
                                        </p>
                                    )}
                                </div>

                                <div className="st-status-grid">
                                    <div className="st-status-chip st-status-chip--green">
                                        <Globe size={16} />
                                        <div>
                                            <div className="st-status-label">Socket.IO</div>
                                            <div className="st-status-value">
                                                {socketConnected ? "Connected" : "Disconnected"}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="st-status-chip st-status-chip--blue">
                                        <Database size={16} />
                                        <div>
                                            <div className="st-status-label">Database</div>
                                            <div className="st-status-value">SQLite (dev)</div>
                                        </div>
                                    </div>
                                    <div className="st-status-chip st-status-chip--amber">
                                        <Bell size={16} />
                                        <div>
                                            <div className="st-status-label">Notifications</div>
                                            <div className="st-status-value">Real-time</div>
                                        </div>
                                    </div>
                                    <div className="st-status-chip st-status-chip--purple">
                                        <Satellite size={16} />
                                        <div>
                                            <div className="st-status-label">GPS Engine</div>
                                            <div className="st-status-value">In-Memory + DB</div>
                                        </div>
                                    </div>
                                </div>

                                {isAdmin && (
                                    <button
                                        onClick={saveSystemConfig}
                                        disabled={saving}
                                        className="st-save-btn st-save-btn--gray"
                                    >
                                        <Save size={15} />
                                        {saving ? "Saving…" : "Save System Config"}
                                    </button>
                                )}
                            </div>
                        </div>
                    )}
                </section>
            </main>
        </div>
    );
};

export default Settings;