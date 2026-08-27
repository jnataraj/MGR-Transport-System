import React from "react";
import { ScrollView } from "react-native";
import DashboardHeader from "../../../components/dashboard/DashboardHeader";
import DashboardActionGrid from "../../../components/dashboard/DashboardActionGrid";
import HodStats from "../../../components/dashboard/HodStats";
import HodAttendanceCard from "../../../components/dashboard/HodAttendanceCard";
import AbsentOnBusSection from "../../../components/dashboard/AbsentOnBusSection";
import AttendanceOverviewSection from "../../../components/dashboard/AttendanceOverviewSection";

export default function HodDashboard({
  user,
  department,
  routeAlerts,
  openRouteAlerts,
  openAbsentStudents,
  exportAttendanceReport,
}) {
  // summary          = own-dept stats (present / absent / total) — dept-scoped by API
  // allSummary       = all-dept data (for the absent button count hint)
  // yearFilter etc.  = new filters for AbsentOnBusSection
  const {
    summary,
    allSummary,
    history,
    timeFilter,
    setTimeFilter,
    yearFilter,
    setYearFilter,
    absentSearch,
    setAbsentSearch,
    filteredAbsentList,
    todayByYear,
  } = department;

  return (
    <ScrollView
      showsVerticalScrollIndicator={false}
      contentContainerStyle={{ paddingBottom: 30 }}
    >
      <DashboardHeader user={user} role="hod" boardStatus={null} />

      {/* ── Stats bar: own-dept present / absent / total ─────────────────── */}
      <HodStats summary={summary} />

      {/* ── Today's Absent on Bus (dept-filtered, year-tab, search) ─────── */}
      <AbsentOnBusSection
        summary={summary}
        filteredAbsentList={filteredAbsentList}
        yearFilter={yearFilter}
        setYearFilter={setYearFilter}
        absentSearch={absentSearch}
        setAbsentSearch={setAbsentSearch}
        department={user?.department}
      />

      {/* ── Today's Attendance Overview (per-year %) ─────────────────────── */}
      <AttendanceOverviewSection
        summary={summary}
        todayByYear={todayByYear}
        department={user?.department}
      />

      {/* ── Quick-action grid ─────────────────────────────────────────────── */}
      <DashboardActionGrid
        role="hod"
        unreadAlerts={routeAlerts.unreadCount}
        onRouteAlerts={openRouteAlerts}
      />

      {/* ── Historical attendance table + absent-students button ──────────── */}
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
