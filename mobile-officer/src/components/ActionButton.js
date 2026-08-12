import React from "react";
import { Text, TouchableOpacity } from "react-native";
import { styles } from "../styles/dashboard.styles";

export default function ActionButton({ title, icon, onPress }) {
  return (
    <TouchableOpacity style={styles.actionBtn} onPress={onPress}>
      <Text style={{ fontSize: 22, marginBottom: 5 }}>{icon}</Text>
      <Text style={styles.actionBtnText}>{title}</Text>
    </TouchableOpacity>
  );
}
