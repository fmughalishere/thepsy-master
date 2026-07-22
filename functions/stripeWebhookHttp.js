const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

// Helper to get config
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

// Lazy initialize Stripe instance
let stripeLive = null;
let stripeTest = null;

function getStripe(isTest = false) {
    if (isTest) {
        if (!stripeTest) {
            const key = getConfig("SECRET_STRIPE_TEST_KEY", "stripe.test_secret_key");
            if (!key) throw new Error("Stripe Test Secret Key not configured");
            stripeTest = require("stripe")(key);
        }
        return stripeTest;
    } else {
        if (!stripeLive) {
            const key = getConfig("SECRET_STRIPE_LIVE_KEY", "stripe.live_secret_key") || getConfig("STRIPE_SECRET_KEY", "stripe.secret_key");
            if (!key) throw new Error("Stripe Secret Key not configured");
            stripeLive = require("stripe")(key);
        }
        return stripeLive;
    }
}

/**
 * HTTP endpoint for Stripe webhooks
 * This receives webhook events from Stripe and processes them
 */
exports.stripeWebhookHttp = onRequest({ 
    secrets: ["SECRET_STRIPE_LIVE_KEY", "SECRET_STRIPE_TEST_KEY"] 
}, async (req, res) => {
    const sig = req.headers["stripe-signature"];
    const webhookSecret = getConfig("STRIPE_WEBHOOK_SECRET", "stripe.webhook_secret");

    console.log("Debug: Webhook Secret loaded?", !!webhookSecret);
    console.log("Debug: Signature received?", !!sig);

    let event;

    try {
        // Verify webhook signature
        // We might need to try both live and test secrets if they share an endpoint, 
        // but usually they are separate. Let's try the primary one first.
        event = getStripe().webhooks.constructEvent(req.rawBody, sig, webhookSecret);
    } catch (err) {
        // Fallback for test webhook secret if live fails
        try {
            const testSecret = getConfig("STRIPE_TEST_WEBHOOK_SECRET", "stripe.test_webhook_secret");
            if (testSecret) {
                event = getStripe(true).webhooks.constructEvent(req.rawBody, sig, testSecret);
            } else {
                throw err;
            }
        } catch (testErr) {
            console.error("Webhook signature verification failed for both keys:", testErr.message);
            return res.status(400).send(`Webhook Error: ${testErr.message}`);
        }
    }

    console.log(`Received Stripe event: ${event.type}`);

    const isTest = !event.livemode;
    const stripeClient = getStripe(isTest);

    try {
        // Process the event directly
        switch (event.type) {
            case "checkout.session.completed":
                await handleCheckoutSessionCompleted(event.data.object, isTest);
                break;
            case "invoice.payment_succeeded":
                await handlePaymentSucceeded(event.data.object, isTest);
                break;
            case "invoice.payment_failed":
                await handlePaymentFailed(event.data.object, isTest);
                break;
            case "customer.subscription.deleted":
                await handleSubscriptionDeleted(event.data.object, isTest);
                break;
            case "customer.subscription.created":
            case "customer.subscription.updated":
                await handleSubscriptionUpdated(event.data.object, isTest);
                break;
            default:
                console.log(`Unhandled event type: ${event.type}`);
        }

        res.json({ received: true });
    } catch (error) {
        console.error("Error processing webhook:", error);
        res.status(500).send("Webhook processing error");
    }
});

