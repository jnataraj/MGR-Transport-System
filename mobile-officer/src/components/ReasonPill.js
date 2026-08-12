import React from "react";
import { Text, View } from "react-native";
import { styles } from "../styles/dashboard.styles";

export default function ReasonPill({ label, count, color }) {
  return (
    <View style={[styles.pill, { backgroundColor: color }]}>
      <Text style={styles.pillText}>
        {label}: {count}
      </Text>
    </View>
  );
}
