import React, { useMemo } from "react";
import { ActivityIndicator, Modal, SafeAreaView, ScrollView, Text, TouchableOpacity, View } from "react-native";
import styles from "../../../styles/modal.styles";

const boardedStages = ["TO_COLLEGE", "AT_COLLEGE", "TO_HOME", "AT_HOME"];
const stageLabels = { PICKUP: "Waiting Pickup", TO_COLLEGE: "Transit → College", AT_COLLEGE: "Arrived College", TO_HOME: "Transit → Home", AT_HOME: "Arrived Home" };

export default function TravelHistoryModal({ visible, role, user, history, onClose }) {
  const filtered = useMemo(() => {
    const records = history.items || [];
    if (history.statusFilter === "ALL") return records;
    return records.filter((record) => history.statusFilter === "BOARDED" ? boardedStages.includes(record.stage) : !boardedStages.includes(record.stage));
  }, [history.items, history.statusFilter]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
        <View style={styles.header}>
          <View>
            <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 10, fontWeight: "700", letterSpacing: 1 }}>{role.toUpperCase()} · {user?.name || "Portal User"}</Text>
            <Text style={styles.headerTitle}>Travel History</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={styles.close}><Text style={styles.closeText}>CLOSE</Text></TouchableOpacity>
        </View>

        <View style={{ padding: 10, flex: 1 }}>
          <View style={{ flexDirection: "row", backgroundColor: "#E2E8F0", padding: 2, borderRadius: 8, marginBottom: 10 }}>
            {["ALL", "BOARDED", "MISSED"].map((value) => (
              <TouchableOpacity key={value} onPress={() => history.setStatusFilter(value)} style={{ flex: 1, padding: 7, backgroundColor: history.statusFilter === value ? "#FFF" : "transparent", borderRadius: 6, alignItems: "center" }}>
                <Text style={{ fontSize: 8, fontWeight: "900", color: history.statusFilter === value ? "#2563EB" : "#64748B" }}>{value}</Text>
              </TouchableOpacity>
            ))}
          </View>

          {history.loading ? <ActivityIndicator size="large" color="#2563EB" style={{ marginTop: 40 }} /> : (
            <ScrollView>
              {filtered.length === 0 ? <Text style={{ textAlign: "center", color: "#64748B", marginTop: 40, fontWeight: "700" }}>No travel history found.</Text> : filtered.map((record, index) => {
                const date = record.scannedAt ? new Date(record.scannedAt) : null;
                const boarded = boardedStages.includes(record.stage);
                return (
                  <View key={record.id || index} style={{ backgroundColor: boarded ? "#F0FDF4" : "#FFF", borderRadius: 10, padding: 10, marginBottom: 7, borderWidth: 1, borderColor: "#F1F5F9" }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                      <Text style={{ fontSize: 11, fontWeight: "900", color: "#1E293B", flex: 1 }}>{record.vehicleId || user?.vehicle || "—"}</Text>
                      <Text style={{ fontSize: 8, color: "#64748B", fontWeight: "700" }}>{date ? date.toLocaleString([], { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "—"}</Text>
                    </View>
                    <Text style={{ marginTop: 6, fontSize: 9, fontWeight: "900", color: boarded ? "#059669" : "#DC2626" }}>{stageLabels[record.stage] || record.stage || "—"}</Text>
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      </SafeAreaView>
    </Modal>
  );
}
