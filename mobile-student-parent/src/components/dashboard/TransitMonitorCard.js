import React from "react";
import { Text, View } from "react-native";
import { Bus, Navigation, Landmark, Home, AlertTriangle } from "lucide-react-native";
import { STAGE_META } from "../../constants/attendanceStages";
import styles from "../../styles/dashboard.styles";

const STAGE_ICONS = {
  PICKUP: Bus,
  TO_COLLEGE: Navigation,
  AT_COLLEGE: Landmark,
  TO_HOME: Navigation,
  AT_HOME: Home,
};

export default function TransitMonitorCard({ boardStatus }) {
  const meta = STAGE_META[boardStatus] || STAGE_META.PICKUP;
  const StageIcon = STAGE_ICONS[boardStatus] || Bus;

  return (
    <View style={[styles.card, { borderWidth: 2, borderColor: meta.color }]}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <View style={[styles.stageIcon, { backgroundColor: `${meta.color}22` }]}>
          <StageIcon size={24} color={meta.color} strokeWidth={2.2} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.stageTitle, { color: meta.color }]}>LIVE TRANSIT MONITOR</Text>
          <Text style={[styles.stageLabel, { color: meta.color }]}>{meta.label}</Text>
        </View>
        <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: meta.color }} />
      </View>
      <View style={styles.reminder}>
        <AlertTriangle size={14} color="#EF4444" strokeWidth={2.4} />
        <Text style={styles.reminderText}>
          REMINDER: <Text style={{ color: "#EF4444", fontWeight: "600" }}>Scan QR before Entry & Drop</Text>
        </Text>
      </View>
    </View>
  );
}