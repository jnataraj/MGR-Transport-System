import React from "react";
import { ScrollView } from "react-native";
import DashboardHeader from "../../../components/dashboard/DashboardHeader";
import DashboardActionGrid from "../../../components/dashboard/DashboardActionGrid";
import HodStats from "../../../components/dashboard/HodStats";
import HodAttendanceCard from "../../../components/dashboard/HodAttendanceCard";

export default function HodDashboard({
  user,
  department,
  routeAlerts,
  openRouteAlerts,
  openAbsentStudents,
  exportAttendanceReport,
}) {
  // summary  = own dept stats (for the HodStats bar)
  // allSummary = all depts (for the absent button count hint)
  const { summary, allSummary, history, timeFilter, setTimeFilter } = department;

  return (
    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 30 }}>
      <DashboardHeader user={user} role="hod" boardStatus={null} />
      {/* Stats bar shows own-dept numbers (present / absent / total) */}
      <HodStats summary={summary} />
      <DashboardActionGrid
        role="hod"
        unreadAlerts={routeAlerts.unreadCount}
        onRouteAlerts={openRouteAlerts}
      />
      <HodAttendanceCard
        history={history}
        timeFilter={timeFilter}
        onChangeFilter={setTimeFilter}
        allAbsentCount={allSummary?.absentCount ?? 0}
        onAbsentStudents={openAbsentStudents}
        onExport={exportAttendanceReport}
      />
    </ScrollView>
  );
}
