import React, { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { StatusBar } from "expo-status-bar";
// import LoginScreen from "./src/screens/LoginScreen";
import LoginScreen from "./src/screens/LoginScreen";
import MainDashboard from "./src/screens/MainDashboard";
import { AuthProvider, useAuth } from "./src/context/AuthContext";

function Root() {
  const { user, token, isLoading, logout } = useAuth();

  // Roles allowed into the Student app. Keep in sync with
  // src/screens/LoginScreen.js which prevents disallowed logins.
  const ALLOWED_APP_ROLES = ["student", "parent", "deptadmin", "hod"];

  // If a restored session belongs to a role this app isn't for, sign out.
  useEffect(() => {
    if (!isLoading && user) {
      const role = (user.role || "").toLowerCase();
      if (!ALLOWED_APP_ROLES.includes(role)) {
        logout();
      }
    }
  }, [isLoading, user, logout]);

  if (isLoading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <StatusBar style="dark" />
        <ActivityIndicator size="large" color="#2563EB" />
      </View>
    );
  }

  if (!user) {
    return <LoginScreen />;
  }

  return <MainDashboard user={user} token={token} onLogout={logout} />;
}

export default function App() {
  return (
    <AuthProvider>
      <Root />
    </AuthProvider>
  );
}
