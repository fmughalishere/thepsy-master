const { onCall, onRequest } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const admin = require("firebase-admin");
const { getPlanDetails } = require("./paymentConfigHelper");

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

// Lazy initialize Stripe
let stripeLive = null;
let stripeTest = null;

function getStripe(isTest = false) {
    if (isTest) {
        if (!stripeTest) {
            const key = getConfig("SECRET_STRIPE_TEST_KEY", "stripe.test_secret_key");
            if (!key) throw new Error("Stripe Test Key not configured");
            stripeTest = require("stripe")(key);
        }
        return stripeTest;
    } else {
        if (!stripeLive) {
            const key = getConfig("SECRET_STRIPE_LIVE_KEY", "stripe.live_secret_key") || getConfig("STRIPE_SECRET_KEY", "stripe.secret_key");
            if (!key) throw new Error("Stripe Live Key not configured");
            stripeLive = require("stripe")(key);
        }
        return stripeLive;
    }
}

/**
 * Creates a Stripe Checkout Session for subscription or one-time payment
 */
exports.createCheckoutSession = onRequest({ 
    cors: true,
    secrets: ["SECRET_STRIPE_LIVE_KEY", "SECRET_STRIPE_TEST_KEY"] 
}, async (req, res) => {
    try {
        // Verify Auth Token (Basic check)
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            res.status(401).json({ error: 'Unauthorized: Missing token' });
            return;
        }
        const idToken = authHeader.split('Bearer ')[1];
        let userId;
        try {
            const decodedToken = await admin.auth().verifyIdToken(idToken);
            userId = decodedToken.uid;
        } catch (e) {
            res.status(401).json({ error: 'Unauthorized: Invalid token' });
            return;
        }

        // Parse body
        const requestData = req.body.data || req.body;
        const { priceId, planId, planName, mode, successUrl, cancelUrl, isTest } = requestData;

        if (!priceId || !planId) {
            res.status(400).json({ error: "Missing required parameters: priceId, planId" });
            return;
        }

        const stripeClient = getStripe(isTest === true);
        const customerIdField = (isTest === true) ? "stripeTestCustomerId" : "stripeCustomerId";

        // Get or create Stripe customer
        const userDoc = await admin.firestore().collection("users").doc(userId).get();
        const userData = userDoc.data();
        let customerId = userData?.patientDetails?.quotas?.[customerIdField];

        // If generic customerId exists but specific one doesn't, we might consider migration, but cleaner to separate.
        // However, if we are in Legacy mode (only stripeCustomerId exists), we might check that first?
        // No, let's keep it strict. 

        if (!customerId) {
            // Also check legacy field if not isTest? 
            // If live mode, check `stripeCustomerId`. If test mode, check `stripeTestCustomerId`.
            // The mapping above does exactly that.

            // Wait, if users already have `stripeCustomerId`, and we use Live, checks `stripeCustomerId`. Correct.

            const customer = await stripeClient.customers.create({
                email: userData.email,
                metadata: { userId: userId, firebaseUid: userId }
            });
            customerId = customer.id;

            // Save the new customer ID
            await admin.firestore().collection("users").doc(userId).set({
                patientDetails: {
                    quotas: {
                        [customerIdField]: customerId
                    }
                }
            }, { merge: true });
        }

        // Create checkout session
        const isOneTime = mode === 'one_time' || mode === 'payment' || planId === "one_time_session";

        const sessionConfig = {
            customer: customerId,
            // Explicitly list payment methods to ensure compatibility and visibility
            payment_method_types: ['card', 'paypal', 'sepa_debit', 'link'],
            // payment_method_options is only needed for one-time payments if we want to setup future usage
            payment_method_options: isOneTime ? {
                card: {
                    setup_future_usage: 'off_session',
                }
            } : undefined,
            line_items: [{ price: priceId, quantity: 1 }],
            mode: isOneTime ? "payment" : "subscription",
            success_url: successUrl || `psycmp://payment/success?session_id={CHECKOUT_SESSION_ID}`,
            cancel_url: cancelUrl || `psycmp://payment/cancel`,
            metadata: { userId: userId, planId: planId, planName: planName, isTest: isTest === true ? "true" : "false" },
            // Allow promotion codes
            allow_promotion_codes: true,
            // Collect billing address for better payment method support
            billing_address_collection: 'auto',
            // Enable customer to save payment method
            customer_update: {
                address: 'auto',
                name: 'auto'
            }
        };

        if (!isOneTime) {
            sessionConfig.subscription_data = {
                metadata: { userId: userId, planId: planId, planName: planName }
            };
        }

        const session = await stripeClient.checkout.sessions.create(sessionConfig);

        res.status(200).json({ url: session.url, sessionId: session.id });
    } catch (error) {
        console.error("Error creating checkout session:", error);
        res.status(500).json({ error: `Failed to create checkout session: ${error.message}` });
    }
});

