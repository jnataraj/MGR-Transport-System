import { useCallback, useEffect, useState } from "react";
import { API_BASE } from "../api/client";

const EMPTY_SUMMARY = {
  totalStudents: 0,
  presentCount: 0,
  absentCount: 0,
  presentList: [],
  absentList: [],
  deptBreakdown: [],
};

export default function useDepartmentAttendance({ user, token, enabled }) {
  // Own-department summary (for stats bar – present/absent count for HoD's dept)
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  // All-departments summary (for absent students modal)
  const [allSummary, setAllSummary] = useState(EMPTY_SUMMARY);
  const [history, setHistory] = useState({ dayWise: [], avgAttendanceRate: "0.0%", totalAbsent: 0, daysTracked: 0 });
  const [timeFilter, setTimeFilter] = useState("W");

  const headers = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  // ── Fetch own-dept summary ───────────────────────────────────────────────
  const fetchSummary = useCallback(async () => {
    if (!enabled || !user?.department) return;
    try {
      const response = await fetch(
        `${API_BASE}/api/attendance/department-summary?department=${encodeURIComponent(user.department)}`,
        { headers }
      );
      const data = await response.json();
      if (data.success) setSummary(data);
    } catch (error) {
      console.log("fetchDeptSummary error:", error.message);
    }
  }, [enabled, user?.department, token]);

  // ── Fetch ALL-departments summary (attendance details for every student) ─
  const fetchAllSummary = useCallback(async () => {
    if (!enabled) return;
    try {
      const response = await fetch(
        `${API_BASE}/api/attendance/department-summary?department=ALL`,
        { headers }
      );
      const data = await response.json();
      if (data.success) setAllSummary(data);
    } catch (error) {
      console.log("fetchAllDeptSummary error:", error.message);
    }
  }, [enabled, token]);

  // ── Fetch history ────────────────────────────────────────────────────────
  const fetchHistory = useCallback(async () => {
    if (!enabled || !user?.department) return;
    const days = timeFilter === "W" ? 7 : timeFilter === "M" ? 30 : 365;
    try {
      const response = await fetch(
        `${API_BASE}/api/attendance/department-history?department=${encodeURIComponent(user.department)}&days=${days}`,
        { headers }
      );
      const data = await response.json();
      if (data.success) setHistory(data);
    } catch (error) {
      console.log("fetchDeptHistory error:", error.message);
    }
  }, [enabled, user?.department, timeFilter, token]);

  useEffect(() => {
    fetchSummary();
    fetchAllSummary();
    fetchHistory();
  }, [fetchSummary, fetchAllSummary, fetchHistory]);

  return {
    summary,       // own-dept stats (absentCount, presentCount, totalStudents)
    allSummary,    // all-dept data (full absentList/presentList across all depts)
    history,
    timeFilter,
    setTimeFilter,
    refresh: async () => {
      await Promise.all([fetchSummary(), fetchAllSummary(), fetchHistory()]);
    },
  };
}
