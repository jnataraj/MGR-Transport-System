import React from "react";
import { Modal, SafeAreaView, ScrollView, Text, TouchableOpacity, View } from "react-native";
import styles from "../../../styles/modal.styles";

export default function RouteAlertsModal({ visible, alerts, onClose }) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
        <View style={styles.header}>
          <View><Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 10, fontWeight: "800", letterSpacing: 1 }}>TRANSPORT</Text><Text style={styles.headerTitle}>Route Alerts</Text></View>
          <TouchableOpacity onPress={onClose} style={styles.close}><Text style={styles.closeText}>CLOSE</Text></TouchableOpacity>
        </View>
        <ScrollView style={{ padding: 14 }}>
          {(alerts || []).length === 0 ? <Text style={{ textAlign: "center", color: "#64748B", marginTop: 40, fontWeight: "700" }}>No route alerts.</Text> : (alerts || []).map((alert, index) => (
            <View key={alert.id || index} style={{ backgroundColor: "#FFF", borderRadius: 16, marginBottom: 12, borderLeftWidth: 5, borderLeftColor: "#2563EB", padding: 14, elevation: 2 }}>
              <Text style={{ fontSize: 12, fontWeight: "900", color: "#2563EB" }}>{alert.notificationType || "General"}</Text>
              <Text style={{ fontSize: 15, fontWeight: "900", color: "#111827", marginTop: 6 }}>{alert.routeName || "Notification"}</Text>
              <Text style={{ fontSize: 11, color: "#6B7280", marginTop: 5 }}>{alert.effectiveDate} at {alert.effectiveTime}</Text>
              {!!alert.customMessage && <Text style={{ fontSize: 13, color: "#374151", lineHeight: 20, marginTop: 10 }}>{alert.customMessage}</Text>}
            </View>
          ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
