const { onRequest } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const axios = require("axios");
const { getPlanDetails, getPaypalConfig } = require("./paymentConfigHelper");

function getPayPalBaseUrl(isSandbox) {
    return isSandbox ? "https://api-m.sandbox.paypal.com" : "https://api-m.paypal.com";
}

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

async function verifyAuthToken(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        throw new Error("UNAUTHORIZED");
    }
    const idToken = authHeader.split("Bearer ")[1];
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    return decodedToken.uid;
}

async function getPayPalAccessToken(isSandbox, paypalConfig) {
    const baseUrl = getPayPalBaseUrl(isSandbox);
    // Fallback to the object only if env is missing (for backward compatibility during migration)
    const secretKey = getConfig(isSandbox ? "SECRET_PAYPAL_SANDBOX_KEY" : "SECRET_PAYPAL_LIVE_KEY", isSandbox ? "paypal.sandbox_secret_key" : "paypal.secret_key") || paypalConfig.secret_key;
    
    if (!secretKey) {
        throw new Error(`PayPal Secret Key (${isSandbox ? 'Sandbox' : 'Live'}) not configured in functions environment`);
    }

    const credentials = `${paypalConfig.client_id}:${secretKey}`;
    const auth = Buffer.from(credentials).toString("base64");
    const response = await axios({
        method: "POST",
        url: `${baseUrl}/v1/oauth2/token`,
        headers: {
            Authorization: `Basic ${auth}`,
            "Content-Type": "application/x-www-form-urlencoded",
        },
        data: "grant_type=client_credentials",
    });
    return response.data.access_token;
}

function buildApplicationContext(paypalConfig, successUrl, cancelUrl, isSubscription = true) {
    return {
        brand_name: "ThePsy",
        shipping_preference: "NO_SHIPPING",
        landing_page: "NO_PREFERENCE",
        user_action: isSubscription ? "SUBSCRIBE_NOW" : "PAY_NOW",
        return_url: successUrl || paypalConfig.return_url || "https://psyfullstack.web.app/payment-success",
        cancel_url: cancelUrl || paypalConfig.cancel_url || "https://psyfullstack.web.app/payment",
    };
}

exports.createPayPalCheckout = onRequest({ 
    cors: true,
    secrets: ["SECRET_PAYPAL_LIVE_KEY", "SECRET_PAYPAL_SANDBOX_KEY"]
}, async (req, res) => {
    try {
        let userId;
        try {
            userId = await verifyAuthToken(req);
        } catch (error) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }

        const requestData = req.body?.data || req.body;
        const {
            planId,
            planName,
            planType,
            paypalPlanId,
            currency,
            successUrl,
            cancelUrl,
            isSandbox,
        } = requestData || {};

        if (!planId || !planName) {
            res.status(400).json({ error: "Missing required parameters: planId, planName" });
            return;
        }

        if (planType === "one_time" || planId === "one_time_session") {
            res.status(400).json({ error: "PayPal is currently available for subscription plans only" });
            return;
        }

        const paypalConfig = await getPaypalConfig(isSandbox === true);
        if (!paypalConfig) {
            res.status(500).json({ error: "PayPal configuration missing from Remote Config" });
            return;
        }
        const sandboxMode = paypalConfig.environment?.toLowerCase() === "sandbox" || isSandbox === true;

        const planIdentifier = paypalPlanId || paypalConfig.plan_ids?.[planId];
        if (!planIdentifier) {
            res.status(400).json({ error: `PayPal plan ID not configured for ${planId}` });
            return;
        }

        const accessToken = await getPayPalAccessToken(sandboxMode, paypalConfig);
        const baseUrl = getPayPalBaseUrl(sandboxMode);

        console.log(`[PayPal] Creating subscription for plan ${planId} (${planIdentifier}) sandbox:${sandboxMode}`);
        const payload = {
            plan_id: planIdentifier,
            custom_id: `${userId}:${planId}`,
            application_context: buildApplicationContext(paypalConfig, successUrl, cancelUrl, true),
        };

        const response = await axios.post(`${baseUrl}/v1/billing/subscriptions`, payload, {
            headers: {
                Authorization: `Bearer ${accessToken}`,
                "Content-Type": "application/json",
            },
        });

        const approvalUrl =
            response.data?.links?.find((link) => link.rel === "approve")?.href;
        if (!approvalUrl) {
            res.status(500).json({ error: "Failed to create PayPal approval link" });
            return;
        }

        res.status(200).json({
            url: approvalUrl,
            subscriptionId: response.data.id,
            environment: sandboxMode ? "sandbox" : "production",
        });
    } catch (error) {
        console.error("[PayPal] Failed to create checkout session:", error.response?.data || error.message);
        res.status(500).json({ error: error.message || "Failed to create PayPal checkout" });
    }
});

