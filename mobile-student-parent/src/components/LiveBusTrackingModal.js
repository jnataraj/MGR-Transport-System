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
import {
  X,
  Bus,
  ExternalLink,
  RefreshCw,
  MapPin,
  AlertTriangle,
} from "lucide-react-native";
import { API_BASE } from "../api/client";

// Safely resolve react-native-maps without native crashes
let MapView = null;
let Marker = null;

if (Platform.OS !== "web") {
  try {
    const Maps = require("react-native-maps");
    MapView = Maps.default || Maps;
    Marker = Maps.Marker || (Maps.default && Maps.default.Marker);
  } catch (err) {
    console.warn("[LiveBusTrackingModal] react-native-maps not available:", err);
  }
}

/** How long (ms) without a GPS ping before we show the bus as offline */
const OFFLINE_THRESHOLD_MS = 60_000;

// Campus / fallback coordinates (Chennai / MGR University) for safe initial map camera
const DEFAULT_COORDS = {
  latitude: 13.0382,
  longitude: 80.1780,
};

// Safe coordinate parser (returns valid finite number or null)
const parseCoord = (val) => {
  if (val === null || val === undefined || val === "") return null;
  const num = typeof val === "number" ? val : parseFloat(val);
  return Number.isFinite(num) ? num : null;
};

// Helper to safely extract clean string ID or identifier
const getCleanString = (val) => {
  if (!val) return null;
  if (typeof val === "string") return val.trim();
  if (typeof val === "number") return String(val).trim();
  if (typeof val === "object") {
    if (val.id) return String(val.id).trim();
    if (val.number) return String(val.number).trim();
  }
  return null;
};

