import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import { db, authAdmin } from "./lib/firebase-admin";

// ---- Payments ----
export {
  createCheckoutSession,
  stripeWebhook,
  cancelSubscription,
  checkSubscriptionStatus,
} from "./payments/stripe";

// TEMPORARILY DISABLED: no PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET secrets
// exist yet in Secret Manager for this project. Uncomment once those are
// created (see REBUILD_README.md) — otherwise deploy will fail trying to
// bind secrets that don't exist.
// export { createPayPalCheckout, paypalWebhook } from "./payments/paypal";

// ---- Video (100ms) ----
// TEMPORARILY DISABLED: no HMS_ACCESS_KEY / HMS_SECRET / HMS_TEMPLATE_ID
// secrets exist yet. Uncomment once those are created.
// export { generate100msToken } from "./video/hms";

// ---- Notifications ----
export {
  createAndSendNotification,
  sendPushNotification,
  sendGlobalPushNotification,
  sendPushNotificationByRole,
} from "./notifications/notify";

// ---- Chat ----
export { onNewChatMessage } from "./chat/onNewChatMessage";

// ---- Quotas ----
export { resetMonthlyQuotas } from "./quotas/resetMonthlyQuotas";

// ---- Existing function (kept exactly as it was, still deployed & working) ----
const WEB_API_KEY = defineSecret("WEB_API_KEY");

export const adminSendUserEmailVerification = onCall(
  { secrets: [WEB_API_KEY], cors: true },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be logged in.");
    }

    const callerDoc = await db.collection("users").doc(request.auth.uid).get();
    if (callerDoc.data()?.role !== "ADMIN") {
      throw new HttpsError("permission-denied", "Only admins can send verification emails.");
    }

    const targetUserId = request.data.targetUserId;
    if (!targetUserId || typeof targetUserId !== "string") {
      throw new HttpsError("invalid-argument", "targetUserId is required.");
    }

    const user = await authAdmin.getUser(targetUserId);
    if (user.emailVerified) {
      return { alreadyVerified: true };
    }
    if (!user.email) {
      throw new HttpsError("failed-precondition", "User has no email.");
    }

    const apiKey = WEB_API_KEY.value();
    try {
      const customToken = await authAdmin.createCustomToken(targetUserId);
      const signInRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token: customToken, returnSecureToken: true }),
        }
      );
      if (!signInRes.ok) {
        logger.error(await signInRes.text());
        throw new HttpsError("internal", "Failed to obtain ID token.");
      }
      const signInData: any = await signInRes.json();
      const sendRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestType: "VERIFY_EMAIL", idToken: signInData.idToken }),
        }
      );
      if (!sendRes.ok) {
        logger.error(await sendRes.text());
        throw new HttpsError("internal", "Failed to send verification email.");
      }
      logger.info(`Verification email sent to ${user.email}`);
      return { success: true };
    } catch (err: any) {
      logger.error(err);
      if (err instanceof HttpsError) throw err;
      throw new HttpsError("internal", err?.message || "Unknown error");
    }
  }
);
