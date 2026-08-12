import React from "react";
import { ScrollView } from "react-native";
import DashboardHeader from "../../../components/dashboard/DashboardHeader";
import DashboardActionGrid from "../../../components/dashboard/DashboardActionGrid";
import AssignedBusCard from "../../../components/dashboard/AssignedBusCard";
import TransitMonitorCard from "../../../components/dashboard/TransitMonitorCard";
import RouteProgressCard from "../../../components/dashboard/RouteProgressCard";

export default function StudentDashboard({ user, attendance, routeAlerts, openBoardingQR, openTravelHistory, viewLiveLocation, openRouteAlerts }) {
  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
      <DashboardHeader user={user} role="student" boardStatus={attendance.boardStatus} />
      <DashboardActionGrid
        role="student"
        unreadAlerts={routeAlerts.unreadCount}
        onBoardingQR={openBoardingQR}
        onTravelHistory={openTravelHistory}
        onLiveTracking={viewLiveLocation}
        onRouteAlerts={openRouteAlerts}
      />
      <AssignedBusCard user={user} />
      {user?.vehicle && user?.route && <TransitMonitorCard boardStatus={attendance.boardStatus} />}
      {user?.vehicle && user?.route && <RouteProgressCard boardStatus={attendance.boardStatus} />}
    </ScrollView>
  );
}
