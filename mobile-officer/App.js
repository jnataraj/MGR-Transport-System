import React, { useEffect } from "react";
import { View, ActivityIndicator } from "react-native";
import { StatusBar } from "expo-status-bar";
import { AuthProvider, useAuth } from "./src/context/AuthContext";
import LoginScreen from "./src/screens/LoginScreen";
import MainDashboard from "./src/screens/MainDashboard";

const ALLOWED_APP_ROLES = ["driver", "coordinator", "maintenance"];

function Root() {
  const { user, token, isLoading, logout } = useAuth();

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

  if (!user || !ALLOWED_APP_ROLES.includes((user.role || "").toLowerCase())) {
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