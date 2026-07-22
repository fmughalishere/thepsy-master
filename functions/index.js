const { onCall } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const admin = require("firebase-admin");

// Set global region to Europe for GDPR compliance
setGlobalOptions({ region: "europe-west1" });

// Helper to get config from env or legacy config
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

// Initialize Stripe lazily
let stripeCache = null;
function getStripe() {
  if (stripeCache) return stripeCache;
  const stripeKey = getConfig("SECRET_STRIPE_LIVE_KEY", "stripe.secret_key") || getConfig("STRIPE_SECRET_KEY", "stripe.secret_key");
  if (!stripeKey) {
    console.warn("⚠️  Stripe secret key not found. Stripe functions may fail.");
    return null;
  }
  stripeCache = require('stripe')(stripeKey);
  console.log("✅ Stripe initialized successfully");
  return stripeCache;
}

admin.initializeApp();

// Export Stripe subscription functions
const {
  createCheckoutSession,
  stripeWebhook,
  checkSubscriptionStatus,
  resetMonthlyQuotas
} = require('./stripeSubscriptions');

exports.createCheckoutSession = createCheckoutSession;
exports.stripeWebhook = stripeWebhook;
exports.checkSubscriptionStatus = checkSubscriptionStatus;
exports.resetMonthlyQuotas = resetMonthlyQuotas;

// Export HTTP webhook for Stripe
const { stripeWebhookHttp } = require('./stripeWebhookHttp');
exports.stripeWebhookHttp = stripeWebhookHttp;

// PayPal integration exports
const { createPayPalCheckout, paypalWebhook } = require('./paypalIntegration');
exports.createPayPalCheckout = createPayPalCheckout;
exports.paypalWebhook = paypalWebhook;

/**
 * Create Stripe PaymentIntent
 */
exports.createPaymentIntent = onCall({ 
  secrets: ["SECRET_STRIPE_LIVE_KEY", "SECRET_STRIPE_TEST_KEY"] 
}, async (request) => {
  const stripe = getStripe();
  if (!stripe) throw new Error("Stripe not configured");
  try {
    const { amount, currency, planId, customerId } = request.data;

    if (!amount || !currency || !planId) {
      throw new Error("Amount, currency, and planId are required");
    }

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      currency: currency,
      customer: customerId || undefined,
      metadata: {
        planId: planId,
        userId: (request.auth && request.auth.uid) || 'anonymous'
      },
      automatic_payment_methods: {
        enabled: true
      }
    });

    return {
      success: true,
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret
    };

  } catch (error) {
    console.error("Error creating PaymentIntent:", error);
    throw new Error("Failed to create PaymentIntent: " + error.message);
  }
});

/**
 * Send push notification to specific users
 */
exports.sendPushNotification = onCall(async (request) => {
  try {
    const { userIds, title, body, data: notificationData = {} } = request.data;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      throw new Error("User IDs array is required and must not be empty");
    }

    if (!title || !body) {
      throw new Error("Title and body are required");
    }

    const usersRef = admin.firestore().collection("users");
    const userDocs = await usersRef.where("uid", "in", userIds).get();

    if (userDocs.empty) {
      return { success: true, message: "No users found", sentCount: 0 };
    }

    const tokens = [];
    userDocs.forEach((doc) => {
      const userData = doc.data();
      if (userData.fcmTokens && Array.isArray(userData.fcmTokens)) {
        tokens.push(...userData.fcmTokens);
      }
      if (userData.fcmToken && !tokens.includes(userData.fcmToken)) {
        tokens.push(userData.fcmToken);
      }
    });

    if (tokens.length === 0) {
      return { success: true, message: "No FCM tokens found", sentCount: 0 };
    }

    const messages = tokens.map(token => ({
      token: token,
      notification: { title, body },
      data: notificationData
    }));

    const response = await admin.messaging().sendEach(messages);

    if (response.failureCount > 0) {
      const failedTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) failedTokens.push(tokens[idx]);
      });
      if (failedTokens.length > 0) {
        await cleanupFailedTokens(failedTokens, userIds);
      }
    }

    return {
      success: true,
      sentCount: response.successCount,
      failureCount: response.failureCount,
    };
  } catch (error) {
    console.error("Error sending push notification:", error);
    throw new Error("Failed to send push notification: " + error.message);
  }
});

/**
 * Send global push notification
 */
