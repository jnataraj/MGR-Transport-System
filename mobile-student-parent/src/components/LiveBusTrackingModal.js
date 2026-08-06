import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Platform,
  Linking,
  SafeAreaView,
} from "react-native";
import * as Location from "expo-location";
import { API_BASE } from "../api/client";

let MapView, Marker, PROVIDER_GOOGLE;
if (Platform.OS !== "web") {
  const Maps = require("react-native-maps");
  MapView = Maps.default;
  Marker = Maps.Marker;
  PROVIDER_GOOGLE = Maps.PROVIDER_GOOGLE;
}

/** How long (ms) without a GPS ping before we show the bus as offline */
const OFFLINE_THRESHOLD_MS = 45_000;

export default function LiveBusTrackingModal({
  visible,
  onClose,
  user,
  token,
  socketRef,
  userRole,
}) {
  // ── State ─────────────────────────────────────────────────────────────────
  const [loading, setLoading] = useState(false);
  const [busOnline, setBusOnline] = useState(false);
  const [busLocation, setBusLocation] = useState(null); // { latitude, longitude, updatedAt }
  const [myLocation, setMyLocation] = useState(null);   // student's own GPS
  const [error, setError] = useState(null);
  const mapRef = useRef(null);
  const offlineTimerRef = useRef(null);
  const assignedVehicleId = user?.vehicleId || user?.vehicle || null;
  const vehicleNumber = user?.vehicle || user?.vehicleId || "—";
  const routeLabel = user?.route || "—";

  const authHeaders = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  // ── Fetch initial snapshot from REST ──────────────────────────────────────
  const fetchInitialLocation = useCallback(async () => {
    if (!assignedVehicleId) {
      setError("No bus assigned to your account.");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/attendance/bus-location?vehicleId=${encodeURIComponent(assignedVehicleId)}`,
        { headers: authHeaders },
      );
      const data = await res.json();
      if (data.success) {
        setBusOnline(data.online);
        if (data.location) {
          setBusLocation({
            latitude: data.location.latitude,
            longitude: data.location.longitude,
            updatedAt: new Date(data.location.updatedAt),
          });
        }
      }
    } catch (err) {
      console.log("[LiveBusTrackingModal] fetch error:", err.message);
      setError("Could not reach server. Check your connection.");
    } finally {
      setLoading(false);
    }
  }, [assignedVehicleId, token]);

  // ── Get student's own GPS for "my location" dot ───────────────────────────
  const fetchMyLocation = useCallback(async () => {
    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === "granted") {
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        });
        setMyLocation({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        });
      }
    } catch {
      // GPS unavailable — no "my location" dot shown, that's fine
    }
  }, []);

  // ── Auto-animate map to bus position ──────────────────────────────────────
  const animateToBus = useCallback((coords) => {
    if (mapRef.current && coords && Platform.OS !== "web") {
      mapRef.current.animateToRegion(
        {
          latitude: coords.latitude,
          longitude: coords.longitude,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        },
        600,
      );
    }
  }, []);

  // ── Reset offline timer every time a new GPS ping arrives ─────────────────
  const resetOfflineTimer = useCallback(() => {
    if (offlineTimerRef.current) clearTimeout(offlineTimerRef.current);
    offlineTimerRef.current = setTimeout(() => {
      setBusOnline(false);
    }, OFFLINE_THRESHOLD_MS);
  }, []);

  // ── Effect: initialise on modal open ─────────────────────────────────────
  useEffect(() => {
    if (!visible) return;
    setBusLocation(null);
    setMyLocation(null);
    setBusOnline(false);
    setError(null);
    fetchInitialLocation();
    fetchMyLocation();

    return () => {
      if (offlineTimerRef.current) clearTimeout(offlineTimerRef.current);
    };
  }, [visible]);

  // ── Effect: socket listeners ───────────────────────────────────────────────
  useEffect(() => {
    if (!visible || !socketRef?.current) return;
    const socket = socketRef.current;

    const handleLocationUpdate = (data) => {
      if (!data || !data.vehicleId) return;
      // Only process updates for OUR assigned vehicle
      const isMyBus =
        data.vehicleId === assignedVehicleId ||
        data.vehicleId === user?.vehicle ||
        data.vehicleId === user?.vehicleId;
      if (!isMyBus) return;

      const newCoords = {
        latitude: data.latitude ?? data.lat,
        longitude: data.longitude ?? data.lng,
        updatedAt: new Date(),
      };
      setBusLocation(newCoords);
      setBusOnline(true);
      animateToBus(newCoords);
      resetOfflineTimer();
    };

    const handleLocationStopped = (data) => {
      if (!data || !data.vehicleId) return;
      const isMyBus =
        data.vehicleId === assignedVehicleId ||
        data.vehicleId === user?.vehicle ||
        data.vehicleId === user?.vehicleId;
      if (!isMyBus) return;
      setBusOnline(false);
      if (offlineTimerRef.current) clearTimeout(offlineTimerRef.current);
    };

    socket.on("busLocationChanged", handleLocationUpdate);
    socket.on("busLocationStopped", handleLocationStopped);

    return () => {
      socket.off("busLocationChanged", handleLocationUpdate);
      socket.off("busLocationStopped", handleLocationStopped);
    };
  }, [visible, socketRef, assignedVehicleId]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const formatTime = (date) => {
    if (!date) return "—";
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
  };

  const openInGoogleMaps = () => {
    if (!busLocation) return;
    const url = `https://www.google.com/maps?q=${busLocation.latitude},${busLocation.longitude}`;
    Linking.openURL(url).catch(() => { });
  };

  // ── Render guard: HoD should never see this ───────────────────────────────
  if (userRole === "hod") return null;

  // ── Initial region for map ────────────────────────────────────────────────
  const initialRegion = busLocation
    ? {
      latitude: busLocation.latitude,
      longitude: busLocation.longitude,
      latitudeDelta: 0.005,
      longitudeDelta: 0.005,
    }
    : {
      // Default centre — overridden once GPS data arrives
      latitude: 11.0168,
      longitude: 76.9558,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.root}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerSub}>LIVE BUS TRACKING</Text>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {vehicleNumber} · {routeLabel}
            </Text>
          </View>
          <View style={styles.headerRight}>
            <View style={[styles.onlineDot, { backgroundColor: busOnline ? "#34D399" : "#94A3B8" }]} />
            <Text style={styles.onlineLabel}>{busOnline ? "LIVE" : "OFFLINE"}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Body ── */}
        {loading ? (
          <View style={styles.centreBox}>
            <ActivityIndicator color="#2563EB" size="large" />
            <Text style={styles.centreText}>Connecting to driver GPS…</Text>
          </View>

        ) : error ? (
          <View style={styles.centreBox}>
            <Text style={{ fontSize: 42, marginBottom: 12 }}>🚌</Text>
            <Text style={styles.errorTitle}>Unable to Load Map</Text>
            <Text style={styles.errorBody}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={fetchInitialLocation}>
              <Text style={styles.retryBtnText}>↻  Retry</Text>
            </TouchableOpacity>
          </View>

        ) : !busOnline && !busLocation ? (
          /* ── Driver hasn't started GPS yet ── */
          <View style={styles.centreBox}>
            <Text style={{ fontSize: 56, marginBottom: 16 }}>🚌</Text>
            <Text style={styles.offlineTitle}>Bus Not Yet Online</Text>
            <Text style={styles.offlineBody}>
              Live tracking will appear here once the driver starts their route and enables GPS sharing.
            </Text>
            <TouchableOpacity style={styles.retryBtn} onPress={fetchInitialLocation}>
              <Text style={styles.retryBtnText}>↻  Check Again</Text>
            </TouchableOpacity>
          </View>

        ) : Platform.OS === "web" ? (
          /* ── Web: full embedded live map, no card/button clutter ── */
          <View style={{ flex: 1 }}>
            {busLocation ? (
              <iframe
                key={`${busLocation.latitude}-${busLocation.longitude}`}
                title="bus-live-map"
                width="100%"
                height="100%"
                style={{ border: 0, display: "block" }}
                loading="lazy"
                src={`https://maps.google.com/maps?q=${busLocation.latitude},${busLocation.longitude}&z=16&output=embed`}
              />
            ) : (
              <View style={styles.centreBox}>
                <Text style={styles.offlineBody}>No position data available yet.</Text>
              </View>
            )}

            {/* Small overlay banner if driver GPS is stale */}
            {!busOnline && busLocation && (
              <View
                style={{
                  position: "absolute",
                  top: 12,
                  left: 12,
                  right: 12,
                  backgroundColor: "rgba(254,249,195,0.95)",
                  borderRadius: 10,
                  padding: 10,
                  borderWidth: 1,
                  borderColor: "#FDE047",
                }}
              >
                <Text style={{ color: "#713F12", fontSize: 12, fontWeight: "700", textAlign: "center" }}>
                  ⚠️ Driver GPS offline — showing last known position
                </Text>
              </View>
            )}
          </View>

        ) : (
          /* ── Native Map (iOS / Android) ── */
          <View style={{ flex: 1 }}>
            <MapView
              ref={mapRef}
              style={styles.map}
              provider={PROVIDER_GOOGLE}
              initialRegion={initialRegion}
              showsUserLocation={false}
              showsMyLocationButton={false}
              showsCompass
              showsScale
            >
              {/* Bus marker */}
              {busLocation && (
                <Marker
                  coordinate={{
                    latitude: busLocation.latitude,
                    longitude: busLocation.longitude,
                  }}
                  title={`Bus ${vehicleNumber}`}
                  description={`Route: ${routeLabel} · ${busOnline ? "Live" : "Last known"}`}
                  anchor={{ x: 0.5, y: 0.5 }}
                >
                  <View style={styles.busMarker}>
                    <Text style={styles.busMarkerEmoji}>🚌</Text>
                  </View>
                </Marker>
              )}

              {/* Student's own location dot */}
              {myLocation && (
                <Marker
                  coordinate={myLocation}
                  title="You"
                  description="Your current location"
                  anchor={{ x: 0.5, y: 0.5 }}
                >
                  <View style={styles.myMarker}>
                    <View style={styles.myMarkerDot} />
                  </View>
                </Marker>
              )}
            </MapView>

            {/* ── Info strip overlaid at bottom ── */}
            <View style={styles.infoStrip}>
              {!busOnline && busLocation && (
                <View style={styles.offlineBanner}>
                  <Text style={styles.offlineBannerText}>
                    ⚠️  Driver GPS offline — showing last known position
                  </Text>
                </View>
              )}
              <View style={styles.infoRow}>
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>BUS</Text>
                  <Text style={styles.infoValue}>{vehicleNumber}</Text>
                </View>
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>ROUTE</Text>
                  <Text style={styles.infoValue} numberOfLines={1}>{routeLabel}</Text>
                </View>
                <View style={styles.infoItem}>
                  <Text style={styles.infoLabel}>UPDATED</Text>
                  <Text style={styles.infoValue}>
                    {busLocation ? formatTime(busLocation.updatedAt) : "—"}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.centreMapBtn}
                  onPress={() => busLocation && animateToBus(busLocation)}
                  accessibilityLabel="Centre map on bus"
                >
                  <Text style={styles.centreMapBtnText}>🎯</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#0F172A",
  },

  // Header
  header: {
    backgroundColor: "#1E40AF",
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingTop: Platform.OS === "android" ? 44 : 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerSub: {
    color: "rgba(255,255,255,0.6)",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    marginBottom: 2,
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 17,
    fontWeight: "900",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  onlineDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  onlineLabel: {
    color: "#FFFFFF",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.8,
    marginRight: 4,
  },
  closeBtn: {
    backgroundColor: "rgba(255,255,255,0.15)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  closeBtnText: {
    color: "#FFFFFF",
    fontWeight: "900",
    fontSize: 14,
  },

  // Centre states (loading / error / offline)
  centreBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
    backgroundColor: "#F8FAFC",
  },
  centreText: {
    marginTop: 14,
    color: "#64748B",
    fontSize: 14,
    fontWeight: "600",
  },
  offlineTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#1E293B",
    textAlign: "center",
    marginBottom: 10,
  },
  offlineBody: {
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 6,
  },
  errorTitle: {
    fontSize: 18,
    fontWeight: "900",
    color: "#DC2626",
    marginBottom: 8,
    textAlign: "center",
  },
  errorBody: {
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
    marginBottom: 20,
  },
  retryBtn: {
    marginTop: 20,
    backgroundColor: "#2563EB",
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 12,
  },
  retryBtnText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 14,
  },

  // Web fallback
  webFallback: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  webTitle: {
    fontSize: 20,
    fontWeight: "900",
    color: "#1E293B",
    marginBottom: 20,
  },
  coordCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    width: "100%",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 16,
  },
  coordLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: "#94A3B8",
    letterSpacing: 1,
    marginTop: 10,
  },
  coordValue: {
    fontSize: 16,
    fontWeight: "800",
    color: "#1E293B",
    marginTop: 2,
  },
  mapsBtn: {
    backgroundColor: "#2563EB",
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 16,
  },
  mapsBtnText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 15,
  },
  offlineBadge: {
    backgroundColor: "#FEF9C3",
    borderRadius: 10,
    padding: 12,
    borderWidth: 1,
    borderColor: "#FDE047",
    width: "100%",
  },
  offlineBadgeText: {
    color: "#713F12",
    fontSize: 12,
    fontWeight: "700",
    textAlign: "center",
  },

  // Native map
  map: {
    flex: 1,
  },

  // Bus marker (custom view)
  busMarker: {
    backgroundColor: "#1E40AF",
    borderRadius: 24,
    padding: 6,
    borderWidth: 3,
    borderColor: "#FFFFFF",
    shadowColor: "#000",
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 6,
  },
  busMarkerEmoji: {
    fontSize: 22,
  },

  // My location marker
  myMarker: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: "rgba(37,99,235,0.18)",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: "#2563EB",
  },
  myMarkerDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#2563EB",
  },

  // Info strip
  infoStrip: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingBottom: 16,
    paddingTop: 6,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 10,
  },
  offlineBanner: {
    backgroundColor: "#FEF9C3",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    marginHorizontal: 12,
    marginTop: 10,
    marginBottom: 4,
    borderWidth: 1,
    borderColor: "#FDE047",
  },
  offlineBannerText: {
    color: "#713F12",
    fontSize: 11,
    fontWeight: "700",
    textAlign: "center",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 14,
    gap: 8,
  },
  infoItem: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: "#94A3B8",
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: "800",
    color: "#1E293B",
  },
  centreMapBtn: {
    backgroundColor: "#EFF6FF",
    borderRadius: 12,
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "#BFDBFE",
  },
  centreMapBtnText: {
    fontSize: 20,
  },
});