// Error Boundary to prevent any native map crash from terminating the Android / iOS app
class MapErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.warn("[LiveBusTrackingModal] Map rendering caught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      if (typeof this.props.fallback === "function") {
        return this.props.fallback(this.state.error);
      }
      return (
        <View style={styles.centreBox}>
          <Text style={{ fontSize: 42, marginBottom: 12 }}>🗺️</Text>
          <Text style={styles.offlineTitle}>Map Display Fallback</Text>
          <Text style={styles.offlineBody}>
            Interactive map view is unavailable. You can still track your bus and open live directions below.
          </Text>
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
  const [error, setError] = useState(null);
  const [driverActive, setDriverActive] = useState(null);
  const [driverOnDuty, setDriverOnDuty] = useState(false);

  const mapRef = useRef(null);
  const mapReadyRef = useRef(false);
  const offlineTimerRef = useRef(null);

  // ── Resolve assigned vehicle & route reliably from existing user data ──
  const assignedVehicleId = getCleanString(
    user?.vehicleId ||
    (typeof user?.assignedVehicle === "object" ? user?.assignedVehicle?.id : user?.assignedVehicle) ||
    user?.vehicle ||
    user?.busNumber
  );

  const vehicleNumber =
    (typeof user?.assignedVehicle === "object" ? user?.assignedVehicle?.number : null) ||
    user?.busNumber ||
    (typeof user?.vehicle === "string" ? user?.vehicle : null) ||
    assignedVehicleId ||
    "Bus";

  const routeLabel =
    user?.route ||
    (typeof user?.assignedVehicle === "object" ? user?.assignedVehicle?.route : null) ||
    user?.routeNumber ||
    "Standard Route";

  const authHeaders = {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  // Helper to verify if an incoming socket event belongs ONLY to the student's assigned bus
  const isMatchingVehicle = useCallback((data) => {
    if (!data || !assignedVehicleId) return false;

    const validTargets = new Set();
    const addTarget = (v) => {
      if (v != null && typeof v !== "object") {
        const s = String(v).trim().toLowerCase();
        if (s) validTargets.add(s);
      }
    };

    addTarget(assignedVehicleId);
    addTarget(vehicleNumber);
    if (user?.vehicleId) addTarget(user.vehicleId);
    if (user?.vehicle) addTarget(user.vehicle);
    if (user?.busNumber) addTarget(user.busNumber);
    if (typeof user?.assignedVehicle === "object") {
      addTarget(user.assignedVehicle?.id);
      addTarget(user.assignedVehicle?.number);
    } else if (user?.assignedVehicle) {
      addTarget(user.assignedVehicle);
    }

    const incomingTargets = [
      data.vehicleId,
      data.vehicleNumber,
      data.id,
      data.vehicle_id,
    ];

    return incomingTargets.some((inc) => {
      if (inc != null && typeof inc !== "object") {
        const s = String(inc).trim().toLowerCase();
        return validTargets.has(s);
      }
      return false;
    });
  }, [assignedVehicleId, vehicleNumber, user]);

  // ── Auto-animate map safely to bus position ──────────────────────────────
  const animateToBus = useCallback((coords) => {
    if (mapRef.current && coords && Platform.OS !== "web" && mapReadyRef.current) {
      const lat = parseCoord(coords.latitude);
      const lng = parseCoord(coords.longitude);
      if (lat !== null && lng !== null && typeof mapRef.current.animateToRegion === "function") {
        try {
          mapRef.current.animateToRegion(
            {
              latitude: lat,
              longitude: lng,
              latitudeDelta: 0.008,
              longitudeDelta: 0.008,
            },
            600
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

  // ── Fetch initial snapshot from REST using ONLY assigned vehicle ID ───────
  const fetchInitialLocation = useCallback(async () => {
    if (!assignedVehicleId) {
      setLoading(false);
      setBusLocation(null);
      setBusOnline(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `${API_BASE}/api/attendance/bus-location?vehicleId=${encodeURIComponent(
          assignedVehicleId
        )}`,
        { headers: authHeaders }
      );
      const data = await res.json();
      if (data.success) {
        setBusOnline(!!data.online);
        setDriverActive(data.driverActive ?? true);
        setDriverOnDuty(!!data.driverOnDuty);

        if (data.location) {
          const lat = parseCoord(data.location.latitude ?? data.location.lat);
          const lng = parseCoord(data.location.longitude ?? data.location.lng);
          if (lat !== null && lng !== null) {
            const locObj = {
              latitude: lat,
              longitude: lng,
              updatedAt: new Date(data.location.updatedAt || Date.now()),
            };
            setBusLocation(locObj);
            if (mapReadyRef.current && mapRef.current?.animateToRegion) {
              animateToBus(locObj);
            }
          } else {
            setBusLocation(null);
          }
        } else {
          setBusLocation(null);
        }
      } else {
        setBusOnline(false);
        setBusLocation(null);
      }
    } catch (err) {
      console.log("[LiveBusTrackingModal] fetch error:", err.message);
      setError("Could not reach transport server. Check connection.");
      setBusLocation(null);
      setBusOnline(false);
    } finally {
      setLoading(false);
    }
  }, [assignedVehicleId, token, animateToBus]);

  // ── Effect: initialise on modal open ─────────────────────────────────────
  useEffect(() => {
    if (!visible) {
      mapReadyRef.current = false;
      return;
    }
    setBusLocation(null);
    setBusOnline(false);
    setError(null);
    setDriverActive(null);
    setDriverOnDuty(false);

    fetchInitialLocation();

    return () => {
      if (offlineTimerRef.current) clearTimeout(offlineTimerRef.current);
      mapReadyRef.current = false;
    };
  }, [visible, user, fetchInitialLocation]);

  // ── Effect: socket listeners (filtered strictly for assigned bus) ───────────
  useEffect(() => {
    if (!visible || !socketRef?.current) return;
    const socket = socketRef.current;

    const handleLocationUpdate = (data) => {
      if (!data) return;
      if (!isMatchingVehicle(data)) {
        // Ignore socket events belonging to any other vehicle
        return;
      }

      const lat = parseCoord(data.latitude ?? data.lat);
      const lng = parseCoord(data.longitude ?? data.lng);
      if (lat === null || lng === null) return;

      setDriverOnDuty(true);
      const newCoords = {
        latitude: lat,
        longitude: lng,
        updatedAt: new Date(data.timestamp || Date.now()),
      };
      setBusLocation(newCoords);
      setBusOnline(true);
      animateToBus(newCoords);
      resetOfflineTimer();
    };

    const handleLocationStopped = (data) => {
      if (!data) return;
      if (!isMatchingVehicle(data)) return;
      setBusOnline(false);
      if (offlineTimerRef.current) clearTimeout(offlineTimerRef.current);
    };

    socket.on("busLocationChanged", handleLocationUpdate);
    socket.on("busLocationStopped", handleLocationStopped);

    return () => {
      socket.off("busLocationChanged", handleLocationUpdate);
      socket.off("busLocationStopped", handleLocationStopped);
    };
  }, [visible, socketRef, isMatchingVehicle, animateToBus, resetOfflineTimer]);

  // ── Helpers ───────────────────────────────────────────────────────────────
  const formatTime = (date) => {
    if (!date) return "—";
    const d = date instanceof Date ? date : new Date(date);
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: true });
  };

  const isAssigned = !!assignedVehicleId;
  const busLat = parseCoord(busLocation?.latitude);
  const busLng = parseCoord(busLocation?.longitude);
  const hasValidBusCoords = busLat !== null && busLng !== null;

  const openInGoogleMaps = () => {
    const targetLat = busLat || DEFAULT_COORDS.latitude;
    const targetLng = busLng || DEFAULT_COORDS.longitude;
    const label = encodeURIComponent(`Bus ${vehicleNumber}`);
    const url = Platform.select({
      ios: `maps:0,0?q=${label}@${targetLat},${targetLng}`,
      android: `geo:0,0?q=${targetLat},${targetLng}(${label})`,
      default: `https://www.google.com/maps?q=${targetLat},${targetLng}`,
    });
    Linking.openURL(url).catch(() => {
      Linking.openURL(`https://www.google.com/maps?q=${targetLat},${targetLng}`);
    });
  };

  if (userRole === "hod") return null;

  // Safe camera region: never passes NaN or null into native maps
  const activeRegion = {
    latitude: hasValidBusCoords ? busLat : DEFAULT_COORDS.latitude,
    longitude: hasValidBusCoords ? busLng : DEFAULT_COORDS.longitude,
    latitudeDelta: 0.015,
    longitudeDelta: 0.015,
  };

  // ── Native map error fallback card ─────────────────────────────────────────
  const renderFallbackCard = () => (
    <View style={styles.webFallback}>
      <View style={styles.mapIconCircle}>
        <Bus size={38} color="#2563EB" strokeWidth={2.2} />
      </View>
      <Text style={styles.fallbackTitle}>
        {vehicleNumber ? `Bus ${vehicleNumber}` : "Assigned Bus"}
      </Text>
      <Text style={styles.fallbackSubtitle}>{routeLabel}</Text>

      <View style={styles.statusBadgeRow}>
        <View
          style={[
            styles.statusPill,
            { backgroundColor: busOnline ? "#DCFCE7" : "#FEF3C7" },
          ]}
        >
          <View
            style={[
              styles.onlineDot,
              { backgroundColor: busOnline ? "#16A34A" : "#D97706" },
            ]}
          />
          <Text
            style={[
              styles.statusPillText,
              { color: busOnline ? "#15803D" : "#B45309" },
            ]}
          >
            {busOnline ? "LIVE ON ROUTE" : "AT DEPOT / OFFLINE"}
          </Text>
        </View>
      </View>

      {hasValidBusCoords ? (
        <View style={styles.coordCard}>
          <View style={styles.coordRow}>
            <MapPin size={18} color="#2563EB" />
            <Text style={styles.coordLabel}>Last Coordinates:</Text>
            <Text style={styles.coordValue}>
              {busLat.toFixed(4)}, {busLng.toFixed(4)}
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.noticeBox}>
          <Text style={styles.noticeText}>
            Driver has not broadcasted GPS coordinates yet today. Location will update automatically as soon as the bus begins transit.
          </Text>
        </View>
      )}

      <TouchableOpacity
        style={styles.openMapsLargeBtn}
        onPress={openInGoogleMaps}
        activeOpacity={0.85}
      >
        <ExternalLink size={18} color="#FFFFFF" strokeWidth={2.5} style={{ marginRight: 8 }} />
        <Text style={styles.openMapsLargeBtnText}>Open in Google Maps</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.refreshBtnOutline}
        onPress={fetchInitialLocation}
        activeOpacity={0.7}
      >
        <RefreshCw size={16} color="#2563EB" style={{ marginRight: 6 }} />
        <Text style={styles.refreshBtnOutlineText}>Check Live Status</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <Modal
      visible={visible}
      animationType="slide"
      onRequestClose={onClose}
      transparent={false}
    >
      <SafeAreaView style={styles.root}>
        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Bus size={14} color="#93C5FD" strokeWidth={2.5} />
              <Text style={styles.headerSub}>LIVE BUS TRACKING</Text>
            </View>
            <Text style={styles.headerTitle} numberOfLines={1}>
              {vehicleNumber ? `Bus ${vehicleNumber} · ${routeLabel}` : "Transit Bus"}
            </Text>
          </View>

          <View style={styles.headerRight}>
            {isAssigned && (
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: busOnline ? "rgba(16,185,129,0.2)" : "rgba(245,158,11,0.2)" },
                ]}
              >
                <View
                  style={[
                    styles.onlineDot,
                    { backgroundColor: busOnline ? "#10B981" : "#F59E0B" },
                  ]}
                />
                <Text
                  style={[
                    styles.onlineLabel,
                    { color: busOnline ? "#34D399" : "#FCD34D" },
                  ]}
                >
                  {busOnline ? "LIVE" : "OFFLINE"}
                </Text>
              </View>
            )}

            <TouchableOpacity
              onPress={fetchInitialLocation}
              style={styles.headerIconBtn}
              accessibilityLabel="Refresh bus location"
            >
              <RefreshCw size={16} color="#FFF" strokeWidth={2.2} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={openInGoogleMaps}
              style={styles.headerIconBtn}
              accessibilityLabel="Open in Google Maps"
            >
              <ExternalLink size={16} color="#FFF" strokeWidth={2.2} />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onClose}
              style={[styles.headerIconBtn, { backgroundColor: "rgba(255,255,255,0.25)" }]}
              accessibilityLabel="Close tracking map"
            >
              <X size={18} color="#FFF" strokeWidth={2.5} />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Main Body ── */}
        {loading ? (
          <View style={styles.centreBox}>
            <ActivityIndicator color="#2563EB" size="large" />
            <Text style={styles.centreText}>Connecting to bus GPS signal…</Text>
          </View>
        ) : !isAssigned ? (
          <View style={styles.centreBox}>
            <Text style={{ fontSize: 52, marginBottom: 16 }}>🚌</Text>
            <Text style={styles.offlineTitle}>No Bus Assigned</Text>
            <Text style={styles.offlineBody}>
              You currently do not have a bus assigned to your transport profile. Please contact the transport officer to register your route.
            </Text>
            <TouchableOpacity style={styles.actionBtn} onPress={onClose}>
              <Text style={styles.actionBtnText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        ) : Platform.OS === "web" ? (
          /* Web Browser Embed */
          <View style={{ flex: 1 }}>
            <iframe
              key={`${activeRegion.latitude}-${activeRegion.longitude}`}
              title="bus-live-map"
              width="100%"
              height="100%"
              style={{ border: 0, display: "block" }}
              loading="lazy"
              src={`https://maps.google.com/maps?q=${activeRegion.latitude},${activeRegion.longitude}&z=15&output=embed`}
            />
            {/* Info overlay */}
            <View style={styles.bottomInfoCard}>
              <View style={styles.infoRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoLabel}>BUS NUMBER</Text>
                  <Text style={styles.infoValue}>{vehicleNumber}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoLabel}>ROUTE</Text>
                  <Text style={styles.infoValue}>{routeLabel}</Text>
                </View>
                <TouchableOpacity style={styles.mapsCircleBtn} onPress={openInGoogleMaps}>
                  <ExternalLink size={18} color="#FFF" strokeWidth={2.5} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : !MapView || !Marker ? (
          /* Fallback view when native maps module is not installed */
          renderFallbackCard()
        ) : (
          /* Native Interactive MapView (Safe default provider on iOS & Android) */
          <MapErrorBoundary fallback={() => renderFallbackCard()}>
            <View style={{ flex: 1 }}>
              <MapView
                ref={mapRef}
                style={styles.map}
                initialRegion={activeRegion}
                showsUserLocation={false}
                showsMyLocationButton={false}
                showsCompass
                showsScale
                onMapReady={() => {
                  mapReadyRef.current = true;
                  if (hasValidBusCoords && busLocation) {
                    animateToBus(busLocation);
                  }
                }}
              >
                {/* Driver/Bus Live Marker ONLY */}
                {hasValidBusCoords && (
                  <Marker
                    coordinate={{
                      latitude: busLat,
                      longitude: busLng,
                    }}
                    title={`Bus ${vehicleNumber}`}
                    description={`Route: ${routeLabel} · ${busOnline ? "Live" : "Last Known"}`}
                    anchor={{ x: 0.5, y: 0.5 }}
                  >
                    <View style={styles.busMarker}>
                      <Text style={styles.busMarkerEmoji}>🚌</Text>
                    </View>
                  </Marker>
                )}
              </MapView>

              {/* Top Warning Banner if Bus is Offline */}
              {!busOnline && (
                <View style={styles.topOfflineBanner}>
                  <AlertTriangle size={14} color="#B45309" strokeWidth={2.5} />
                  <Text style={styles.topOfflineBannerText}>
                    {hasValidBusCoords
                      ? "Showing last reported position · Driver offline"
                      : "Bus at Depot · Awaiting trip start"}
                  </Text>
                </View>
              )}

              {/* Floating Action Controls */}
              <View style={styles.floatingControls}>
                {hasValidBusCoords && (
                  <TouchableOpacity
                    style={styles.floatingBtn}
                    onPress={() => animateToBus(busLocation)}
                    accessibilityLabel="Center on bus"
                  >
                    <Bus size={20} color="#2563EB" strokeWidth={2.2} />
                  </TouchableOpacity>
                )}

                <TouchableOpacity
                  style={[styles.floatingBtn, { backgroundColor: "#2563EB" }]}
                  onPress={openInGoogleMaps}
                  accessibilityLabel="Open directions in Maps app"
                >
                  <ExternalLink size={18} color="#FFFFFF" strokeWidth={2.5} />
                </TouchableOpacity>
              </View>

              {/* Bottom Information Card */}
              <View style={styles.bottomInfoCard}>
                <View style={styles.infoRow}>
                  <View style={styles.infoCol}>
                    <Text style={styles.infoLabel}>BUS</Text>
                    <Text style={styles.infoValue} numberOfLines={1}>
                      {vehicleNumber}
                    </Text>
                  </View>

                  <View style={styles.infoCol}>
                    <Text style={styles.infoLabel}>ROUTE</Text>
                    <Text style={styles.infoValue} numberOfLines={1}>
                      {routeLabel}
                    </Text>
                  </View>

                  <View style={styles.infoCol}>
                    <Text style={styles.infoLabel}>STATUS</Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <View
                        style={[
                          styles.smallDot,
                          { backgroundColor: busOnline ? "#10B981" : "#F59E0B" },
                        ]}
                      />
                      <Text
                        style={[
                          styles.infoValue,
                          { color: busOnline ? "#10B981" : "#D97706", fontSize: 12 },
                        ]}
                      >
                        {busOnline ? "Active" : "Depot"}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.infoCol}>
                    <Text style={styles.infoLabel}>UPDATED</Text>
                    <Text style={styles.infoValue}>
                      {busLocation ? formatTime(busLocation.updatedAt) : "—"}
                    </Text>
                  </View>
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
    paddingVertical: 12,
    paddingTop: Platform.OS === "android" ? 40 : 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerSub: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 10,
    fontWeight: "800",
    letterSpacing: 1.2,
  },
  headerTitle: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "900",
    marginTop: 2,
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  statusBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 20,
    gap: 5,
  },
  onlineDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  onlineLabel: {
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 0.8,
  },
  headerIconBtn: {
    backgroundColor: "rgba(255,255,255,0.15)",
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: "center",
    justifyContent: "center",
  },

  // Centre states
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
    marginBottom: 8,
  },
  offlineBody: {
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 20,
  },
  actionBtn: {
    backgroundColor: "#2563EB",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 12,
  },
  actionBtnText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 14,
  },

  // Native map
  map: {
    flex: 1,
  },

  // Markers
  busMarker: {
    backgroundColor: "#1E40AF",
    borderRadius: 22,
    padding: 6,
    borderWidth: 2.5,
    borderColor: "#FFFFFF",
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  busMarkerEmoji: {
    fontSize: 20,
  },

  // Top banner
  topOfflineBanner: {
    position: "absolute",
    top: 12,
    left: 12,
    right: 12,
    backgroundColor: "rgba(254,243,199,0.95)",
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: "#FCD34D",
    elevation: 4,
  },
  topOfflineBannerText: {
    color: "#92400E",
    fontSize: 11,
    fontWeight: "700",
  },

  // Floating controls
  floatingControls: {
    position: "absolute",
    right: 16,
    bottom: 110,
    gap: 10,
  },
  floatingBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 5,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },

  // Bottom info card
  bottomInfoCard: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingBottom: Platform.OS === "ios" ? 28 : 16,
    elevation: 12,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 10,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  infoCol: {
    flex: 1,
  },
  infoLabel: {
    fontSize: 9,
    fontWeight: "800",
    color: "#94A3B8",
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: 13,
    fontWeight: "800",
    color: "#1E293B",
  },
  smallDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  mapsCircleBtn: {
    backgroundColor: "#2563EB",
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },

  // Fallback View
  webFallback: {
    flex: 1,
    backgroundColor: "#F8FAFC",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  mapIconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#DBEAFE",
  },
  fallbackTitle: {
    fontSize: 22,
    fontWeight: "900",
    color: "#1E293B",
    marginBottom: 4,
  },
  fallbackSubtitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#64748B",
    marginBottom: 14,
  },
  statusBadgeRow: {
    marginBottom: 20,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.5,
  },
  coordCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    width: "100%",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 20,
  },
  coordRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  coordLabel: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "600",
  },
  coordValue: {
    fontSize: 13,
    fontWeight: "800",
    color: "#1E293B",
  },
  noticeBox: {
    backgroundColor: "#EFF6FF",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#BFDBFE",
    width: "100%",
    marginBottom: 20,
  },
  noticeText: {
    color: "#1E40AF",
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
  },
  openMapsLargeBtn: {
    backgroundColor: "#2563EB",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    paddingVertical: 14,
    borderRadius: 14,
    marginBottom: 10,
    elevation: 2,
  },
  openMapsLargeBtnText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 15,
  },
  refreshBtnOutline: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#CBD5E1",
    backgroundColor: "#FFFFFF",
  },
  refreshBtnOutlineText: {
    color: "#2563EB",
    fontWeight: "700",
    fontSize: 13,
  },
});
