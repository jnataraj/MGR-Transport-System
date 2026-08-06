import React, { useState } from "react";
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

const ROLES = [
  { key: "driver", label: "Driver", icon: "🧑‍✈️" },
  { key: "coordinator", label: "Coord", icon: "📋" },
  { key: "maintenance", label: "Maint", icon: "🔧" },
];

export default function LoginScreen() {
  const { login } = useAuth();
  const [selectedRole, setSelectedRole] = useState("driver");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert("Missing Details", "Please enter both email and password.");
      return;
    }

    setIsSubmitting(true);
    try {
      const user = await login(email.trim(), password);

      const normalizedRole = (user.role || "").toLowerCase();
      if (normalizedRole !== selectedRole) {
        Alert.alert(
          "Role Mismatch",
          `This account is registered as "${user.role}", not "${selectedRole}". You're logged in — the app will use your account's actual role.`,
        );
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
          <Text style={styles.title}>Transport Staff App</Text>
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
    fontSize: 26,
    fontWeight: "900",
    color: "#2563EB",
    textAlign: "center",
  },
  titleUnderline: {
    height: 3,
    width: 120,
    backgroundColor: "#2563EB",
    alignSelf: "center",
    borderRadius: 2,
    marginTop: 6,
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
    width: "47%",
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
    fontSize: 13,
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
});