/**
 * Handles Stripe webhook events
 * Note: This is a callable function wrapper for Stripe webhooks
 * The actual webhook endpoint will be created by admin
 */
exports.stripeWebhook = onCall({ 
    secrets: ["SECRET_STRIPE_LIVE_KEY", "SECRET_STRIPE_TEST_KEY"] 
}, async (request) => {
    try {
        const { event } = request.data;

        if (!event || !event.type) {
            throw new Error("Invalid webhook event");
        }

        console.log(`Received event: ${event.type}`);

        switch (event.type) {
            case "checkout.session.completed":
                await handleCheckoutSessionCompleted(event.data.object);
                break;
            case "invoice.payment_succeeded":
                await handlePaymentSucceeded(event.data.object);
                break;
            case "invoice.payment_failed":
                await handlePaymentFailed(event.data.object);
                break;
            case "customer.subscription.deleted":
                await handleSubscriptionDeleted(event.data.object);
                break;
            case "customer.subscription.created":
            case "customer.subscription.updated":
                await handleSubscriptionUpdated(event.data.object);
                break;
            default:
                console.log(`Unhandled event type: ${event.type}`);
        }

        return { received: true, processed: event.type };
    } catch (error) {
        console.error(`Error processing webhook: ${error.message}`);
        throw new Error(`Webhook processing error: ${error.message}`);
    }
});

/**
 * Checks the current subscription status for a user
 * Returns simplified status for the mobile app to poll
 */
exports.checkSubscriptionStatus = onCall(async (request) => {
    try {
        const userId = request.auth?.uid || request.data?.userId;
        if (!userId) {
            throw new Error("User ID is required");
        }

        const userDoc = await admin.firestore().collection("users").doc(userId).get();
        if (!userDoc.exists) {
            return { status: "none", isActive: false };
        }

        const userData = userDoc.data();
        const quotas = userData.patientDetails?.quotas;

        return {
            status: quotas?.subscriptionStatus || "none",
            isActive: quotas?.isActive || false,
            planId: quotas?.planId,
            requiresPayment: quotas?.requiresPayment || false
        };
    } catch (error) {
        console.error("Error checking subscription status:", error);
        throw new Error(`Failed to check subscription status: ${error.message}`);
    }
});

/**
 * Handles successful checkout session completion
 */
