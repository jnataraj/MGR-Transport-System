import { useCallback, useEffect, useState } from "react";
import { Alert } from "react-native";
import { API_BASE, checkBackendHealth } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { ALLOWED_APP_ROLES, ROLES } from "../constants/roles";

const ROLE_LABELS = ROLES.reduce((acc, r) => {
  acc[r.key] = r.label;
  return acc;
}, {});

export default function useLogin() {
  const { login, logout } = useAuth();
  const [selectedRole, setSelectedRole] = useState("student");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [serverStatus, setServerStatus] = useState("checking");
  const [serverError, setServerError] = useState("");

  const runHealthCheck = useCallback(async () => {
    setServerStatus("checking");
    setServerError("");
    try {
      const result = await checkBackendHealth();
      if (result.ok) setServerStatus("online");
      else {
        setServerStatus("offline");
        setServerError(result.error || "Backend is unavailable.");
      }
    } catch (error) {
      setServerStatus("offline");
      setServerError(error.message || "Backend is unavailable.");
    }
  }, []);

  useEffect(() => {
    runHealthCheck();
  }, [runHealthCheck]);

  const handleLogin = async () => {
    if (!email.trim() || !password) {
      Alert.alert("Missing Details", "Please enter both email and password.");
      return;
    }

    setIsSubmitting(true);
    try {
      const user = await login(email.trim(), password);
      const normalizedRole = (user?.role || "").toLowerCase();

      if (!ALLOWED_APP_ROLES.includes(normalizedRole)) {
        await logout();
        Alert.alert(
          "Access Denied",
          `This app is for Students, Parents, and HoDs only. Your account role is "${user?.role || "unknown"}" — please use the Driver/Coordinator app instead.`,
        );
        return;
      }

      // HoD tile covers both "hod" and "deptadmin" backend roles.
      const roleMatches =
        normalizedRole === selectedRole ||
        (selectedRole === "hod" && normalizedRole === "deptadmin");

      if (!roleMatches) {
        await logout();
        const correctRoleKey = normalizedRole === "deptadmin" ? "hod" : normalizedRole;
        const correctLabel = ROLE_LABELS[correctRoleKey] || user?.role;

        Alert.alert(
          "Wrong Role Selected",
          `These credentials belong to a "${correctLabel}" account, but "${ROLE_LABELS[selectedRole] || selectedRole}" is selected above.\n\nPlease check "Choose Your Role" before logging in.`,
          [
            {
              text: `Switch to ${correctLabel}`,
              onPress: () => setSelectedRole(correctRoleKey),
            },
            { text: "OK", style: "cancel" },
          ],
        );
        return;
      }
    } catch (error) {
      Alert.alert("Login Failed", error.message || "Invalid credentials.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return {
    selectedRole,
    setSelectedRole,
    email,
    setEmail,
    password,
    setPassword,
    isSubmitting,
    serverStatus,
    serverError,
    apiBase: API_BASE,
    handleLogin,
    retryConnection: runHealthCheck,
  };
}