import React, { useState, useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import {
  ArrowLeftRight,
  Bus,
  CheckCircle2,
  Clock,
  RefreshCw,
  Shuffle,
  Users,
  X,
  AlertCircle,
} from "lucide-react-native";
import QRCode from "react-native-qrcode-svg";
import * as Location from "expo-location";
import { apiRequest } from "../api/client";

export default function BusRouteChangeQRModal({
  visible,
  onClose,
  token,
  user,
  userVehicle,
  routeLabel,
  socket,
}) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [timeLeft, setTimeLeft] = useState(300); // 5 mins in seconds
  const [recentStudents, setRecentStudents] = useState([]);
  const timerRef = useRef(null);

  const fetchOrGenerateSession = async (forceNew = false) => {
    setLoading(true);
    setError(null);
    let lat = null;
    let lng = null;
    let acc = null;
    let gpsTime = null;

    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === "granted") {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        if (loc?.coords) {
          lat = loc.coords.latitude;
          lng = loc.coords.longitude;
          acc = loc.coords.accuracy;
          gpsTime = loc.timestamp ? new Date(loc.timestamp).toISOString() : new Date().toISOString();
        }
      }
    } catch (locErr) {
      console.log("Driver QR modal GPS fetch note:", locErr.message);
    }

    try {
      const res = await apiRequest("/api/bus-route-change/qr/session", {
        method: "POST",
        token,
        body: {
          forceNew,
          expiryMinutes: 5,
          latitude: lat,
          longitude: lng,
          accuracy: acc,
          gpsTimestamp: gpsTime,
        },
      });

      if (res?.success && res.data) {
        setSession(res.data);
        setRecentStudents(res.data.recentStudents || []);

        // Calculate remaining seconds
        const expiresAt = new Date(res.data.expiresAt).getTime();
        const diffSecs = Math.max(0, Math.floor((expiresAt - Date.now()) / 1000));
        setTimeLeft(diffSecs);
      } else {
        setError(res?.message || "Failed to load QR code session");
      }
    } catch (err) {
      console.error("fetchOrGenerateSession error:", err);
      setError(err.message || "Unable to connect to server.");
    } finally {
      setLoading(false);
    }
  };

  const closeSession = async () => {
    if (!session) return;
    try {
      await apiRequest("/api/bus-route-change/qr/close", {
        method: "POST",
        token,
        body: { sessionId: session.id },
      });
      onClose();
    } catch (err) {
      console.error("closeSession error:", err);
      onClose();
    }
  };

  // Timer countdown effect
  useEffect(() => {
    if (!visible) return;
    fetchOrGenerateSession(false);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [visible]);

  useEffect(() => {
    if (!visible || !session) return;

    if (timerRef.current) clearInterval(timerRef.current);

    timerRef.current = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [visible, session]);

  // Socket listener for students confirming change in real-time
  useEffect(() => {
    if (!socket || !visible) return;

    const handleStudentJoined = (data) => {
      if (data) {
        setRecentStudents((prev) => [
          {
            id: data.referenceNumber || Date.now().toString(),
            referenceNumber: data.referenceNumber,
            studentName: data.studentName,
            oldBusNumber: data.oldBusNumber,
            confirmedAt: data.confirmedAt || new Date().toISOString(),
          },
          ...prev,
        ]);
      }
    };

    socket.on("student_joined_bus", handleStudentJoined);
    socket.on("bus_route_change_confirmed", (data) => {
      if (data && session && (data.driverId === session.driverId || data.newBusNumber === session.busNumber)) {
        setRecentStudents((prev) => {
          if (prev.some((s) => s.referenceNumber === data.referenceNumber)) return prev;
          return [
            {
              id: data.referenceNumber,
              referenceNumber: data.referenceNumber,
              studentName: data.studentName,
              studentRollNo: data.studentRollNo,
              oldBusNumber: data.oldBusNumber,
              confirmedAt: data.confirmedAt,
            },
            ...prev,
          ];
        });
      }
    });

    return () => {
      socket.off("student_joined_bus", handleStudentJoined);
      socket.off("bus_route_change_confirmed");
    };
  }, [socket, visible, session]);

  const formatTimer = (secs) => {
    const mins = Math.floor(secs / 60);
    const rem = secs % 60;
    return `${mins.toString().padStart(2, "0")}:${rem.toString().padStart(2, "0")}`;
  };

  const isExpired = timeLeft <= 0;

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        {/* Top Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.headerIconWrap}>
              <Shuffle size={20} color="#8B5CF6" strokeWidth={2.5} />
            </View>
            <View>
              <Text style={styles.headerTitle}>Bus / Route Change QR</Text>
              <Text style={styles.headerSubtitle}>Common QR for Switch-in Students</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <X size={20} color="#64748B" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {/* Driver & Bus Info Banner */}
          <View style={styles.busInfoCard}>
            <View style={styles.busInfoRow}>
              <View style={styles.busIconBadge}>
                <Bus size={22} color="#1E293B" strokeWidth={2.2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.busNumberText}>{session?.busNumber || userVehicle || "Bus Loading..."}</Text>
                <Text style={styles.routeText}>{session?.routeName || routeLabel || "Assigned Route"}</Text>
              </View>
              <View style={[styles.statusPill, isExpired ? styles.statusPillExpired : styles.statusPillActive]}>
                <View style={[styles.statusDot, isExpired ? styles.dotExpired : styles.dotActive]} />
                <Text style={[styles.statusPillText, isExpired ? styles.statusTextExpired : styles.statusTextActive]}>
                  {isExpired ? "EXPIRED" : "ACTIVE"}
                </Text>
              </View>
            </View>
          </View>

          {/* QR Code Container */}
          <View style={styles.qrCard}>
            {loading ? (
              <View style={styles.qrPlaceholder}>
                <ActivityIndicator size="large" color="#8B5CF6" />
                <Text style={styles.loadingText}>Generating secure Common QR...</Text>
              </View>
            ) : error ? (
              <View style={styles.qrPlaceholder}>
                <AlertCircle size={42} color="#EF4444" />
                <Text style={styles.errorText}>{error}</Text>
                <TouchableOpacity style={styles.retryBtn} onPress={() => fetchOrGenerateSession(true)}>
                  <Text style={styles.retryBtnText}>Retry</Text>
                </TouchableOpacity>
              </View>
            ) : session ? (
              <View style={{ alignItems: "center" }}>
                <View style={[styles.qrWrapper, isExpired && styles.qrWrapperExpired]}>
                  <QRCode
                    value={session.qrPayload || session.qrText}
                    size={220}
                    color={isExpired ? "#94A3B8" : "#0F172A"}
                    backgroundColor="#FFFFFF"
                  />
                  {isExpired && (
                    <View style={styles.expiredOverlay}>
                      <Clock size={36} color="#EF4444" />
                      <Text style={styles.expiredOverlayText}>QR Expired</Text>
                    </View>
                  )}
                </View>

                {/* Expiry Countdown */}
                <View style={styles.timerRow}>
                  <Clock size={16} color={isExpired ? "#EF4444" : "#6366F1"} />
                  <Text style={[styles.timerText, isExpired && { color: "#EF4444" }]}>
                    {isExpired ? "Session Expired" : `Expires in ${formatTimer(timeLeft)}`}
                  </Text>
                </View>
                <Text style={styles.qrSubInstruction}>
                  Students scanning this QR will instantly switch to this bus.
                </Text>
              </View>
            ) : null}
          </View>

          {/* Real-time Stats */}
          <View style={styles.statsRow}>
            <View style={styles.statBox}>
              <View style={styles.statIconWrap}>
                <Users size={18} color="#2563EB" />
              </View>
              <Text style={styles.statValue}>{recentStudents.length}</Text>
              <Text style={styles.statLabel}>Students Joined</Text>
            </View>
            <View style={styles.statBox}>
              <View style={[styles.statIconWrap, { backgroundColor: "#ECFDF5" }]}>
                <CheckCircle2 size={18} color="#10B981" />
              </View>
              <Text style={styles.statValue}>{isExpired ? "0" : "Ready"}</Text>
              <Text style={styles.statLabel}>QR Status</Text>
            </View>
          </View>

          {/* Recently Joined Students List */}
          {recentStudents.length > 0 && (
            <View style={styles.studentsListCard}>
              <Text style={styles.studentsListHeader}>Students Joined This Session ({recentStudents.length})</Text>
              {recentStudents.map((s, idx) => (
                <View key={s.id || idx} style={styles.studentItem}>
                  <View style={styles.studentAvatar}>
                    <Text style={styles.studentAvatarText}>{s.studentName?.charAt(0) || "S"}</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={styles.studentNameText}>{s.studentName}</Text>
                    <Text style={styles.studentSubText}>
                      From: {s.oldBusNumber || "Previous Bus"} · {s.referenceNumber}
                    </Text>
                  </View>
                  <CheckCircle2 size={18} color="#10B981" />
                </View>
              ))}
            </View>
          )}

          {/* Bottom Actions */}
          <View style={styles.actionButtonsRow}>
            <TouchableOpacity
              style={styles.refreshBtn}
              onPress={() => fetchOrGenerateSession(true)}
              disabled={loading}
            >
              <RefreshCw size={17} color="#8B5CF6" />
              <Text style={styles.refreshBtnText}>Regenerate QR</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.closeSessionBtn}
              onPress={closeSession}
            >
              <Text style={styles.closeSessionBtnText}>End Session</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  headerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#F3E8FF",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
  },
  headerSubtitle: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 1,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  content: {
    padding: 18,
    paddingBottom: 40,
  },
  busInfoCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 16,
  },
  busInfoRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  busIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  busNumberText: {
    fontSize: 17,
    fontWeight: "800",
    color: "#0F172A",
  },
  routeText: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 2,
  },
  statusPill: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 6,
  },
  statusPillActive: {
    backgroundColor: "#ECFDF5",
  },
  statusPillExpired: {
    backgroundColor: "#FEF2F2",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    backgroundColor: "#10B981",
  },
  dotExpired: {
    backgroundColor: "#EF4444",
  },
  statusPillText: {
    fontSize: 12,
    fontWeight: "750",
  },
  statusTextActive: {
    color: "#059669",
  },
  statusTextExpired: {
    color: "#DC2626",
  },
  qrCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 18,
    padding: 24,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 3,
    marginBottom: 16,
  },
  qrPlaceholder: {
    height: 260,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: "#64748B",
    fontWeight: "600",
  },
  errorText: {
    marginTop: 10,
    fontSize: 14,
    color: "#EF4444",
    textAlign: "center",
  },
  retryBtn: {
    marginTop: 14,
    backgroundColor: "#8B5CF6",
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 8,
  },
  retryBtnText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 13,
  },
  qrWrapper: {
    padding: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    position: "relative",
  },
  qrWrapperExpired: {
    opacity: 0.35,
  },
  expiredOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255, 255, 255, 0.8)",
  },
  expiredOverlayText: {
    marginTop: 8,
    fontSize: 15,
    fontWeight: "800",
    color: "#EF4444",
  },
  timerRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 16,
    paddingHorizontal: 14,
    paddingVertical: 6,
    backgroundColor: "#EEF2FF",
    borderRadius: 20,
  },
  timerText: {
    fontSize: 14,
    fontWeight: "750",
    color: "#4F46E5",
  },
  qrSubInstruction: {
    marginTop: 12,
    fontSize: 12,
    color: "#94A3B8",
    textAlign: "center",
    maxWidth: 260,
  },
  statsRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  statBox: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  statIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#EFF6FF",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 6,
  },
  statValue: {
    fontSize: 20,
    fontWeight: "800",
    color: "#0F172A",
  },
  statLabel: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 2,
  },
  studentsListCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    marginBottom: 16,
  },
  studentsListHeader: {
    fontSize: 14,
    fontWeight: "750",
    color: "#1E293B",
    marginBottom: 12,
  },
  studentItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  studentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#8B5CF6",
    alignItems: "center",
    justifyContent: "center",
  },
  studentAvatarText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 13,
  },
  studentNameText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#0F172A",
  },
  studentSubText: {
    fontSize: 12,
    color: "#64748B",
    marginTop: 1,
  },
  actionButtonsRow: {
    flexDirection: "row",
    gap: 12,
  },
  refreshBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F3E8FF",
    borderWidth: 1,
    borderColor: "#DDD6FE",
    paddingVertical: 13,
    borderRadius: 12,
    gap: 8,
  },
  refreshBtnText: {
    color: "#7C3AED",
    fontWeight: "750",
    fontSize: 14,
  },
  closeSessionBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingVertical: 13,
    borderRadius: 12,
  },
  closeSessionBtnText: {
    color: "#475569",
    fontWeight: "700",
    fontSize: 14,
  },
});
