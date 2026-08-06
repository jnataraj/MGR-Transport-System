import AsyncStorage from "@react-native-async-storage/async-storage";

export const API_BASE = process.env.EXPO_PUBLIC_API_URL;

if (!API_BASE) {
  throw new Error(
    "EXPO_PUBLIC_API_URL is missing. Please configure it in the .env file.",
  );
}

const TOKEN_KEY = "ctms_auth_token";
const USER_KEY = "ctms_auth_user";

// ===============================
// Store Login
// ===============================
export const storeAuth = async (token, user) => {
  try {
    await AsyncStorage.setItem(TOKEN_KEY, token);
    await AsyncStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch (err) {
    console.error("Store Auth Error:", err);
  }
};

// ===============================
// Clear Login
// ===============================
export const clearAuth = async () => {
  try {
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
  } catch (err) {
    console.error("Clear Auth Error:", err);
  }
};

// ===============================
// Load Login
// ===============================
export const loadAuth = async () => {
  try {
    const [token, userRaw] = await Promise.all([
      AsyncStorage.getItem(TOKEN_KEY),
      AsyncStorage.getItem(USER_KEY),
    ]);

    return {
      token,
      user: userRaw ? JSON.parse(userRaw) : null,
    };
  } catch (err) {
    console.error("Load Auth Error:", err);

    return {
      token: null,
      user: null,
    };
  }
};

// ===============================
// Backend Health Check
// ===============================
export const checkBackendHealth = async () => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    // Some backends expose /health, others just return 200 at /
    const res = await fetch(`${API_BASE}/`, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!res.ok) {
      return { ok: false, error: `Server responded with ${res.status}` };
    }

    return { ok: true };
  } catch (err) {
    clearTimeout(timeoutId);
    if (err.name === "AbortError") {
      return { ok: false, error: "Connection timed out" };
    }
    return { ok: false, error: "Could not reach the server" };
  }
};

// ===============================
// API Request Helper
// ===============================
export const apiRequest = async (
  path,
  { method = "GET", body = null, token = null } = {},
) => {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      const error = new Error(
        data.message ||
        data.error ||
        `Request failed with status ${response.status}`,
      );
      error.status = response.status; // NEW: let callers branch on 401 specifically
      throw error;
    }

    return data;
  } catch (err) {
    console.error("API Error:", err);
    throw err;
  }
};