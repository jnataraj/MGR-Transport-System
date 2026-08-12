import React from "react";
import { Modal, SafeAreaView, Text, View } from "react-native";
import QRScanner from "../../../components/attendance/QRScanner";
import styles from "../../../styles/modal.styles";

export default function BoardingQRModal({ visible, attendance, onClose }) {
  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.full}>
        <View style={styles.header}>
          <View>
            <Text style={{ color: "rgba(255,255,255,0.7)", fontSize: 10, fontWeight: "800", letterSpacing: 1 }}>STUDENT ATTENDANCE</Text>
            <Text style={styles.headerTitle}>Boarding QR Scanner</Text>
          </View>
        </View>
        <View style={{ padding: 16 }}>
          <Text style={{ fontSize: 11, fontWeight: "800", color: "#64748B", marginBottom: 10 }}>
            Current stage: {attendance.boardStatus}
          </Text>
          <QRScanner
            permission={attendance.cameraPermission}
            scanEnabled={attendance.scanEnabled}
            onScan={attendance.handleVehicleQRScanned}
            onEnable={attendance.openScanner}
            onPickImage={attendance.pickQRFromLibrary}
            onRequestPermission={attendance.requestCameraPermission}
            onCancel={onClose}
            feedback={attendance.scanFeedback}
          />
        </View>
      </SafeAreaView>
    </Modal>
  );
}
