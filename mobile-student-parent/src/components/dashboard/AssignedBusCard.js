import React from "react";
import { Text, View } from "react-native";
import { Bus, MapPin, User } from "lucide-react-native";
import styles from "../../styles/dashboard.styles";

export function getActiveAssignedVehicle(user, liveVehicleList = []) {
  if (!user) return null;

  let list = [];
  if (Array.isArray(user.vehicles) && user.vehicles.length > 0) {
    list = user.vehicles;
  } else if (Array.isArray(user.studentAssignments) && user.studentAssignments.length > 0) {
    list = user.studentAssignments.map((a) => ({
      ...(a.vehicle || {}),
      pickupPoint: a.pickupPoint,
      assignedAt: a.assignedAt,
    }));
  } else if (user.vehicle && user.vehicle !== "Not Assigned") {
    const numbers = String(user.vehicle).split(",").map((s) => s.trim()).filter(Boolean);
    list = numbers.map((num) => ({
      number: num,
      route: user.route,
      driver: { name: user.driverName },
      status: "active",
    }));
  }

  if (list.length === 0) return null;

  const liveSet = new Set(Array.isArray(liveVehicleList) ? liveVehicleList : []);
  const liveVehicle = list.find(
    (v) => (v.id && liveSet.has(v.id)) || (v.number && liveSet.has(v.number))
  );
  if (liveVehicle) return liveVehicle;

  // Filter for active status
  const activeVehicles = list.filter(
    (v) => !v.status || (v.status || "").toLowerCase() === "active"
  );
  const candidateList = activeVehicles.length > 0 ? activeVehicles : list;

  // Sort by earliest starting time
  const sorted = [...candidateList].sort((a, b) => {
    const timeA = a.startTime || a.departureTime || a.start_time || a.time || "";
    const timeB = b.startTime || b.departureTime || b.start_time || b.time || "";
    if (timeA && timeB) return timeA.localeCompare(timeB);
    if (timeA) return -1;
    if (timeB) return 1;

    if (a.assignedAt && b.assignedAt) {
      return new Date(a.assignedAt) - new Date(b.assignedAt);
    }
    return 0;
  });

  return sorted[0] || null;
}

export default function AssignedBusCard({ user }) {
  const activeBus = getActiveAssignedVehicle(user);
  if (!activeBus && !user?.vehicle) return null;

  const busNumber = activeBus?.number || String(user?.vehicle || "").split(",")[0].trim();
  const routeName = activeBus?.route || (user?.route ? String(user.route).split(",")[0].trim() : "Not Assigned");
  const driverName = activeBus?.driver?.name || user?.driverName || "—";

  if (!busNumber || busNumber === "Not Assigned") return null;

  return (
    <View style={styles.blueCard}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
        <View style={{ flex: 1, zIndex: 2 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <Bus size={10} color="#93C5FD" strokeWidth={2.4} />
            <Text style={[styles.cardLabel, styles.blueLabel]}>YOUR ASSIGNED BUS</Text>
          </View>
          <Text style={styles.cardTitle}>{busNumber}</Text>
          {routeName && routeName !== "Not Assigned" && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 4 }}>
              <MapPin size={11} color="#93C5FD" strokeWidth={2.4} />
              <Text style={{ fontSize: 13, fontWeight: "700", color: "#BFDBFE" }}>{routeName}</Text>
            </View>
          )}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 }}>
            <User size={11} color="#BFDBFE" strokeWidth={2.2} />
            <Text style={styles.cardBody}>Driver: {driverName}</Text>
          </View>
        </View>
        <View style={styles.onRoutePill}>
          <Text style={styles.onRoutePillText}>ON ROUTE</Text>
        </View>
      </View>
      <View style={styles.busWatermark}>
        <Bus size={70} color="#FFFFFF" strokeWidth={1.5} />
      </View>
    </View>
  );
}