import React from "react";
import { Modal, Text, TouchableOpacity, View } from "react-native";
import styles from "../../../styles/modal.styles";

export default function SettingsModal({ visible, gpsEnabled, onToggleGPS, onLogout, onClose }) {
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <Text style={styles.modalTitle}>App Settings</Text>
          <Text style={{ fontSize: 13, color: "#4B5563", fontWeight: "700", marginBottom: 10 }}>GPS Tracking Status</Text>
          <TouchableOpacity onPress={onToggleGPS} style={[styles.button, { backgroundColor: gpsEnabled ? "#10B981" : "#EF4444" }]}>
            <Text style={styles.buttonText}>{gpsEnabled ? "GPS ACCESS: PROVIDED" : "GPS ACCESS: DECLINED"}</Text>
          </TouchableOpacity>
          <Text style={{ fontSize: 10, color: "#9CA3AF", textAlign: "center", marginTop: 8 }}>Control whether your location is used for live bus tracking.</Text>
          <TouchableOpacity onPress={onLogout} style={[styles.button, styles.dangerButton, { marginTop: 20 }]}><Text style={styles.buttonText}>LOG OUT</Text></TouchableOpacity>
          <TouchableOpacity onPress={onClose} style={[styles.button, styles.secondaryButton]}><Text style={styles.buttonText}>CLOSE</Text></TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
