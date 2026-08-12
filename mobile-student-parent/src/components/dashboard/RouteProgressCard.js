import React from "react";
import { Text, View } from "react-native";
import { Bus, Navigation, Landmark, Home } from "lucide-react-native";
import { STAGE, STAGE_META } from "../../constants/attendanceStages";
import { getLegStops } from "../../utils/attendanceUtils";
import styles from "../../styles/dashboard.styles";

const STAGE_ICONS = {
  PICKUP: Bus,
  TO_COLLEGE: Navigation,
  AT_COLLEGE: Landmark,
  TO_HOME: Navigation,
  AT_HOME: Home,
};

export default function RouteProgressCard({ boardStatus }) {
  const stops = getLegStops(boardStatus);
  const activeIndex = Math.max(0, stops.findIndex((stop) => stop.key === boardStatus));
  const progressPct = activeIndex === 0 ? "0%" : activeIndex === 1 ? "50%" : "100%";
  const activeColor = STAGE_META[boardStatus]?.color || "#2563EB";
  const morning = boardStatus === STAGE.PICKUP || boardStatus === STAGE.TO_COLLEGE;

  return (
    <View style={styles.card}>
      <Text style={styles.progressTitle}>ROUTE PROGRESS TRACKING — {morning ? "MORNING" : "EVENING"} LEG</Text>
      <View style={{ position: "relative", paddingHorizontal: 10 }}>
        <View style={styles.progressTrack} />
        <View style={{ position: "absolute", top: 19, left: 20, width: progressPct, height: 4, backgroundColor: activeColor, borderRadius: 2 }} />
        <View style={styles.progressRow}>
          {stops.map((stop, index) => {
            const StopIcon = STAGE_ICONS[stop.key] || Bus;
            const done = index <= activeIndex;
            return (
              <View key={stop.key} style={styles.progressItem}>
                <View style={[styles.progressDot, { backgroundColor: done ? activeColor : "#E2E8F0" }]}>
                  <StopIcon size={18} color={done ? "#FFFFFF" : "#94A3B8"} strokeWidth={2.2} />
                </View>
                <Text style={[styles.progressLabel, { color: done ? "#334155" : "#94A3B8" }]}>{stop.label}</Text>
                <Text style={styles.progressSubLabel}>
                  {index < activeIndex ? "Done" : index === activeIndex ? "Pending" : "Upcoming"}
                </Text>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}