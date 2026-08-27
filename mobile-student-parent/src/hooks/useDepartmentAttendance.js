import { useCallback, useEffect, useMemo, useState } from "react";
import { API_BASE } from "../api/client";

const EMPTY_SUMMARY = {
  totalStudents: 0,
  presentCount: 0,
  absentCount: 0,
  presentList: [],
  absentList: [],
  deptBreakdown: [],
};

// Academic year labels (must match User.year values in the DB)
export const YEAR_TABS = [
  { key: "ALL", label: "ALL BATCHES" },
  { key: "1st Year", label: "1ST YEAR" },
  { key: "2nd Year", label: "2ND YEAR" },
  { key: "3rd Year", label: "3RD YEAR" },
  { key: "4th Year", label: "4TH YEAR" },
];

export default function useDepartmentAttendance({ user, token, enabled }) {
  // Own-department summary (for stats bar – present/absent count for HoD's dept)
  const [summary, setSummary] = useState(EMPTY_SUMMARY);
  const [allSummary, setAllSummary] = useState(EMPTY_SUMMARY);
  const [history, setHistory] = useState({ dayWise: [], avgAttendanceRate: "0.0%", totalAbsent: 0, daysTracked: 0 });
  const [timeFilter, setTimeFilter] = useState("W");
  const [yearFilter, setYearFilter] = useState("ALL");
  const [absentSearch, setAbsentSearch] = useState("");

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

  // ── Derived: filtered absent list (year tab + search) ────────────────────
  // Department is already enforced by the API — summary.absentList only
  // contains students from user.department.
  const filteredAbsentList = useMemo(() => {
    let list = summary.absentList || [];

    // 1. Year tab filter
    if (yearFilter !== "ALL") {
      list = list.filter((s) => s.year === yearFilter);
    }

    // 2. Search filter (name or roll number)
    const q = absentSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (s) =>
          s.name?.toLowerCase().includes(q) ||
          s.rollNumber?.toLowerCase().includes(q)
      );
    }

    return list;
  }, [summary.absentList, yearFilter, absentSearch]);

  const todayByYear = useMemo(() => {
    const allStudents = [
      ...(summary.presentList || []).map((s) => ({ ...s, present: true })),
      ...(summary.absentList || []).map((s) => ({ ...s, present: false })),
    ];

    const yearMap = {};
    for (const s of allStudents) {
      const yr = s.year || "Unknown";
      if (!yearMap[yr]) yearMap[yr] = { year: yr, present: 0, absent: 0, total: 0 };
      yearMap[yr].total += 1;
      if (s.present) yearMap[yr].present += 1;
      else yearMap[yr].absent += 1;
    }

    // Add rate
    return Object.values(yearMap)
      .sort((a, b) => a.year.localeCompare(b.year))
      .map((yr) => ({
        ...yr,
        rate: yr.total ? Math.round((yr.present / yr.total) * 100) : 0,
      }));
  }, [summary.presentList, summary.absentList]);

  return {
    summary,       // own-dept stats (absentCount, presentCount, totalStudents)
    allSummary,    // all-dept data (full absentList/presentList across all depts)
    history,
    timeFilter,
    setTimeFilter,
    yearFilter,
    setYearFilter,
    absentSearch,
    setAbsentSearch,
    filteredAbsentList,
    todayByYear,
    refresh: async () => {
      await Promise.all([fetchSummary(), fetchAllSummary(), fetchHistory()]);
    },
  };
}
