import React from "react";
import {
  ActivityIndicator,
  Image,
  Modal,
  SafeAreaView,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  Alert,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { Phone } from "lucide-react-native";
import logo from "../../../assets/logo.png";
import BottomTabBar from "../../components/BottomTabBar";
import { styles, profileStyles } from "../../styles/dashboard.styles";
import { maintStyles } from "../../styles/maintenance.styles";

export default function MaintenanceDashboard({ dashboard }) {
  const {
    user,
    userId,
    userName,
    userVehicle,
    role,
    caps,
    activeTab,
    handleTabPress,
    confirmLogout,
    isSettingsModalOpen,
    setIsSettingsModalOpen,
    gpsEnabled,
    setGpsEnabled,
    storeGpsEnabled,
    isLogHistoryModalOpen,
    setIsLogHistoryModalOpen,
    isMaintLogModalOpen,
    setIsMaintLogModalOpen,
    maintItems,
    maintLoading,
    maintOnline,
    sosAlerts,
    setSosAlerts,
    unreadSosCount,
    setUnreadSosCount,
    handleAcknowledge,
    ongoingTasks,
    maintLogPeriod,
    setMaintLogPeriod,
    maintLogTab,
    setMaintLogTab,
    completedLogs,
    isWithinPeriod,
    loadMaintenanceFeed,
    showProfileModal,
    setShowProfileModal,
  } = dashboard;

return (
      <SafeAreaView style={maintStyles.safeArea}>
        <StatusBar style="dark" />

        {/* University header strip */}
        <View style={{ alignItems: "center", paddingVertical: 8, backgroundColor: "#fff" }}>
          <Image source={logo} style={{ height: 60, width: 200 }} resizeMode="contain" />
        </View>

        {/* Green staff header */}
        <View style={maintStyles.staffHeader}>
          <View style={maintStyles.staffAvatar}>
            <Text style={{ fontSize: 26 }}>🔧</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={maintStyles.staffLabel}>MAINTENANCE STAFF</Text>
            <Text style={maintStyles.staffName}>{userName}</Text>
            <Text style={maintStyles.staffEmp}>
              EMP: {user?.empId || userId?.slice(0, 8).toUpperCase() || "—"}
            </Text>
          </View>
          <TouchableOpacity onPress={confirmLogout} style={maintStyles.logoutPill}>
            <Text style={{ color: "#fff", fontSize: 9, fontWeight: "800" }}>LOGOUT</Text>
          </TouchableOpacity>
        </View>

        {/* Raised Issue Log button */}
        <TouchableOpacity
          style={maintStyles.rowActionBtn}
          onPress={() => { setIsLogHistoryModalOpen(true); loadMaintenanceFeed(); }}
        >
          <Text style={{ color: "#fff", fontWeight: "900", fontSize: 14 }}>
            📄  RAISED ISSUE LOG
          </Text>
        </TouchableOpacity>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 90 }}>

          {/* ── SOS ALERTS SECTION ── */}
          <View style={maintStyles.sectionHeaderRow}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={[maintStyles.sectionHeaderText, { color: "#DC2626" }]}>🚨 SOS ALERTS</Text>
              {unreadSosCount > 0 && (
                <View style={{ backgroundColor: "#EF4444", borderRadius: 10, minWidth: 20, height: 20, paddingHorizontal: 5, alignItems: "center", justifyContent: "center" }}>
                  <Text style={{ color: "#fff", fontSize: 10, fontWeight: "900" }}>
                    {unreadSosCount > 9 ? "9+" : unreadSosCount}
                  </Text>
                </View>
              )}
            </View>
            {sosAlerts.some((a) => a.type === "sos" && !a.acknowledged) && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: "#EF4444" }} />
                <Text style={{ fontSize: 10, fontWeight: "900", color: "#DC2626" }}>ACTIVE</Text>
              </View>
            )}
          </View>

          {sosAlerts.length === 0 && (
            <Text style={maintStyles.emptyText}>No SOS alerts right now. ✅</Text>
          )}

          {sosAlerts.map((alert) => {
            const isResolved = alert.type === "sos_resolved" || alert.acknowledged;
            let parsedData = {};
            try { parsedData = typeof alert.data === "string" ? JSON.parse(alert.data) : (alert.data || {}); } catch { }
            const lat = parsedData.latitude;
            const lng = parsedData.longitude;

            return (
              <View
                key={alert.id || alert.createdAt}
                style={{
                  marginHorizontal: 12,
                  marginBottom: 10,
                  borderRadius: 14,
                  borderWidth: 2,
                  borderColor: isResolved ? "#A7F3D0" : "#FCA5A5",
                  backgroundColor: isResolved ? "#F0FDF4" : "#FEF2F2",
                  padding: 14,
                  shadowColor: isResolved ? "#10B981" : "#EF4444",
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: 0.15,
                  shadowRadius: 4,
                  elevation: 3,
                }}
              >
                {/* Card Header */}
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <Text style={{ fontWeight: "900", fontSize: 14, color: isResolved ? "#065F46" : "#991B1B" }}>
                    {isResolved ? "✅ SOS RESOLVED" : "🚨 SOS EMERGENCY"}
                  </Text>
                  <View style={{
                    backgroundColor: isResolved ? "#10B981" : "#EF4444",
                    borderRadius: 6,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                  }}>
                    <Text style={{ color: "#fff", fontSize: 9, fontWeight: "900" }}>
                      {isResolved ? "RESOLVED" : "ACTIVE"}
                    </Text>
                  </View>
                </View>

                {/* Alert Body */}
                <Text style={{ fontSize: 13, color: isResolved ? "#065F46" : "#7F1D1D", fontWeight: "700", marginBottom: 4 }}>
                  {alert.message}
                </Text>

                <Text style={{ fontSize: 11, color: "#6B7280", marginBottom: 4 }}>
                  From: <Text style={{ fontWeight: "700" }}>{alert.sender || "Unknown"}</Text>
                  {parsedData.vehicleId ? `  ·  Vehicle: ${parsedData.vehicleId}` : ""}
                </Text>

                {lat != null && lng != null && (
                  <Text style={{ fontSize: 11, color: "#2563EB", fontWeight: "700", marginBottom: 4 }}>
                    📍 GPS: {Number(lat).toFixed(5)}, {Number(lng).toFixed(5)}
                  </Text>
                )}

                <Text style={{ fontSize: 10, color: "#9CA3AF", marginBottom: 10 }}>
                  {alert.createdAt ? new Date(alert.createdAt).toLocaleString([], { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "Just now"}
                </Text>

                {/* Action */}
                {!isResolved && (
                  <TouchableOpacity
                    style={{
                      backgroundColor: "#DC2626",
                      borderRadius: 8,
                      paddingVertical: 9,
                      alignItems: "center",
                    }}
                    onPress={() => {
                      setSosAlerts((prev) =>
                        prev.map((a) => a.id === alert.id ? { ...a, acknowledged: true } : a)
                      );
                      setUnreadSosCount((c) => Math.max(0, c - 1));
                    }}
                  >
                    <Text style={{ color: "#fff", fontWeight: "900", fontSize: 13 }}>Acknowledge SOS</Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}

          {/* ── VEHICLE ISSUE NOTIFICATIONS ── */}
          <View style={maintStyles.sectionHeaderRow}>
            <Text style={maintStyles.sectionHeaderText}>⚠️ VEHICLE ISSUE NOTIFICATIONS</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5 }}>
              <View
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 4,
                  backgroundColor: maintOnline ? "#10B981" : "#EF4444",
                }}
              />
              <Text style={{ fontSize: 10, fontWeight: "800", color: maintOnline ? "#059669" : "#DC2626" }}>
                {maintOnline ? "LIVE" : "OFFLINE"}
              </Text>
            </View>
          </View>

          {maintLoading && maintItems.length === 0 && (
            <ActivityIndicator style={{ marginTop: 20 }} color="#2563EB" />
          )}

          {!maintLoading && maintItems.length === 0 && (
            <Text style={maintStyles.emptyText}>No vehicle issues right now. ✅</Text>
          )}

          {maintItems.map((item, idx) => {
            const isResolved = item.status === "Resolved" || item.status === "resolved";
            const isCritical = item.severity === "Critical";
            return (
              <View
                key={item.id}
                style={[
                  maintStyles.issueCard,
                  isResolved
                    ? { borderColor: "#A7F3D0", backgroundColor: "#F0FDF4" }
                    : { borderColor: isCritical ? "#FCA5A5" : "#FDE68A", backgroundColor: isCritical ? "#FEF2F2" : "#FFFBEB" },
                ]}
              >
                <View style={maintStyles.issueCardTop}>
                  <Text style={{ fontWeight: "900", fontSize: 13, color: "#1F2937" }}>
                    ⚙️ VEHICLE ISSUE
                  </Text>
                  <View
                    style={[
                      maintStyles.severityPill,
                      {
                        backgroundColor: isResolved
                          ? "#10B981"
                          : isCritical
                            ? "#EF4444"
                            : "#F59E0B",
                      },
                    ]}
                  >
                    <Text style={maintStyles.severityPillText}>
                      {isResolved ? "RESOLVED" : isCritical ? "CRITICAL" : "WARNING"}
                    </Text>
                  </View>
                </View>

                <Text style={maintStyles.issueMeta}>
                  #{String(idx + 1).padStart(2, "0")} ·{" "}
                  {new Date(item.createdAt).toLocaleString([], {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </Text>

                <Text style={maintStyles.issueTitle}>
                  [{item.vehicle}] — {item.description || item.title}
                </Text>

                <Text style={maintStyles.issueTag}>🔖 {item.raisedByLabel}</Text>

                {isResolved ? (
                  <Text style={maintStyles.resolvedNote}>
                    ✅ Resolved by {item.resolvedBy || "You"}
                    {item.resolvedAt
                      ? ` · ${new Date(item.resolvedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                      : ""}
                  </Text>
                ) : (
                  <TouchableOpacity
                    style={maintStyles.ackBtn}
                    onPress={() => handleAcknowledge(item)}
                  >
                    <Text style={{ color: "#fff", fontWeight: "900", fontSize: 13 }}>
                      Acknowledge
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            );
          })}

          {/* Current Ongoing Tasks */}
          <View style={[maintStyles.sectionHeaderRow, { marginTop: 10 }]}>
            <Text style={maintStyles.sectionHeaderText}>📋 CURRENT ONGOING TASKS</Text>
          </View>

          {ongoingTasks.length === 0 && (
            <Text style={maintStyles.emptyText}>No ongoing tasks assigned.</Text>
          )}

          {ongoingTasks.map((task) => {
            const inProgress = task.status === "Acknowledged";
            return (
              <View key={`task-${task.id}`} style={maintStyles.taskCard}>
                <View style={{ flex: 1 }}>
                  <Text style={maintStyles.taskTitle}>
                    {task.vehicle} — {task.title}
                  </Text>
                  <Text style={maintStyles.taskSub}>
                    {task.source === "alert"
                      ? `${task.raisedByLabel} · Priority: ${task.severity}`
                      : `Assigned to: You · ${new Date(task.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`}
                  </Text>
                </View>
                <View
                  style={[
                    maintStyles.taskStatusPill,
                    { backgroundColor: inProgress ? "#D1FAE5" : "#FEF3C7" },
                  ]}
                >
                  <Text
                    style={{
                      fontSize: 9,
                      fontWeight: "900",
                      color: inProgress ? "#059669" : "#B45309",
                    }}
                  >
                    {inProgress ? "IN PROGRESS" : "PENDING"}
                  </Text>
                </View>
              </View>
            );
          })}
        </ScrollView>

        {/* Floating create-log shortcut */}
        <TouchableOpacity
          style={maintStyles.fab}
          onPress={() => setIsMaintLogModalOpen(true)}
        >
          <Text style={{ color: "#fff", fontSize: 22 }}>＋</Text>
        </TouchableOpacity>

        {/* Reuse existing modals so Create Log / Log History / Settings / Profile still work */}
        <Modal visible={isMaintLogModalOpen} animationType="slide">
          {/* ...unchanged — keep your existing Create Maint. Log modal JSX here... */}
        </Modal>

        {/* <Modal visible={isLogHistoryModalOpen} animationType="slide">
        </Modal> */}
        <Modal visible={isLogHistoryModalOpen} animationType="slide">
          <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
            <View style={styles.modalHdr}>
              <Text style={styles.modalTitle}>Maintenance Logs</Text>
              <TouchableOpacity onPress={() => setIsLogHistoryModalOpen(false)}>
                <Text style={styles.modalCloseText}>CLOSE</Text>
              </TouchableOpacity>
            </View>

            <View style={{ padding: 15, flex: 1 }}>
              {/* Period Tabs */}
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 15 }}>
                {["Day", "Week", "Month", "Year"].map((t) => (
                  <TouchableOpacity
                    key={t}
                    style={{
                      flex: 1,
                      padding: 8,
                      backgroundColor: maintLogPeriod === t ? "#2563EB" : "white",
                      borderRadius: 8,
                      alignItems: "center",
                      borderWidth: 1,
                      borderColor: "#E5E7EB",
                    }}
                    onPress={() => setMaintLogPeriod(t)}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: "800",
                        color: maintLogPeriod === t ? "white" : "#64748B",
                      }}
                    >
                      {t.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Status Tabs */}
              <View style={{ flexDirection: "row", gap: 10, marginBottom: 15 }}>
                {["Ongoing", "Completed"].map((s) => (
                  <TouchableOpacity
                    key={s}
                    style={{
                      flex: 1,
                      padding: 10,
                      backgroundColor: maintLogTab === s ? "#10B981" : "#F3F4F6",
                      borderRadius: 8,
                      alignItems: "center",
                    }}
                    onPress={() => setMaintLogTab(s)}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: "800",
                        color: maintLogTab === s ? "white" : "#64748B",
                      }}
                    >
                      {s.toUpperCase()}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <ScrollView>
                {maintLogTab === "Ongoing" ? (
                  <>
                    {maintItems
                      .filter(
                        (i) =>
                          i.status !== "Resolved" &&
                          i.status !== "resolved" &&
                          isWithinPeriod(i.createdAt, maintLogPeriod),
                      )
                      .map((item) => {
                        const isCritical = item.severity === "Critical";
                        return (
                          <View
                            key={item.id}
                            style={{
                              backgroundColor: isCritical ? "#FEF2F2" : "white",
                              padding: 15,
                              borderRadius: 12,
                              marginBottom: 10,
                              borderWidth: 1,
                              borderColor: isCritical ? "#EF4444" : "#E5E7EB",
                            }}
                          >
                            <View
                              style={{
                                flexDirection: "row",
                                justifyContent: "space-between",
                                alignItems: "flex-start",
                                marginBottom: 5,
                              }}
                            >
                              <Text
                                style={{ fontWeight: "800", fontSize: 14, flex: 1, marginRight: 8 }}
                              >
                                {item.vehicle} {item.title}
                              </Text>
                              <Text
                                style={{
                                  fontSize: 10,
                                  color: isCritical ? "#EF4444" : "#F59E0B",
                                  fontWeight: "800",
                                  backgroundColor: isCritical ? "#FEE2E2" : "#FEF3C7",
                                  borderColor: isCritical ? "#EF4444" : "transparent",
                                  borderWidth: isCritical ? 1 : 0,
                                  paddingHorizontal: 6,
                                  paddingVertical: 2,
                                  borderRadius: 4,
                                  overflow: "hidden",
                                }}
                              >
                                {isCritical ? "CRITICAL" : "ONGOING"}
                              </Text>
                            </View>

                            <Text
                              style={{
                                fontSize: 9,
                                alignSelf: "flex-start",
                                backgroundColor: isCritical ? "#ef4444" : "#e0e7ff",
                                color: isCritical ? "white" : "#4338ca",
                                paddingHorizontal: 6,
                                paddingVertical: 2,
                                borderRadius: 4,
                                overflow: "hidden",
                                marginBottom: 8,
                              }}
                            >
                              {item.raisedByLabel}
                            </Text>

                            <Text
                              style={{
                                fontSize: 11,
                                color: isCritical ? "#B91C1C" : "#64748B",
                                marginBottom: 10,
                              }}
                            >
                              {item.description}
                            </Text>

                            <TouchableOpacity
                              onPress={() =>
                                Alert.alert("View", "Viewing paper log attachment")
                              }
                            >
                              <Text
                                style={{ fontSize: 11, color: "#2563EB", fontWeight: "800" }}
                              >
                                📎 View Paper Log
                              </Text>
                            </TouchableOpacity>
                          </View>
                        );
                      })}

                    {maintItems.filter(
                      (i) =>
                        i.status !== "Resolved" &&
                        i.status !== "resolved" &&
                        isWithinPeriod(i.createdAt, maintLogPeriod),
                    ).length === 0 && (
                        <Text
                          style={{
                            textAlign: "center",
                            color: "#9CA3AF",
                            fontSize: 12,
                            marginTop: 30,
                          }}
                        >
                          No ongoing logs for this period.
                        </Text>
                      )}
                  </>
                ) : (
                  <>
                    {completedLogs
                      .filter((row) => isWithinPeriod(row.resolvedAt, maintLogPeriod))
                      .map((row) => (
                        <View
                          key={row.id}
                          style={{
                            backgroundColor: "#F0FDF4",
                            padding: 15,
                            borderRadius: 12,
                            marginBottom: 10,
                            borderWidth: 1,
                            borderColor: "#A7F3D0",
                          }}
                        >
                          <View
                            style={{
                              flexDirection: "row",
                              justifyContent: "space-between",
                              alignItems: "flex-start",
                              marginBottom: 5,
                            }}
                          >
                            <Text
                              style={{ fontWeight: "800", fontSize: 14, flex: 1, marginRight: 8 }}
                            >
                              {row.vehicle} — {row.issueType}
                            </Text>
                            <Text
                              style={{
                                fontSize: 10,
                                color: "#059669",
                                fontWeight: "800",
                                backgroundColor: "#D1FAE5",
                                paddingHorizontal: 6,
                                paddingVertical: 2,
                                borderRadius: 4,
                                overflow: "hidden",
                              }}
                            >
                              RESOLVED
                            </Text>
                          </View>

                          <Text style={{ fontSize: 11, color: "#64748B", marginBottom: 6 }}>
                            Raised by {row.raisedBy} · Priority: {row.priority}
                          </Text>

                          <Text style={{ fontSize: 11, color: "#059669", fontWeight: "700" }}>
                            ✅ Resolved by {row.resolvedBy}
                            {row.resolvedAt
                              ? ` · ${new Date(row.resolvedAt).toLocaleString([], {
                                day: "2-digit",
                                month: "short",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}`
                              : ""}
                          </Text>
                        </View>
                      ))}

                    {completedLogs.filter((row) =>
                      isWithinPeriod(row.resolvedAt, maintLogPeriod),
                    ).length === 0 && (
                        <Text
                          style={{
                            textAlign: "center",
                            color: "#9CA3AF",
                            fontSize: 12,
                            marginTop: 30,
                          }}
                        >
                          No completed logs for this period.
                        </Text>
                      )}
                  </>
                )}
              </ScrollView>
            </View>
          </SafeAreaView>
        </Modal>

        <Modal visible={isSettingsModalOpen} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.issueCard}>
              <Text style={styles.modalTitle}>App Settings</Text>

              <View style={{ width: "100%", marginBottom: 20 }}>
                <Text
                  style={{
                    fontSize: 13,
                    color: "#4B5563",
                    fontWeight: "700",
                    marginBottom: 10,
                  }}
                >
                  GPS Tracking Control
                </Text>
                <TouchableOpacity
                  style={[
                    styles.actionBtn,
                    {
                      height: 55,
                      width: "100%",
                      backgroundColor: gpsEnabled ? "#10B981" : "#EF4444",
                      borderWidth: 0,
                      marginBottom: 5,
                    },
                  ]}
                  onPress={() => {
                    const next = !gpsEnabled;
                    setGpsEnabled(next);
                    storeGpsEnabled(next);
                  }}
                >
                  <Text style={{ color: "white", fontWeight: "900", fontSize: 14 }}>
                    {gpsEnabled ? "GPS ACCESS: PROVIDED" : "GPS ACCESS: DECLINED"}
                  </Text>
                </TouchableOpacity>
                <Text style={{ fontSize: 10, color: "#9CA3AF", textAlign: "center" }}>
                  Toggle this to manually stop or start live GPS sharing with the university hub.
                </Text>
              </View>

              <View
                style={{
                  width: "100%",
                  marginBottom: 20,
                  borderTopWidth: 1,
                  borderTopColor: "#F3F4F6",
                  paddingTop: 20,
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    color: "#4B5563",
                    fontWeight: "700",
                    marginBottom: 10,
                  }}
                >
                  Notification Alerts
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Text style={{ fontSize: 12, color: "#6B7280" }}>Sound &amp; Vibration</Text>
                  <Text style={{ fontSize: 10, fontWeight: "800", color: "#2563EB" }}>ENABLED</Text>
                </View>
              </View>

              <TouchableOpacity
                style={{
                  backgroundColor: "#FEF2F2",
                  borderWidth: 1.5,
                  borderColor: "#FCA5A5",
                  borderRadius: 10,
                  padding: 12,
                  width: "100%",
                  alignItems: "center",
                  marginBottom: 10,
                }}
                onPress={() => {
                  setIsSettingsModalOpen(false);
                  confirmLogout();
                }}
              >
                <Text style={{ color: "#DC2626", fontWeight: "900", fontSize: 13 }}>LOG OUT</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={{ padding: 15, width: "100%", alignItems: "center" }}
                onPress={() => setIsSettingsModalOpen(false)}
              >
                <Text style={{ color: "#2563EB", fontWeight: "800" }}>Close Settings</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* ── FULL PROFILE MODAL ── */}
        <Modal
          visible={showProfileModal}
          animationType="slide"
          onRequestClose={() => setShowProfileModal(false)}
        >
          <View style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
            <SafeAreaView style={{ flex: 1 }}>
              <ScrollView
                contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
                showsVerticalScrollIndicator={false}
              >
                {/* Avatar + Header */}
                <View style={{ alignItems: "center", marginBottom: 20 }}>
                  <View style={profileStyles.avatarRing}>
                    <Text style={{ fontSize: 40 }}>{caps?.icon || "🔧"}</Text>
                  </View>
                  <Text
                    style={{
                      fontSize: 22,
                      fontWeight: "900",
                      color: "#0F172A",
                      marginTop: 12,
                    }}
                  >
                    {userName}
                  </Text>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "900",
                      color: "#2563EB",
                      letterSpacing: 1,
                      marginTop: 4,
                    }}
                  >
                    OFFICIAL {(role || "").toUpperCase()}
                  </Text>
                </View>

                {/* Employee Details Card */}
                <View style={profileStyles.card}>
                  <Text style={profileStyles.cardTitle}>📇 EMPLOYEE DETAILS</Text>
                  <View style={profileStyles.row}>
                    <View style={profileStyles.col}>
                      <Text style={profileStyles.label}>EMP ID</Text>
                      <Text style={profileStyles.value}>
                        {user?.empId || userId?.slice(0, 8).toUpperCase() || "—"}
                      </Text>
                    </View>
                    <View style={profileStyles.col}>
                      <Text style={profileStyles.label}>NAME</Text>
                      <Text style={profileStyles.value}>{userName}</Text>
                    </View>
                  </View>
                  <View style={[profileStyles.row, { marginTop: 14 }]}>
                    <View style={profileStyles.col}>
                      <Text style={profileStyles.label}>DEPARTMENT</Text>
                      <Text style={profileStyles.value}>
                        {user?.department || "Transport Ops"}
                      </Text>
                    </View>
                    <View style={profileStyles.col}>
                      <Text style={profileStyles.label}>BLOOD GROUP</Text>
                      <Text style={[profileStyles.value, { color: "#EF4444" }]}>
                        {user?.bloodGroup || "—"}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Emergency Contact Card */}
                <View style={profileStyles.card}>
                  <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 14 }}>
                    <Phone size={15} color="#2563EB" strokeWidth={2.2} />
                    <Text style={[profileStyles.cardTitle, { marginBottom: 0, marginLeft: 6 }]}>
                      EMERGENCY CONTACT
                    </Text>
                  </View>
                  <View style={profileStyles.row}>
                    <View style={profileStyles.col}>
                      <Text style={profileStyles.label}>PRIMARY KIN</Text>
                      <Text style={profileStyles.value}>
                        {user?.emergencyContactName || "—"}
                      </Text>
                    </View>
                    <View style={profileStyles.col}>
                      <Text style={profileStyles.label}>CONTACT NO.</Text>
                      <Text style={profileStyles.value}>
                        {user?.emergencyContactPhone || "—"}
                      </Text>
                    </View>
                  </View>
                </View>
              </ScrollView>
            </SafeAreaView>

            <BottomTabBar
              activeTab="profile"
              onTabPress={(tab) => {
                if (tab === "home") setShowProfileModal(false);
                if (tab === "settings") {
                  setShowProfileModal(false);
                  setIsSettingsModalOpen(true);
                }
              }}
            />
          </View>
        </Modal>

        <BottomTabBar activeTab={activeTab} onTabPress={handleTabPress} />
      </SafeAreaView>
    );
}
