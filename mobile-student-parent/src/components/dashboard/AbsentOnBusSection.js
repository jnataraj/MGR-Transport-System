import React from "react";
import {
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { YEAR_TABS } from "../../hooks/useDepartmentAttendance";

// ── Helpers ───────────────────────────────────────────────────────────────────
function todayLabel() {
  return new Date().toLocaleDateString("en-GB", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

// ── Student card ──────────────────────────────────────────────────────────────
function AbsentStudentCard({ student }) {
  const isLate = student.stage === "LATE";
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        backgroundColor: "#FFF",
        padding: 12,
        marginBottom: 6,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: isLate ? "#FDE68A" : "#FECACA",
        elevation: 1,
      }}
    >
      {/* Avatar */}
      <View
        style={{
          width: 38,
          height: 38,
          borderRadius: 19,
          backgroundColor: isLate ? "#FEF9C3" : "#FEF2F2",
          justifyContent: "center",
          alignItems: "center",
          marginRight: 10,
        }}
      >
        <Text style={{ fontSize: 18 }}>{isLate ? "🕐" : "🚫"}</Text>
      </View>

      {/* Info */}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 12, fontWeight: "800", color: "#1E293B" }}>
          {student.name}{" "}
          <Text style={{ color: "#94A3AF", fontWeight: "700" }}>
            ({student.rollNumber || "—"})
          </Text>
        </Text>
        <Text
          style={{ fontSize: 10, color: "#64748B", fontWeight: "600", marginTop: 1 }}
          numberOfLines={1}
        >
          {[student.department, student.year, student.route]
            .filter(Boolean)
            .join(" • ")}
        </Text>
      </View>

      {/* Badge */}
      <View
        style={{
          backgroundColor: isLate ? "#FEF9C3" : "#FEE2E2",
          paddingHorizontal: 8,
          paddingVertical: 4,
          borderRadius: 6,
        }}
      >
        <Text
          style={{
            fontSize: 9,
            fontWeight: "900",
            color: isLate ? "#CA8A04" : "#DC2626",
          }}
        >
          {isLate ? "LATE" : "ABSENT"}
        </Text>
      </View>
    </View>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AbsentOnBusSection({
  summary,
  filteredAbsentList,
  yearFilter,
  setYearFilter,
  absentSearch,
  setAbsentSearch,
  department,
}) {
  // ── No department guard ───────────────────────────────────────────────────
  if (!department) {
    return (
      <View style={card}>
        <View style={headerRow}>
          <Text style={sectionTitle}>🚍 Today's Absent on Bus</Text>
        </View>
        <View style={emptyState}>
          <Text style={emptyIcon}>🏢</Text>
          <Text style={emptyText}>No department assigned</Text>
          <Text style={emptySubText}>
            Ask your administrator to assign a department to your account.
          </Text>
        </View>
      </View>
    );
  }

  const absentCount = summary?.absentCount ?? 0;

  return (
    <View style={card}>
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View style={headerRow}>
        <View>
          <Text style={sectionTitle}>🚍 Today's Absent on Bus</Text>
          <Text style={dateLabel}>{todayLabel()}</Text>
        </View>
        {absentCount > 0 && (
          <View style={badge}>
            <Text style={badgeText}>{absentCount} ABSENT</Text>
          </View>
        )}
      </View>

      {/* ── Search box ──────────────────────────────────────────────────── */}
      <TextInput
        value={absentSearch}
        onChangeText={setAbsentSearch}
        placeholder="Search student name or roll..."
        placeholderTextColor="#94A3B8"
        style={searchBox}
      />

      {/* ── Year tabs ───────────────────────────────────────────────────── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ marginBottom: 10 }}
        contentContainerStyle={{ gap: 6, paddingRight: 4 }}
      >
        {YEAR_TABS.map((tab) => {
          const active = yearFilter === tab.key;
          return (
            <TouchableOpacity
              key={tab.key}
              onPress={() => setYearFilter(tab.key)}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 20,
                backgroundColor: active ? "#7C3AED" : "#F1F5F9",
                borderWidth: 1,
                borderColor: active ? "#7C3AED" : "#E2E8F0",
              }}
            >
              <Text
                style={{
                  fontSize: 9,
                  fontWeight: "900",
                  color: active ? "#FFF" : "#64748B",
                }}
              >
                {tab.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── Student cards ───────────────────────────────────────────────── */}
      {filteredAbsentList.length === 0 ? (
        <View style={emptyState}>
          <Text style={emptyIcon}>
            {absentCount === 0 ? "🎉" : "🔍"}
          </Text>
          <Text style={emptyText}>
            {absentCount === 0
              ? "All students have boarded!"
              : "No students match your filters."}
          </Text>
        </View>
      ) : (
        filteredAbsentList.map((student, i) => (
          <AbsentStudentCard key={student.id || i} student={student} />
        ))
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
  alignItems: "flex-start",
  marginBottom: 10,
};

const sectionTitle = {
  fontSize: 13,
  fontWeight: "900",
  color: "#1E293B",
};

const dateLabel = {
  fontSize: 10,
  color: "#94A3B8",
  fontWeight: "600",
  marginTop: 2,
};

const badge = {
  backgroundColor: "#FEE2E2",
  borderRadius: 20,
  paddingHorizontal: 10,
  paddingVertical: 4,
  borderWidth: 1,
  borderColor: "#FECACA",
};

const badgeText = {
  fontSize: 10,
  fontWeight: "900",
  color: "#DC2626",
};

const searchBox = {
  backgroundColor: "#F8FAFC",
  borderRadius: 10,
  paddingHorizontal: 12,
  paddingVertical: 9,
  fontSize: 12,
  color: "#1E293B",
  borderWidth: 1,
  borderColor: "#E2E8F0",
  marginBottom: 10,
};

const emptyState = {
  alignItems: "center",
  paddingVertical: 24,
};

const emptyIcon = {
  fontSize: 30,
  marginBottom: 8,
};

const emptyText = {
  fontSize: 13,
  fontWeight: "700",
  color: "#64748B",
  textAlign: "center",
};

const emptySubText = {
  fontSize: 11,
  color: "#94A3B8",
  textAlign: "center",
  marginTop: 4,
};
