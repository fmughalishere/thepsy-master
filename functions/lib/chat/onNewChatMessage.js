"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onNewChatMessage = void 0;
const firestore_1 = require("firebase-functions/v2/firestore");
const v2_1 = require("firebase-functions/v2");
const firebase_admin_1 = require("../lib/firebase-admin");
/**
 * onNewChatMessage
 * Firestore trigger on conversations/{conversationId}/messages/{messageId}
 * (matches the path used in src/pages/Chat.tsx: addDoc(collection(db, "conversations", sessionId, "messages"), ...))
 *
 * Notifies the other occupant(s) of the conversation (conversations/{conversationId}.occupants)
 * via FCM push + writes a lightweight "notifications" doc, unless the reader is
 * already viewing the conversation (not tracked server-side here — the frontend's
 * ChatNotificationContext handles unread badges client-side; this just handles push).
 */
exports.onNewChatMessage = (0, firestore_1.onDocumentCreated)("conversations/{conversationId}/messages/{messageId}", async (event) => {
    var _a, _b, _c;
    const snap = event.data;
    if (!snap)
        return;
    const message = snap.data();
    const conversationId = event.params.conversationId;
    const senderId = message.senderId;
    try {
        const convDoc = await firebase_admin_1.db.doc(`conversations/${conversationId}`).get();
        const occupants = ((_a = convDoc.data()) === null || _a === void 0 ? void 0 : _a.occupants) || [];
        const recipients = occupants.filter((uid) => uid !== senderId);
        if (recipients.length === 0)
            return;
        const senderDoc = await firebase_admin_1.db.doc(`users/${senderId}`).get();
        const senderName = ((_b = senderDoc.data()) === null || _b === void 0 ? void 0 : _b.name) || ((_c = senderDoc.data()) === null || _c === void 0 ? void 0 : _c.displayName) || "New message";
        const preview = message.messageType === "TEXT"
            ? "You have a new message" // message.message is encrypted client-side, so we don't decrypt/expose it here
            : `Sent a ${(message.messageType || "file").toLowerCase()}`;
        const tokensSnap = await firebase_admin_1.db
            .collection("users")
            .where(firebase_admin_1.admin.firestore.FieldPath.documentId(), "in", recipients.slice(0, 30))
            .get();
        const tokens = [];
        tokensSnap.forEach((d) => {
            var _a;
            const t = (_a = d.data()) === null || _a === void 0 ? void 0 : _a.fcmToken;
            if (t)
                tokens.push(t);
        });
        if (tokens.length > 0) {
            await firebase_admin_1.admin.messaging().sendEachForMulticast({
                tokens,
                notification: { title: senderName, body: preview },
                data: { type: "CHAT", conversationId },
            });
        }
        const batch = firebase_admin_1.db.batch();
        recipients.forEach((uid) => {
            const ref = firebase_admin_1.db.collection("notifications").doc();
            batch.set(ref, {
                userId: uid,
                title: senderName,
                message: preview,
                type: "chat",
                conversationId,
                createdAt: firebase_admin_1.admin.firestore.Timestamp.now(),
                read: false,
            });
        });
        await batch.commit();
    }
    catch (err) {
        v2_1.logger.error("onNewChatMessage error:", err);
    }
});
//# sourceMappingURL=onNewChatMessage.js.map