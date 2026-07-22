const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

/**
 * Single function to handle all notification types.
 * Replaces multiple failing Firestore triggers.
 */
exports.createAndSendNotification = onCall({ region: "europe-west1" }, async (request) => {
    // 1. Verify Authentication
    if (!request.auth) {
        throw new HttpsError("unauthenticated", "User must be logged in.");
    }

    const {
        title,
        message,
        titleKey = null,
        messageKey = null,
        params = {},
        clickAction = null,
        type = "GENERIC",
        targetUserIds = [],
        targetRoles = [],
        global = false,
        appointmentId = null,
        metadata = {}
    } = request.data;

    try {
        const db = admin.firestore();

        // 2. Add to Notifications Collection
        const notificationData = {
            title,
            message,
            titleKey,
            messageKey,
            params,
            clickAction,
            type,
            targetUserIds,
            targetRoles,
            global,
            appointmentId,
            metadata,
            senderId: request.auth.uid,
            timestamp: admin.firestore.Timestamp.now(),
            timeAgo: admin.firestore.Timestamp.now()
        };

        await db.collection("notifications").add(notificationData);

        // 3. Find FCM Tokens
        let tokens = [];

        if (global) {
            // Global push logic (optional, usually limited for performance)
            const snapshot = await db.collection("users").get();
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.fcmTokens) tokens.push(...data.fcmTokens);
                if (data.fcmToken) tokens.push(data.fcmToken);
            });
        } else if (targetUserIds.length > 0) {
            const users = await db.collection("users").where("uid", "in", targetUserIds).get();
            users.forEach(doc => {
                const data = doc.data();
                if (data.fcmTokens) tokens.push(...data.fcmTokens);
                if (data.fcmToken) tokens.push(data.fcmToken);
            });
        } else if (targetRoles.length > 0) {
            const users = await db.collection("users").where("role", "in", targetRoles).get();
            users.forEach(doc => {
                const data = doc.data();
                if (data.fcmTokens) tokens.push(...data.fcmTokens);
                if (data.fcmToken) tokens.push(data.fcmToken);
            });
        }

        // Remove duplicates and empty
        tokens = [...new Set(tokens)].filter(t => !!t);

        // 4. Send Push Notification
        if (tokens.length > 0) {
            const messages = tokens.slice(0, 500).map(token => ({
                token: token,
                notification: {
                    title: title || "New Notification",
                    body: message || ""
                },
                data: {
                    type: type,
                    titleKey: titleKey || "",
                    messageKey: messageKey || "",
                    params: JSON.stringify(params || {}),
                    clickAction: JSON.stringify(clickAction || {}),
                    appointmentId: appointmentId || "",
                    ...metadata
                }
            }));

            await admin.messaging().sendEach(messages);
            return { success: true, tokenCount: tokens.length };
        }

        return { success: true, tokenCount: 0 };

    } catch (e) {
        console.error("Consolidated notification failed:", e);
        throw new HttpsError("internal", e.message);
    }
});
