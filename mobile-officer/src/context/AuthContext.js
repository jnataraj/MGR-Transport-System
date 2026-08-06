import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import {
  apiRequest,
  storeAuth,
  clearAuth,
  loadAuth,
  setOnUnauthorized, // NEW
} from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const logout = useCallback(async () => {
    await clearAuth();
    setToken(null);
    setUser(null);
  }, []);

  // ── NEW: wire the global 401 hook to logout, once, on mount ──
  useEffect(() => {
    setOnUnauthorized(() => {
      console.log("Session expired / invalid token — logging out.");
      logout();
    });
  }, [logout]);

  useEffect(() => {
    (async () => {
      const { token: savedToken, user: savedUser } = await loadAuth();
      if (savedToken && savedUser) {
        setToken(savedToken);
        setUser(savedUser);
      }
      setIsLoading(false);
    })();
  }, []);

  const login = useCallback(async (email, password) => {
    // Normalize email: trim whitespace and lowercase so the lookup is
    // consistent regardless of how the user typed it (e.g. "Driver@CTMS.com")
    const normalizedEmail = (email || "").trim().toLowerCase();
    const data = await apiRequest("/api/auth/login", {
      method: "POST",
      body: { email: normalizedEmail, password },
    });
    await storeAuth(data.token, data.user);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const refreshProfile = useCallback(async () => {
    if (!token) return null;
    try {
      const data = await apiRequest("/api/auth/profile", { token });
      if (data?.user) {
        setUser(data.user);
        await storeAuth(token, data.user);
        return data.user;
      }
    } catch (err) {
      console.error("Failed to refresh profile:", err);
    }
    return null;
  }, [token]);

  return (
    <AuthContext.Provider
      value={{ user, token, isLoading, login, logout, refreshProfile }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
};