function parseCustomId(customValue) {
    if (!customValue || typeof customValue !== "string") return { userId: null, planId: null };
    const [userId, planId] = customValue.split(":");
    return { userId: userId || null, planId: planId || null };
}

async function resolveUserFromResource(resource) {
    const { userId } = parseCustomId(resource?.custom_id || resource?.custom);
    if (userId) {
        const userDoc = await admin.firestore().collection("users").doc(userId).get();
        if (userDoc.exists) {
            return userDoc;
        }
    }

    const subscriptionId = resource?.id || resource?.billing_agreement_id;
    if (subscriptionId) {
        const snapshot = await admin.firestore().collection("users")
            .where("patientDetails.quotas.paypalSubscriptionId", "==", subscriptionId)
            .limit(1)
            .get();
        if (!snapshot.empty) {
            return snapshot.docs[0];
        }
    }

    return null;
}

async function verifyWebhook(req) {
    const headers = req.headers;

    const attemptVerification = async (sandboxMode) => {
        const paypalConfig = await getPaypalConfig(sandboxMode);
        if (!paypalConfig) return { verified: false };

        try {
            const accessToken = await getPayPalAccessToken(sandboxMode, paypalConfig);
            const baseUrl = getPayPalBaseUrl(sandboxMode);
            const verification = await axios.post(`${baseUrl}/v1/notifications/verify-webhook-signature`, {
                transmission_id: headers["paypal-transmission-id"],
                transmission_time: headers["paypal-transmission-time"],
                cert_url: headers["paypal-cert-url"],
                auth_algo: headers["paypal-auth-algo"],
                transmission_sig: headers["paypal-transmission-sig"],
                webhook_id: paypalConfig.webhook_id,
                webhook_event: req.body,
            }, {
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                    "Content-Type": "application/json",
                },
            });

            const status = verification.data?.verification_status === "SUCCESS";
            return { verified: status, isSandbox: sandboxMode, paypalConfig };
        } catch (error) {
            console.error(`[PayPal] Webhook verification failed (${sandboxMode ? "sandbox" : "live"}):`, error.response?.data || error.message);
            return { verified: false };
        }
    };

    let verification = await attemptVerification(false);
    if (!verification.verified) {
        verification = await attemptVerification(true);
    }
    return verification;
}

async function markSubscriptionActive(resource, isSandbox) {
    const subscriptionId = resource.id;
    const { planId: customPlanId } = parseCustomId(resource.custom_id);
    const planId = customPlanId || resource.plan_id;
    if (!planId) {
        console.error("[PayPal] Missing plan ID in subscription resource");
        return;
    }

    const userDoc = await resolveUserFromResource(resource);
    if (!userDoc) {
        console.error("[PayPal] Failed to locate user for subscription", subscriptionId);
        return;
    }

    const planDetails = await getPlanDetails(planId, isSandbox);
    const updateData = {
        "patientDetails.quotas.planId": planId,
        "patientDetails.quotas.subscriptionStatus": "ACTIVE",
        "patientDetails.quotas.isActive": true,
        "patientDetails.quotas.requiresPayment": false,
        "patientDetails.quotas.paypalSubscriptionId": subscriptionId,
        "patientDetails.quotas.lastPaymentDate": admin.firestore.Timestamp.now(),
    };

    if (planDetails) {
        updateData["patientDetails.quotas.quotas"] = {
            messageWordLimit: planDetails.quotas.messageWordLimit,
            liveSessionsPerMonth: planDetails.quotas.liveSessionsPerMonth,
        };
        updateData["patientDetails.quotas.currentUsage"] = {
            remainingLiveSessions: planDetails.quotas.liveSessionsPerMonth,
            lastMessageDate: null,
        };
    }

    await userDoc.ref.update(updateData);
    console.log("[PayPal] Subscription activated for user", userDoc.id);
}

