import AsyncStorage from "@react-native-async-storage/async-storage";

// API URL comes only from .env
export const API_BASE = process.env.EXPO_PUBLIC_API_URL;

const TOKEN_KEY = "ctms_auth_token";
const USER_KEY = "ctms_auth_user";
const GPS_KEY = "ctms_gps_enabled";

let onUnauthorized = null;
export const setOnUnauthorized = (handler) => {
  onUnauthorized = handler;
};

// Save token and user
export const storeAuth = async (token, user) => {
  await AsyncStorage.setItem(TOKEN_KEY, token);
  await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
};

export const storeGpsEnabled = async (enabled) => {
  await AsyncStorage.setItem(GPS_KEY, JSON.stringify(enabled));
};

// Load GPS toggle state
export const loadGpsEnabled = async () => {
  const raw = await AsyncStorage.getItem(GPS_KEY);
  return raw ? JSON.parse(raw) : false;
};

// Clear token and user
export const clearAuth = async () => {
  await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
};

// Load saved login
export const loadAuth = async () => {
  const [token, userRaw] = await Promise.all([
    AsyncStorage.getItem(TOKEN_KEY),
    AsyncStorage.getItem(USER_KEY),
  ]);


  return {
    token,
    user: userRaw ? JSON.parse(userRaw) : null,
  };
};

// API Request Helper
export const apiRequest = async (
  path,
  { method = "GET", body, token } = {},
) => {
  try {
    const res = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await res.json().catch(() => null);

    if (!res.ok) {
      const err = new Error(
        data?.message || data?.error || `Request failed (${res.status})`,
      );
      err.status = res.status;

      // Only treat as a dead/expired session when the request was made with
      // an existing token (i.e. the user was already logged in). This prevents
      // a failed *login* attempt (no token yet) from accidentally triggering
      // the global logout handler.
      const isAuthenticatedRequest = !!token;
      const isDeadSession =
        isAuthenticatedRequest &&
        (res.status === 401 ||
          (res.status === 404 && data?.message === "User Not Found"));

      if (isDeadSession && onUnauthorized) {
        onUnauthorized();
      }
      throw err;
    }

    return data;
  } catch (err) {
    console.error("API Error:", err);
    throw err;
  }
};
