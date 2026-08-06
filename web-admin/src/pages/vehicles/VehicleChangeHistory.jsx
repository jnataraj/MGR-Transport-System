import { useEffect, useState } from "react";
import { fetchBusChanges } from "../../api";

const VehicleChangeHistory = ({ vehicleId }) => {
    const [logs, setLogs] = useState([]);

    useEffect(() => {
        if (!vehicleId) return;
        fetchBusChanges({ vehicleId }).then(setLogs).catch(() => { });
    }, [vehicleId]);

    if (logs.length === 0) return null;

    return (
        <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 6 }}>
                VEHICLE CHANGE HISTORY
            </div>
            {logs.map((l) => (
                <div key={l.id} style={{ fontSize: 13, color: "#334155", padding: "4px 0" }}>
                    {l.routeName || "Route"}: {l.oldVehicleNumber} → {l.newVehicleNumber}
                    <span style={{ color: "#94A3B8" }}> · {new Date(l.createdAt).toLocaleDateString("en-IN")}</span>
                </div>
            ))}
        </div>
    );
};

export default VehicleChangeHistory;