async function markSubscriptionCancelled(resource) {
    const userDoc = await resolveUserFromResource(resource);
    if (!userDoc) {
        console.warn("[PayPal] Cancel subscription - user not found");
        return;
    }
    await userDoc.ref.update({
        "patientDetails.quotas.subscriptionStatus": "CANCELLED",
        "patientDetails.quotas.isActive": false,
        "patientDetails.quotas.requiresPayment": true,
    });
    console.log("[PayPal] Subscription cancelled for user", userDoc.id);
}

async function markSubscriptionPastDue(resource) {
    const userDoc = await resolveUserFromResource(resource);
    if (!userDoc) {
        console.warn("[PayPal] Past due subscription - user not found");
        return;
    }
    await userDoc.ref.update({
        "patientDetails.quotas.subscriptionStatus": "PAST_DUE",
        "patientDetails.quotas.requiresPayment": true,
    });
    console.log("[PayPal] Subscription marked as past due for user", userDoc.id);
}

async function recordPayment(resource, isSandbox) {
    const userDoc = await resolveUserFromResource(resource);
    if (!userDoc) {
        console.warn("[PayPal] Payment event without matching user");
        return;
    }

    const { planId: customPlanId } = parseCustomId(resource.custom);
    const planId = customPlanId || userDoc.data()?.patientDetails?.quotas?.planId;
    const planDetails = planId ? await getPlanDetails(planId, isSandbox) : null;

    const amount = resource.amount || resource.total_amount || resource.seller_receivable_breakdown?.gross_amount;
    const formattedAmount = amount
        ? `${amount.value || amount.total} ${(amount.currency_code || amount.currency || "").toUpperCase()}`
        : (planDetails ? `${planDetails.price} ${planDetails.currency}` : "N/A");

    const transactionData = {
        userId: userDoc.id,
        userName: userDoc.data()?.displayName || userDoc.data()?.name || "Unknown User",
        userEmail: userDoc.data()?.email || "No Email",
        planName: planDetails?.name || "Therapy Session Plan",
        planId: planId || null,
        amount: formattedAmount,
        status: "Completed",
        timestamp: admin.firestore.Timestamp.now(),
        paymentMethod: "PayPal",
        paypalSaleId: resource.id,
        paypalSubscriptionId: resource.billing_agreement_id || null,
    };

    await admin.firestore().collection("transactions").add(transactionData);
    await userDoc.ref.update({
        "patientDetails.quotas.lastPaymentDate": admin.firestore.Timestamp.now(),
        "patientDetails.quotas.subscriptionStatus": "ACTIVE",
        "patientDetails.quotas.requiresPayment": false,
        "patientDetails.quotas.isActive": true,
    });

    console.log("[PayPal] Recorded payment for user", userDoc.id);
}

async function handlePayPalEvent(event, isSandbox) {
    switch (event.event_type) {
        case "BILLING.SUBSCRIPTION.CREATED":
            // Do NOT activate quotas here — this fires when the subscription object
            // is created, before the user approves/pays. Wait for ACTIVATED instead.
            console.log("[PayPal] Subscription created (pending approval):", event.resource?.id);
            break;
        case "BILLING.SUBSCRIPTION.ACTIVATED":
            await markSubscriptionActive(event.resource, isSandbox);
            break;
        case "BILLING.SUBSCRIPTION.CANCELLED":
        case "BILLING.SUBSCRIPTION.EXPIRED":
            await markSubscriptionCancelled(event.resource);
            break;
        case "BILLING.SUBSCRIPTION.SUSPENDED":
        case "BILLING.SUBSCRIPTION.PAYMENT.FAILED":
            await markSubscriptionPastDue(event.resource);
            break;
        case "PAYMENT.SALE.COMPLETED":
            await recordPayment(event.resource, isSandbox);
            break;
        default:
            console.log("[PayPal] Unhandled event type:", event.event_type);
    }
}

exports.paypalWebhook = onRequest({ 
    cors: true,
    secrets: ["SECRET_PAYPAL_LIVE_KEY", "SECRET_PAYPAL_SANDBOX_KEY"]
}, async (req, res) => {
    try {
        const verification = await verifyWebhook(req);
        if (!verification.verified) {
            res.status(400).send("Invalid PayPal signature");
            return;
        }

        await handlePayPalEvent(req.body, verification.isSandbox);
        res.status(200).json({ received: true });
    } catch (error) {
        console.error("[PayPal] Webhook handler error:", error.response?.data || error.message);
        res.status(500).json({ error: "Failed to process PayPal webhook" });
    }
});
