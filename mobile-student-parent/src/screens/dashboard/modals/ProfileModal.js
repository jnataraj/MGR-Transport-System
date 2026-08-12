import React from "react";
import { Modal, SafeAreaView, ScrollView, Text, TouchableOpacity, View } from "react-native";
import styles from "../../../styles/modal.styles";

const Field = ({ label, value }) => (
  <View style={{ flex: 1, marginBottom: 14 }}>
    <Text style={{ fontSize: 9, fontWeight: "900", color: "#94A3B8" }}>{label}</Text>
    <Text style={{ fontSize: 12, fontWeight: "800", color: "#1E293B", marginTop: 3 }}>{value || "—"}</Text>
  </View>
);

export default function ProfileModal({ visible, user, onClose }) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Profile</Text>
          <TouchableOpacity onPress={onClose} style={styles.close}><Text style={styles.closeText}>CLOSE</Text></TouchableOpacity>
        </View>
        <ScrollView contentContainerStyle={{ padding: 14 }}>
          <View style={{ backgroundColor: "#FFF", borderRadius: 16, padding: 16, marginBottom: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: "900", color: "#1E293B", marginBottom: 14 }}>PERSONAL DETAILS</Text>
            <View style={{ flexDirection: "row", gap: 12 }}><Field label="NAME" value={user?.name} /><Field label="EMAIL" value={user?.email} /></View>
            <View style={{ flexDirection: "row", gap: 12 }}><Field label="DEPARTMENT" value={user?.department} /><Field label="YEAR" value={user?.year} /></View>
            <View style={{ flexDirection: "row", gap: 12 }}><Field label="ROLL / ID" value={user?.rollNumber || user?.id} /><Field label="BLOOD GROUP" value={user?.bloodGroup} /></View>
          </View>
          <View style={{ backgroundColor: "#FFF", borderRadius: 16, padding: 16, marginBottom: 12 }}>
            <Text style={{ fontSize: 16, fontWeight: "900", color: "#1E293B", marginBottom: 14 }}>TRANSIT SUBSCRIPTION</Text>
            <Field label="ROUTE / BUS NO." value={user?.route || user?.vehicle} />
            <View style={{ flexDirection: "row", gap: 12 }}><Field label="PICKUP POINT" value={user?.pickupPoint} /><Field label="EST. TIME" value={user?.pickupTime} /></View>
          </View>
          <View style={{ backgroundColor: "#FFF", borderRadius: 16, padding: 16 }}>
            <Text style={{ fontSize: 16, fontWeight: "900", color: "#1E293B", marginBottom: 14 }}>EMERGENCY / PARENT CONTACT</Text>
            <View style={{ flexDirection: "row", gap: 12 }}><Field label="FATHER NAME" value={user?.fatherName} /><Field label="CONTACT NO." value={user?.fatherContact} /></View>
            <Field label="MOTHER NAME & CONTACT" value={`${user?.motherName || "—"}${user?.motherContact ? ` (${user.motherContact})` : ""}`} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
