import { useState, useEffect, useCallback } from "react";
import { ArrowLeftRight, Bus } from "lucide-react";
import Sidebar from "../../components/Sidebar";
import Topbar from "../../components/Topbar";
import { fetchRoutes, fetchVehicles, fetchBusChanges, createBusChange } from "../../api";

const fmt = (d) =>
    new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

const BusChange = () => {
    const [routes, setRoutes] = useState([]);
    const [vehicles, setVehicles] = useState([]);
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(false);

    const [selectedVehicleId, setSelectedVehicleId] = useState("");
    const [newVehicleId, setNewVehicleId] = useState("");
    const [reason, setReason] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState("");

    const loadAll = useCallback(async () => {
        setLoading(true);
        try {
            const [routesData, vehiclesData, historyData] = await Promise.all([
                fetchRoutes({ isActive: true }),
                fetchVehicles(),
                fetchBusChanges(),
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

    useEffect(() => {
        loadAll();
    }, [loadAll]);

    const currentVehicle = vehicles.find((v) => v.id === selectedVehicleId);
    const newVehicle = vehicles.find((v) => v.id === newVehicleId);
    // Don't offer the currently-selected vehicle as its own replacement
    const vehicleOptions = vehicles.filter((v) => v.id !== selectedVehicleId);
    // If this vehicle has a matching active route assignment, reuse its
    // routeId so the RouteVehicleAssignment row gets synced too.
    const matchingRoute = routes.find((r) => r.vehicleId === selectedVehicleId);

    const handleSubmit = async () => {
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
            loadAll();
        } catch (e) {
            setError(e.message || "Failed to record bus change");
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="dashboard-layout">
            <Sidebar />
            <main className="main-content">
                <Topbar />
                <section className="page-content">
                    <h1 style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <ArrowLeftRight size={22} /> Bus Change
                    </h1>
                    <p style={{ color: "#64748B", marginBottom: 20 }}>
                        Swap the vehicle assigned to a route. Everyone gets notified automatically.
                    </p>

                    <div style={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 12, padding: 20, maxWidth: 560, marginBottom: 32 }}>
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
                            onClick={handleSubmit}
                            disabled={submitting || !currentVehicle || !newVehicle}
                            style={{
                                background: "#1D4ED8", color: "#fff", border: "none", borderRadius: 8,
                                padding: "10px 18px", fontWeight: 700, cursor: "pointer",
                                opacity: submitting || !currentVehicle || !newVehicle ? 0.6 : 1,
                            }}
                        >
                            {submitting ? "Saving…" : "Confirm Bus Change"}
                        </button>
                    </div>

                    <h3 style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                        <Bus size={18} /> Change History
                    </h3>
                    {loading ? (
                        <div>Loading…</div>
                    ) : history.length === 0 ? (
                        <div style={{ color: "#94A3B8" }}>No bus changes recorded yet.</div>
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
                </section>
            </main>
        </div>
    );
};

export default BusChange;