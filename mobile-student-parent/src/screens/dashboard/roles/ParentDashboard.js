import React from "react";
import { ScrollView, Text, View } from "react-native";
import DashboardHeader from "../../../components/dashboard/DashboardHeader";
import DashboardActionGrid from "../../../components/dashboard/DashboardActionGrid";
import AssignedBusCard from "../../../components/dashboard/AssignedBusCard";
import TransitMonitorCard from "../../../components/dashboard/TransitMonitorCard";
import styles from "../../../styles/dashboard.styles";

export default function ParentDashboard({ user, attendance, routeAlerts, travelHistory, openTravelHistory, viewLiveLocation, openRouteAlerts }) {
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
      <DashboardHeader user={user} role="parent" boardStatus={attendance.boardStatus} />
      {travelHistory.linkedStudentName && (
        <View style={[styles.card, { marginBottom: 10 }]}>
          <Text style={styles.cardLabel}>LINKED STUDENT</Text>
          <Text style={{ fontSize: 16, fontWeight: "900", color: "#1E293B", marginTop: 5 }}>{travelHistory.linkedStudentName}</Text>
        </View>
      )}
      <DashboardActionGrid
        role="parent"
        unreadAlerts={routeAlerts.unreadCount}
        onTravelHistory={openTravelHistory}
        onLiveTracking={viewLiveLocation}
        onRouteAlerts={openRouteAlerts}
      />
      <AssignedBusCard user={user} />
      {user?.vehicle && user?.route && <TransitMonitorCard boardStatus={attendance.boardStatus} />}
    </ScrollView>
  );
}
