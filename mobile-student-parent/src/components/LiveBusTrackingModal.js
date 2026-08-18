import React, { useState, useEffect, useRef, useCallback, Component } from "react";
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
import { X, Bus, ExternalLink, RefreshCw } from "lucide-react-native";
import * as Location from "expo-location";
import { API_BASE } from "../api/client";

// Safely resolve react-native-maps
let MapView = null;
let Marker = null;
let PROVIDER_GOOGLE = undefined;

if (Platform.OS !== "web") {
  try {
    const Maps = require("react-native-maps");
    MapView = Maps.default || Maps;
    Marker = Maps.Marker || (Maps.default && Maps.default.Marker);
    PROVIDER_GOOGLE = Maps.PROVIDER_GOOGLE || (Maps.default && Maps.default.PROVIDER_GOOGLE);
  } catch (err) {
    console.warn("[LiveBusTrackingModal] react-native-maps not available:", err);
  }
}

/** How long (ms) without a GPS ping before we show the bus as offline */
const OFFLINE_THRESHOLD_MS = 45_000;

// Safe coordinate parser
const parseCoord = (val) => {
  if (val === null || val === undefined) return null;
  const num = typeof val === "number" ? val : parseFloat(val);
  return Number.isFinite(num) ? num : null;
};

// Error Boundary to prevent any native map crash from closing the app
class MapErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.warn("[LiveBusTrackingModal] Map crashed:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ? (
        this.props.fallback(this.state.error, () => this.setState({ hasError: false, error: null }))
      ) : (
        <View style={styles.centreBox}>
          <Text style={{ fontSize: 42, marginBottom: 12 }}>🗺️</Text>
          <Text style={styles.errorTitle}>Map Display Unavailable</Text>
          <Text style={styles.errorBody}>Could not render the interactive map on this device.</Text>
        </View>
      );
    }
    return this.props.children;
  }
}

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
  // ── Gating conditions ─────────────────────────────────────────────────────
  const [driverActive, setDriverActive] = useState(null);  // null = not yet fetched
  const [driverOnDuty, setDriverOnDuty] = useState(false); // true only when STARTED scan today
  const mapRef = useRef(null);
  const offlineTimerRef = useRef(null);
  const assignedVehicleId = user?.vehicleId || user?.vehicle || null;
  const vehicleNumber = user?.vehicle || user?.vehicleId || null;
  const routeLabel = user?.route || "—";

  const authHeaders = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  // ── Fetch initial snapshot from REST ──────────────────────────────────────
  const fetchInitialLocation = useCallback(async () => {
    if (!assignedVehicleId) {
      // Student not assigned to any bus — no need to call the API
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
        setBusOnline(!!data.online);
        // Store driver gating flags from the enriched response
        setDriverActive(data.driverActive ?? null);
        setDriverOnDuty(!!data.driverOnDuty);
        // Only store location when driver is active+onduty and coords are valid
        if (data.driverActive && data.driverOnDuty && data.location) {
          const lat = parseCoord(data.location.latitude);
          const lng = parseCoord(data.location.longitude);
          if (lat !== null && lng !== null) {
            setBusLocation({
              latitude: lat,
              longitude: lng,
              updatedAt: new Date(data.location.updatedAt || Date.now()),
            });
          }
        } else {
          setBusLocation(null);
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
        if (loc?.coords) {
          const lat = parseCoord(loc.coords.latitude);
          const lng = parseCoord(loc.coords.longitude);
          if (lat !== null && lng !== null) {
            setMyLocation({ latitude: lat, longitude: lng });
          }
        }
      }
    } catch {
      // GPS unavailable — no "my location" dot shown, that's fine
    }
  }, []);

  // ── Auto-animate map to bus position ──────────────────────────────────────
  const animateToBus = useCallback((coords) => {
    if (mapRef.current && coords && Platform.OS !== "web") {
      const lat = parseCoord(coords.latitude);
      const lng = parseCoord(coords.longitude);
      if (lat !== null && lng !== null && mapRef.current.animateToRegion) {
        try {
          mapRef.current.animateToRegion(
            {
              latitude: lat,
              longitude: lng,
              latitudeDelta: 0.005,
              longitudeDelta: 0.005,
            },
            600,
          );
        } catch (err) {
          console.warn("[LiveBusTrackingModal] animateToRegion error:", err);
        }
      }
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
    setDriverActive(null);
    setDriverOnDuty(false);
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

      const lat = parseCoord(data.latitude ?? data.lat);
      const lng = parseCoord(data.longitude ?? data.lng);
      if (lat === null || lng === null) return;

      // Socket update means driver IS on duty and sending live GPS
      setDriverOnDuty(true);
      const newCoords = {
        latitude: lat,
        longitude: lng,
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

  // ── Four-condition gating ─────────────────────────────────────────────────
  // Condition 1: student must have an assigned bus/vehicle
  const isAssigned = !!assignedVehicleId;
  // Condition 2: driver account must be Active (null = still loading)
  const isDriverActive = driverActive === true;
  // Condition 3: driver must be OnDuty (STARTED scan today)
  const isDriverOnDuty = driverOnDuty;
  // Condition 4: valid live GPS coordinates
  const busLat = parseCoord(busLocation?.latitude);
  const busLng = parseCoord(busLocation?.longitude);
  const hasValidBusCoords = busLat !== null && busLng !== null;

  // Only build a region when we have real coordinates — no hardcoded fallback
  const initialRegion = hasValidBusCoords
    ? {
      latitude: busLat,
      longitude: busLng,
      latitudeDelta: 0.005,
      longitudeDelta: 0.005,
    }
    : null;

  // ── Native map error boundary fallback ────────────────────────────────────
  const renderNativeFallback = (customErr, retry) => (
    <View style={styles.centreBox}>
      <Text style={{ fontSize: 42, marginBottom: 12 }}>🗺️</Text>
      <Text style={styles.errorTitle}>Map Unavailable</Text>
      <Text style={styles.errorBody}>Could not display the interactive map on this device.</Text>
      <TouchableOpacity
        style={styles.retryBtn}
        onPress={() => { if (retry) retry(); }}
        activeOpacity={0.8}
      >
        <Text style={styles.retryBtnText}>↻ Try Again</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.root}>
        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={styles.headerSub}>LIVE BUS TRACKING</Text>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {vehicleNumber ? `${vehicleNumber} · ${routeLabel}` : "My Bus"}
            </Text>
          </View>
          <View style={styles.headerRight}>
            {/* Only show live/offline dot when all conditions pass */}
            {isAssigned && isDriverActive && isDriverOnDuty && (
              <>
                <View style={[styles.onlineDot, { backgroundColor: busOnline ? "#34D399" : "#94A3B8" }]} />
                <Text style={styles.onlineLabel}>{busOnline ? "LIVE" : "OFFLINE"}</Text>
              </>
            )}
            {/* Open in Maps button only when we have valid GPS */}
            {hasValidBusCoords && (
              <TouchableOpacity
                onPress={openInGoogleMaps}
                style={[styles.closeBtn, { marginRight: 4, backgroundColor: "rgba(255,255,255,0.2)" }]}
                accessibilityLabel="Open in Google Maps"
              >
                <ExternalLink size={15} color="#FFF" strokeWidth={2.2} />
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <X size={16} color="#FFF" strokeWidth={2.5} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Body: four-condition gated rendering ── */}
        {loading ? (
          <View style={styles.centreBox}>
            <ActivityIndicator color="#2563EB" size="large" />
            <Text style={styles.centreText}>Connecting to driver GPS…</Text>
          </View>

        ) : error ? (
          /* ── Network / server error ── */
          <View style={styles.centreBox}>
            <Text style={{ fontSize: 42, marginBottom: 12 }}>🚌</Text>
            <Text style={styles.errorTitle}>Unable to Load Map</Text>
            <Text style={styles.errorBody}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={fetchInitialLocation}>
              <Text style={styles.retryBtnText}>↻  Retry</Text>
            </TouchableOpacity>
          </View>

        ) : !isAssigned ? (
          /* ── Condition 1 failed: student has no bus assigned ── */
          <View style={styles.centreBox}>
            <Text style={{ fontSize: 52, marginBottom: 16 }}>🚌</Text>
            <Text style={styles.offlineTitle}>No Bus Assigned</Text>
            <Text style={styles.offlineBody}>
              You have not been assigned to a bus. Please contact your transport administrator.
            </Text>
          </View>

        ) : !isDriverActive ? (
          /* ── Condition 2 failed: driver account is not Active ── */
          <View style={styles.centreBox}>
            <Text style={{ fontSize: 52, marginBottom: 16 }}>🚫</Text>
            <Text style={styles.offlineTitle}>Bus Tracking Unavailable</Text>
            <Text style={styles.offlineBody}>
              Bus tracking is currently unavailable.
            </Text>
            <TouchableOpacity style={styles.retryBtn} onPress={fetchInitialLocation}>
              <Text style={styles.retryBtnText}>↻  Check Again</Text>
            </TouchableOpacity>
          </View>

        ) : !isDriverOnDuty ? (
          /* ── Condition 3 failed: driver hasn't started their duty today ── */
          <View style={styles.centreBox}>
            <Text style={{ fontSize: 52, marginBottom: 16 }}>⏳</Text>
            <Text style={styles.offlineTitle}>Bus Tracking Unavailable</Text>
            <Text style={styles.offlineBody}>
              Bus tracking is currently unavailable.
            </Text>
            <TouchableOpacity style={styles.retryBtn} onPress={fetchInitialLocation}>
              <Text style={styles.retryBtnText}>↻  Check Again</Text>
            </TouchableOpacity>
          </View>

        ) : !hasValidBusCoords ? (
          /* ── Condition 4 failed: driver is on duty but no valid GPS yet ── */
          <View style={styles.centreBox}>
            <Text style={{ fontSize: 52, marginBottom: 16 }}>📡</Text>
            <Text style={styles.offlineTitle}>Bus Location Unavailable</Text>
            <Text style={styles.offlineBody}>
              Bus location is currently unavailable. The driver's GPS is being acquired — please try again shortly.
            </Text>
            <TouchableOpacity style={styles.retryBtn} onPress={fetchInitialLocation}>
              <Text style={styles.retryBtnText}>↻  Refresh</Text>
            </TouchableOpacity>
          </View>

        ) : Platform.OS === "web" ? (
          /* ── All conditions met — Web: embedded Google Maps iframe ── */
          <View style={{ flex: 1 }}>
            <iframe
              key={`${busLat}-${busLng}`}
              title="bus-live-map"
              width="100%"
              height="100%"
              style={{ border: 0, display: "block" }}
              loading="lazy"
              src={`https://maps.google.com/maps?q=${busLat},${busLng}&z=16&output=embed`}
            />
            {/* Stale GPS overlay */}
            {!busOnline && (
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
                  ⚠️ Driver GPS signal weak — showing last known position
                </Text>
              </View>
            )}
          </View>

        ) : !MapView || !Marker ? (
          /* ── Native map library not available ── */
          renderNativeFallback()
        ) : (
          /* ── All conditions met — Native Map (iOS / Android) wrapped in ErrorBoundary ── */
          <MapErrorBoundary fallback={(err, retry) => renderNativeFallback(err, retry)}>
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
                {hasValidBusCoords && (
                  <Marker
                    coordinate={{
                      latitude: busLat,
                      longitude: busLng,
                    }}
                    title={`Bus ${vehicleNumber}`}
                    description={`Route: ${routeLabel} · ${busOnline ? "Live" : "Last known"}`}
                    anchor={{ x: 0.5, y: 0.5 }}
                    tracksViewChanges={false}
                  >
                    <View style={styles.busMarker}>
                      <Text style={styles.busMarkerEmoji}>🚌</Text>
                    </View>
                  </Marker>
                )}

                {/* Student's own location dot */}
                {myLocation && parseCoord(myLocation.latitude) !== null && parseCoord(myLocation.longitude) !== null && (
                  <Marker
                    coordinate={{
                      latitude: parseCoord(myLocation.latitude),
                      longitude: parseCoord(myLocation.longitude),
                    }}
                    title="You"
                    description="Your current location"
                    anchor={{ x: 0.5, y: 0.5 }}
                    tracksViewChanges={false}
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
                  <TouchableOpacity
                    style={[styles.centreMapBtn, { backgroundColor: "#2563EB", borderColor: "#1D4ED8" }]}
                    onPress={openInGoogleMaps}
                    accessibilityLabel="Open in Google Maps"
                  >
                    <ExternalLink size={18} color="#FFFFFF" strokeWidth={2.5} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </MapErrorBoundary>
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
