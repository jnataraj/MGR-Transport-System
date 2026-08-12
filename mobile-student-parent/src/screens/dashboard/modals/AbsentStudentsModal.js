import React, { useMemo, useState } from "react";
import {
  Modal,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import styles from "../../../styles/modal.styles";

// ── Status badge colours ──────────────────────────────────────────────────
const STAGE_COLORS = {
  PICKUP: { bg: "#FEF9C3", text: "#CA8A04" },
  TO_COLLEGE: { bg: "#DBEAFE", text: "#2563EB" },
  AT_COLLEGE: { bg: "#DCFCE7", text: "#16A34A" },
  TO_HOME: { bg: "#EDE9FE", text: "#7C3AED" },
  AT_HOME: { bg: "#D1FAE5", text: "#059669" },
};

const ABSENT_COLOR = { bg: "#FEE2E2", text: "#DC2626" };

const STAGE_LABELS = {
  PICKUP: "Waiting Pickup",
  TO_COLLEGE: "In-Route",
  AT_COLLEGE: "At College",
  TO_HOME: "To Home",
  AT_HOME: "At Home",
};

function StudentRow({ student, showDept }) {
  const isAbsent = !student.stage;
  const color = isAbsent ? ABSENT_COLOR : (STAGE_COLORS[student.stage] || { bg: "#F1F5F9", text: "#475569" });

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
        borderColor: isAbsent ? "#FECACA" : "#F1F5F9",
        elevation: 1,
      }}
    >
      {/* Avatar */}
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: isAbsent ? "#FEE2E2" : "#F0FDF4",
          justifyContent: "center",
          alignItems: "center",
          marginRight: 10,
        }}
      >
        <Text style={{ fontSize: 16 }}>{isAbsent ? "🚫" : "✅"}</Text>
      </View>

      {/* Student info */}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 12, fontWeight: "800", color: "#1E293B" }}>
          {student.name}{" "}
          <Text style={{ color: "#94A3AF", fontWeight: "700" }}>
            ({student.rollNumber || "—"})
          </Text>
        </Text>
        <Text style={{ fontSize: 10, color: "#64748B", fontWeight: "600", marginTop: 1 }}>
          {showDept && student.department ? `${student.department}` : ""}
          {student.year ? (showDept && student.department ? ` • ${student.year}` : student.year) : ""}
          {student.route && student.route !== "—" ? ` • ${student.route}` : ""}
        </Text>
      </View>

      {/* Status badge */}
      <View
        style={{
          backgroundColor: color.bg,
          paddingHorizontal: 8,
          paddingVertical: 4,
          borderRadius: 6,
        }}
      >
        <Text style={{ fontSize: 9, fontWeight: "900", color: color.text }}>
          {isAbsent ? "ABSENT" : STAGE_LABELS[student.stage] || student.stage}
        </Text>
      </View>
    </View>
  );
}

