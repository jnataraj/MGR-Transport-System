import React from "react";
import { Text, View } from "react-native";
import { Bus } from "lucide-react-native";
import styles from "../../styles/dashboard.styles";

export default function AssignedBusCard({ user }) {
  if (!user?.vehicle || !user?.route) return null;
  return (
    <View style={styles.blueCard}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between" }}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.cardLabel, styles.blueLabel]}>YOUR ASSIGNED BUS</Text>
          <Text style={styles.cardTitle}>{user.vehicle} · {user.route}</Text>
          <Text style={styles.cardBody}>Driver: {user.driverName || "—"}</Text>
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