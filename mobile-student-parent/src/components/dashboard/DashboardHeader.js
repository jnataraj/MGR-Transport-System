import React from "react";
import { Image, Text, View } from "react-native";
import { GraduationCap, MapPin } from "lucide-react-native";
import logo from "../../../assets/logo.png";
import { isTransitStage } from "../../constants/attendanceStages";
import styles from "../../styles/dashboard.styles";

export default function DashboardHeader({ user, role, boardStatus }) {
  const inTransit = isTransitStage(boardStatus);
  const userName = user?.name || "Portal User";

  return (
    <>
      <View style={styles.logoWrap}>
        <Image source={logo} style={styles.logo} resizeMode="contain" />
      </View>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          {/* Avatar */}
          <View style={styles.avatar}>
            <GraduationCap size={26} color="#1D4ED8" strokeWidth={2.2} />
          </View>

          {/* User info */}
          <View style={{ flex: 1 }}>
            <Text style={styles.roleText}>{role}</Text>
            <Text style={styles.nameText} numberOfLines={1}>
              You — {userName}
            </Text>
            <Text style={styles.subText}>
              ROLL:{" "}
              {user?.year ||
                (user?.id
                  ? String(user.id).slice(0, 8).toUpperCase()
                  : "AR12234")}
            </Text>
          </View>

          {/* Right: status + route */}
          <View style={styles.headerRight}>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: inTransit ? "#10B981" : "#EF4444" },
              ]}
            >
              <Text style={styles.statusText}>
                {inTransit ? "IN TRANSIT" : "STOP"}
              </Text>
            </View>
            <View style={styles.routePin}>
              <MapPin size={11} color="#93C5FD" strokeWidth={2.5} />
              <Text style={styles.routeText} numberOfLines={1}>
                {(user?.route || "ROUTE 7 (THENI)").toUpperCase()}
              </Text>
            </View>
          </View>
        </View>
      </View>
    </>
  );
}