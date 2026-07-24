const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

// Helper to get config from env or legacy config (same pattern as index.js)
function getConfig(envKey, legacyPath) {
  if (process.env[envKey]) return process.env[envKey];
  try {
    const functions = require("firebase-functions");
    const config = functions.config();
    const parts = legacyPath.split('.');
    let value = config;
    for (const part of parts) value = value?.[part];
    return value;
  } catch (e) {
    return null;
  }
}

// Initialize Stripe lazily (self-contained, same pattern as index.js)
let stripeCache = null;
function getStripe() {
  if (stripeCache) return stripeCache;
  const stripeKey = getConfig("SECRET_STRIPE_LIVE_KEY", "stripe.secret_key") || getConfig("STRIPE_SECRET_KEY", "stripe.secret_key");
  if (!stripeKey) {
    console.warn("⚠️  Stripe secret key not found. Stripe functions may fail.");
    return null;
  }
  stripeCache = require('stripe')(stripeKey);
  return stripeCache;
}

/**
 * cancelSubscription
 * Immediately cancels the authenticated user's active Stripe subscription
 * and updates their Firestore record.
 *
 * Expects: request.data = { subscriptionId?: string }
 * If subscriptionId is not passed, it is read from the user's Firestore doc
 * (field: stripeSubscriptionId).
 */
exports.cancelSubscription = onCall({
  secrets: ["SECRET_STRIPE_LIVE_KEY", "SECRET_STRIPE_TEST_KEY"]
}, async (request) => {
  const stripe = getStripe();
  if (!stripe) throw new HttpsError("failed-precondition", "Stripe not configured");

  if (!request.auth || !request.auth.uid) {
    throw new HttpsError("unauthenticated", "You must be logged in to cancel a subscription");
  }

  const uid = request.auth.uid;
  const db = admin.firestore();

  try {
    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();

    if (!userSnap.exists) {
      throw new HttpsError("not-found", "User record not found");
    }

    const userData = userSnap.data();
    const subscriptionId = request.data?.subscriptionId || userData.stripeSubscriptionId;

    if (!subscriptionId) {
      throw new HttpsError("failed-precondition", "No active subscription found for this user");
    }

    // Immediate cancellation
    const cancelledSubscription = await stripe.subscriptions.cancel(subscriptionId);

    await userRef.update({
      subscriptionStatus: "cancelled",
      stripeSubscriptionId: admin.firestore.FieldValue.delete(),
      subscriptionCancelledAt: admin.firestore.FieldValue.serverTimestamp(),
      currentPlan: null,
    });

    return {
      success: true,
      subscriptionId: cancelledSubscription.id,
      status: cancelledSubscription.status,
    };

  } catch (error) {
    console.error("Error cancelling subscription:", error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", "Failed to cancel subscription: " + error.message);
  }
});