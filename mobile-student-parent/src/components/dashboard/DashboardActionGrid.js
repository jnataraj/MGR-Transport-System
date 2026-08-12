import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { QrCode, History, MapPin, Bell, ChevronRight } from "lucide-react-native";
import styles from "../../styles/dashboard.styles";

const ACTION_THEMES = {
  qr: { bg: "#EFF6FF", fg: "#2563EB" },
  history: { bg: "#FFF7ED", fg: "#F97316" },
  tracking: { bg: "#ECFDF5", fg: "#10B981" },
  alerts: { bg: "#FEF2F2", fg: "#EF4444" },
};

function Action({ Icon, theme, label, onPress, badge }) {
  const colors = ACTION_THEMES[theme];
  return (
    <View style={styles.actionWrap}>
      <TouchableOpacity style={styles.action} onPress={onPress} activeOpacity={0.7}>
        <View style={[styles.actionIconWrap, { backgroundColor: colors.bg }]}>
          <Icon size={24} color={colors.fg} strokeWidth={2.2} />
        </View>
        <Text style={styles.actionText}>{label}</Text>
        <View style={[styles.actionChevron, { backgroundColor: colors.bg }]}>
          <ChevronRight size={16} color={colors.fg} strokeWidth={2.5} />
        </View>
      </TouchableOpacity>
      {badge > 0 && (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{badge > 9 ? "9+" : badge}</Text>
        </View>
      )}
    </View>
  );
}

export default function DashboardActionGrid({
  role,
  unreadAlerts,
  onBoardingQR,
  onTravelHistory,
  onLiveTracking,
  onRouteAlerts,
}) {
  return (
    <View style={styles.grid}>
      {role === "student" && (
        <Action Icon={QrCode} theme="qr" label={"Boarding\nQR Code"} onPress={onBoardingQR} />
      )}
      {role !== "hod" && (
        <Action Icon={History} theme="history" label={"Travel\nHistory"} onPress={onTravelHistory} />
      )}
      {role !== "hod" && (
        <Action Icon={MapPin} theme="tracking" label={"Live Bus\nTracking"} onPress={onLiveTracking} />
      )}
      <Action
        Icon={Bell}
        theme="alerts"
        label={"Route\nAlerts"}
        onPress={onRouteAlerts}
        badge={unreadAlerts}
      />
    </View>
  );
}