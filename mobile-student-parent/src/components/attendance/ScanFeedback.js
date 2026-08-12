import React from "react";
import { Text, View } from "react-native";

export default function ScanFeedback({ feedback }) {
  if (!feedback) return null;
  const color = feedback.type === "success" ? "#059669" : feedback.type === "pending" ? "#2563EB" : "#DC2626";
  const bg = feedback.type === "success" ? "#ECFDF5" : feedback.type === "pending" ? "#EFF6FF" : "#FEF2F2";
  return (
    <View style={{ backgroundColor: bg, borderRadius: 12, padding: 14, marginTop: 12 }}>
      <Text style={{ color, fontWeight: "900", textAlign: "center", lineHeight: 20 }}>{feedback.message}</Text>
    </View>
  );
}
