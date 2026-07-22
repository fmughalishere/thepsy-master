import { onCall, HttpsError } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";
import { db, admin } from "../lib/firebase-admin";

interface NotifyInput {
  title: string;
  message: string;
  titleKey?: string;
  messageKey?: string;
  params?: Record<string, any>;
  type?: string;
  targetUserIds?: string[];
  targetRoles?: string[];
  global?: boolean;
  appointmentId?: string;
  userId?: string;
  metadata?: Record<string, string>;
  clickAction?: { type: "PROFILE" | "APPOINTMENT" | "URL"; id?: string; url?: string };
}

async function getFcmTokensForUsers(userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const tokens: string[] = [];
  // Firestore 'in' queries max out at 30 items per query.
  const chunks: string[][] = [];
  for (let i = 0; i < userIds.length; i += 30) {
    chunks.push(userIds.slice(i, i + 30));
  }
  for (const chunk of chunks) {
    const snap = await db
      .collection("users")
      .where(admin.firestore.FieldPath.documentId(), "in", chunk)
      .get();
    snap.forEach((doc) => {
      const t = doc.data()?.fcmToken;
      if (t) tokens.push(t);
    });
  }
  return tokens;
}

async function sendToTokens(tokens: string[], title: string, body: string, data?: Record<string, string>) {
  if (tokens.length === 0) return { successCount: 0, failureCount: 0 };
  const message: admin.messaging.MulticastMessage = {
    tokens,
    notification: { title, body },
    data: data || {},
  };
  const res = await admin.messaging().sendEachForMulticast(message);
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
export const createAndSendNotification = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be logged in.");
  }

  const data = request.data as NotifyInput;
  if (!data?.title || !data?.message) {
    throw new HttpsError("invalid-argument", "title and message are required.");
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
      createdAt: admin.firestore.Timestamp.now(),
      read: false,
    };

    let recipientUserIds: string[] = [];

    if (data.global) {
      await db.collection("global_notifications").add(baseDoc);
      // For a true "global" push you'd send to an FCM topic all clients subscribe to.
      await admin.messaging().send({
        topic: "all_users",
        notification: { title: data.title, body: data.message },
      });
      return { success: true, scope: "global" };
    }

    if (data.targetRoles && data.targetRoles.length > 0) {
      const usersSnap = await db
        .collection("users")
        .where("role", "in", data.targetRoles)
        .get();
      recipientUserIds = usersSnap.docs.map((d) => d.id);
    } else if (data.targetUserIds && data.targetUserIds.length > 0) {
      recipientUserIds = data.targetUserIds;
    } else if (data.userId) {
      recipientUserIds = [data.userId];
    }

    if (recipientUserIds.length === 0) {
      throw new HttpsError(
        "invalid-argument",
        "Provide targetUserIds, targetRoles, userId, or global: true."
      );
    }

    const batch = db.batch();
    recipientUserIds.forEach((uid) => {
      const ref = db.collection("notifications").doc();
      batch.set(ref, { ...baseDoc, userId: uid });
    });
    await batch.commit();

    const tokens = await getFcmTokensForUsers(recipientUserIds);
    const pushResult = await sendToTokens(tokens, data.title, data.message, data.metadata);

    return { success: true, recipientCount: recipientUserIds.length, pushResult };
  } catch (err: any) {
    logger.error("createAndSendNotification error:", err);
    if (err instanceof HttpsError) throw err;
    throw new HttpsError("internal", err.message || "Failed to send notification.");
  }
});

/** sendPushNotification: push to a single user by userId */
export const sendPushNotification = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be logged in.");
  }
  const { userId, title, body, data } = request.data || {};
  if (!userId || !title || !body) {
    throw new HttpsError("invalid-argument", "userId, title, and body are required.");
  }
  const tokens = await getFcmTokensForUsers([userId]);
  const result = await sendToTokens(tokens, title, body, data);
  return { success: true, ...result };
});

/** sendGlobalPushNotification: push to the 'all_users' FCM topic */
export const sendGlobalPushNotification = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be logged in.");
  }
  const { title, body } = request.data || {};
  if (!title || !body) {
    throw new HttpsError("invalid-argument", "title and body are required.");
  }
  await admin.messaging().send({
    topic: "all_users",
    notification: { title, body },
  });
  return { success: true };
});

/** sendPushNotificationByRole: push to every user with a given Firestore role */
export const sendPushNotificationByRole = onCall({ cors: true }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be logged in.");
  }
  const { role, title, body, data } = request.data || {};
  if (!role || !title || !body) {
    throw new HttpsError("invalid-argument", "role, title, and body are required.");
  }
  const usersSnap = await db.collection("users").where("role", "==", role).get();
  const userIds = usersSnap.docs.map((d) => d.id);
  const tokens = await getFcmTokensForUsers(userIds);
  const result = await sendToTokens(tokens, title, body, data);
  return { success: true, recipientCount: userIds.length, ...result };
});
