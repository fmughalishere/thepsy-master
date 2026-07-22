"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sendPushNotificationByRole = exports.sendGlobalPushNotification = exports.sendPushNotification = exports.createAndSendNotification = void 0;
const https_1 = require("firebase-functions/v2/https");
const v2_1 = require("firebase-functions/v2");
const firebase_admin_1 = require("../lib/firebase-admin");
async function getFcmTokensForUsers(userIds) {
    if (userIds.length === 0)
        return [];
    const tokens = [];
    // Firestore 'in' queries max out at 30 items per query.
    const chunks = [];
    for (let i = 0; i < userIds.length; i += 30) {
        chunks.push(userIds.slice(i, i + 30));
    }
    for (const chunk of chunks) {
        const snap = await firebase_admin_1.db
            .collection("users")
            .where(firebase_admin_1.admin.firestore.FieldPath.documentId(), "in", chunk)
            .get();
        snap.forEach((doc) => {
            var _a;
            const t = (_a = doc.data()) === null || _a === void 0 ? void 0 : _a.fcmToken;
            if (t)
                tokens.push(t);
        });
    }
    return tokens;
}
async function sendToTokens(tokens, title, body, data) {
    if (tokens.length === 0)
        return { successCount: 0, failureCount: 0 };
    const message = {
        tokens,
        notification: { title, body },
        data: data || {},
    };
    const res = await firebase_admin_1.admin.messaging().sendEachForMulticast(message);
    return { successCount: res.successCount, failureCount: res.failureCount };
}
/**
 * createAndSendNotification
 * Called from src/lib/firebase-functions.ts across Calendar.tsx, Profile.tsx,
 * SignUp.tsx, CompleteTherapistProfile.tsx, AdminUserDetails.tsx.
 *
 * Writes a notification doc to Firestore ("notifications" collection) AND
 * sends a push via FCM to the relevant users/roles/global audience.
 */
exports.createAndSendNotification = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "You must be logged in.");
    }
    const data = request.data;
    if (!(data === null || data === void 0 ? void 0 : data.title) || !(data === null || data === void 0 ? void 0 : data.message)) {
        throw new https_1.HttpsError("invalid-argument", "title and message are required.");
    }
    try {
        // 1. Persist notification record(s)
        const baseDoc = {
            title: data.title,
            message: data.message,
            titleKey: data.titleKey || null,
            messageKey: data.messageKey || null,
            params: data.params || null,
            type: data.type || "general",
            appointmentId: data.appointmentId || null,
            clickAction: data.clickAction || null,
            createdAt: firebase_admin_1.admin.firestore.Timestamp.now(),
            read: false,
        };
        let recipientUserIds = [];
        if (data.global) {
            await firebase_admin_1.db.collection("global_notifications").add(baseDoc);
            // For a true "global" push you'd send to an FCM topic all clients subscribe to.
            await firebase_admin_1.admin.messaging().send({
                topic: "all_users",
                notification: { title: data.title, body: data.message },
            });
            return { success: true, scope: "global" };
        }
        if (data.targetRoles && data.targetRoles.length > 0) {
            const usersSnap = await firebase_admin_1.db
                .collection("users")
                .where("role", "in", data.targetRoles)
                .get();
            recipientUserIds = usersSnap.docs.map((d) => d.id);
        }
        else if (data.targetUserIds && data.targetUserIds.length > 0) {
            recipientUserIds = data.targetUserIds;
        }
        else if (data.userId) {
            recipientUserIds = [data.userId];
        }
        if (recipientUserIds.length === 0) {
            throw new https_1.HttpsError("invalid-argument", "Provide targetUserIds, targetRoles, userId, or global: true.");
        }
        const batch = firebase_admin_1.db.batch();
        recipientUserIds.forEach((uid) => {
            const ref = firebase_admin_1.db.collection("notifications").doc();
            batch.set(ref, { ...baseDoc, userId: uid });
        });
        await batch.commit();
        const tokens = await getFcmTokensForUsers(recipientUserIds);
        const pushResult = await sendToTokens(tokens, data.title, data.message, data.metadata);
        return { success: true, recipientCount: recipientUserIds.length, pushResult };
    }
    catch (err) {
        v2_1.logger.error("createAndSendNotification error:", err);
        if (err instanceof https_1.HttpsError)
            throw err;
        throw new https_1.HttpsError("internal", err.message || "Failed to send notification.");
    }
});
/** sendPushNotification: push to a single user by userId */
exports.sendPushNotification = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "You must be logged in.");
    }
    const { userId, title, body, data } = request.data || {};
    if (!userId || !title || !body) {
        throw new https_1.HttpsError("invalid-argument", "userId, title, and body are required.");
    }
    const tokens = await getFcmTokensForUsers([userId]);
    const result = await sendToTokens(tokens, title, body, data);
    return { success: true, ...result };
});
/** sendGlobalPushNotification: push to the 'all_users' FCM topic */
exports.sendGlobalPushNotification = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "You must be logged in.");
    }
    const { title, body } = request.data || {};
    if (!title || !body) {
        throw new https_1.HttpsError("invalid-argument", "title and body are required.");
    }
    await firebase_admin_1.admin.messaging().send({
        topic: "all_users",
        notification: { title, body },
    });
    return { success: true };
});
/** sendPushNotificationByRole: push to every user with a given Firestore role */
exports.sendPushNotificationByRole = (0, https_1.onCall)({ cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "You must be logged in.");
    }
    const { role, title, body, data } = request.data || {};
    if (!role || !title || !body) {
        throw new https_1.HttpsError("invalid-argument", "role, title, and body are required.");
    }
    const usersSnap = await firebase_admin_1.db.collection("users").where("role", "==", role).get();
    const userIds = usersSnap.docs.map((d) => d.id);
    const tokens = await getFcmTokensForUsers(userIds);
    const result = await sendToTokens(tokens, title, body, data);
    return { success: true, recipientCount: userIds.length, ...result };
});
//# sourceMappingURL=notify.js.map