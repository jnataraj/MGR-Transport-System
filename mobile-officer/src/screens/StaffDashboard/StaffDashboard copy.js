import React from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  FlatList,
} from "react-native";
import { StatusBar } from "expo-status-bar";
import { CameraView } from "expo-camera";
import logo from "../../../assets/logo.png";
import BottomTabBar from "../../components/BottomTabBar";
import ActionButton from "../../components/ActionButton";
import IssueTile from "../../components/IssueTile";
import { styles, profileStyles } from "../../styles/dashboard.styles";
import { subModalStyles } from "../../styles/modal.styles";

export default function StaffDashboard({ dashboard }) {
  const {
    user,
    token,
    role,
    caps,
    userId,
    userName,
    userVehicle,
    gpsEnabled,
    setGpsEnabled,
    storeGpsEnabled,
    isSettingsModalOpen,
    setIsSettingsModalOpen,
    activeTab,
    setActiveTab,
    handleTabPress,
    confirmLogout,

    isCameraOpen,
    setIsCameraOpen,
    cameraMode,
    cameraRef,
    qrStatus,
    setQrStatus,
    scannedData,
    isScanConfirmOpen,
    setIsScanConfirmOpen,
    isCloseTripConfirmOpen,
    setIsCloseTripConfirmOpen,
    selfieStatus,
    onShutterPress,
    pickQRFromLibrary,
    openCamera,

    isIssueModalOpen,
    setIsIssueModalOpen,
    isBreakdownModalOpen,
    setIsBreakdownModalOpen,
    isAccidentConfirmOpen,
    setIsAccidentConfirmOpen,
    isOthersConfirmOpen,
    setIsOthersConfirmOpen,
    isIssueSuccessOpen,
    setIsIssueSuccessOpen,
    reportedIssueType,
    handleIssueApi,

    isSosConfirmOpen,
    setIsSosConfirmOpen,
    isSosSentOpen,
    setIsSosSentOpen,
    isSosStopConfirmOpen,
    setIsSosStopConfirmOpen,
    isSosStoppedOpen,
    setIsSosStoppedOpen,
    triggerSOS,
    stopSOS,
    isSosActive,
    blink,

    isSelfieConfirmOpen,
    setIsSelfieConfirmOpen,

    tripStatus,
    setTripStatus,
    routeAlerts,
    unreadAlerts,
    setUnreadAlerts,
    showRouteAlertHistory,
    setShowRouteAlertHistory,
    handleNotificationAction,

    isHistoryModalOpen,
    setIsHistoryModalOpen,
    historyRecords,
    historyLoading,
    statusFilter,
    setStatusFilter,
    timeFilter,
    setTimeFilter,
    fetchMyHistory,
    generatePDF,

    isMaintLogModalOpen,
    setIsMaintLogModalOpen,
    setIsLogHistoryModalOpen,
    maintChecklist,
    setMaintChecklist,

    showProfileModal,
    setShowProfileModal,
  } = dashboard;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      {/* Logo */}
      <View style={{ alignItems: "center", marginBottom: 10 }}>
        <Image
          source={logo}
          style={{ height: 90, width: 250 }}
          resizeMode="contain"
        />
      </View>

      {/* Header Section */}
      <View style={styles.homeHdr}>
        <View style={styles.profileImgWrap}>
          <Text style={{ fontSize: 28 }}>{caps.icon}</Text>
        </View>
        <View style={styles.hdrMainInfo}>
          <View style={styles.hdrCatRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.hdrRole}>{role.toUpperCase()}</Text>
              <Text style={styles.hdrName}>{userName}</Text>
              <Text
                style={{
                  fontSize: 9,
                  fontWeight: "800",
                  color: "rgba(255,255,255,0.7)",
                  marginTop: 2,
                }}
                numberOfLines={1}
              >
                {user?.email}
                {userVehicle !== "UNASSIGNED" ? ` · ${userVehicle}` : ""}
              </Text>
            </View>
            <View style={{ alignItems: "flex-end", gap: 6 }}>
              {caps.showDutyBadges && (
                <>
                  <Text
                    style={{
                      fontSize: 9,
                      fontWeight: "900",
                      backgroundColor:
                        qrStatus === "STARTED" ? "#10B981" : "#EF4444",
                      paddingVertical: 4,
                      paddingHorizontal: 10,
                      borderRadius: 4,
                      color: "#fff",
                      minWidth: 80,
                      textAlign: "center",
                      overflow: "hidden",
                    }}
                  >
                    {qrStatus === "STARTED" ? "QR: START" : "QR: CLOSE"}
                  </Text>
                  <Text
                    style={{
                      fontSize: 9,
                      fontWeight: "900",
                      backgroundColor:
                        selfieStatus === "VERIFIED" ? "#10B981" : "#EF4444",
                      paddingVertical: 4,
                      paddingHorizontal: 10,
                      borderRadius: 4,
                      color: "#fff",
                      minWidth: 80,
                      textAlign: "center",
                      overflow: "hidden",
                    }}
                  >
                    {selfieStatus === "VERIFIED"
                      ? "SELFIE: START"
                      : "SELFIE: CLOSE"}
                  </Text>
                </>
              )}
              <TouchableOpacity
                style={{
                  backgroundColor: "rgba(255,255,255,0.2)",
                  paddingVertical: 4,
                  paddingHorizontal: 10,
                  borderRadius: 4,
                }}
                onPress={confirmLogout}
              >
                <Text style={{ color: "#fff", fontSize: 9, fontWeight: "800" }}>
                  LOGOUT
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>

      {/* Main Dashboard Layout */}
      <View style={styles.dashboard}>
        {/* Left Column: Actions */}
        <View style={styles.actionColumn}>
          {caps.canScanQR && (
            <ActionButton
              icon="📷"
              title={"SCAN QR\nATTENDANCE"}
              onPress={() => openCamera("QR")}
            />
          )}
          {caps.canRaiseIssue && (
            <ActionButton
              icon="⚠️"
              title={"RAISE\nISSUE"}
              onPress={() => setIsIssueModalOpen(true)}
            />
          )}
          {caps.canSelfie && (
            <ActionButton
              icon="🤳"
              title={"START / HALT\nRECORD"}
              onPress={() => openCamera("SELFIE")}
            />
          )}
          {caps.canCreateMaintLog && (
            <ActionButton
              icon="📝"
              title={"CREATE\nMAINT. LOG"}
              onPress={() => setIsMaintLogModalOpen(true)}
            />
          )}
          {caps.canViewLogHistory && (
            <ActionButton
              icon="📜"
              title={"LOG\nHISTORY"}
              onPress={() => setIsLogHistoryModalOpen(true)}
            />
          )}
          {caps.canViewMyHistory && (
            <ActionButton
              icon="📜"
              title={"MY\nHISTORY"}
              onPress={() => {
                setIsHistoryModalOpen(true);
                fetchMyHistory();
              }}
            />
          )}
          {/* Route Alert Notifications Button */}
          {caps.canViewRouteAlerts && (
            <View style={{ position: "relative" }}>
              <ActionButton
                icon="🔔"
                title={"ROUTE\nALERTS"}
                onPress={() => {
                  setShowRouteAlertHistory(true);
                  setUnreadAlerts(0);
                }}
              />
              {unreadAlerts > 0 && (
                <View
                  style={{
                    position: "absolute",
                    top: 6,
                    right: 6,
                    backgroundColor: "#EF4444",
                    borderRadius: 10,
                    width: 20,
                    height: 20,
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 10,
                  }}
                >
                  <Text
                    style={{ color: "#fff", fontSize: 11, fontWeight: "900" }}
                  >
                    {unreadAlerts > 9 ? "9+" : unreadAlerts}
                  </Text>
                </View>
              )}
            </View>
          )}
          {/* <ActionButton
            icon="⚙️"
            title={"APP\nSETTINGS"}
            onPress={() => setIsSettingsModalOpen(true)}
          /> */}
        </View>

        {/* Right Column: Notifications */}
        <View style={styles.notifColumn}>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 8,
            }}
          >
            <Text style={styles.notifTitle}>Notification</Text>
            {routeAlerts.length > 0 && (
              <View
                style={{
                  backgroundColor: "#EF4444",
                  borderRadius: 10,
                  minWidth: 20,
                  height: 20,
                  paddingHorizontal: 5,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: "#fff", fontSize: 10, fontWeight: "900" }}>
                  {routeAlerts.length > 9 ? "9+" : routeAlerts.length}
                </Text>
              </View>
            )}
          </View>

          <FlatList
            data={routeAlerts}
            ListEmptyComponent={
              <Text
                style={{
                  fontSize: 11,
                  color: "#9CA3AF",
                  textAlign: "center",
                  marginTop: 20,
                }}
              >
                No notifications right now.
              </Text>
            }
            renderItem={({ item }) => {
              const isAlertType =
                item.notificationType === "maintenance" ||
                item.notificationType === "halt" ||
                item.notificationType === "broadcast" ||
                item.notificationType === "RouteDelayed" ||
                item.notificationType === "RouteCancelled";

              return (
                <View
                  style={[
                    styles.notifTile,
                    isAlertType && {
                      backgroundColor: "#FFFBEB",
                      borderColor: "#FDE68A",
                    },
                  ]}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      marginBottom: 8,
                      borderBottomWidth: 1,
                      borderBottomColor: "#F3F4F6",
                      paddingBottom: 6,
                    }}
                  >
                    <Text style={{ fontSize: 12, marginRight: 5 }}>
                      {isAlertType ? "⚠️" : "🚌"}
                    </Text>
                    <Text
                      style={{
                        fontSize: 8,
                        fontWeight: "900",
                        color: isAlertType ? "#B45309" : "#2563EB",
                        letterSpacing: 0.5,
                      }}
                    >
                      {isAlertType ? "VEHICLE ALERT" : "DR. MGR TRANSPORT"}
                    </Text>
                  </View>

                  <Text style={styles.notifText}>
                    {item.customMessage || item.routeName}
                  </Text>

                  {isAlertType ? (
                    <TouchableOpacity
                      style={[styles.smallBtn, { backgroundColor: "#F59E0B" }]}
                      onPress={() => handleNotificationAction(item)}
                    >
                      <Text style={styles.smallBtnText}>Acknowledge</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.notifBtns}>
                      <TouchableOpacity
                        style={[styles.smallBtn, styles.btnBlue]}
                        onPress={() => handleNotificationAction(item, "Accepted")}
                      >
                        <Text style={styles.smallBtnText}>Accept</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.smallBtn, styles.btnGray]}
                        onPress={() => handleNotificationAction(item, "Declined")}
                      >
                        <Text style={styles.smallBtnText}>Decline</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              );
            }}
            keyExtractor={(item) => String(item.id)}
          />
        </View>
      </View>

      {/* Footer Panel */}
      <View style={styles.bottomArea}>
        <View
          style={[
            styles.tripStatusCard,
            tripStatus === "CLOSED" && {
              backgroundColor: "#DCFCE7",
              borderColor: "#22C55E",
              borderWidth: 1,
            },
          ]}
        >
          <Text style={styles.tripLabel}>1. Current trip:</Text>
          <Text
            style={[
              styles.tripValue,
              tripStatus === "CLOSED" && { color: "#15803D" },
            ]}
          >
            {tripStatus === "CLOSED"
              ? "No Current Trip"
              : user?.route || user?.assignedRoute || user?.routeName || user?.assignedVehicle?.route
                ? (user?.route || user?.assignedRoute || user?.routeName || user?.assignedVehicle?.route)
                : userVehicle !== "UNASSIGNED"
                  ? `${userVehicle} Route`
                  : "Unassigned Route"}
          </Text>
        </View>

        <TouchableOpacity
          style={[
            styles.closeTripBtn,
            qrStatus !== "STARTED" && { backgroundColor: "#22C55E" },
          ]}
          onPress={() => openCamera("QR")}
        >
          <Text style={styles.btnMainText}>
            {qrStatus !== "STARTED"
              ? role === "driver"
                ? "Start New Trip"
                : "Start New Task"
              : "CLOSE CURRENT TRIP"}
          </Text>
        </TouchableOpacity>

        {caps.canTriggerSOS && (
          <TouchableOpacity
            style={[
              styles.sosBtn,
              isSosActive &&
              blink && { backgroundColor: "#FEE2E2", borderColor: "#EF4444" },
            ]}
            onPress={() => {
              if (isSosActive) {
                setIsSosStopConfirmOpen(true);
              } else {
                setIsSosConfirmOpen(true);
              }
            }}
          >
            <Text style={[styles.sosText, isSosActive && { color: "#EF4444" }]}>
              <Text
                style={[
                  styles.sosIcon,
                  isSosActive && { backgroundColor: "#EF4444", color: "white" },
                ]}
              >
                {isSosActive ? "ACTIVE" : "SOS"}
              </Text>
              {isSosActive ? " STOP EMERGENCY" : " TRIGGER SOS"}
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Modals */}
      <Modal visible={isCameraOpen} animationType="slide">
        <View style={styles.cameraContainer}>
          <CameraView style={styles.camera} ref={cameraRef} facing="back">
            <View style={styles.cameraFrame}>
              <Text style={styles.cameraTitle}>
                {cameraMode === "QR"
                  ? qrStatus === "STARTED" ? "Close Attendance (QR Scan)" : "Initial Scan (Start Work)"
                  : selfieStatus === "VERIFIED" ? "Close/Hault Vehicle Verification" : "Vehicle Verification Selfie (Start)"}
              </Text>
              <View style={cameraMode === "QR" ? styles.wrapperQR : styles.wrapperFace} />
              <Text style={styles.cameraHint}>
                {cameraMode === "QR" ? "Align QR Code" : "Include yourself & vehicle in frame"}
              </Text>
            </View>
          </CameraView>
          <View style={styles.cameraControls}>
            <TouchableOpacity style={styles.shutter} onPress={onShutterPress}>
              <View style={styles.shutterInner} />
            </TouchableOpacity>

            {/* NEW — moved here, only shows during QR mode on web */}
            {Platform.OS === "web" && cameraMode === "QR" && (
              <TouchableOpacity
                onPress={() => {
                  setIsCameraOpen(false);
                  pickQRFromLibrary();
                }}
                style={{
                  marginTop: 16,
                  paddingHorizontal: 18,
                  paddingVertical: 10,
                  borderRadius: 10,
                  borderWidth: 1.5,
                  borderColor: "rgba(255,255,255,0.6)",
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "700", fontSize: 13 }}>
                  📁 Upload QR Image Instead
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      <Modal visible={isIssueModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.issueCard}>
            <Text style={styles.modalTitle}>Report Issue</Text>
            <Text style={{ fontSize: 12, color: "#6B7280", marginTop: -14, marginBottom: 16 }}>
              Select a category below
            </Text>
            <View style={styles.issueGrid}>
              <IssueTile
                icon="🚗"
                label={"Vehicle\nBreakdown"}
                onPress={() => setIsBreakdownModalOpen(true)}
              />
              <IssueTile
                icon="🚑"
                label={"Vehicle\nAccident"}
                onPress={() => setIsAccidentConfirmOpen(true)}
              />
              <IssueTile
                icon="🗺️"
                label={"Route /\nSocial"}
                onPress={() => handleIssueApi("ROUTE", `Route/Social issue reported by ${userName}`)}
              />
              <IssueTile
                icon="📝"
                label="Others"
                onPress={() => setIsOthersConfirmOpen(true)}
              />
            </View>
            <TouchableOpacity onPress={() => setIsIssueModalOpen(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Vehicle Breakdown — sub-type picker */}
      <Modal visible={isBreakdownModalOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.issueCard}>
            <Text style={styles.modalTitle}>Vehicle Breakdown</Text>
            <Text style={{ fontSize: 12, color: "#6B7280", marginTop: -14, marginBottom: 16, alignSelf: "flex-start" }}>
              Select specific issue type:
            </Text>

            <TouchableOpacity
              style={subModalStyles.optionBtn}
              onPress={() => handleIssueApi("BREAKDOWN", "Puncture reported")}
            >
              <Text style={subModalStyles.optionBtnText}>Puncture</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={subModalStyles.optionBtn}
              onPress={() => handleIssueApi("BREAKDOWN", "Low pickup / engine power loss")}
            >
              <Text style={subModalStyles.optionBtnText}>Low Pickup</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[subModalStyles.optionBtn, subModalStyles.optionBtnPrimary]}
              onPress={() => handleIssueApi("BREAKDOWN", "Other breakdown issue")}
            >
              <Text style={subModalStyles.optionBtnPrimaryText}>Others</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setIsBreakdownModalOpen(false)}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Vehicle Accident — emergency confirm */}
      <Modal visible={isAccidentConfirmOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.issueCard}>
            <Text style={styles.modalTitle}>⚠️ ACCIDENT ALERT</Text>
            <Text style={{ fontSize: 13, color: "#6B7280", textAlign: "center", marginBottom: 20 }}>
              Confirm Emergency Accident Alert? This will send your GPS location to Admin immediately.
            </Text>

            <TouchableOpacity
              style={[subModalStyles.optionBtn, subModalStyles.optionBtnPrimary, { width: "100%" }]}
              onPress={() => handleIssueApi("ACCIDENT", "CRITICAL ALERT — Emergency accident reported with GPS location")}
            >
              <Text style={subModalStyles.optionBtnPrimaryText}>CONFIRM & NOTIFY</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[subModalStyles.optionBtn, { width: "100%" }]}
              onPress={() => setIsAccidentConfirmOpen(false)}
            >
              <Text style={subModalStyles.optionBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Others — free-form report confirm */}
      <Modal visible={isOthersConfirmOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.issueCard}>
            <Text style={styles.modalTitle}>Other Issue</Text>
            <Text style={{ fontSize: 13, color: "#6B7280", textAlign: "center", marginBottom: 20 }}>
              Report custom issue to the administration?
            </Text>

            <TouchableOpacity
              style={[subModalStyles.optionBtn, subModalStyles.optionBtnPrimary, { width: "100%" }]}
              onPress={() => handleIssueApi("OTHERS", `Custom issue reported by ${userName}`)}
            >
              <Text style={subModalStyles.optionBtnPrimaryText}>SEND REPORT</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[subModalStyles.optionBtn, { width: "100%" }]}
              onPress={() => setIsOthersConfirmOpen(false)}
            >
              <Text style={subModalStyles.optionBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Shared success confirmation */}
      <Modal visible={isIssueSuccessOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.issueCard}>
            <Text style={styles.modalTitle}>Issue Reported</Text>
            <Text style={{ fontSize: 13, color: "#6B7280", textAlign: "center", marginBottom: 20 }}>
              Issue "{reportedIssueType}" reported to admin successfully.
            </Text>
            <TouchableOpacity
              style={[subModalStyles.optionBtn, subModalStyles.optionBtnPrimary, { width: "100%" }]}
              onPress={() => setIsIssueSuccessOpen(false)}
            >
              <Text style={subModalStyles.optionBtnPrimaryText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* SOS Trigger Confirm — matches "SOS EMERGENCY" screenshot */}
      <Modal visible={isSosConfirmOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.issueCard}>
            <Text style={styles.modalTitle}>SOS EMERGENCY</Text>
            <Text style={{ fontSize: 13, color: "#6B7280", textAlign: "center", marginBottom: 20 }}>
              Are you sure you want to trigger the University Emergency Team?
            </Text>

            <TouchableOpacity
              style={[subModalStyles.optionBtn, subModalStyles.optionBtnPrimary, { width: "100%" }]}
              onPress={triggerSOS}
            >
              <Text style={subModalStyles.optionBtnPrimaryText}>TRIGGER NOW</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[subModalStyles.optionBtn, { width: "100%" }]}
              onPress={() => setIsSosConfirmOpen(false)}
            >
              <Text style={subModalStyles.optionBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* SOS Sent — matches "SOS Sent" screenshot */}
      <Modal visible={isSosSentOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.issueCard}>
            <Text style={styles.modalTitle}>SOS Sent</Text>
            <Text style={{ fontSize: 13, color: "#6B7280", textAlign: "center", marginBottom: 20 }}>
              Emergency alert has been broadcasted to the maintenance team.
            </Text>
            <TouchableOpacity
              style={[subModalStyles.optionBtn, { width: "100%" }]}
              onPress={() => setIsSosSentOpen(false)}
            >
              <Text style={subModalStyles.optionBtnText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Stop Emergency Confirm */}
      <Modal visible={isSosStopConfirmOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.issueCard}>
            <Text style={styles.modalTitle}>Stop Emergency</Text>
            <Text style={{ fontSize: 13, color: "#6B7280", textAlign: "center", marginBottom: 20 }}>
              Are you sure you want to cancel the active SOS alert?
            </Text>

            <TouchableOpacity
              style={[subModalStyles.optionBtn, subModalStyles.optionBtnPrimary, { width: "100%", backgroundColor: "#EF4444" }]}
              onPress={stopSOS}
            >
              <Text style={subModalStyles.optionBtnPrimaryText}>STOP</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[subModalStyles.optionBtn, { width: "100%" }]}
              onPress={() => setIsSosStopConfirmOpen(false)}
            >
              <Text style={subModalStyles.optionBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Emergency Stopped confirmation */}
      <Modal visible={isSosStoppedOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.issueCard}>
            <Text style={styles.modalTitle}>Emergency Stopped</Text>
            <Text style={{ fontSize: 13, color: "#6B7280", textAlign: "center", marginBottom: 20 }}>
              The maintenance team has been notified that this emergency is resolved.
            </Text>
            <TouchableOpacity
              style={[subModalStyles.optionBtn, { width: "100%" }]}
              onPress={() => setIsSosStoppedOpen(false)}
            >
              <Text style={subModalStyles.optionBtnText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={isSelfieConfirmOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.issueCard}>
            <Text style={styles.modalTitle}>Selfie Recorded</Text>
            <View
              style={{
                width: "100%",
                marginBottom: 15,
                borderRadius: 12,
                overflow: "hidden",
                borderWidth: 2,
                borderColor: "#E5E7EB",
              }}
            >
              <Image
                source={{
                  uri: "https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=300&q=80",
                }}
                style={{ width: "100%", height: 160 }}
              />
            </View>
            <Text
              style={{
                fontSize: 13,
                color: "#6B7280",
                lineHeight: 20,
                textAlign: "center",
                marginBottom: 20,
              }}
            >
              Image & GPS Location (13.06, 80.21) successfully logged to server
              and verified.
            </Text>
            <TouchableOpacity
              style={[
                styles.actionBtn,
                { height: 45, width: "100%", backgroundColor: "#2563EB" },
              ]}
              onPress={() => setIsSelfieConfirmOpen(false)}
            >
              <Text style={{ color: "white", fontWeight: "800", fontSize: 14 }}>
                OK
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={isSettingsModalOpen} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.issueCard}>
            <Text style={styles.modalTitle}>App Settings</Text>

            <View style={{ width: "100%", marginBottom: 20, marginTop: 90 }}>
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
                <Text
                  style={{ color: "white", fontWeight: "900", fontSize: 14 }}
                >
                  {gpsEnabled ? "GPS ACCESS: PROVIDED" : "GPS ACCESS: DECLINED"}
                </Text>
              </TouchableOpacity>
              <Text
                style={{ fontSize: 10, color: "#9CA3AF", textAlign: "center" }}
              >
                Toggle this to manually stop or start live GPS sharing with the
                university hub.
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
                <Text style={{ fontSize: 12, color: "#6B7280" }}>
                  Sound & Vibration
                </Text>
                <Text
                  style={{ fontSize: 10, fontWeight: "800", color: "#2563EB" }}
                >
                  ENABLED
                </Text>
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
              <Text
                style={{ color: "#DC2626", fontWeight: "900", fontSize: 13 }}
              >
                LOG OUT
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{ padding: 15, width: "100%", alignItems: "center" }}
              onPress={() => setIsSettingsModalOpen(false)}
            >
              <Text style={{ color: "#2563EB", fontWeight: "800" }}>
                Close Settings
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal visible={isHistoryModalOpen} animationType="slide">
        <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
          {/* ── Header ── */}
          <View style={[styles.blueHeader, { minHeight: 80, paddingTop: 20, paddingHorizontal: 16 }]}>
            <View>
              <Text style={{ color: "rgba(255,255,255,0.75)", fontSize: 10, fontWeight: "700", letterSpacing: 1 }}>
                {role.toUpperCase()} · {userName}
              </Text>
              <Text style={{ color: "white", fontSize: 20, fontWeight: "900", marginTop: 2 }}>
                My History
              </Text>
            </View>
          </View>

          <View style={{ padding: 10, flex: 1 }}>
            {/* ── Status filter (ALL / ON DUTY / COMPLETED) ── */}
            <View
              style={{
                flexDirection: "row",
                backgroundColor: "#E2E8F0",
                padding: 2,
                borderRadius: 8,
                marginBottom: 8,
              }}
            >
              {[
                { l: "ALL", v: "ALL" },
                { l: "ON DUTY", v: "STARTED" },
                { l: "COMPLETED", v: "CLOSED" },
              ].map((t) => (
                <TouchableOpacity
                  key={t.v}
                  onPress={() => setStatusFilter(t.v)}
                  style={{
                    flex: 1,
                    padding: 5,
                    backgroundColor:
                      statusFilter === t.v ? "white" : "transparent",
                    borderRadius: 6,
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      fontSize: 8,
                      fontWeight: "900",
                      color: statusFilter === t.v ? "#2563EB" : "#64748B",
                    }}
                  >
                    {t.l}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* ── Time filter (W / M / Y) ── */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                marginBottom: 10,
              }}
            >
              <View style={{ flexDirection: "row", gap: 4 }}>
                {[
                  { label: "W", days: 7 },
                  { label: "M", days: 31 },
                  { label: "Y", days: 366 },
                ].map((t) => (
                  <TouchableOpacity
                    key={t.label}
                    onPress={() => setTimeFilter(t.label)}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 13,
                      borderWidth: 1,
                      borderColor: timeFilter === t.label ? "#2563EB" : "#CBD5E1",
                      backgroundColor: timeFilter === t.label ? "#EFF6FF" : "white",
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 9,
                        fontWeight: "900",
                        color: timeFilter === t.label ? "#2563EB" : "#64748B",
                      }}
                    >
                      {t.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View
                style={{
                  flex: 1,
                  paddingVertical: 5,
                  paddingHorizontal: 10,
                  borderWidth: 1,
                  borderColor: "#E2E8F0",
                  borderRadius: 20,
                  backgroundColor: "white",
                }}
              >
                <Text
                  style={{
                    fontSize: 9,
                    fontWeight: "800",
                    color: "#64748B",
                    textAlign: "center",
                  }}
                >
                  {timeFilter === "W"
                    ? `Last 7 days`
                    : timeFilter === "M"
                      ? "Last 30 days"
                      : "Last 12 months"}
                </Text>
              </View>
              <TouchableOpacity
                onPress={fetchMyHistory}
                style={{
                  backgroundColor: "#2563EB",
                  borderRadius: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                }}
              >
                <Text style={{ color: "#fff", fontWeight: "900", fontSize: 9 }}>↻ REFRESH</Text>
              </TouchableOpacity>
            </View>

            {/* ── Table Header ── */}
            <View
              style={{
                flexDirection: "row",
                backgroundColor: "#F1F5F9",
                padding: 8,
                borderTopLeftRadius: 8,
                borderTopRightRadius: 8,
                borderBottomWidth: 1,
                borderBottomColor: "#E2E8F0",
              }}
            >
              <Text style={{ flex: 1.5, fontSize: 9, fontWeight: "900", color: "#475569" }}>
                Route / OnDuty
              </Text>
              <Text style={{ flex: 1.4, fontSize: 9, fontWeight: "900", color: "#475569" }}>
                Date / Time
              </Text>
              <Text style={{ flex: 0.7, fontSize: 9, fontWeight: "900", color: "#475569", textAlign: "right" }}>
                Status
              </Text>
            </View>

            {/* ── Table Body ── */}
            <View
              style={{
                backgroundColor: "white",
                borderBottomLeftRadius: 8,
                borderBottomRightRadius: 8,
                borderWidth: 1,
                borderTopWidth: 0,
                borderColor: "#E2E8F0",
                flex: 1,
              }}
            >
              {historyLoading ? (
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 10 }}>
                  <ActivityIndicator color="#2563EB" size="small" />
                  <Text style={{ fontSize: 11, color: "#9CA3AF" }}>Loading history…</Text>
                </View>
              ) : (() => {
                const nowMs = Date.now();
                const dayMs = 24 * 60 * 60 * 1000;
                const cutoffMs = timeFilter === "W" ? 7 * dayMs
                  : timeFilter === "M" ? 31 * dayMs
                    : 366 * dayMs;

                const filtered = historyRecords.filter((rec) => {
                  const recMs = new Date(rec.scannedAt).getTime();
                  const withinTime = (nowMs - recMs) <= cutoffMs;
                  const matchStatus =
                    statusFilter === "ALL" ||
                    rec.stage === statusFilter;
                  return withinTime && matchStatus;
                });

                if (filtered.length === 0) {
                  return (
                    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 20 }}>
                      <Text style={{ fontSize: 32, marginBottom: 10 }}>📭</Text>
                      <Text style={{ fontWeight: "800", color: "#6B7280", fontSize: 13, textAlign: "center" }}>
                        No records found
                      </Text>
                      <Text style={{ color: "#9CA3AF", fontSize: 11, textAlign: "center", marginTop: 4 }}>
                        {historyRecords.length === 0
                          ? "No duty history available yet."
                          : "Try a different filter or time range."}
                      </Text>
                    </View>
                  );
                }

                return (
                  <ScrollView>
                    {filtered.map((rec, i) => {
                      const isStarted = rec.stage === "STARTED";
                      const isClosed = rec.stage === "CLOSED";
                      const statusLabel = isStarted ? "ON DUTY" : isClosed ? "COMPLETED" : (rec.stage || "—");
                      const statusColor = isStarted ? "#10B981" : isClosed ? "#2563EB" : "#F59E0B";
                      const vehicleLabel = rec.vehicleId || userVehicle || "—";
                      const routeLabel =
                        user?.route || user?.assignedRoute || user?.routeName ||
                        user?.assignedVehicle?.route || vehicleLabel;
                      const dt = new Date(rec.scannedAt);
                      const dateStr = dt.toLocaleDateString([], {
                        day: "2-digit",
                        month: "short",
                      });
                      const timeStr = dt.toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: true,
                      });
                      return (
                        <View
                          key={rec.id || i}
                          style={{
                            flexDirection: "row",
                            paddingVertical: 7,
                            paddingHorizontal: 8,
                            borderBottomWidth: i === filtered.length - 1 ? 0 : 1,
                            borderBottomColor: "#F1F5F9",
                            alignItems: "center",
                            backgroundColor: isStarted ? "#F0FDF4" : "white",
                          }}
                        >
                          <Text
                            style={{
                              flex: 1.5,
                              fontSize: 9,
                              fontWeight: "700",
                              color: "#1E293B",
                            }}
                            numberOfLines={2}
                          >
                            {routeLabel}
                          </Text>
                          <Text
                            style={{
                              flex: 1.4,
                              fontSize: 8,
                              fontWeight: "600",
                              color: "#64748B",
                            }}
                          >
                            {dateStr}{"\n"}{timeStr}
                          </Text>
                          <View
                            style={{
                              flex: 0.7,
                              alignItems: "flex-end",
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 8,
                                fontWeight: "900",
                                color: statusColor,
                                backgroundColor: isStarted ? "#DCFCE7" : isClosed ? "#DBEAFE" : "#FEF3C7",
                                paddingHorizontal: 4,
                                paddingVertical: 2,
                                borderRadius: 4,
                                overflow: "hidden",
                                textAlign: "center",
                              }}
                            >
                              {statusLabel}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </ScrollView>
                );
              })()}
            </View>

            {/* ── Bottom Action Buttons ── */}
            <View
              style={{
                marginTop: 16,
                flexDirection: "row",
                justifyContent: "space-between",
                gap: 12,
              }}
            >
              {/* Download PDF */}
              <TouchableOpacity
                style={{
                  flex: 1,
                  height: 52,
                  backgroundColor: "#2563EB",
                  borderRadius: 14,
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  elevation: 3,
                  shadowColor: "#000",
                  shadowOpacity: 0.15,
                  shadowRadius: 4,
                }}
                onPress={generatePDF}
              >
                <Text style={{ fontSize: 18, marginRight: 8 }}>📄</Text>
                <Text
                  style={{
                    color: "#FFF",
                    fontSize: 14,
                    fontWeight: "700",
                  }}
                >
                  Download PDF
                </Text>
              </TouchableOpacity>

              {/* Close */}
              <TouchableOpacity
                style={{
                  flex: 1,
                  height: 52,
                  backgroundColor: "#F1F5F9",
                  borderRadius: 14,
                  borderWidth: 1,
                  borderColor: "#CBD5E1",
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                onPress={() => setIsHistoryModalOpen(false)}
              >
                <Text style={{ fontSize: 18, marginRight: 8 }}>✖</Text>
                <Text
                  style={{
                    color: "#334155",
                    fontSize: 14,
                    fontWeight: "700",
                  }}
                >
                  Close
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </SafeAreaView>
      </Modal>

      {/* Route Alert Notification History Modal */}
      <Modal visible={showRouteAlertHistory} animationType="slide">
        <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
          <View style={styles.modalHdr}>
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 10 }}
            >
              <Text style={{ fontSize: 18 }}>🔔</Text>
              <Text style={styles.modalTitle}>Route Alerts</Text>
            </View>
            <TouchableOpacity onPress={() => setShowRouteAlertHistory(false)}>
              <Text style={styles.modalCloseText}>CLOSE</Text>
            </TouchableOpacity>
          </View>

          {routeAlerts.length === 0 ? (
            <View
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Text style={{ fontSize: 40, marginBottom: 12 }}>🔕</Text>
              <Text
                style={{ fontWeight: "800", color: "#6B7280", fontSize: 14 }}
              >
                No route alerts yet
              </Text>
              <Text style={{ color: "#9CA3AF", fontSize: 12, marginTop: 4 }}>
                Alerts from admin will appear here
              </Text>
            </View>
          ) : (
            <ScrollView style={{ flex: 1, padding: 16 }}>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: "700",
                  color: "#9CA3AF",
                  letterSpacing: 1,
                  marginBottom: 12,
                  textTransform: "uppercase",
                }}
              >
                {routeAlerts.length} Alert{routeAlerts.length !== 1 ? "s" : ""}
              </Text>
              {routeAlerts.map((alert, idx) => {
                const typeMap = {
                  RouteDelayed: {
                    emoji: "⏰",
                    label: "Route Delayed",
                    bgColor: "#FFFBEB",
                    leftColor: "#D97706",
                    tagBg: "#FEF3C7",
                    tagText: "#92400E",
                  },
                  RouteCancelled: {
                    emoji: "❌",
                    label: "Route Cancelled",
                    bgColor: "#FEF2F2",
                    leftColor: "#DC2626",
                    tagBg: "#FEE2E2",
                    tagText: "#991B1B",
                  },
                  NewPath: {
                    emoji: "🔀",
                    label: "New Path / Diversion",
                    bgColor: "#EFF6FF",
                    leftColor: "#2563EB",
                    tagBg: "#DBEAFE",
                    tagText: "#1D4ED8",
                  },
                  General: {
                    emoji: "📢",
                    label: "Notice",
                    bgColor: "#EFF6FF",
                    leftColor: "#2563EB",
                    tagBg: "#DBEAFE",
                    tagText: "#1D4ED8",
                  },
                };
                const t = typeMap[alert.notificationType] || {
                  emoji: "📢",
                  label: alert.notificationType,
                  bgColor: "#F9FAFB",
                  leftColor: "#6B7280",
                  tagBg: "#F3F4F6",
                  tagText: "#374151",
                };
                const dt = new Date(alert.receivedAt || alert.timestamp);
                const isToday = dt.toDateString() === new Date().toDateString();
                const timeStr = dt.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                const dateStr = isToday
                  ? "Today"
                  : dt.toLocaleDateString([], { day: "numeric", month: "short" });
                return (
                  <View
                    key={alert.id || idx}
                    style={{
                      backgroundColor: t.bgColor,
                      borderRadius: 16,
                      marginBottom: 14,
                      borderLeftWidth: 5,
                      borderLeftColor: t.leftColor,
                      shadowColor: "#000",
                      shadowOpacity: 0.05,
                      shadowRadius: 5,
                      elevation: 2,
                      overflow: "hidden",
                    }}
                  >
                    <View style={{ padding: 14 }}>
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          justifyContent: "space-between",
                          marginBottom: 10,
                        }}
                      >
                        <View
                          style={{
                            backgroundColor: t.tagBg,
                            borderRadius: 8,
                            paddingHorizontal: 10,
                            paddingVertical: 4,
                            flexDirection: "row",
                            alignItems: "center",
                            gap: 5,
                          }}
                        >
                          <Text style={{ fontSize: 14 }}>{t.emoji}</Text>
                          <Text
                            style={{ fontWeight: "900", fontSize: 12, color: t.tagText }}
                          >
                            {t.label}
                          </Text>
                        </View>
                        <Text
                          style={{ fontSize: 10, color: "#9CA3AF", fontWeight: "600" }}
                        >
                          {dateStr} {timeStr}
                        </Text>
                      </View>
                      <Text
                        style={{
                          fontSize: 15,
                          fontWeight: "900",
                          color: "#111827",
                          marginBottom: 4,
                        }}
                      >
                        {alert.routeName}
                      </Text>
                      <Text
                        style={{
                          fontSize: 12,
                          color: "#6B7280",
                          fontWeight: "600",
                          marginBottom: 8,
                        }}
                      >
                        Effective: {alert.effectiveDate} at {alert.effectiveTime}
                        {alert.duration ? `  ·  ${alert.duration}` : ""}
                      </Text>
                      {(alert.customMessage || alert.updatedRoute) && (
                        <View
                          style={{
                            backgroundColor: "rgba(255,255,255,0.8)",
                            borderRadius: 8,
                            padding: 10,
                            borderLeftWidth: 2,
                            borderLeftColor: t.leftColor,
                          }}
                        >
                          <Text
                            style={{ fontSize: 13, color: "#374151", lineHeight: 20 }}
                          >
                            {alert.customMessage || alert.updatedRoute}
                          </Text>
                        </View>
                      )}
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          marginTop: 10,
                          gap: 6,
                        }}
                      >
                        <View
                          style={{
                            width: 7,
                            height: 7,
                            borderRadius: 4,
                            backgroundColor: "#10B981",
                          }}
                        />
                        <Text
                          style={{ fontSize: 10, color: "#059669", fontWeight: "700" }}
                        >
                          Sent by Transport Admin ·{" "}
                          {alert.totalAffected
                            ? `${alert.totalAffected} notified`
                            : "All route members notified"}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })}
              <View style={{ height: 20 }} />
            </ScrollView>
          )}
        </SafeAreaView>
      </Modal>

      <Modal visible={isMaintLogModalOpen} animationType="slide">
        <SafeAreaView style={{ flex: 1, backgroundColor: "#F8FAFC" }}>
          <View style={styles.modalHdr}>
            <Text style={styles.modalTitle}>Create Maint. Log</Text>
            <TouchableOpacity onPress={() => setIsMaintLogModalOpen(false)}>
              <Text style={styles.modalCloseText}>CLOSE</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={{ padding: 20, flex: 1 }}>
            <Text style={{ fontWeight: "800", marginBottom: 5 }}>
              Vehicle ID
            </Text>
            <TextInput
              style={{
                borderWidth: 1,
                borderColor: "#E5E7EB",
                borderRadius: 8,
                padding: 12,
                marginBottom: 20,
                backgroundColor: "white",
              }}
              placeholder="e.g. BUS-07"
            />

            <Text
              style={{ fontWeight: "900", marginBottom: 10, color: "#1e293b" }}
            >
              ⚙️ Engine Section
            </Text>
            <View
              style={{
                backgroundColor: "white",
                borderRadius: 10,
                padding: 15,
                marginBottom: 20,
                borderWidth: 1,
                borderColor: "#e2e8f0",
                flexDirection: "row",
                flexWrap: "wrap",
              }}
            >
              {["oil", "filters", "belts", "coolant"].map((item) => (
                <TouchableOpacity
                  key={item}
                  style={{
                    width: "50%",
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: 10,
                  }}
                  onPress={() =>
                    setMaintChecklist((prev) => ({
                      ...prev,
                      [item]: !prev[item],
                    }))
                  }
                >
                  <View
                    style={{
                      width: 18,
                      height: 18,
                      borderWidth: 1,
                      borderColor: "#94a3b8",
                      borderRadius: 4,
                      marginRight: 8,
                      backgroundColor: maintChecklist[item]
                        ? "#2563eb"
                        : "white",
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    {maintChecklist[item] && (
                      <Text
                        style={{
                          color: "white",
                          fontSize: 12,
                          fontWeight: "bold",
                        }}
                      >
                        ✓
                      </Text>
                    )}
                  </View>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "700",
                      color: "#475569",
                      textTransform: "capitalize",
                    }}
                  >
                    {item}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text
              style={{ fontWeight: "900", marginBottom: 10, color: "#1e293b" }}
            >
              🛑 Brakes Section
            </Text>
            <View
              style={{
                backgroundColor: "white",
                borderRadius: 10,
                padding: 15,
                marginBottom: 20,
                borderWidth: 1,
                borderColor: "#e2e8f0",
                flexDirection: "row",
                flexWrap: "wrap",
              }}
            >
              {["frontPads", "rearPads", "fluid", "rotors"].map((item) => (
                <TouchableOpacity
                  key={item}
                  style={{
                    width: "50%",
                    flexDirection: "row",
                    alignItems: "center",
                    marginBottom: 10,
                  }}
                  onPress={() =>
                    setMaintChecklist((prev) => ({
                      ...prev,
                      [item]: !prev[item],
                    }))
                  }
                >
                  <View
                    style={{
                      width: 18,
                      height: 18,
                      borderWidth: 1,
                      borderColor: "#94a3b8",
                      borderRadius: 4,
                      marginRight: 8,
                      backgroundColor: maintChecklist[item]
                        ? "#2563eb"
                        : "white",
                      justifyContent: "center",
                      alignItems: "center",
                    }}
                  >
                    {maintChecklist[item] && (
                      <Text
                        style={{
                          color: "white",
                          fontSize: 12,
                          fontWeight: "bold",
                        }}
                      >
                        ✓
                      </Text>
                    )}
                  </View>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: "700",
                      color: "#475569",
                    }}
                  >
                    {item === "frontPads"
                      ? "Front Pads"
                      : item === "rearPads"
                        ? "Rear Pads"
                        : item === "fluid"
                          ? "Fluid Level"
                          : "Rotors"}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={{ fontWeight: "800", marginBottom: 5 }}>
              Manual Issue Entry
            </Text>
            <TextInput
              style={{
                borderWidth: 1,
                borderColor: "#E5E7EB",
                borderRadius: 8,
                padding: 12,
                marginBottom: 20,
                backgroundColor: "white",
                minHeight: 80,
                textAlignVertical: "top",
              }}
              placeholder="Describe any additional manual issues..."
              multiline
            />

            <TouchableOpacity
              style={{
                backgroundColor: "#F0FDFA",
                padding: 20,
                borderRadius: 12,
                alignItems: "center",
                marginBottom: 20,
                borderWidth: 2,
                borderColor: "#99F6E4",
                borderStyle: "dashed",
              }}
              onPress={() =>
                Alert.alert("Upload", "Paper log uploaded successfully (Mock)")
              }
            >
              <Text style={{ fontSize: 24, marginBottom: 5 }}>📄</Text>
              <Text
                style={{ color: "#0F766E", fontWeight: "900", fontSize: 14 }}
              >
                UPLOAD PAPER LOG
              </Text>
              <Text
                style={{
                  color: "#14B8A6",
                  fontWeight: "600",
                  fontSize: 10,
                  marginTop: 3,
                }}
              >
                Tap to scan or select photo
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{
                backgroundColor: "#2563EB",
                padding: 15,
                borderRadius: 10,
                alignItems: "center",
                marginBottom: 40,
              }}
              onPress={() => {
                Alert.alert("Success", "Maintenance Log Created");
                setMaintChecklist({});
                setIsMaintLogModalOpen(false);
              }}
            >
              <Text style={{ color: "white", fontWeight: "900", fontSize: 14 }}>
                SUBMIT MAINTENANCE LOG
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>


      <Modal visible={isCloseTripConfirmOpen} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.issueCard}>
            <Text style={styles.modalTitle}>Close Trip</Text>
            <Text style={{ fontSize: 13, color: "#6B7280", textAlign: "center", marginBottom: 20 }}>
              Confirm and close current session?
            </Text>

            <TouchableOpacity
              style={[subModalStyles.optionBtn, subModalStyles.optionBtnPrimary, { width: "100%" }]}
              onPress={() => {
                setQrStatus("CLOSED");
                setSelfieStatus("CLOSED");
                setTripStatus("CLOSED");
                setIsCloseTripConfirmOpen(false);
              }}
            >
              <Text style={subModalStyles.optionBtnPrimaryText}>CLOSE TRIP</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[subModalStyles.optionBtn, { width: "100%" }]}
              onPress={() => setIsCloseTripConfirmOpen(false)}
            >
              <Text style={subModalStyles.optionBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── ATTENDANCE LOGGED MODAL ── */}
      <Modal
        visible={isScanConfirmOpen}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setIsScanConfirmOpen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "center",
            alignItems: "center",
            padding: 24,
          }}
        >
          <View
            style={{
              width: "100%",
              maxWidth: 360,
              backgroundColor: "#FFFFFF",
              borderRadius: 28,
              padding: 24,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 10 },
              shadowOpacity: 0.15,
              shadowRadius: 20,
              elevation: 8,
              alignItems: "center",
            }}
          >
            <Text
              style={{
                fontSize: 20,
                fontWeight: "900",
                color: "#1E293B",
                textAlign: "center",
                marginBottom: 20,
              }}
            >
              Attendance Logged{"\n"}[{qrStatus === "STARTED" ? "START" : "STOP"}]
            </Text>

            {/* Inner Details Box */}
            <View
              style={{
                width: "100%",
                backgroundColor: "#F8FAFC",
                borderRadius: 18,
                padding: 18,
                marginBottom: 24,
                borderWidth: 1,
                borderColor: "#F1F5F9",
              }}
            >
              {/* Geo Coordinates */}
              <View style={{ flexDirection: "row", marginBottom: 14 }}>
                <Text style={{ fontSize: 18, marginRight: 10 }}>📍</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: "800", color: "#334155" }}>
                    Geo-Coordinates:
                  </Text>
                  <Text style={{ fontSize: 12, color: "#64748B", fontWeight: "600", marginTop: 2 }}>
                    Lat: {scannedData.lat}, Lng: {scannedData.lng}
                  </Text>
                </View>
              </View>

              {/* Timestamp */}
              <View style={{ flexDirection: "row", marginBottom: 14 }}>
                <Text style={{ fontSize: 18, marginRight: 10 }}>⏰</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: "800", color: "#334155" }}>
                    Timestamp:
                  </Text>
                  <Text style={{ fontSize: 12, color: "#64748B", fontWeight: "600", marginTop: 2 }}>
                    {scannedData.timestamp}
                  </Text>
                </View>
              </View>

              {/* Data Sync */}
              <View style={{ flexDirection: "row" }}>
                <Text style={{ fontSize: 18, marginRight: 10 }}>📡</Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 13, fontWeight: "800", color: "#334155", marginBottom: 4 }}>
                    Data Sync:
                  </Text>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: "#10B981", marginBottom: 2 }}>
                    ✓ Saved to Central DB
                  </Text>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: "#10B981", marginBottom: 2 }}>
                    ✓ Sent to Route Coordinator
                  </Text>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: "#10B981" }}>
                    ✓ Sent to Admin Dashboard
                  </Text>
                </View>
              </View>
            </View>

            {/* Acknowledge Button */}
            <TouchableOpacity
              style={{
                width: "100%",
                backgroundColor: "#2563EB",
                borderRadius: 14,
                paddingVertical: 16,
                alignItems: "center",
                justifyContent: "center",
                shadowColor: "#2563EB",
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
                elevation: 4,
              }}
              onPress={() => setIsScanConfirmOpen(false)}
            >
              <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "800" }}>
                Acknowledge
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <BottomTabBar activeTab={activeTab} onTabPress={handleTabPress} />

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
                  <Text style={{ fontSize: 40 }}>{caps.icon}</Text>
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
                  OFFICIAL {role.toUpperCase()}
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

              {/* Current Assignments Card */}
              <View style={profileStyles.card}>
                <Text style={profileStyles.cardTitle}>🚍 CURRENT ASSIGNMENTS</Text>
                <View
                  style={{
                    backgroundColor: "#F8FAFC",
                    borderRadius: 12,
                    padding: 12,
                    marginBottom: 14,
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 6,
                    }}
                  >
                    <Text style={profileStyles.label}>DEFAULT ROUTE</Text>
                    <View
                      style={{
                        backgroundColor: "#D1FAE5",
                        paddingHorizontal: 8,
                        paddingVertical: 3,
                        borderRadius: 10,
                      }}
                    >
                      <Text
                        style={{ fontSize: 10, fontWeight: "900", color: "#059669" }}
                      >
                        ACTIVE
                      </Text>
                    </View>
                  </View>
                  <Text style={profileStyles.value}>
                    {user?.route ||
                      user?.assignedRoute ||
                      user?.assignedVehicle?.route ||
                      "—"}
                  </Text>
                </View>
                <View style={profileStyles.row}>
                  <View style={profileStyles.col}>
                    <Text style={profileStyles.label}>VEHICLE REG</Text>
                    <Text style={profileStyles.value}>
                      {user?.vehicleRegNo || userVehicle}
                    </Text>
                  </View>
                  <View style={profileStyles.col}>
                    <Text style={profileStyles.label}>SHIFT TYPE</Text>
                    <Text style={profileStyles.value}>
                      {user?.shiftType || "Morning/Evening"}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Emergency Contact Card */}
              <View style={profileStyles.card}>
                <Text style={profileStyles.cardTitle}>📞 EMERGENCY CONTACT</Text>
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
              setActiveTab(tab);
            }}
          />
        </View>
      </Modal>
    </SafeAreaView>
  );
}