exports.sendGlobalPushNotification = onCall(async (request) => {
  try {
    const { title, body, data: notificationData = {} } = request.data;

    if (!title || !body) {
      throw new Error("Title and body are required");
    }

    const usersRef = admin.firestore().collection("users");
    const userDocs = await usersRef.where("fcmTokens", "!=", null).get();

    if (userDocs.empty) {
      return { success: true, message: "No users with FCM tokens found", sentCount: 0 };
    }

    const tokens = [];
    userDocs.forEach((doc) => {
      const userData = doc.data();
      if (userData.fcmTokens && Array.isArray(userData.fcmTokens)) {
        tokens.push(...userData.fcmTokens);
      }
      if (userData.fcmToken && !tokens.includes(userData.fcmToken)) {
        tokens.push(userData.fcmToken);
      }
    });

    const limitedTokens = tokens.slice(0, 500);

    if (limitedTokens.length === 0) {
      return { success: true, message: "No FCM tokens available", sentCount: 0 };
    }

    const messages = limitedTokens.map(token => ({
      token: token,
      notification: { title, body },
      data: notificationData
    }));

    const response = await admin.messaging().sendEach(messages);

    if (response.failureCount > 0) {
      const failedTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) failedTokens.push(limitedTokens[idx]);
      });
      await cleanupFailedTokens(failedTokens);
    }

    return {
      success: true,
      sentCount: response.successCount,
      failureCount: response.failureCount,
      totalUsers: tokens.length,
    };
  } catch (error) {
    console.error("Error sending global push notification:", error);
    throw new Error("Failed to send global push notification: " + error.message);
  }
});

/**
 * Send push notification by role
 */
exports.sendPushNotificationByRole = onCall(async (request) => {
  try {
    const { roles, title, body, data: notificationData = {} } = request.data;

    if (!roles || !Array.isArray(roles) || roles.length === 0) {
      throw new Error("Roles array is required and must not be empty");
    }

    if (!title || !body) {
      throw new Error("Title and body are required");
    }

    const usersRef = admin.firestore().collection("users");
    const userDocs = await usersRef.where("role", "in", roles).get();

    if (userDocs.empty) {
      return { success: true, message: "No users found", sentCount: 0 };
    }

    const tokens = [];
    userDocs.forEach((doc) => {
      const userData = doc.data();
      if (userData.fcmTokens && Array.isArray(userData.fcmTokens)) {
        tokens.push(...userData.fcmTokens);
      }
      if (userData.fcmToken && !tokens.includes(userData.fcmToken)) {
        tokens.push(userData.fcmToken);
      }
    });

    if (tokens.length === 0) {
      return { success: true, message: "No FCM tokens found", sentCount: 0 };
    }

    const limitedTokens = tokens.slice(0, 500);

    const messages = limitedTokens.map(token => ({
      token: token,
      notification: { title, body },
      data: notificationData
    }));

    const response = await admin.messaging().sendEach(messages);

    if (response.failureCount > 0) {
      const failedTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) failedTokens.push(limitedTokens[idx]);
      });
      await cleanupFailedTokens(failedTokens);
    }

    return {
      success: true,
      sentCount: response.successCount,
      failureCount: response.failureCount,
      totalUsers: tokens.length,
    };
  } catch (error) {
    console.error("Error sending role-based push notification:", error);
    throw new Error("Failed to send role-based push notification: " + error.message);
  }
});

/**
 * Clean up failed FCM tokens
 */
async function cleanupFailedTokens(failedTokens, userIds) {
  try {
    let query;
    if (userIds) {
      query = admin.firestore().collection("users").where("uid", "in", userIds);
    } else {
      query = admin.firestore().collection("users").where("fcmTokens", "array-contains-any", failedTokens);
    }

    const userDocs = await query.get();
    const batch = admin.firestore().batch();

    userDocs.forEach((doc) => {
      const userData = doc.data();
      let currentTokens = userData.fcmTokens || [];
      if (userData.fcmToken && !currentTokens.includes(userData.fcmToken)) {
        currentTokens.push(userData.fcmToken);
      }

      const updatedTokens = currentTokens.filter((token) => !failedTokens.includes(token));

      const updateData = {};
      if (userData.fcmTokens !== undefined) updateData.fcmTokens = updatedTokens;
      if (userData.fcmToken !== undefined && failedTokens.includes(userData.fcmToken)) {
        updateData.fcmToken = null;
      }

      if (Object.keys(updateData).length > 0) {
        batch.update(doc.ref, updateData);
      }
    });

    await batch.commit();
  } catch (error) {
    console.error("Error cleaning up failed tokens:", error);
  }
}

// 100ms Video Call Token Generation
const { generate100msToken, createAppointmentRoom } = require('./generate100msToken');
exports.generate100msToken = generate100msToken;
exports.createAppointmentRoom = createAppointmentRoom;

// Consolidated Notification System
const { createAndSendNotification } = require('./consolidatedNotifications');
exports.createAndSendNotification = createAndSendNotification;

// Chat Message Notification Trigger
const { onNewChatMessage } = require('./chatNotifications');
exports.onNewChatMessage = onNewChatMessage;
// End of file
