"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminSendUserEmailVerification = exports.resetMonthlyQuotas = exports.onNewChatMessage = exports.sendPushNotificationByRole = exports.sendGlobalPushNotification = exports.sendPushNotification = exports.createAndSendNotification = exports.checkSubscriptionStatus = exports.cancelSubscription = exports.stripeWebhook = exports.createCheckoutSession = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const v2_1 = require("firebase-functions/v2");
const firebase_admin_1 = require("./lib/firebase-admin");
// ---- Payments ----
var stripe_1 = require("./payments/stripe");
Object.defineProperty(exports, "createCheckoutSession", { enumerable: true, get: function () { return stripe_1.createCheckoutSession; } });
Object.defineProperty(exports, "stripeWebhook", { enumerable: true, get: function () { return stripe_1.stripeWebhook; } });
Object.defineProperty(exports, "cancelSubscription", { enumerable: true, get: function () { return stripe_1.cancelSubscription; } });
Object.defineProperty(exports, "checkSubscriptionStatus", { enumerable: true, get: function () { return stripe_1.checkSubscriptionStatus; } });
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
var notify_1 = require("./notifications/notify");
Object.defineProperty(exports, "createAndSendNotification", { enumerable: true, get: function () { return notify_1.createAndSendNotification; } });
Object.defineProperty(exports, "sendPushNotification", { enumerable: true, get: function () { return notify_1.sendPushNotification; } });
Object.defineProperty(exports, "sendGlobalPushNotification", { enumerable: true, get: function () { return notify_1.sendGlobalPushNotification; } });
Object.defineProperty(exports, "sendPushNotificationByRole", { enumerable: true, get: function () { return notify_1.sendPushNotificationByRole; } });
// ---- Chat ----
var onNewChatMessage_1 = require("./chat/onNewChatMessage");
Object.defineProperty(exports, "onNewChatMessage", { enumerable: true, get: function () { return onNewChatMessage_1.onNewChatMessage; } });
// ---- Quotas ----
var resetMonthlyQuotas_1 = require("./quotas/resetMonthlyQuotas");
Object.defineProperty(exports, "resetMonthlyQuotas", { enumerable: true, get: function () { return resetMonthlyQuotas_1.resetMonthlyQuotas; } });
// ---- Existing function (kept exactly as it was, still deployed & working) ----
const WEB_API_KEY = (0, params_1.defineSecret)("WEB_API_KEY");
exports.adminSendUserEmailVerification = (0, https_1.onCall)({ secrets: [WEB_API_KEY], cors: true }, async (request) => {
    var _a;
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "You must be logged in.");
    }
    const callerDoc = await firebase_admin_1.db.collection("users").doc(request.auth.uid).get();
    if (((_a = callerDoc.data()) === null || _a === void 0 ? void 0 : _a.role) !== "ADMIN") {
        throw new https_1.HttpsError("permission-denied", "Only admins can send verification emails.");
    }
    const targetUserId = request.data.targetUserId;
    if (!targetUserId || typeof targetUserId !== "string") {
        throw new https_1.HttpsError("invalid-argument", "targetUserId is required.");
    }
    const user = await firebase_admin_1.authAdmin.getUser(targetUserId);
    if (user.emailVerified) {
        return { alreadyVerified: true };
    }
    if (!user.email) {
        throw new https_1.HttpsError("failed-precondition", "User has no email.");
    }
    const apiKey = WEB_API_KEY.value();
    try {
        const customToken = await firebase_admin_1.authAdmin.createCustomToken(targetUserId);
        const signInRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ token: customToken, returnSecureToken: true }),
        });
        if (!signInRes.ok) {
            v2_1.logger.error(await signInRes.text());
            throw new https_1.HttpsError("internal", "Failed to obtain ID token.");
        }
        const signInData = await signInRes.json();
        const sendRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ requestType: "VERIFY_EMAIL", idToken: signInData.idToken }),
        });
        if (!sendRes.ok) {
            v2_1.logger.error(await sendRes.text());
            throw new https_1.HttpsError("internal", "Failed to send verification email.");
        }
        v2_1.logger.info(`Verification email sent to ${user.email}`);
        return { success: true };
    }
    catch (err) {
        v2_1.logger.error(err);
        if (err instanceof https_1.HttpsError)
            throw err;
        throw new https_1.HttpsError("internal", (err === null || err === void 0 ? void 0 : err.message) || "Unknown error");
    }
});
//# sourceMappingURL=index.js.map