import { useCallback, useEffect, useState } from "react";
import { Alert, Platform } from "react-native";
import * as Location from "expo-location";
import * as ImagePicker from "expo-image-picker";
import { useCameraPermissions } from "expo-camera";
import jsQR from "jsqr";
import { API_BASE } from "../api/client";
import { STAGE, STAGE_META, NEXT_STAGE } from "../constants/attendanceStages";

const authHeaders = (token) => ({
  "Content-Type": "application/json",
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
});

export default function useAttendanceScanner({ user, token, enabled = true }) {
  const [boardStatus, setBoardStatus] = useState(STAGE.PICKUP);
  const [gpsEnabled, setGpsEnabled] = useState(false);
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [scanFeedback, setScanFeedback] = useState(null);
  const [scanEnabled, setScanEnabled] = useState(false);

  const isMorningLeg = boardStatus === STAGE.PICKUP || boardStatus === STAGE.TO_COLLEGE;
  const nextStageAfterScan = NEXT_STAGE[boardStatus];
  const scanDirection = isMorningLeg ? "COLLEGE_TO_INROUTE" : "INROUTE_TO_HOME";
  const userId = user?.id || "unknown-user";

  const fetchCurrentStatus = useCallback(async () => {
    if (!userId || userId === "unknown-user") return;
    try {
      const response = await fetch(
        `${API_BASE}/api/attendance/current?userId=${encodeURIComponent(userId)}`,
        { headers: authHeaders(token) },
      );
      const data = await response.json();
      if (data.success && data.stage && STAGE_META[data.stage]) setBoardStatus(data.stage);
    } catch (error) {
      console.log("Failed to fetch current attendance status:", error.message);
    }
  }, [userId, token]);

  useEffect(() => {
    fetchCurrentStatus();
  }, [fetchCurrentStatus]);

  useEffect(() => {
    if (!enabled) return;
    (async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status === "granted") setGpsEnabled(true);
      } catch (error) {
        console.log("Location permission check failed:", error.message);
      }
    })();
  }, [enabled]);

  const requestGPS = useCallback(async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === "granted") {
      setGpsEnabled(true);
      return true;
    }
    setGpsEnabled(false);
    Alert.alert("Permission Denied", "Live tracking will be unavailable.");
    return false;
  }, []);

  const toggleGPS = useCallback(async () => {
    if (gpsEnabled) {
      setGpsEnabled(false);
      return;
    }
    await requestGPS();
  }, [gpsEnabled, requestGPS]);

  const decodeQRFromImageUri = useCallback((uri) => {
    if (Platform.OS !== "web") {
      return Promise.reject(new Error("Image upload scanning is only available on web right now."));
    }

    return new Promise((resolve, reject) => {
      const image = new window.Image();
      image.crossOrigin = "anonymous";
      image.onload = () => {
        try {
          const canvas = document.createElement("canvas");
          canvas.width = image.width;
          canvas.height = image.height;
          const context = canvas.getContext("2d");
          context.drawImage(image, 0, 0);
          const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(imageData.data, imageData.width, imageData.height);
          if (code) resolve(code.data);
          else reject(new Error("No QR code found in image"));
        } catch (error) {
          reject(error);
        }
      };
      image.onerror = () => reject(new Error("Failed to load image"));
      image.src = uri;
    });
  }, []);

  const handleScanQR = useCallback(async (vehicleNumber) => {
    let latitude = null;
    let longitude = null;

    try {
      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });
      latitude = location.coords.latitude;
      longitude = location.coords.longitude;
      console.log(`[GPS DEBUG][STUDENT]
latitude: ${latitude}
longitude: ${longitude}
accuracy: ${location.coords.accuracy}
timestamp: ${new Date(location.timestamp).toISOString()}
source: StudentApp-useAttendanceScanner`);
    } catch (error) {
      console.warn("[GPS DEBUG][STUDENT] Student GPS unavailable:", error?.message);
    }

    let response;
    let data;
    try {
      response = await fetch(`${API_BASE}/api/attendance`, {
        method: "POST",
        headers: authHeaders(token),
        body: JSON.stringify({
          userId,
          vehicleId: user?.vehicle || null,
          type: "student_scan",
          direction: scanDirection,
          stage: nextStageAfterScan,
          latitude,
          longitude,
        }),
      });
      data = await response.json();
    } catch (error) {
      setScanFeedback({
        type: "error",
        message: "⚠️ Could not reach the server. Check your internet connection and try again.",
      });
      setTimeout(() => setScanned(false), 3000);
      return false;
    }

    if (!response.ok || !data.success) {
      let message = data?.message || "Attendance could not be recorded. Please try again.";
      if (data?.code === "TOO_FAR_FROM_VEHICLE") message = `📍 ${message}`;
      else if (data?.code === "VEHICLE_OFFLINE") message = `🚌 ${message}`;
      else if (data?.code === "STUDENT_GPS_MISSING") message = `📡 ${message}`;

      setScanFeedback({ type: "error", message });
      setTimeout(() => setScanned(false), 3500);
      return false;
    }

    setBoardStatus(nextStageAfterScan);
    setScanFeedback({
      type: "success",
      message: `✅ ATTENDANCE MARKED\n${STAGE_META[nextStageAfterScan].label.replace("\n", " ")}\nBus: ${vehicleNumber || user?.vehicle || ""}`,
    });

    setTimeout(() => setScanEnabled(false), 1800);
    return true;
  }, [token, user, userId, scanDirection, nextStageAfterScan]);

  const processScannedQRData = useCallback(async (rawData) => {
    let parsed;
    try {
      parsed = JSON.parse(rawData);
    } catch {
      setScanFeedback({ type: "error", message: "That doesn't look like a bus QR code. Try again." });
      setTimeout(() => setScanned(false), 1500);
      return;
    }

    if (parsed.type !== "vehicle_qr") {
      setScanFeedback({ type: "error", message: "This isn't a bus boarding QR code." });
      setTimeout(() => setScanned(false), 1500);
      return;
    }

    const assignedVehicleId = user?.vehicleId;
    const assignedVehicleNumber = user?.vehicle;
    const matches =
      (assignedVehicleId && parsed.vehicleId === assignedVehicleId) ||
      (assignedVehicleNumber && parsed.vehicleNumber === assignedVehicleNumber);

    if (!matches) {
      setScanFeedback({
        type: "error",
        message: `Wrong bus — this is ${parsed.vehicleNumber || "another vehicle"}. Your assigned bus is ${assignedVehicleNumber || "not set"}.`,
      });
      setTimeout(() => setScanned(false), 2000);
      return;
    }

    setScanFeedback({ type: "pending", message: `Verified ${parsed.vehicleNumber}! Marking attendance…` });
    await handleScanQR(parsed.vehicleNumber);
  }, [user, handleScanQR]);

  const handleVehicleQRScanned = useCallback(async ({ data }) => {
    if (scanned) return;
    setScanned(true);
    setScanEnabled(false);
    await processScannedQRData(data);
  }, [scanned, processScannedQRData]);

  const pickQRFromLibrary = useCallback(async () => {
    if (Platform.OS !== "web") {
      setScanFeedback({ type: "error", message: "Image upload scanning is only available on web right now. Please use the live camera." });
      setTimeout(() => setScanFeedback(null), 2500);
      return;
    }

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 1,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;
      setScanned(true);
      setScanEnabled(false);
      setScanFeedback({ type: "pending", message: "Reading QR code from image…" });
      const data = await decodeQRFromImageUri(result.assets[0].uri);
      await processScannedQRData(data);
    } catch (error) {
      console.log("Image QR decode error:", error.message);
      setScanFeedback({ type: "error", message: "Couldn't find a readable QR code in that image. Try another one." });
      setTimeout(() => {
        setScanFeedback(null);
        setScanned(false);
      }, 2000);
    }
  }, [decodeQRFromImageUri, processScannedQRData]);

  const openScanner = useCallback(async () => {
    if (!cameraPermission?.granted) {
      const result = await requestCameraPermission();
      if (!result?.granted) return;
    }
    setScanned(false);
    setScanFeedback(null);
    setScanEnabled(true);
  }, [cameraPermission, requestCameraPermission]);

  const closeScanner = useCallback(() => {
    setScanEnabled(false);
    setScanned(false);
    setScanFeedback(null);
  }, []);

  return {
    boardStatus,
    setBoardStatus,
    isMorningLeg,
    nextStageAfterScan,
    scanDirection,
    gpsEnabled,
    toggleGPS,
    requestGPS,
    cameraPermission,
    requestCameraPermission,
    scanned,
    scanFeedback,
    scanEnabled,
    openScanner,
    closeScanner,
    handleVehicleQRScanned,
    pickQRFromLibrary,
    refreshAttendanceStatus: fetchCurrentStatus,
  };
}
