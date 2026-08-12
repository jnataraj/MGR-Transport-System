import React from "react";
import { Text, TouchableOpacity } from "react-native";
import { styles } from "../styles/dashboard.styles";

export default function IssueTile({ icon, label, onPress }) {
  return (
    <TouchableOpacity style={styles.issueTile} onPress={onPress}>
      <Text style={{ fontSize: 24 }}>{icon}</Text>
      <Text style={styles.issueTileLabel}>{label}</Text>
    </TouchableOpacity>
  );
}
