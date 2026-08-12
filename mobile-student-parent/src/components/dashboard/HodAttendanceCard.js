import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Users, Download } from "lucide-react-native";
import styles from "../../styles/dashboard.styles";

export default function HodAttendanceCard({
  history,
  timeFilter,
  onChangeFilter,
  allAbsentCount,
  onAbsentStudents,
  onExport,
}) {
  const rows = history?.dayWise || [];

  return (
    <View style={styles.card}>
      {/* ── Header row ──────────────────────────────────────────────────── */}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 12,
        }}
      >
        <Text style={styles.progressTitle}>DEPARTMENT ATTENDANCE</Text>
        <View style={{ flexDirection: "row", gap: 4 }}>
          {["W", "M", "Y"].map((value) => (
            <TouchableOpacity
              key={value}
              onPress={() => onChangeFilter(value)}
              style={{
                paddingHorizontal: 9,
                paddingVertical: 5,
                borderRadius: 7,
                backgroundColor: timeFilter === value ? "#7C3AED" : "#F1F5F9",
              }}
            >
              <Text
                style={{
                  fontSize: 9,
                  fontWeight: "900",
                  color: timeFilter === value ? "#FFF" : "#64748B",
                }}
              >
                {value}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ── Average row ─────────────────────────────────────────────────── */}
      <View
        style={{
          backgroundColor: "#F8FAFC",
          borderRadius: 10,
          padding: 10,
          marginBottom: 10,
        }}
      >
        <Text style={{ fontSize: 11, fontWeight: "900", color: "#475569" }}>
          Average attendance: {history?.avgAttendanceRate || "0.0%"}
        </Text>
      </View>

      {/* ── Column headers ──────────────────────────────────────────────── */}
      <View
        style={{
          flexDirection: "row",
          paddingVertical: 5,
          borderBottomWidth: 1.5,
          borderBottomColor: "#E2E8F0",
          marginBottom: 2,
        }}
      >
        <Text style={{ flex: 1.5, fontSize: 9, fontWeight: "900", color: "#94A3B8" }}>DATE</Text>
        <Text style={{ flex: 0.8, fontSize: 9, fontWeight: "900", color: "#10B981", textAlign: "center" }}>PRESENT</Text>
        <Text style={{ flex: 0.8, fontSize: 9, fontWeight: "900", color: "#EF4444", textAlign: "center" }}>ABSENT</Text>
        <Text style={{ flex: 0.6, fontSize: 9, fontWeight: "900", color: "#94A3B8", textAlign: "right" }}>RATE</Text>
      </View>

      {/* ── Day-wise rows ────────────────────────────────────────────────── */}
      {rows.slice(0, 7).map((row, index) => (
        <View
          key={`${row.label}-${index}`}
          style={{
            flexDirection: "row",
            paddingVertical: 7,
            borderBottomWidth: 1,
            borderBottomColor: "#F8FAFC",
          }}
        >
          <Text style={{ flex: 1.5, fontSize: 9, fontWeight: "800", color: "#1E293B" }}>
            {row.label}
          </Text>
          <Text style={{ flex: 0.8, fontSize: 10, fontWeight: "800", color: "#10B981", textAlign: "center" }}>
            {row.present}
          </Text>
          <Text style={{ flex: 0.8, fontSize: 10, fontWeight: "800", color: "#EF4444", textAlign: "center" }}>
            {row.absent}
          </Text>
          <Text style={{ flex: 0.6, fontSize: 9, fontWeight: "800", color: "#64748B", textAlign: "right" }}>
            {row.rate}
          </Text>
        </View>
      ))}

      {/* ── View Absent Students ─────────────────────────────────────────── */}
      <TouchableOpacity
        onPress={onAbsentStudents}
        style={{
          marginTop: 14,
          padding: 12,
          borderRadius: 12,
          backgroundColor: "#FEF2F2",
          alignItems: "center",
          flexDirection: "row",
          justifyContent: "center",
          gap: 8,
          borderWidth: 1,
          borderColor: "#FCA5A5",
        }}
      >
        <Users size={14} color="#DC2626" strokeWidth={2.5} />
        <Text style={{ color: "#DC2626", fontSize: 10, fontWeight: "900" }}>
          VIEW ABSENT STUDENTS — ALL DEPTS
        </Text>
        {allAbsentCount > 0 && (
          <View
            style={{
              backgroundColor: "#DC2626",
              borderRadius: 10,
              minWidth: 20,
              height: 20,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: 5,
            }}
          >
            <Text style={{ color: "#FFF", fontSize: 10, fontWeight: "900" }}>
              {allAbsentCount}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      {/* ── Export ──────────────────────────────────────────────────────── */}
      <TouchableOpacity
        onPress={onExport}
        style={{
          marginTop: 10,
          padding: 12,
          borderRadius: 12,
          backgroundColor: "#F5F3FF",
          alignItems: "center",
          flexDirection: "row",
          justifyContent: "center",
          gap: 8,
          borderWidth: 1,
          borderColor: "#DDD6FE",
        }}
      >
        <Download size={14} color="#7C3AED" strokeWidth={2.5} />
        <Text style={{ color: "#7C3AED", fontSize: 10, fontWeight: "900" }}>
          EXPORT ATTENDANCE REPORT
        </Text>
      </TouchableOpacity>
    </View>
  );
}
