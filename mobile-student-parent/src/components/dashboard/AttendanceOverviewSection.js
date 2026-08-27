import React from "react";
import { Text, View } from "react-native";

const TARGET_RATE = 95;

export default function AttendanceOverviewSection({ summary, todayByYear, department }) {
  // ── No department guard ───────────────────────────────────────────────────
  if (!department) {
    return (
      <View style={card}>
        <View style={headerRow}>
          <Text style={sectionTitle}>📊 Today's Attendance Overview</Text>
        </View>
        <View style={emptyState}>
          <Text style={emptyIcon}>🏢</Text>
          <Text style={emptyText}>No department assigned</Text>
        </View>
      </View>
    );
  }

  // ── Compute overall average ───────────────────────────────────────────────
  const totalStudents = summary?.totalStudents ?? 0;
  const presentCount = summary?.presentCount ?? 0;
  const overallRate = totalStudents
    ? Math.round((presentCount / totalStudents) * 100)
    : 0;

  // Show only known year labels in a fixed order; skip "Unknown"
  const ORDERED_YEARS = ["1st Year", "2nd Year", "3rd Year", "4th Year"];
  const yearStats = ORDERED_YEARS.map((yr) => {
    const found = (todayByYear || []).find((d) => d.year === yr);
    return found || { year: yr, present: 0, absent: 0, total: 0, rate: 0 };
  });

  const SHORT_LABELS = {
    "1st Year": "1ST YR",
    "2nd Year": "2ND YR",
    "3rd Year": "3RD YR",
    "4th Year": "4TH YR",
  };

  return (
    <View style={card}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View style={headerRow}>
        <Text style={sectionTitle}>📊 Today's Attendance Overview</Text>
        <View style={perBatchBadge}>
          <Text style={perBatchText}>PER BATCH</Text>
        </View>
      </View>

      {/* ── Per-year stats grid ──────────────────────────────────────────── */}
      {totalStudents === 0 ? (
        <View style={emptyState}>
          <Text style={emptyIcon}>📋</Text>
          <Text style={emptyText}>
            No students available for your assigned department.
          </Text>
        </View>
      ) : (
        <>
          <View style={statsGrid}>
            {yearStats.map((yr) => {
              const rateNum = yr.rate;
              const rateColor =
                rateNum >= TARGET_RATE
                  ? "#10B981"
                  : rateNum >= 80
                    ? "#F59E0B"
                    : "#EF4444";

              return (
                <View key={yr.year} style={statCell}>
                  <Text style={[statRate, { color: rateColor }]}>
                    {yr.total > 0 ? `${rateNum}%` : "—"}
                  </Text>
                  <Text style={statLabel}>{SHORT_LABELS[yr.year]}</Text>
                  {yr.total > 0 && (
                    <Text style={statSub}>
                      {yr.present}/{yr.total}
                    </Text>
                  )}
                </View>
              );
            })}
          </View>

          {/* ── Footer: avg + target ──────────────────────────────────────── */}
          <View style={footer}>
            <Text style={footerText}>
              Avg Attendance:{" "}
              <Text
                style={{
                  fontWeight: "900",
                  color:
                    overallRate >= TARGET_RATE
                      ? "#10B981"
                      : overallRate >= 80
                        ? "#F59E0B"
                        : "#EF4444",
                }}
              >
                {overallRate}%
              </Text>
            </Text>
            <Text style={footerText}>
              Target:{" "}
              <Text style={{ fontWeight: "900", color: "#7C3AED" }}>
                {TARGET_RATE}%
              </Text>
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const card = {
  backgroundColor: "#FFF",
  borderRadius: 16,
  padding: 16,
  marginHorizontal: 16,
  marginVertical: 8,
  elevation: 2,
  shadowColor: "#000",
  shadowOffset: { width: 0, height: 1 },
  shadowOpacity: 0.06,
  shadowRadius: 4,
};

const headerRow = {
  flexDirection: "row",
  justifyContent: "space-between",
  alignItems: "center",
  marginBottom: 14,
};

const sectionTitle = {
  fontSize: 13,
  fontWeight: "900",
  color: "#1E293B",
  flexShrink: 1,
};

const perBatchBadge = {
  backgroundColor: "#EDE9FE",
  borderRadius: 20,
  paddingHorizontal: 10,
  paddingVertical: 4,
  borderWidth: 1,
  borderColor: "#DDD6FE",
  marginLeft: 8,
};

const perBatchText = {
  fontSize: 9,
  fontWeight: "900",
  color: "#7C3AED",
};

const statsGrid = {
  flexDirection: "row",
  justifyContent: "space-between",
  marginBottom: 14,
};

const statCell = {
  flex: 1,
  alignItems: "center",
  paddingHorizontal: 4,
};

const statRate = {
  fontSize: 22,
  fontWeight: "900",
  marginBottom: 2,
};

const statLabel = {
  fontSize: 9,
  fontWeight: "900",
  color: "#94A3B8",
  letterSpacing: 0.5,
};

const statSub = {
  fontSize: 9,
  color: "#CBD5E1",
  fontWeight: "600",
  marginTop: 2,
};

const footer = {
  flexDirection: "row",
  justifyContent: "space-between",
  paddingTop: 10,
  borderTopWidth: 1,
  borderTopColor: "#F1F5F9",
};

const footerText = {
  fontSize: 11,
  fontWeight: "700",
  color: "#64748B",
};

const emptyState = {
  alignItems: "center",
  paddingVertical: 20,
};

const emptyIcon = {
  fontSize: 28,
  marginBottom: 8,
};

const emptyText = {
  fontSize: 12,
  fontWeight: "700",
  color: "#94A3B8",
  textAlign: "center",
};
