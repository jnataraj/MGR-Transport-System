import React from "react";
import { Text, View } from "react-native";
import styles from "../../styles/dashboard.styles";

export default function HodStats({ summary }) {
  return (
    <View style={styles.hodStats}>
      <View style={[styles.hodStat, { borderColor: "#fecaca" }]}>
        <Text style={[styles.hodStatNum, { color: "#EF4444" }]}>{summary.absentCount ?? 0}</Text>
        <Text style={styles.hodStatLabel}>{"Absent\nToday"}</Text>
      </View>
      <View style={[styles.hodStat, { borderColor: "#dcfce7" }]}>
        <Text style={[styles.hodStatNum, { color: "#10B981" }]}>{summary.presentCount ?? 0}</Text>
        <Text style={styles.hodStatLabel}>Present</Text>
      </View>
      <View style={[styles.hodStat, { borderColor: "#ddd6fe" }]}>
        <Text style={[styles.hodStatNum, { color: "#7C3AED" }]}>{summary.totalStudents ?? 0}</Text>
        <Text style={styles.hodStatLabel}>{"Total\nDept"}</Text>
      </View>
    </View>
  );
}