async function handleCheckoutSessionCompleted(session) {
    console.log(`[SubscriptionHandler][Checkout Completed] Processing session ${session.id} for user ${session.metadata.userId}`);
    const userId = session.metadata.userId;
    const planId = session.metadata.planId;

    if (!userId) {
        console.error(`[SubscriptionHandler] ERROR: No userId in session metadata! Metadata:`, session.metadata);
        return;
    }

    // Fetch current user data to check previous status
    const userDocSnapshot = await admin.firestore().collection("users").doc(userId).get();

    if (!userDocSnapshot.exists) {
        console.error(`[SubscriptionHandler] ERROR: User document ${userId} not found!`);
        return;
    }

    const currentUserData = userDocSnapshot.data();
    const previousStatus = currentUserData?.patientDetails?.quotas?.subscriptionStatus;
    console.log(`[SubscriptionHandler] User ${userId} found. Previous status: ${previousStatus}`);

    let newStatus = "ACTIVE";
    if (previousStatus === "UNSUBSCRIBED" || previousStatus === "CANCELLED" || previousStatus === "RETURNED" || previousStatus === "EXPIRED") {
        newStatus = "RETURNED";
    }

    const isTest = session.metadata.isTest === "true";
    console.log(`[SubscriptionHandler] Fetching plan details for ${planId} (Test Mode: ${isTest})`);
    const planDetails = await getPlanDetails(planId, isTest);

    if (!planDetails) {
        console.error(`[SubscriptionHandler] CRITICAL: Plan details not found for ${planId}. Quotas will NOT be updated properly.`);
    } else {
        console.log(`[SubscriptionHandler] Plan details found:`, JSON.stringify(planDetails));
    }

    // Check if this is a one-time session purchase for an existing user
    if (planId === "one_time_session" && currentUserData) {
        console.log(`[SubscriptionHandler] Processing ONE TIME SESSION for ${userId}`);
        const currentQuotas = currentUserData.patientDetails?.quotas;
        if (currentQuotas) {
            const currentRemaining = currentQuotas.currentUsage?.remainingLiveSessions || 0;
            const updateData = {
                "patientDetails.quotas.currentUsage.remainingLiveSessions": currentRemaining + 1,
                "patientDetails.quotas.lastPaymentDate": admin.firestore.Timestamp.now(),
                "patientDetails.quotas.isActive": true,
                "patientDetails.quotas.requiresPayment": false,
                "patientDetails.quotas.subscriptionStatus": "ACTIVE"
            };

            // Note: stripeSubscriptions.js doesn't seem to use stripeTestCustomerId but let's check
            updateData["patientDetails.quotas.stripeCustomerId"] = session.customer;

            await admin.firestore().collection("users").doc(userId).update(updateData);
            console.log(`[SubscriptionHandler] Successfully added 1+ session to user ${userId} via one-time purchase and set isActive=true. New total: ${currentRemaining + 1}`);
            return;
        } else {
            console.warn(`[SubscriptionHandler] User ${userId} has no existing quotas structure for one-time purchase. Initializing...`);
            // We'll fall through to the main update logic below which will initialize the structure
        }
    }

    const updateData = {
        "patientDetails.quotas.stripeCustomerId": session.customer,
        "patientDetails.quotas.planId": planId,
        "patientDetails.quotas.isActive": true,
        "patientDetails.quotas.requiresPayment": false,
        "patientDetails.quotas.subscriptionStatus": newStatus,
        "patientDetails.quotas.lastPaymentDate": admin.firestore.Timestamp.now(),
    };

    if (session.mode === "subscription") {
        updateData["patientDetails.quotas.stripeSubscriptionId"] = session.subscription;
    }

    if (planDetails) {
        updateData["patientDetails.quotas.quotas"] = planDetails.quotas;
        updateData["patientDetails.quotas.currentUsage"] = {
            remainingLiveSessions: planDetails.quotas.liveSessionsPerMonth,
            lastMessageDate: null
        };
    }

    console.log(`[SubscriptionHandler] Updating user ${userId} with data:`, JSON.stringify(updateData));
    try {
        await admin.firestore().collection("users").doc(userId).update(updateData);
        console.log(`[SubscriptionHandler] SUCCESS: Updated user ${userId} with subscription data (Status: ${newStatus})`);
    } catch (e) {
        console.error(`[SubscriptionHandler] ERROR: Failed to update Firestore for user ${userId}:`, e);
    }
    // Create Transaction Record
    try {
        const transactionRef = admin.firestore().collection("transactions").doc(session.id);
        const transactionData = {
            userId: userId,
            userName: currentUserData.displayName || currentUserData.name || "Unknown User",
            userEmail: currentUserData.email || "No Email",
            planName: session.metadata.planName || (planDetails ? "Subscription Plan" : "One-Time Payment"),
            planId: planId,
            amount: (session.amount_total / 100).toFixed(2) + " " + (session.currency || "eur").toUpperCase(),
            status: "Completed",
            timestamp: admin.firestore.Timestamp.now(),
            paymentMethod: "Stripe",
            sessionId: session.id,
            customerId: session.customer
        };

        if (session.payment_method_types && session.payment_method_types.length > 0) {
            transactionData.paymentMethod = "Stripe (" + session.payment_method_types[0] + ")";
        }

        await transactionRef.set(transactionData);
        console.log(`[SubscriptionHandler] transaction record created: ${session.id}`);
    } catch (e) {
        console.error(`[SubscriptionHandler] ERROR: Failed to create transaction record:`, e);
    }
}

/**
 * Handles successful payment (resets quotas every 30 days)
 */
async function handlePaymentSucceeded(invoice) {
    console.log(`[SubscriptionHandler][Payment Succeeded] Processing invoice ${invoice.id}, Subscription: ${invoice.subscription}`);
    const subscriptionId = invoice.subscription;
    if (!subscriptionId) return;

    const usersSnapshot = await admin.firestore().collection("users")
        .where("patientDetails.quotas.stripeSubscriptionId", "==", subscriptionId)
        .limit(1).get();

    if (usersSnapshot.empty) {
        console.warn(`[SubscriptionHandler][Payment Succeeded] WARNING: No user found for subscription ${subscriptionId}`);
        return;
    }

    const userDoc = usersSnapshot.docs[0];
    const quotas = userDoc.data().patientDetails?.quotas;
    console.log(`[SubscriptionHandler] User ${userDoc.id} found.`);

    const updateData = {
        "patientDetails.quotas.subscriptionStatus": "ACTIVE",
        "patientDetails.quotas.lastPaymentDate": admin.firestore.Timestamp.now(),
        "patientDetails.quotas.requiresPayment": false,
        "patientDetails.quotas.isActive": true,
    };

    // Reset quotas every 30 days when payment succeeds
    if (quotas?.quotas) {
        updateData["patientDetails.quotas.currentUsage"] = {
            remainingLiveSessions: quotas.quotas.liveSessionsPerMonth || 0,
            lastMessageDate: null
        };
        console.log(`[SubscriptionHandler] Resetting quotas to:`, quotas.quotas.liveSessionsPerMonth);
    }

    await userDoc.ref.update(updateData);
    console.log(`[SubscriptionHandler] SUCCESS: Quotas reset for user ${userDoc.id}`);
}

