import React from "react";
import { Platform, Text, TouchableOpacity, View } from "react-native";
import { CameraView } from "expo-camera";
import ScanFeedback from "./ScanFeedback";

export default function QRScanner({ permission, scanEnabled, onScan, onEnable, onPickImage, onRequestPermission, onCancel, feedback }) {
  if (!permission?.granted) {
    return (
      <View style={{ padding: 20, alignItems: "center" }}>
        <Text style={{ fontSize: 14, fontWeight: "800", color: "#334155", textAlign: "center" }}>Camera permission is required to scan the bus QR code.</Text>
        <TouchableOpacity onPress={onRequestPermission} style={{ marginTop: 14, backgroundColor: "#2563EB", paddingHorizontal: 20, paddingVertical: 11, borderRadius: 10 }}>
          <Text style={{ color: "#FFF", fontWeight: "900" }}>Allow Camera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View>
      <View style={{ height: 320, borderRadius: 18, overflow: "hidden", backgroundColor: "#0F172A" }}>
        {scanEnabled ? (
          <CameraView
            style={{ flex: 1 }}
            facing="back"
            barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
            onBarcodeScanned={onScan}
          />
        ) : (
          <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 20 }}>
            <Text style={{ fontSize: 42 }}>📷</Text>
            <Text style={{ color: "#FFF", fontWeight: "800", marginTop: 10, textAlign: "center" }}>Camera is ready</Text>
          </View>
        )}
      </View>

      <ScanFeedback feedback={feedback} />

      {!scanEnabled && !feedback?.type?.includes("success") && (
        <TouchableOpacity onPress={onEnable} style={{ marginTop: 12, backgroundColor: "#10B981", padding: 14, borderRadius: 12, alignItems: "center" }}>
          <Text style={{ color: "#FFF", fontWeight: "900" }}>Start Camera Scan</Text>
        </TouchableOpacity>
      )}

      {Platform.OS === "web" && (
        <TouchableOpacity onPress={onPickImage} style={{ marginTop: 10, backgroundColor: "#EFF6FF", padding: 12, borderRadius: 12, alignItems: "center" }}>
          <Text style={{ color: "#2563EB", fontWeight: "900" }}>Scan QR From Image</Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity onPress={onCancel} style={{ marginTop: 10, backgroundColor: "#475569", padding: 12, borderRadius: 12, alignItems: "center" }}>
        <Text style={{ color: "#FFF", fontWeight: "900" }}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}