// Copy the handler functions from stripeSubscriptions.js
async function handleCheckoutSessionCompleted(session, isTest = false) {
    console.log(`[Checkout Completed] Processing session ${session.id} for user ${session.metadata.userId}`);
    const userId = session.metadata.userId;
    const planId = session.metadata.planId;

    if (!userId) {
        console.error(`[Checkout Completed] ERROR: No userId in session metadata! Metadata:`, session.metadata);
        return;
    }

    // Fetch the user document to check their previous status
    const userRef = admin.firestore().collection("users").doc(userId);
    const userDoc = await userRef.get();

    if (!userDoc.exists) {
        console.error(`[Checkout Completed] ERROR: User document ${userId} not found!`);
        return;
    }

    const previousStatus = userDoc.data().patientDetails?.quotas?.subscriptionStatus;
    console.log(`[Checkout Completed] User ${userId} found. Previous status: ${previousStatus}`);

    let newStatus = "ACTIVE";
    if (previousStatus === "UNSUBSCRIBED" || previousStatus === "CANCELLED" || previousStatus === "RETURNED" || previousStatus === "EXPIRED") {
        newStatus = "RETURNED";
    }

    console.log(`[Checkout Completed] Fetching plan details for ${planId} (Test Mode: ${isTest})`);
    const planDetails = await getPlanDetails(planId, isTest);

    if (!planDetails) {
        console.error(`[Checkout Completed] CRITICAL: Plan details not found for ${planId}. Quotas will NOT be updated properly.`);
    } else {
        console.log(`[Checkout Completed] Plan details found:`, JSON.stringify(planDetails));
    }

    // Check if this is a one-time session purchase for an existing user
    if (planId === "one_time_session") {
        console.log(`[Checkout Completed] Processing ONE TIME SESSION for ${userId}`);
        const currentQuotas = userDoc.data().patientDetails?.quotas;
        if (currentQuotas) {
            const currentRemaining = currentQuotas.currentUsage?.remainingLiveSessions || 0;
            const updateData = {
                "patientDetails.quotas.currentUsage.remainingLiveSessions": currentRemaining + 1,
                "patientDetails.quotas.lastPaymentDate": admin.firestore.Timestamp.now(),
                "patientDetails.quotas.isActive": true,
                "patientDetails.quotas.requiresPayment": false,
                "patientDetails.quotas.subscriptionStatus": "ACTIVE" // Ensure they have a status
            };

            if (isTest) {
                updateData["patientDetails.quotas.stripeTestCustomerId"] = session.customer;
            } else {
                updateData["patientDetails.quotas.stripeCustomerId"] = session.customer;
            }

            await userRef.update(updateData);
            console.log(`[Checkout Completed] Successfully added 1+ session to user ${userId} and set isActive=true. Old total: ${currentRemaining}, New total: ${currentRemaining + 1}`);
            return;
        } else {
            console.warn(`[Checkout Completed] User ${userId} has no existing quotas structure for one-time purchase. Initializing...`);
            // We'll fall through to the main update logic below which will initialize the structure
        }
    }

    const customerIdField = isTest ? "patientDetails.quotas.stripeTestCustomerId" : "patientDetails.quotas.stripeCustomerId";

    const updateData = {
        [customerIdField]: session.customer,
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

    console.log(`[Checkout Completed] Updating user ${userId} with data:`, JSON.stringify(updateData));
    try {
        await userRef.update(updateData);
        console.log(`[Checkout Completed] SUCCESS: Updated user ${userId} with subscription data. Status: ${newStatus}`);
    } catch (e) {
        console.error(`[Checkout Completed] ERROR: Failed to update Firestore for user ${userId}:`, e);
    }
}

async function handlePaymentSucceeded(invoice, isTest = false) {
    console.log(`[Payment Succeeded] Processing invoice ${invoice.id}, Subscription: ${invoice.subscription}`);
    const subscriptionId = invoice.subscription;
    if (!subscriptionId) return;

    const customerIdField = isTest ? "patientDetails.quotas.stripeTestCustomerId" : "patientDetails.quotas.stripeCustomerId";

    // Note: We search by subscription ID, so test/live shouldn't matter too much if IDs are unique
    const usersSnapshot = await admin.firestore().collection("users")
        .where("patientDetails.quotas.stripeSubscriptionId", "==", subscriptionId)
        .limit(1).get();

    if (usersSnapshot.empty) {
        console.warn(`[Payment Succeeded] WARNING: No user found for subscription ${subscriptionId}`);
        return;
    }

    const userDoc = usersSnapshot.docs[0];
    const quotas = userDoc.data().patientDetails?.quotas;
    console.log(`[Payment Succeeded] User ${userDoc.id} found.`);

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
        console.log(`[Payment Succeeded] Resetting quotas to:`, quotas.quotas.liveSessionsPerMonth);
    }

    await userDoc.ref.update(updateData);
    console.log(`[Payment Succeeded] SUCCESS: Quotas reset for user ${userDoc.id}`);
}

async function handlePaymentFailed(invoice, isTest = false) {
    console.log(`[Payment Failed] Invoice ${invoice.id}, Subscription: ${invoice.subscription}`);
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
    console.log(`[Payment Failed] User ${usersSnapshot.docs[0].id} marked as PAST_DUE`);
}

async function handleSubscriptionDeleted(subscription, isTest = false) {
    console.log(`[Subscription Deleted] ID: ${subscription.id}`);
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
    console.log(`[Subscription Deleted] User ${usersSnapshot.docs[0].id} marked as CANCELLED`);
}

