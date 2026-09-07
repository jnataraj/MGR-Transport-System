import React, { useState, useEffect } from "react";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  ArrowDown,
  ArrowLeftRight,
  Bus,
  CheckCircle2,
  ChevronRight,
  Clock,
  MapPin,
  QrCode,
  Shuffle,
  Upload,
  User,
  X,
  AlertTriangle,
} from "lucide-react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import jsQR from "jsqr";
import { API_BASE } from "../api/client";

export default function StudentBusRouteChangeModal({
  visible,
  onClose,
  token,
  user,
  onSuccessChange,
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [step, setStep] = useState("SCAN"); // "SCAN" | "CONFIRM" | "SUCCESS"
  const [validating, setValidating] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [scanFeedback, setScanFeedback] = useState(null);
  const [validationData, setValidationData] = useState(null);
  const [changeResult, setChangeResult] = useState(null);
  const [remarks, setRemarks] = useState("");
  const [hasScanned, setHasScanned] = useState(false);

  // Reset states when modal opens
  useEffect(() => {
    if (visible) {
      setStep("SCAN");
      setValidating(false);
      setConfirming(false);
      setScanFeedback(null);
      setValidationData(null);
      setChangeResult(null);
      setRemarks("");
      setHasScanned(false);
    }
  }, [visible]);

  // Decode image from library for web or fallback
  const pickQRFromGallery = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 1,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const uri = result.assets[0].uri;
        if (Platform.OS === "web") {
          const img = new window.Image();
          img.src = uri;
          img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(img, 0, 0);
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height);
            if (code && code.data) {
              handleTokenScanned(code.data);
            } else {
              setScanFeedback({ type: "error", message: "No QR code found in the selected image." });
            }
          };
        } else {
          // Native fallback alert or direct token
          setScanFeedback({ type: "info", message: "Processing selected image..." });
        }
      }
    } catch (e) {
      console.error("pickQRFromGallery error:", e);
      setScanFeedback({ type: "error", message: "Failed to read QR from photo." });
    }
  };

  const handleBarcodeScanned = ({ data }) => {
    if (hasScanned || validating || confirming) return;
    if (data) {
      setHasScanned(true);
      handleTokenScanned(data);
    }
  };

  const handleTokenScanned = async (rawToken) => {
    setValidating(true);
    setScanFeedback(null);

    let studentLat = null;
    let studentLng = null;
    let acc = null;
    let gpsTime = null;

    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === "granted") {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        if (loc?.coords) {
          studentLat = loc.coords.latitude;
          studentLng = loc.coords.longitude;
          acc = loc.coords.accuracy;
          gpsTime = loc.timestamp ? new Date(loc.timestamp).toISOString() : new Date().toISOString();
        }
      }
    } catch (locErr) {
      console.log("Student QR scan GPS fetch note:", locErr.message);
    }

    try {
      const res = await fetch(`${API_BASE}/api/bus-route-change/qr/validate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          token: rawToken,
          studentLat,
          studentLng,
          latitude: studentLat,
          longitude: studentLng,
          accuracy: acc,
          gpsTimestamp: gpsTime,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        setScanFeedback({
          type: "error",
          message: data?.message || "Invalid or expired QR code.",
        });
        setHasScanned(false);
        setValidating(false);
        return;
      }

      setValidationData(data.data);
      setStep("CONFIRM");
    } catch (err) {
      console.error("Validation error:", err);
      setScanFeedback({
        type: "error",
        message: err.message || "Failed to reach backend server.",
      });
      setHasScanned(false);
    } finally {
      setValidating(false);
    }
  };

  const confirmChange = async () => {
    if (!validationData?.sessionToken) return;

    setConfirming(true);
    let studentLat = null;
    let studentLng = null;
    let acc = null;
    let gpsTime = null;

    try {
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status === "granted") {
        const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        if (loc?.coords) {
          studentLat = loc.coords.latitude;
          studentLng = loc.coords.longitude;
          acc = loc.coords.accuracy;
          gpsTime = loc.timestamp ? new Date(loc.timestamp).toISOString() : new Date().toISOString();
        }
      }
    } catch (e) {
      // ignore GPS failure
    }

    try {
      const res = await fetch(`${API_BASE}/api/bus-route-change/confirm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          sessionToken: validationData.sessionToken,
          remarks,
          studentLat,
          studentLng,
          latitude: studentLat,
          longitude: studentLng,
          accuracy: acc,
          gpsTimestamp: gpsTime,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        Alert.alert("Error", data?.message || "Failed to complete bus change.");
        setConfirming(false);
        return;
      }

      setChangeResult(data.data);
      setStep("SUCCESS");

      if (onSuccessChange) {
        onSuccessChange(data.data);
      }
    } catch (err) {
      console.error("confirmChange error:", err);
      Alert.alert("Network Error", err.message || "Unable to confirm change.");
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent={false} onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerLeft}>
            <View style={styles.headerIconBadge}>
              <Shuffle size={20} color="#8B5CF6" strokeWidth={2.5} />
            </View>
            <View>
              <Text style={styles.headerTitle}>Bus / Route Change</Text>
              <Text style={styles.headerSub}>Scan Driver's Common QR</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.closeBtn} onPress={onClose}>
            <X size={20} color="#64748B" />
          </TouchableOpacity>
        </View>

        {/* STEP 1: SCANNER */}
        {step === "SCAN" && (
          <View style={{ flex: 1 }}>
            {!permission ? (
              <View style={styles.centerContainer}>
                <ActivityIndicator size="large" color="#8B5CF6" />
                <Text style={styles.infoText}>Checking camera permission...</Text>
              </View>
            ) : !permission.granted ? (
              <View style={styles.centerContainer}>
                <AlertTriangle size={48} color="#F59E0B" />
                <Text style={styles.permissionTitle}>Camera Permission Required</Text>
                <Text style={styles.permissionDesc}>
                  Allow camera access to scan the Driver's Bus / Route Change QR Code.
                </Text>
                <TouchableOpacity style={styles.primaryBtn} onPress={requestPermission}>
                  <Text style={styles.primaryBtnText}>Grant Camera Permission</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={{ flex: 1, position: "relative" }}>
                <CameraView
                  style={StyleSheet.absoluteFillObject}
                  facing="back"
                  barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
                  onBarcodeScanned={hasScanned ? undefined : handleBarcodeScanned}
                />

                {/* Scanner Overlay UI */}
                <View style={styles.scannerOverlay}>
                  <View style={styles.overlayTop}>
                    <Text style={styles.scanInstruction}>
                      Point camera at the Driver's Bus / Route Change QR Code
                    </Text>
                  </View>

                  <View style={styles.scanTargetBox}>
                    <View style={[styles.corner, styles.topLeft]} />
                    <View style={[styles.corner, styles.topRight]} />
                    <View style={[styles.corner, styles.bottomLeft]} />
                    <View style={[styles.corner, styles.bottomRight]} />

                    {validating && (
                      <View style={styles.validatingOverlay}>
                        <ActivityIndicator size="large" color="#FFFFFF" />
                        <Text style={styles.validatingText}>Validating QR Code...</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.overlayBottom}>
                    {scanFeedback && (
                      <View
                        style={[
                          styles.feedbackPill,
                          scanFeedback.type === "error" ? styles.feedbackError : styles.feedbackInfo,
                        ]}
                      >
                        <Text style={styles.feedbackText}>{scanFeedback.message}</Text>
                      </View>
                    )}

                    <TouchableOpacity style={styles.galleryBtn} onPress={pickQRFromGallery}>
                      <Upload size={17} color="#FFFFFF" strokeWidth={2.2} />
                      <Text style={styles.galleryBtnText}>Upload QR Image Instead</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            )}
          </View>
        )}

        {/* STEP 2: CONFIRMATION SHEET */}
        {step === "CONFIRM" && validationData && (
          <ScrollView contentContainerStyle={styles.confirmContent} showsVerticalScrollIndicator={false}>
            <View style={styles.reviewHeaderBadge}>
              <ArrowLeftRight size={24} color="#8B5CF6" strokeWidth={2.4} />
              <Text style={styles.reviewHeaderTitle}>Confirm Bus / Route Switch</Text>
            </View>

            <Text style={styles.reviewDescription}>
              Please verify your current assignment and the new bus you are joining before confirming.
            </Text>

            {/* Comparison Cards */}
            <View style={styles.assignmentCompareCard}>
              {/* CURRENT */}
              <View style={styles.assignmentSection}>
                <View style={styles.assignmentLabelRow}>
                  <Text style={styles.sectionBadgeCurrent}>CURRENT ASSIGNMENT</Text>
                </View>
                <View style={styles.assignmentRow}>
                  <View style={styles.busIconCurrent}>
                    <Bus size={20} color="#64748B" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.busNumberCurrent}>
                      {validationData.currentAssignment?.busNumber || "Not Assigned"}
                    </Text>
                    <Text style={styles.routeCurrent}>
                      {validationData.currentAssignment?.routeName || "Unassigned Route"}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Arrow Divider */}
              <View style={styles.arrowDivider}>
                <View style={styles.dividerLine} />
                <View style={styles.arrowCircle}>
                  <ArrowDown size={18} color="#8B5CF6" strokeWidth={2.5} />
                </View>
                <View style={styles.dividerLine} />
              </View>

              {/* NEW */}
              <View style={styles.assignmentSectionNew}>
                <View style={styles.assignmentLabelRow}>
                  <Text style={styles.sectionBadgeNew}>NEW ASSIGNMENT (TARGET)</Text>
                </View>
                <View style={styles.assignmentRow}>
                  <View style={styles.busIconNew}>
                    <Bus size={22} color="#10B981" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.busNumberNew}>
                      {validationData.newAssignment?.busNumber}
                    </Text>
                    <Text style={styles.routeNew}>
                      {validationData.newAssignment?.routeName}
                    </Text>
                  </View>
                </View>

                {validationData.driver?.name && (
                  <View style={styles.driverRow}>
                    <User size={15} color="#0D9488" />
                    <Text style={styles.driverNameText}>
                      Driver: {validationData.driver.name}
                    </Text>
                  </View>
                )}
              </View>
            </View>

            {/* Optional Remarks input */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>REASON / REMARKS (Optional)</Text>
              <TextInput
                style={styles.textInput}
                placeholder="e.g. Temporary change, evening drop-off..."
                placeholderTextColor="#94A3B8"
                value={remarks}
                onChangeText={setRemarks}
              />
            </View>

            {/* Action Buttons */}
            <View style={styles.confirmActionRow}>
              <TouchableOpacity
                style={styles.cancelBtn}
                onPress={() => setStep("SCAN")}
                disabled={confirming}
              >
                <Text style={styles.cancelBtnText}>Back to Scan</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.confirmBtn}
                onPress={confirmChange}
                disabled={confirming}
              >
                {confirming ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <CheckCircle2 size={18} color="#FFFFFF" strokeWidth={2.4} />
                    <Text style={styles.confirmBtnText}>Confirm Change</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        )}

        {/* STEP 3: SUCCESS CONFIRMATION */}
        {step === "SUCCESS" && changeResult && (
          <View style={styles.successContainer}>
            <View style={styles.successIconCircle}>
              <CheckCircle2 size={56} color="#10B981" strokeWidth={2.5} />
            </View>

            <Text style={styles.successTitle}>Bus & Route Changed!</Text>
            <Text style={styles.successSub}>
              Your assignment has been updated successfully.
            </Text>

            <View style={styles.successCard}>
              <View style={styles.successRow}>
                <Text style={styles.successLabel}>Reference Number</Text>
                <Text style={styles.successRefNumber}>{changeResult.referenceNumber}</Text>
              </View>
              <View style={styles.cardDivider} />
              <View style={styles.successRow}>
                <Text style={styles.successLabel}>New Bus</Text>
                <Text style={styles.successValueHighlight}>{changeResult.newBusNumber}</Text>
              </View>
              <View style={styles.cardDivider} />
              <View style={styles.successRow}>
                <Text style={styles.successLabel}>New Route</Text>
                <Text style={styles.successValue}>{changeResult.newRouteName}</Text>
              </View>
              <View style={styles.cardDivider} />
              <View style={styles.successRow}>
                <Text style={styles.successLabel}>Driver</Text>
                <Text style={styles.successValue}>{changeResult.driverName}</Text>
              </View>
            </View>

            <TouchableOpacity style={styles.doneBtn} onPress={onClose}>
              <Text style={styles.doneBtnText}>Done</Text>
            </TouchableOpacity>
          </View>
        )}
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
  headerIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: "#F3E8FF",
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: "800",
    color: "#0F172A",
  },
  headerSub: {
    fontSize: 12,
    color: "#64748B",
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
  },
  centerContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  infoText: {
    marginTop: 12,
    fontSize: 14,
    color: "#64748B",
  },
  permissionTitle: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
    marginTop: 16,
    marginBottom: 8,
  },
  permissionDesc: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    marginBottom: 20,
    lineHeight: 20,
  },
  primaryBtn: {
    backgroundColor: "#8B5CF6",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  primaryBtnText: {
    color: "#FFFFFF",
    fontWeight: "750",
    fontSize: 14,
  },
  scannerOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 30,
  },
  overlayTop: {
    paddingHorizontal: 24,
    alignItems: "center",
  },
  scanInstruction: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "650",
    textAlign: "center",
    backgroundColor: "rgba(15, 23, 42, 0.75)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  scanTargetBox: {
    width: 260,
    height: 260,
    position: "relative",
    justifyContent: "center",
    alignItems: "center",
  },
  corner: {
    position: "absolute",
    width: 32,
    height: 32,
    borderColor: "#A855F7",
  },
  topLeft: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 10,
  },
  topRight: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 10,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 10,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 10,
  },
  validatingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(15, 23, 42, 0.8)",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
  },
  validatingText: {
    color: "#FFFFFF",
    marginTop: 10,
    fontWeight: "700",
    fontSize: 14,
  },
  overlayBottom: {
    alignItems: "center",
    paddingHorizontal: 24,
    width: "100%",
  },
  feedbackPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 14,
    maxWidth: "90%",
  },
  feedbackError: {
    backgroundColor: "#FEE2E2",
  },
  feedbackInfo: {
    backgroundColor: "#EFF6FF",
  },
  feedbackText: {
    color: "#B91C1C",
    fontWeight: "650",
    fontSize: 13,
    textAlign: "center",
  },
  galleryBtn: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.4)",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
    gap: 8,
  },
  galleryBtnText: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 13,
  },
  confirmContent: {
    padding: 20,
    paddingBottom: 40,
  },
  reviewHeaderBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
  },
  reviewHeaderTitle: {
    fontSize: 19,
    fontWeight: "800",
    color: "#0F172A",
  },
  reviewDescription: {
    fontSize: 13,
    color: "#64748B",
    marginBottom: 20,
    lineHeight: 18,
  },
  assignmentCompareCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 16,
    marginBottom: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  assignmentSection: {
    paddingBottom: 6,
  },
  assignmentSectionNew: {
    backgroundColor: "#F0FDF4",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#DCFCE7",
  },
  assignmentLabelRow: {
    marginBottom: 8,
  },
  sectionBadgeCurrent: {
    fontSize: 11,
    fontWeight: "800",
    color: "#64748B",
    letterSpacing: 0.5,
  },
  sectionBadgeNew: {
    fontSize: 11,
    fontWeight: "800",
    color: "#059669",
    letterSpacing: 0.5,
  },
  assignmentRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  busIconCurrent: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  busNumberCurrent: {
    fontSize: 16,
    fontWeight: "750",
    color: "#334155",
  },
  routeCurrent: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 2,
  },
  arrowDivider: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#E2E8F0",
  },
  arrowCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "#F3E8FF",
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 8,
  },
  busIconNew: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: "#DCFCE7",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  busNumberNew: {
    fontSize: 18,
    fontWeight: "800",
    color: "#0F172A",
  },
  routeNew: {
    fontSize: 13,
    fontWeight: "600",
    color: "#059669",
    marginTop: 2,
  },
  driverRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#DCFCE7",
    gap: 6,
  },
  driverNameText: {
    fontSize: 13,
    color: "#0F766E",
    fontWeight: "650",
  },
  inputGroup: {
    marginBottom: 24,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: "750",
    color: "#475569",
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#CBD5E1",
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    color: "#0F172A",
  },
  confirmActionRow: {
    flexDirection: "row",
    gap: 12,
  },
  cancelBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    paddingVertical: 14,
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#475569",
  },
  confirmBtn: {
    flex: 1.5,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#8B5CF6",
    borderRadius: 12,
    paddingVertical: 14,
    gap: 8,
  },
  confirmBtnText: {
    fontSize: 14,
    fontWeight: "750",
    color: "#FFFFFF",
  },
  successContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  successIconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "#ECFDF5",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  successTitle: {
    fontSize: 22,
    fontWeight: "800",
    color: "#0F172A",
    marginBottom: 6,
  },
  successSub: {
    fontSize: 14,
    color: "#64748B",
    textAlign: "center",
    marginBottom: 24,
  },
  successCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    padding: 18,
    width: "100%",
    marginBottom: 28,
  },
  successRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  successLabel: {
    fontSize: 13,
    color: "#64748B",
  },
  successRefNumber: {
    fontSize: 14,
    fontWeight: "800",
    color: "#8B5CF6",
    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
  },
  successValueHighlight: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0F172A",
  },
  successValue: {
    fontSize: 14,
    fontWeight: "650",
    color: "#334155",
  },
  cardDivider: {
    height: 1,
    backgroundColor: "#F1F5F9",
    marginVertical: 4,
  },
  doneBtn: {
    backgroundColor: "#8B5CF6",
    borderRadius: 12,
    paddingVertical: 14,
    width: "100%",
    alignItems: "center",
  },
  doneBtnText: {
    color: "#FFFFFF",
    fontWeight: "800",
    fontSize: 15,
  },
});
