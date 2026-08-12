import React from "react";
import { View, Text, TouchableOpacity } from "react-native";
import { ROLES } from "../../constants/roles";
import styles from "../../styles/login.styles";

export default function RoleSelector({ selectedRole, onChange }) {
  return (
    <View style={styles.card}>
      <Text style={styles.cardLabel}>CHOOSE YOUR ROLE</Text>
      <View style={styles.roleGrid}>
        {ROLES.map((role) => {
          const active = selectedRole === role.key;
          return (
            <TouchableOpacity
              key={role.key}
              style={[styles.roleTile, active && styles.roleTileActive]}
              onPress={() => onChange(role.key)}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text style={{ fontSize: 26 }}>{role.icon}</Text>
              <Text style={[styles.roleTileLabel, active && styles.roleTileLabelActive]}>
                {role.label}
              </Text>
              {active && (
                <View style={styles.checkBadge}>
                  <Text style={styles.checkBadgeText}>✓</Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}
