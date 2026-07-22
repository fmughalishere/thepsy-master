import { onDocumentCreated } from "firebase-functions/v2/firestore";
import { logger } from "firebase-functions/v2";
import { db, admin } from "../lib/firebase-admin";

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
export const onNewChatMessage = onDocumentCreated(
  "conversations/{conversationId}/messages/{messageId}",
  async (event) => {
    const snap = event.data;
    if (!snap) return;

    const message = snap.data();
    const conversationId = event.params.conversationId;
    const senderId = message.senderId;

    try {
      const convDoc = await db.doc(`conversations/${conversationId}`).get();
      const occupants: string[] = convDoc.data()?.occupants || [];
      const recipients = occupants.filter((uid) => uid !== senderId);

      if (recipients.length === 0) return;

      const senderDoc = await db.doc(`users/${senderId}`).get();
      const senderName = senderDoc.data()?.name || senderDoc.data()?.displayName || "New message";

      const preview =
        message.messageType === "TEXT"
          ? "You have a new message" // message.message is encrypted client-side, so we don't decrypt/expose it here
          : `Sent a ${(message.messageType || "file").toLowerCase()}`;

      const tokensSnap = await db
        .collection("users")
        .where(admin.firestore.FieldPath.documentId(), "in", recipients.slice(0, 30))
        .get();

      const tokens: string[] = [];
      tokensSnap.forEach((d) => {
        const t = d.data()?.fcmToken;
        if (t) tokens.push(t);
      });

      if (tokens.length > 0) {
        await admin.messaging().sendEachForMulticast({
          tokens,
          notification: { title: senderName, body: preview },
          data: { type: "CHAT", conversationId },
        });
      }

      const batch = db.batch();
      recipients.forEach((uid) => {
        const ref = db.collection("notifications").doc();
        batch.set(ref, {
          userId: uid,
          title: senderName,
          message: preview,
          type: "chat",
          conversationId,
          createdAt: admin.firestore.Timestamp.now(),
          read: false,
        });
      });
      await batch.commit();
    } catch (err) {
      logger.error("onNewChatMessage error:", err);
    }
  }
);
