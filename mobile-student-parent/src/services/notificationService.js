import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { apiRequest } from "../api/client";

// Set how notifications are presented when app is foregrounded
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Register device for Expo Push Notifications and upload pushToken to backend.
 * @param {string} authToken - User's JWT bearer token
 */
export async function registerForPushNotificationsAsync(authToken) {
  let token = null;

  try {
    if (Platform.OS === "android") {
      await Notifications.setNotificationChannelAsync("default", {
        name: "default",
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: "#FF231F7C",
      });
    }

    if (Device.isDevice) {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;

      if (existingStatus !== "granted") {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }

      if (finalStatus !== "granted") {
        console.log("Failed to get push token for push notification!");
        return null;
      }

      const pushTokenResponse = await Notifications.getExpoPushTokenAsync().catch((err) => {
        console.warn("Could not get Expo push token (check projectId if in Expo Go):", err);
        return null;
      });

      token = pushTokenResponse?.data || null;
    } else {
      console.log("Must use physical device for Expo Push Notifications");
    }

    if (token && authToken) {
      await apiRequest("/api/notifications/push-token", {
        method: "POST",
        body: { pushToken: token },
        token: authToken,
      }).catch((err) => console.error("Failed to register push token on backend:", err));
    }
  } catch (error) {
    console.error("Error in registerForPushNotificationsAsync:", error);
  }

  return token;
}
