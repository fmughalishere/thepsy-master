"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paypalWebhook = exports.createPayPalCheckout = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const v2_1 = require("firebase-functions/v2");
const firebase_admin_1 = require("../lib/firebase-admin");
const PAYPAL_CLIENT_ID = (0, params_1.defineSecret)("PAYPAL_CLIENT_ID");
const PAYPAL_CLIENT_SECRET = (0, params_1.defineSecret)("PAYPAL_CLIENT_SECRET");
function paypalApiBase(isSandbox) {
    return isSandbox
        ? "https://api-m.sandbox.paypal.com"
        : "https://api-m.paypal.com";
}
async function getPaypalAccessToken(isSandbox) {
    const base = paypalApiBase(isSandbox);
    const auth = Buffer.from(`${PAYPAL_CLIENT_ID.value()}:${PAYPAL_CLIENT_SECRET.value()}`).toString("base64");
    const res = await fetch(`${base}/v1/oauth2/token`, {
        method: "POST",
        headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
    });
    if (!res.ok) {
        throw new Error(`Failed to get PayPal access token: ${await res.text()}`);
    }
    const data = (await res.json());
    return data.access_token;
}
/**
 * createPayPalCheckout
 * Called from src/hooks/usePayment.ts -> initiatePayment() (PayPal branch).
 *
 * Input:  { planId, planName, planType, amount, currency, paypalPlanId,
 *            successUrl, cancelUrl, isSandbox, couponCode, plusConfig }
 * Output: { url }
 */
exports.createPayPalCheckout = (0, https_1.onCall)({ secrets: [PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET], cors: true }, async (request) => {
    var _a, _b;
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "You must be logged in.");
    }
    const { planId, planName, paypalPlanId, successUrl, cancelUrl, isSandbox, couponCode, plusConfig, } = request.data || {};
    if (!paypalPlanId) {
        throw new https_1.HttpsError("invalid-argument", "paypalPlanId is required.");
    }
    const userId = request.auth.uid;
    const sandbox = !!isSandbox;
    try {
        const accessToken = await getPaypalAccessToken(sandbox);
        const base = paypalApiBase(sandbox);
        const res = await fetch(`${base}/v1/billing/subscriptions`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                plan_id: paypalPlanId,
                custom_id: userId,
                application_context: {
                    brand_name: "ThePsy",
                    return_url: successUrl,
                    cancel_url: cancelUrl,
                    user_action: "SUBSCRIBE_NOW",
                },
            }),
        });
        if (!res.ok) {
            const errText = await res.text();
            v2_1.logger.error("PayPal subscription creation failed:", errText);
            throw new https_1.HttpsError("internal", "Failed to create PayPal subscription.");
        }
        const data = (await res.json());
        const approveLink = (_b = (_a = data.links) === null || _a === void 0 ? void 0 : _a.find((l) => l.rel === "approve")) === null || _b === void 0 ? void 0 : _b.href;
        if (!approveLink) {
            throw new https_1.HttpsError("internal", "No PayPal approval link returned.");
        }
        // Stash the pending subscription so the webhook can match it up on approval.
        await firebase_admin_1.db.doc(`users/${userId}`).set({
            patientDetails: {
                pendingPaypal: {
                    paypalSubscriptionId: data.id,
                    planId: planId || "",
                    planName: planName || "",
                    couponCode: couponCode || "",
                    plusConfig: plusConfig || null,
                    createdAt: new Date().toISOString(),
                },
            },
        }, { merge: true });
        return { url: approveLink };
    }
    catch (err) {
        v2_1.logger.error("createPayPalCheckout error:", err);
        if (err instanceof https_1.HttpsError)
            throw err;
        throw new https_1.HttpsError("internal", err.message || "Failed to create PayPal checkout.");
    }
});
/**
 * paypalWebhook
 * Configure this URL in PayPal Developer Dashboard -> Webhooks.
 * Handles BILLING.SUBSCRIPTION.ACTIVATED and BILLING.SUBSCRIPTION.CANCELLED.
 *
 * NOTE: PayPal webhook signature verification requires calling PayPal's
 * verify-webhook-signature API with the webhook_id (stored in Remote Config
 * as paypal_config.webhook_id / method.webhook_id). Wire that check in before
 * relying on this in production — right now it trusts the payload as-is,
 * which is NOT safe for production use.
 */
exports.paypalWebhook = (0, https_1.onRequest)(async (req, res) => {
    var _a, _b;
    try {
        const event = req.body;
        const eventType = event === null || event === void 0 ? void 0 : event.event_type;
        const resource = event === null || event === void 0 ? void 0 : event.resource;
        if (eventType === "BILLING.SUBSCRIPTION.ACTIVATED") {
            const paypalSubscriptionId = resource === null || resource === void 0 ? void 0 : resource.id;
            const userId = resource === null || resource === void 0 ? void 0 : resource.custom_id;
            if (userId) {
                const userRef = firebase_admin_1.db.doc(`users/${userId}`);
                const userDoc = await userRef.get();
                const pending = (_b = (_a = userDoc.data()) === null || _a === void 0 ? void 0 : _a.patientDetails) === null || _b === void 0 ? void 0 : _b.pendingPaypal;
                await userRef.set({
                    patientDetails: {
                        quotas: {
                            userId,
                            planId: (pending === null || pending === void 0 ? void 0 : pending.planId) || "",
                            planName: (pending === null || pending === void 0 ? void 0 : pending.planName) || "",
                            isActive: true,
                            subscriptionStatus: "ACTIVE",
                            plusConfig: (pending === null || pending === void 0 ? void 0 : pending.plusConfig) || null,
                            willRenew: true,
                            requiresPayment: false,
                            mockPayment: false,
                            paypalSubscriptionId,
                            lastPaymentDate: new Date().toISOString(),
                            nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
                        },
                        pendingPaypal: null,
                    },
                }, { merge: true });
                v2_1.logger.info(`PayPal subscription activated for user ${userId}`);
            }
        }
        if (eventType === "BILLING.SUBSCRIPTION.CANCELLED") {
            const paypalSubscriptionId = resource === null || resource === void 0 ? void 0 : resource.id;
            const usersSnap = await firebase_admin_1.db
                .collection("users")
                .where("patientDetails.quotas.paypalSubscriptionId", "==", paypalSubscriptionId)
                .limit(1)
                .get();
            if (!usersSnap.empty) {
                await usersSnap.docs[0].ref.set({
                    patientDetails: {
                        quotas: { isActive: false, subscriptionStatus: "CANCELLED" },
                    },
                }, { merge: true });
            }
        }
        res.status(200).send({ received: true });
    }
    catch (err) {
        v2_1.logger.error("paypalWebhook error:", err);
        res.status(500).send("Webhook handler error");
    }
});
//# sourceMappingURL=paypal.js.map