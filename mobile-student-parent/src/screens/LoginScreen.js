import React, { useState, useEffect, useCallback } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useAuth } from "../context/AuthContext";
import { API_BASE, checkBackendHealth } from "../api/client";

// These map to the `role` string stored on the User model in Prisma.
// "HoD" corresponds to the "deptadmin" role in the backend.
const ROLES = [
  { key: "student", label: "Student", icon: "🎓" },
  { key: "parent", label: "Parent", icon: "👪" },
  { key: "hod", label: "HoD", icon: "👑" },
];

const ALLOWED_APP_ROLES = ["student", "parent", "deptadmin", "hod"];

export default function LoginScreen() {
  const { login, logout } = useAuth();
  const [selectedRole, setSelectedRole] = useState("student");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // "checking" | "online" | "offline"
  const [serverStatus, setServerStatus] = useState("checking");
  const [serverError, setServerError] = useState("");

  const runHealthCheck = useCallback(async () => {
    setServerStatus("checking");
    setServerError("");
    const result = await checkBackendHealth();
    if (result.ok) {
      setServerStatus("online");
    } else {
      setServerStatus("offline");
      setServerError(result.error);
    }
  }, []);

  useEffect(() => {
    runHealthCheck();
  }, [runHealthCheck]);

  // Full-screen "connecting" state — shown before the login form appears.
  if (serverStatus === "checking") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color="#2563EB" />
          <Text style={styles.statusTitle}>Connecting to server…</Text>
          <Text style={styles.statusSubtitle}>{API_BASE}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // Full-screen error state — server unreachable, with retry.
  if (serverStatus === "offline") {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centerFill}>
          <Text style={{ fontSize: 40, marginBottom: 12 }}>📡</Text>
          <Text style={[styles.statusTitle, { color: "#DC2626" }]}>
            Can't reach the server
          </Text>
          <Text style={styles.statusSubtitle}>{API_BASE}</Text>
          <Text style={styles.statusDetail}>{serverError}</Text>
          <Text style={styles.statusHint}>
            Make sure the backend is running and, if you're on a physical
            device, that API_BASE points to your computer's LAN IP rather than
            "localhost".
          </Text>
          <TouchableOpacity style={styles.retryBtn} onPress={runHealthCheck}>
            <Text style={styles.retryBtnText}>Retry Connection</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert("Missing Details", "Please enter both email and password.");
      return;
    }

    setIsSubmitting(true);
    try {
      const user = await login(email.trim(), password);

      const normalizedRole = (user.role || "").toLowerCase();
      if (!ALLOWED_APP_ROLES.includes(normalizedRole)) {
        await logout();
        Alert.alert(
          "Access Denied",
          `This app is for Students, Parents, and HoDs only. Your account role is "${user.role}" — please use the Driver/Coordinator app instead.`,
        );
        return;
      }
    } catch (err) {
      Alert.alert("Login Failed", err.message || "Invalid credentials.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.container}>

          <Text style={styles.title}>
            Dr MGR Academic &{"\n"}Student Portal
          </Text>
          <View style={styles.titleUnderline} />

          <View style={styles.card}>
            <Text style={styles.cardLabel}>CHOOSE YOUR ROLE</Text>
            <View style={styles.roleGrid}>
              {ROLES.map((r) => {
                const isActive = selectedRole === r.key;
                return (
                  <TouchableOpacity
                    key={r.key}
                    style={[styles.roleTile, isActive && styles.roleTileActive]}
                    onPress={() => setSelectedRole(r.key)}
                  >
                    <Text style={{ fontSize: 26 }}>{r.icon}</Text>
                    <Text
                      style={[
                        styles.roleTileLabel,
                        isActive && styles.roleTileLabelActive,
                      ]}
                    >
                      {r.label}
                    </Text>
                    {isActive && (
                      <View style={styles.checkBadge}>
                        <Text style={styles.checkBadgeText}>✓</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={styles.inputWrap}>
            <Text style={styles.inputIcon}>👤</Text>
            <TextInput
              style={styles.input}
              placeholder="Email address"
              placeholderTextColor="#9CA3AF"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
          </View>

          <View style={styles.inputWrap}>
            <Text style={styles.inputIcon}>🔒</Text>
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor="#9CA3AF"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
          </View>

          <TouchableOpacity
            style={[styles.loginBtn, isSubmitting && { opacity: 0.7 }]}
            onPress={handleLogin}
            disabled={isSubmitting}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.loginBtnText}>Login Securely</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#F3F4F6" },
  container: { flex: 1, padding: 24, justifyContent: "center" },
  title: {
    fontSize: 24,
    fontWeight: "900",
    color: "#2563EB",
    textAlign: "center",
    lineHeight: 30,
  },
  titleUnderline: {
    height: 3,
    width: 120,
    backgroundColor: "#2563EB",
    alignSelf: "center",
    borderRadius: 2,
    marginTop: 10,
    marginBottom: 28,
  },
  card: {
    backgroundColor: "white",
    borderRadius: 20,
    padding: 20,
    marginBottom: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: "900",
    color: "#2563EB",
    textAlign: "center",
    letterSpacing: 1,
    marginBottom: 16,
  },
  roleGrid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  roleTile: {
    width: "30%",
    backgroundColor: "#F9FAFB",
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    borderRadius: 14,
    paddingVertical: 18,
    alignItems: "center",
    position: "relative",
  },
  roleTileActive: { borderColor: "#2563EB", backgroundColor: "#EFF6FF" },
  roleTileLabel: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: "800",
    color: "#374151",
  },
  roleTileLabelActive: { color: "#2563EB" },
  checkBadge: {
    position: "absolute",
    bottom: -8,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#2563EB",
    alignItems: "center",
    justifyContent: "center",
  },
  checkBadgeText: { color: "white", fontSize: 10, fontWeight: "900" },
  inputWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "white",
    borderWidth: 1.5,
    borderColor: "#E5E7EB",
    borderRadius: 14,
    paddingHorizontal: 16,
    height: 54,
    marginBottom: 14,
  },
  inputIcon: { fontSize: 16, marginRight: 10 },
  input: { flex: 1, fontSize: 14, fontWeight: "700", color: "#1F2937" },
  loginBtn: {
    backgroundColor: "#2563EB",
    height: 54,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  loginBtnText: { color: "white", fontSize: 15, fontWeight: "900" },

  centerFill: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  statusTitle: {
    fontSize: 16,
    fontWeight: "900",
    color: "#1F2937",
    marginTop: 16,
    textAlign: "center",
  },
  statusSubtitle: {
    fontSize: 12,
    fontWeight: "700",
    color: "#9CA3AF",
    marginTop: 6,
    textAlign: "center",
  },
  statusDetail: {
    fontSize: 12,
    color: "#DC2626",
    marginTop: 10,
    textAlign: "center",
  },
  statusHint: {
    fontSize: 11,
    color: "#6B7280",
    marginTop: 16,
    textAlign: "center",
    lineHeight: 17,
  },
  retryBtn: {
    marginTop: 24,
    backgroundColor: "#2563EB",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryBtnText: { color: "white", fontWeight: "900", fontSize: 13 },

  connectedBadge: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#ECFDF5",
    borderWidth: 1,
    borderColor: "#A7F3D0",
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
    marginBottom: 16,
  },
  connectedDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "#10B981",
    marginRight: 6,
  },
  connectedText: { fontSize: 10, fontWeight: "800", color: "#059669" },
});