export default function AbsentStudentsModal({ visible, summary, deptBreakdown, onClose }) {
  const [search, setSearch] = useState("");
  const [activeTab, setActiveTab] = useState("absent"); // "absent" | "all" | "present"
  const [selectedDept, setSelectedDept] = useState("ALL");

  const absentList = summary?.absentList || [];
  const presentList = summary?.presentList || [];
  const allList = useMemo(() => [...absentList, ...presentList], [absentList, presentList]);

  const totalAbsent = summary?.absentCount ?? 0;
  const totalPresent = summary?.presentCount ?? 0;
  const totalAll = summary?.totalStudents ?? 0;

  // Unique department list for filter pills
  const depts = useMemo(() => {
    const set = new Set();
    allList.forEach((s) => s.department && set.add(s.department));
    return ["ALL", ...Array.from(set).sort()];
  }, [allList]);

  // Source list based on active tab
  const sourceList = activeTab === "absent" ? absentList : activeTab === "present" ? presentList : allList;

  // Apply search + dept filter
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sourceList.filter((s) => {
      const matchesDept = selectedDept === "ALL" || s.department === selectedDept;
      if (!matchesDept) return false;
      if (!q) return true;
      return (
        s.name?.toLowerCase().includes(q) ||
        s.rollNumber?.toLowerCase().includes(q) ||
        s.department?.toLowerCase().includes(q)
      );
    });
  }, [sourceList, search, selectedDept]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
        {/* ── Header ────────────────────────────────────────────────────── */}
        <View style={[styles.header, { backgroundColor: "#7C3AED" }]}>
          <View>
            <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 9, fontWeight: "800", letterSpacing: 1 }}>
              ALL DEPARTMENTS
            </Text>
            <Text style={styles.headerTitle}>Today's Attendance Details</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.close}>
            <Text style={styles.closeText}>CLOSE</Text>
          </TouchableOpacity>
        </View>

        {/* ── Summary stats row ─────────────────────────────────────────── */}
        <View style={{ flexDirection: "row", backgroundColor: "#FFF", padding: 14, gap: 8, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" }}>
          {[
            { label: "Absent Today", count: totalAbsent, color: "#EF4444", bg: "#FEE2E2", tab: "absent" },
            { label: "Present Today", count: totalPresent, color: "#10B981", bg: "#DCFCE7", tab: "present" },
            { label: "Total Students", count: totalAll, color: "#7C3AED", bg: "#EDE9FE", tab: "all" },
          ].map((item) => (
            <TouchableOpacity
              key={item.tab}
              onPress={() => setActiveTab(item.tab)}
              style={{
                flex: 1,
                backgroundColor: activeTab === item.tab ? item.bg : "#F8FAFC",
                borderRadius: 10,
                padding: 10,
                alignItems: "center",
                borderWidth: 1.5,
                borderColor: activeTab === item.tab ? item.color : "#F1F5F9",
              }}
            >
              <Text style={{ fontSize: 20, fontWeight: "900", color: item.color }}>{item.count}</Text>
              <Text style={{ fontSize: 9, fontWeight: "800", color: "#64748B", textAlign: "center", marginTop: 2 }}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Per-dept breakdown (only when showing absent or all) ───────── */}
        {deptBreakdown && deptBreakdown.length > 0 && (
          <View style={{ backgroundColor: "#FFF", paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" }}>
            <Text style={{ fontSize: 10, fontWeight: "900", color: "#94A3B8", letterSpacing: 1, marginBottom: 8 }}>
              DEPT-WISE SNAPSHOT
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {deptBreakdown.map((d) => (
                  <View
                    key={d.department}
                    style={{
                      backgroundColor: "#FEF2F2",
                      borderRadius: 10,
                      paddingHorizontal: 10,
                      paddingVertical: 8,
                      minWidth: 90,
                      alignItems: "center",
                      borderWidth: 1,
                      borderColor: "#FECACA",
                    }}
                  >
                    <Text style={{ fontSize: 9, fontWeight: "900", color: "#7C3AED", textAlign: "center" }} numberOfLines={2}>
                      {d.department}
                    </Text>
                    <Text style={{ fontSize: 16, fontWeight: "900", color: "#EF4444", marginTop: 4 }}>{d.absent}</Text>
                    <Text style={{ fontSize: 9, color: "#64748B", fontWeight: "700" }}>absent / {d.total}</Text>
                  </View>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        {/* ── Search + Dept filter ──────────────────────────────────────── */}
        <View style={{ backgroundColor: "#FFF", paddingHorizontal: 14, paddingTop: 10, paddingBottom: 6, borderBottomWidth: 1, borderBottomColor: "#F1F5F9" }}>
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="🔍  Search by name, roll no. or department…"
            placeholderTextColor="#94A3B8"
            style={{
              backgroundColor: "#F8FAFC",
              borderRadius: 10,
              paddingHorizontal: 12,
              paddingVertical: 9,
              fontSize: 12,
              color: "#1E293B",
              borderWidth: 1,
              borderColor: "#E2E8F0",
              marginBottom: 8,
            }}
          />
          {/* Department pills */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: "row", gap: 6, paddingBottom: 4 }}>
              {depts.map((dept) => (
                <TouchableOpacity
                  key={dept}
                  onPress={() => setSelectedDept(dept)}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 8,
                    backgroundColor: selectedDept === dept ? "#7C3AED" : "#F1F5F9",
                  }}
                >
                  <Text style={{ fontSize: 9, fontWeight: "900", color: selectedDept === dept ? "#FFF" : "#64748B" }}>
                    {dept === "ALL" ? "ALL DEPTS" : dept}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* ── Student list ──────────────────────────────────────────────── */}
        <ScrollView contentContainerStyle={{ padding: 12 }}>
          {/* Section heading */}
          <Text style={{ fontSize: 10, fontWeight: "900", color: "#94A3B8", letterSpacing: 1, marginBottom: 8 }}>
            {activeTab === "absent"
              ? `NOT MARKED TODAY — ${filtered.length} STUDENT${filtered.length !== 1 ? "S" : ""}`
              : activeTab === "present"
              ? `MARKED PRESENT — ${filtered.length} STUDENT${filtered.length !== 1 ? "S" : ""}`
              : `ALL STUDENTS — ${filtered.length} STUDENT${filtered.length !== 1 ? "S" : ""}`}
          </Text>

          {filtered.length === 0 ? (
            <View style={{ alignItems: "center", marginTop: 40 }}>
              <Text style={{ fontSize: 32, marginBottom: 10 }}>
                {activeTab === "absent" ? "🎉" : "🔍"}
              </Text>
              <Text style={{ color: "#64748B", fontWeight: "700", fontSize: 14 }}>
                {activeTab === "absent" && !search && selectedDept === "ALL"
                  ? "All students have marked attendance!"
                  : "No students match your filters."}
              </Text>
            </View>
          ) : (
            filtered.map((student, index) => (
              <StudentRow
                key={student.id || index}
                student={student}
                showDept={selectedDept === "ALL"}
              />
            ))
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
