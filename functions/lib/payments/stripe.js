"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkSubscriptionStatus = exports.cancelSubscription = exports.stripeWebhook = exports.createCheckoutSession = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const v2_1 = require("firebase-functions/v2");
const stripe_1 = __importDefault(require("stripe"));
const firebase_admin_1 = require("../lib/firebase-admin");
const STRIPE_SECRET_KEY = (0, params_1.defineSecret)("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = (0, params_1.defineSecret)("STRIPE_WEBHOOK_SECRET");
function getStripe(key) {
    return new stripe_1.default(key, { apiVersion: "2023-10-16" });
}
function mapStripeError(err) {
    if (err instanceof https_1.HttpsError)
        return err;
    const stripeType = err === null || err === void 0 ? void 0 : err.type;
    const stripeCode = err === null || err === void 0 ? void 0 : err.code;
    if (stripeType === "StripeInvalidRequestError" && stripeCode === "resource_missing") {
        v2_1.logger.error("Stripe resource_missing (likely price/mode mismatch):", err);
        return new https_1.HttpsError("failed-precondition", "This plan isn't available for checkout right now. Please try a different plan or contact support.");
    }
    if (stripeType === "StripeCardError") {
        return new https_1.HttpsError("failed-precondition", err.message || "Your card was declined.");
    }
    if (stripeType === "StripeInvalidRequestError") {
        v2_1.logger.error("Stripe invalid request:", err);
        return new https_1.HttpsError("invalid-argument", "There was a problem with the checkout request. Please try again or contact support.");
    }
    if (stripeType === "StripeAPIError" || stripeType === "StripeConnectionError") {
        v2_1.logger.error("Stripe API/connection error:", err);
        return new https_1.HttpsError("unavailable", "Payment provider is temporarily unavailable. Please try again shortly.");
    }
    v2_1.logger.error("Unhandled error in Stripe function:", err);
    return new https_1.HttpsError("internal", (err === null || err === void 0 ? void 0 : err.message) || "Failed to process payment request.");
}
exports.createCheckoutSession = (0, https_1.onCall)({ secrets: [STRIPE_SECRET_KEY], cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "You must be logged in.");
    }
    const { planId, priceId, planName, mode, successUrl, cancelUrl, couponCode, plusConfig, selectedAddons, } = request.data || {};
    if (!priceId || typeof priceId !== "string") {
        throw new https_1.HttpsError("invalid-argument", "priceId is required.");
    }
    if (!successUrl || !cancelUrl) {
        throw new https_1.HttpsError("invalid-argument", "successUrl and cancelUrl are required.");
    }
    if (selectedAddons !== undefined && !Array.isArray(selectedAddons)) {
        throw new https_1.HttpsError("invalid-argument", "selectedAddons must be an array.");
    }
    const stripe = getStripe(STRIPE_SECRET_KEY.value());
    const userId = request.auth.uid;
    const stripeMode = mode === "one_time" ? "payment" : "subscription";
    try {
        const session = await stripe.checkout.sessions.create({
            mode: stripeMode,
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: successUrl,
            cancel_url: cancelUrl,
            client_reference_id: userId,
            customer_email: request.auth.token.email,
            metadata: {
                userId,
                planId: planId || "",
                planName: planName || "",
                couponCode: couponCode || "",
                plusConfig: plusConfig ? JSON.stringify(plusConfig) : "",
                selectedAddons: selectedAddons ? JSON.stringify(selectedAddons) : "",
            },
        });
        if (!session.url) {
            throw new https_1.HttpsError("unavailable", "Stripe did not return a checkout URL. Please try again.");
        }
        return { url: session.url };
    }
    catch (err) {
        throw mapStripeError(err);
    }
});
exports.stripeWebhook = (0, https_1.onRequest)({ secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET], cors: false }, async (req, res) => {
    var _a, _b, _c, _d, _e;
    const stripe = getStripe(STRIPE_SECRET_KEY.value());
    const sig = req.headers["stripe-signature"];
    let event;
    try {
        event = stripe.webhooks.constructEvent(req.rawBody, sig, STRIPE_WEBHOOK_SECRET.value());
    }
    catch (err) {
        v2_1.logger.error("Webhook signature verification failed:", err.message);
        res.status(400).send(`Webhook Error: ${err.message}`);
        return;
    }
    try {
        switch (event.type) {
            case "checkout.session.completed": {
                const session = event.data.object;
                const userId = ((_a = session.metadata) === null || _a === void 0 ? void 0 : _a.userId) || session.client_reference_id;
                if (!userId) {
                    v2_1.logger.error("No userId on checkout session metadata:", session.id);
                    break;
                }
                const planId = ((_b = session.metadata) === null || _b === void 0 ? void 0 : _b.planId) || "";
                const planName = ((_c = session.metadata) === null || _c === void 0 ? void 0 : _c.planName) || "";
                const plusConfig = ((_d = session.metadata) === null || _d === void 0 ? void 0 : _d.plusConfig)
                    ? JSON.parse(session.metadata.plusConfig)
                    : null;
                const selectedAddons = ((_e = session.metadata) === null || _e === void 0 ? void 0 : _e.selectedAddons)
                    ? JSON.parse(session.metadata.selectedAddons)
                    : [];
                await firebase_admin_1.db.doc(`users/${userId}`).set({
                    patientDetails: {
                        quotas: {
                            userId,
                            planId,
                            planName,
                            isActive: true,
                            subscriptionStatus: session.mode === "subscription" ? "ACTIVE" : "ACTIVE",
                            plusConfig,
                            selectedAddons,
                            currency: "EUR",
                            willRenew: session.mode === "subscription",
                            requiresPayment: false,
                            mockPayment: false,
                            stripeCustomerId: session.customer,
                            stripeSubscriptionId: session.subscription || null,
                            lastPaymentDate: new Date().toISOString(),
                            nextBillingDate: session.mode === "subscription"
                                ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
                                : null,
                        },
                    },
                }, { merge: true });
                v2_1.logger.info(`Activated plan ${planId} for user ${userId}`);
                break;
            }
            case "customer.subscription.deleted": {
                const sub = event.data.object;
                const usersSnap = await firebase_admin_1.db
                    .collection("users")
                    .where("patientDetails.quotas.stripeSubscriptionId", "==", sub.id)
                    .limit(1)
                    .get();
                if (!usersSnap.empty) {
                    await usersSnap.docs[0].ref.set({
                        patientDetails: {
                            quotas: { isActive: false, subscriptionStatus: "CANCELLED" },
                        },
                    }, { merge: true });
                }
                break;
            }
            case "invoice.payment_failed": {
                const invoice = event.data.object;
                v2_1.logger.warn(`Payment failed for invoice ${invoice.id}, customer ${invoice.customer}`);
                break;
            }
            default:
                v2_1.logger.info(`Unhandled Stripe event type: ${event.type}`);
        }
        res.status(200).send({ received: true });
    }
    catch (err) {
        v2_1.logger.error("Error processing Stripe webhook:", err);
        res.status(500).send("Webhook handler error");
    }
});
exports.cancelSubscription = (0, https_1.onCall)({ secrets: [STRIPE_SECRET_KEY], cors: true }, async (request) => {
    var _a, _b, _c;
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "You must be logged in.");
    }
    const userId = request.auth.uid;
    const userDoc = await firebase_admin_1.db.doc(`users/${userId}`).get();
    const stripeSubscriptionId = (_c = (_b = (_a = userDoc.data()) === null || _a === void 0 ? void 0 : _a.patientDetails) === null || _b === void 0 ? void 0 : _b.quotas) === null || _c === void 0 ? void 0 : _c.stripeSubscriptionId;
    if (!stripeSubscriptionId) {
        throw new https_1.HttpsError("failed-precondition", "No active Stripe subscription found.");
    }
    const stripe = getStripe(STRIPE_SECRET_KEY.value());
    try {
        await stripe.subscriptions.update(stripeSubscriptionId, {
            cancel_at_period_end: true,
        });
        await userDoc.ref.set({
            patientDetails: {
                quotas: {
                    subscriptionStatus: "CANCELLED",
                    willRenew: false,
                },
            },
        }, { merge: true });
        return { success: true };
    }
    catch (err) {
        throw mapStripeError(err);
    }
});
exports.checkSubscriptionStatus = (0, https_1.onCall)({ secrets: [STRIPE_SECRET_KEY], cors: true }, async (request) => {
    var _a, _b, _c;
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "You must be logged in.");
    }
    const userId = request.auth.uid;
    const userDoc = await firebase_admin_1.db.doc(`users/${userId}`).get();
    const stripeSubscriptionId = (_c = (_b = (_a = userDoc.data()) === null || _a === void 0 ? void 0 : _a.patientDetails) === null || _b === void 0 ? void 0 : _b.quotas) === null || _c === void 0 ? void 0 : _c.stripeSubscriptionId;
    if (!stripeSubscriptionId) {
        return { isActive: false, status: "NONE" };
    }
    const stripe = getStripe(STRIPE_SECRET_KEY.value());
    try {
        const sub = await stripe.subscriptions.retrieve(stripeSubscriptionId);
        return {
            isActive: sub.status === "active" || sub.status === "trialing",
            status: sub.status,
            currentPeriodEnd: sub.current_period_end,
        };
    }
    catch (err) {
        throw mapStripeError(err);
    }
});
void firebase_admin_1.authAdmin;
//# sourceMappingURL=stripe.js.map