async function handleSubscriptionUpdated(subscription, isTest = false) {
    console.log(`[Subscription Update] ID: ${subscription.id}, Status: ${subscription.status}`);

    // Try to find user by subscription ID first
    let userDoc = null;
    const usersSnapshot = await admin.firestore().collection("users")
        .where("patientDetails.quotas.stripeSubscriptionId", "==", subscription.id)
        .limit(1).get();

    if (!usersSnapshot.empty) {
        userDoc = usersSnapshot.docs[0];
    } else if (subscription.metadata && subscription.metadata.userId) {
        // Fallback to metadata if subscription ID not yet linked
        console.log(`[Subscription Update] Looking up user by metadata ID: ${subscription.metadata.userId}`);
        userDoc = await admin.firestore().collection("users").doc(subscription.metadata.userId).get();
    }

    if (!userDoc || !userDoc.exists) {
        console.log(`[Subscription Update] User not found for subscription ${subscription.id}`);
        return;
    }

    const previousStatus = userDoc.data()?.patientDetails?.quotas?.subscriptionStatus;
    let newStatus = subscription.status;

    if (subscription.status === 'active') {
        if (['UNSUBSCRIBED', 'CANCELLED', 'RETURNED', 'EXPIRED'].includes(previousStatus)) {
            newStatus = 'RETURNED';
        } else {
            newStatus = 'ACTIVE';
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

    if (subscription.metadata && subscription.metadata.planId) {
        updateData["patientDetails.quotas.planId"] = subscription.metadata.planId;
    }

    await userDoc.ref.update(updateData);
    console.log(`[Subscription Update] User ${userDoc.id} updated. New Status: ${newStatus}`);
}

/**
 * Get plan details from Remote Config
 * This avoids hardcoding quotas in multiple places
 */
async function getPlanDetails(planId, isTest = false) {
    console.log(`[Get Plan Details] Fetching for ${planId} (Test: ${isTest})`);
    try {
        const rcKey = isTest ? 'debug_payments' : 'payments';
        const template = await admin.remoteConfig().getTemplate();
        const param = template.parameters[rcKey];

        if (!param || !param.defaultValue || !param.defaultValue.value) {
            console.error(`[Get Plan Details] CRITICAL: Remote Config parameter ${rcKey} not found or empty for plan ${planId}. Quotas WILL NOT be updated.`);
            // Fallback: Try to use 'payments' even if isTest is true, just in case they share structure (dangerous but helpful for debug)
            if (isTest && rcKey === 'debug_payments') {
                console.log("[Get Plan Details] Attempting fallback to 'payments' config...");
                const fallbackParam = template.parameters['payments'];
                if (fallbackParam && fallbackParam.defaultValue && fallbackParam.defaultValue.value) {
                    const fallbackConfig = JSON.parse(fallbackParam.defaultValue.value);
                    const fallbackPlans = fallbackConfig['therapy_session_plans_en'] || [];
                    const fallbackPlan = fallbackPlans.find(p => p.id === planId);
                    if (fallbackPlan) {
                        console.log("[Get Plan Details] Found plan in fallback 'payments' config.");
                        return {
                            price: fallbackPlan.price,
                            currency: fallbackPlan.currency,
                            quotas: {
                                messageWordLimit: fallbackPlan.quotas.message_word_limit || 0,
                                liveSessionsPerMonth: fallbackPlan.quotas.live_sessions_per_month || 0
                            }
                        };
                    } else {
                        console.error(`[Get Plan Details] Plan ${planId} NOT found in fallback config.`);
                    }
                }
            }
            return null;
        }

        const config = JSON.parse(param.defaultValue.value);

        // Search across all therapy_session_plans_* keys if en fails
        let plan = null;
        const langKeys = Object.keys(config).filter(k => k.startsWith('therapy_session_plans_'));

        // Try 'en' first as primary
        if (config['therapy_session_plans_en']) {
            plan = config['therapy_session_plans_en'].find(p => p.id === planId);
        }

        // If not found, try others
        if (!plan) {
            console.log(`[Get Plan Details] Plan ${planId} not found in 'en'. Searching other languages...`);
            for (const key of langKeys) {
                if (key === 'therapy_session_plans_en') continue;
                plan = config[key].find(p => p.id === planId);
                if (plan) {
                    console.log(`[Get Plan Details] Found plan ${planId} in '${key}'`);
                    break;
                }
            }
        }

        if (plan) {
            console.log(`[Get Plan Details] Found plan ${planId}. Quotas:`, plan.quotas);
            return {
                price: plan.price,
                currency: plan.currency,
                quotas: {
                    messageWordLimit: plan.quotas.message_word_limit || 0,
                    liveSessionsPerMonth: plan.quotas.live_sessions_per_month || 0
                }
            };
        } else {
            const allAvailableIds = new Set();
            langKeys.forEach(k => config[k].forEach(p => allAvailableIds.add(p.id)));
            console.error(`[Get Plan Details] Plan ${planId} NOT found in config ${rcKey}. Available plan IDs across all languages:`, Array.from(allAvailableIds));
        }
    } catch (error) {
        console.error("[Get Plan Details] Error fetching plans from Remote Config:", error);
    }
    return null;
}