/**
 * Handles failed payment
 */
async function handlePaymentFailed(invoice) {
    console.log(`[SubscriptionHandler][Payment Failed] Invoice ${invoice.id}, Subscription: ${invoice.subscription}`);
    const subscriptionId = invoice.subscription;
    if (!subscriptionId) return;

    const usersSnapshot = await admin.firestore().collection("users")
        .where("patientDetails.quotas.stripeSubscriptionId", "==", subscriptionId)
        .limit(1).get();

    if (usersSnapshot.empty) return;

    await usersSnapshot.docs[0].ref.update({
        "patientDetails.quotas.subscriptionStatus": "PAST_DUE",
        "patientDetails.quotas.paymentFailedAt": admin.firestore.Timestamp.now(),
        "patientDetails.quotas.requiresPayment": true,
    });
    console.log(`[SubscriptionHandler][Payment Failed] User ${usersSnapshot.docs[0].id} marked as PAST_DUE`);
}

/**
 * Handles subscription deletion
 */
async function handleSubscriptionDeleted(subscription) {
    console.log(`[SubscriptionHandler][Subscription Deleted] ID: ${subscription.id}`);
    const usersSnapshot = await admin.firestore().collection("users")
        .where("patientDetails.quotas.stripeSubscriptionId", "==", subscription.id)
        .limit(1).get();

    if (usersSnapshot.empty) return;

    await usersSnapshot.docs[0].ref.update({
        "patientDetails.quotas.subscriptionStatus": "CANCELLED",
        "patientDetails.quotas.cancelledAt": admin.firestore.Timestamp.now(),
        "patientDetails.quotas.requiresPayment": true,
        "patientDetails.quotas.isActive": false,
    });
    console.log(`[SubscriptionHandler][Subscription Deleted] User ${usersSnapshot.docs[0].id} marked as CANCELLED`);
}

/**
 * Scheduled function to reset monthly quotas (backup - main reset is on payment)
 */
exports.resetMonthlyQuotas = onSchedule("0 0 1 * *", async (event) => {
    console.log("Monthly quota reset - skipped (using payment-based reset)");
});

/**
 * Handles subscription created/updated
 */
async function handleSubscriptionUpdated(subscription) {
    console.log("Processing subscription update", subscription.id);

    // Try to find user by subscription ID first
    let userDoc = null;
    const usersSnapshot = await admin.firestore().collection("users")
        .where("patientDetails.quotas.stripeSubscriptionId", "==", subscription.id)
        .limit(1).get();

    if (!usersSnapshot.empty) {
        userDoc = usersSnapshot.docs[0];
    } else if (subscription.metadata && subscription.metadata.userId) {
        // Fallback to metadata if subscription ID not yet linked
        userDoc = await admin.firestore().collection("users").doc(subscription.metadata.userId).get();
    }

    if (!userDoc || !userDoc.exists) {
        console.log("User not found for subscription update:", subscription.id);
        return;
    }

    const previousStatus = userDoc.data()?.patientDetails?.quotas?.subscriptionStatus;
    let newStatus = subscription.status;

    // Map 'active' to 'RETURNED' if previously cancelled/unsubscribed
    if (subscription.status === 'active') {
        if (previousStatus === 'UNSUBSCRIBED' || previousStatus === 'CANCELLED' || previousStatus === 'RETURNED' || previousStatus === 'EXPIRED') {
            newStatus = 'RETURNED'; // Keep internal status as RETURNED for stats, even if Stripe says active
            // Note: If you want to strictly Map Stripe 'active' to our 'ACTIVE' or 'RETURNED', this works.
            // But usually subscription.status from Stripe includes 'active', 'past_due', etc.
            // We are overriding the display status here.
        } else {
            newStatus = 'ACTIVE'; // Normalize Stripe 'active' to our enum 'ACTIVE'
        }
    } else if (subscription.status === 'trialing') {
        newStatus = 'TRIAL';
    } else if (subscription.status === 'past_due') {
        newStatus = 'PAST_DUE';
    } else if (subscription.status === 'canceled') {
        newStatus = 'CANCELLED';
    }

    const updateData = {
        "patientDetails.quotas.subscriptionStatus": newStatus,
        "patientDetails.quotas.isActive": subscription.status === 'active' || subscription.status === 'trialing',
        "patientDetails.quotas.stripeSubscriptionId": subscription.id
    };

    // If planId is in metadata, ensure it's set
    if (subscription.metadata && subscription.metadata.planId) {
        updateData["patientDetails.quotas.planId"] = subscription.metadata.planId;
    }

    await userDoc.ref.update(updateData);
    console.log(`Updated subscription status for user ${userDoc.id} to ${newStatus}`);
}
