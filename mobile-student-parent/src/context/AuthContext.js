import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { apiRequest, storeAuth, clearAuth, loadAuth } from "../api/client";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Restore a saved session on app launch
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
    const data = await apiRequest("/api/auth/login", {
      method: "POST",
      body: { email, password },
    });
    console.log("Login Response:", data);
    console.log("Token:", data.token);
    // data => { success, token, user: { id, name, email, role, department, ... } }
    await storeAuth(data.token, data.user);
    setToken(data.token);
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    await clearAuth();
    setToken(null);
    setUser(null);
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

      // If the server says the user no longer exists (deleted account / DB reset)
      // or the token is invalid/expired, clear local auth so the user lands on
      // the login screen instead of being stuck in a broken authenticated state.
      if (err.status === 404 || err.status === 401) {
        console.warn("Stale session detected — clearing auth and logging out.");
        await clearAuth();
        setToken(null);
        setUser(null);
      }
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
