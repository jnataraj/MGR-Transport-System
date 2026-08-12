import React from "react";
import { ActivityIndicator, SafeAreaView, Text, TouchableOpacity, View } from "react-native";
import styles from "../../styles/login.styles";

export default function ServerStatusView({ status, error, apiBase, onRetry }) {
  if (status === "checking") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.statusTitle}>Connecting to server…</Text>
          <Text style={styles.statusSubtitle}>{apiBase}</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.centerFill}>
        <Text style={{ fontSize: 40, marginBottom: 12 }}>📡</Text>
        <Text style={[styles.statusTitle, { color: "#DC2626" }]}>Can't reach the server</Text>
        <Text style={styles.statusSubtitle}>{apiBase}</Text>
        <Text style={styles.statusDetail}>{error}</Text>
        <Text style={styles.statusHint}>
          Make sure the backend is running and, on a physical device, API_BASE points to your computer's LAN IP rather than localhost.
        </Text>
        <TouchableOpacity style={styles.retryBtn} onPress={onRetry}>
          <Text style={styles.retryBtnText}>Retry Connection</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
