const { Expo } = require("expo-server-sdk");
const prisma = require("../prisma/prisma");

const expo = new Expo();

/**
 * Sends Expo Push Notifications to a list of Expo push tokens.
 * @param {Array<string>|string} tokens - Array of push tokens or single push token
 * @param {string} title - Notification title
 * @param {string} body - Notification body text
 * @param {Object} data - Extra JSON metadata payload
 */
async function sendPushNotification(tokens, title, body, data = {}) {
  try {
    const tokenList = Array.isArray(tokens) ? tokens : [tokens];
    const validTokens = tokenList.filter((t) => typeof t === "string" && Expo.isExpoPushToken(t));

    if (validTokens.length === 0) {
      console.log("No valid Expo push tokens provided.");
      return { success: false, sentCount: 0 };
    }

    const messages = validTokens.map((to) => ({
      to,
      sound: "default",
      title,
      body,
      data,
      priority: "high",
    }));

    const chunks = expo.chunkPushNotifications(messages);
    let sentCount = 0;

    for (const chunk of chunks) {
      try {
        const ticketChunk = await expo.sendPushNotificationsAsync(chunk);
        sentCount += ticketChunk.length;
        console.log("Expo Push Notification Tickets:", ticketChunk);
      } catch (error) {
        console.error("Error sending Expo push notification chunk:", error);
      }
    }

    return { success: true, sentCount };
  } catch (err) {
    console.error("sendPushNotification Error:", err);
    return { success: false, error: err.message };
  }
}

/**
 * High-level helper to trigger a system notification:
 * 1. Saves notification record in PostgreSQL DB
 * 2. Emits real-time Socket.IO event
 * 3. Sends Expo Push Notifications to targeted user(s)
 */
async function triggerNotification(io, { title, message, type = "general", sender = "System", target = "all", userId = null, data = {} }) {
  try {
    // 1. Save in DB
    const notification = await prisma.notification.create({
      data: {
        title,
        message,
        type,
        sender,
        target,
        userId,
        data: typeof data === "string" ? data : JSON.stringify(data),
      },
    });

    // 2. Real-time Socket.IO emission
    if (io) {
      if (target === "all") {
        // Broadcast to every connected client
        io.emit("new_notification", notification);
      } else if (userId) {
        // Target a specific user's private room; also inform admin dashboard
        io.to(`user_${userId}`).emit("new_notification", notification);
        io.to("admin").emit("new_notification", notification);
      } else {
        // Emit ONLY to the named role room (e.g. "maintenance") —
        // do NOT broadcast to all users to avoid polluting other dashboards.
        io.to(target).emit("new_notification", notification);
      }
    }

    // 3. Find target users' Expo Push Tokens & Send Push Notification
    let whereClause = {};
    if (target === "driver") {
      whereClause = { role: { equals: "driver", mode: "insensitive" } };
    } else if (target === "student") {
      whereClause = { role: { equals: "student", mode: "insensitive" } };
    } else if (target === "hod" || target === "deptadmin") {
      whereClause = { role: { in: ["deptadmin", "hod"], mode: "insensitive" } };
    } else if (target === "coordinator") {
      whereClause = { role: { equals: "coordinator", mode: "insensitive" } };
    } else if (target === "parent") {
      whereClause = { role: { equals: "parent", mode: "insensitive" } };
    } else if (target === "admin" || target === "superadmin") {
      whereClause = { role: { in: ["superadmin", "admin", "deptadmin"], mode: "insensitive" } };
    } else if (target === "maintenance") {
      // Bug Fix: 'maintenance' was previously unhandled → fell into else → no push notifications sent.
      // Now correctly resolves to all users with the maintenance role.
      whereClause = { role: { equals: "maintenance", mode: "insensitive" } };
    } else if (userId) {
      whereClause = { id: userId };
    } else if (target === "all") {
      whereClause = {};
    } else {
      whereClause = { id: "none" }; // prevent sending to all users if target is unknown/empty
    }

    // Include push tokens
    const users = await prisma.user.findMany({
      where: {
        ...whereClause,
        pushToken: { not: null },
      },
      select: { pushToken: true },
    });

    const pushTokens = users.map((u) => u.pushToken).filter(Boolean);

    if (pushTokens.length > 0) {
      await sendPushNotification(pushTokens, title, message, data);
    }

    return notification;
  } catch (err) {
    console.error("triggerNotification Error:", err);
    throw err;
  }
}

module.exports = {
  sendPushNotification,
  triggerNotification,
  sendNotification: sendPushNotification, // Backward compatibility alias
};
