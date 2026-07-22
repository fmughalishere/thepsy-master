import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import { db } from "../lib/firebase-admin";

const PAYPAL_CLIENT_ID = defineSecret("PAYPAL_CLIENT_ID");
const PAYPAL_CLIENT_SECRET = defineSecret("PAYPAL_CLIENT_SECRET");

function paypalApiBase(isSandbox: boolean) {
  return isSandbox
    ? "https://api-m.sandbox.paypal.com"
    : "https://api-m.paypal.com";
}

async function getPaypalAccessToken(isSandbox: boolean) {
  const base = paypalApiBase(isSandbox);
  const auth = Buffer.from(
    `${PAYPAL_CLIENT_ID.value()}:${PAYPAL_CLIENT_SECRET.value()}`
  ).toString("base64");

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
  const data = (await res.json()) as any;
  return data.access_token as string;
}

/**
 * createPayPalCheckout
 * Called from src/hooks/usePayment.ts -> initiatePayment() (PayPal branch).
 *
 * Input:  { planId, planName, planType, amount, currency, paypalPlanId,
 *            successUrl, cancelUrl, isSandbox, couponCode, plusConfig }
 * Output: { url }
 */
export const createPayPalCheckout = onCall(
  { secrets: [PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET], cors: true },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be logged in.");
    }

    const {
      planId,
      planName,
      paypalPlanId,
      successUrl,
      cancelUrl,
      isSandbox,
      couponCode,
      plusConfig,
    } = request.data || {};

    if (!paypalPlanId) {
      throw new HttpsError("invalid-argument", "paypalPlanId is required.");
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
        logger.error("PayPal subscription creation failed:", errText);
        throw new HttpsError("internal", "Failed to create PayPal subscription.");
      }

      const data = (await res.json()) as any;
      const approveLink = data.links?.find((l: any) => l.rel === "approve")?.href;

      if (!approveLink) {
        throw new HttpsError("internal", "No PayPal approval link returned.");
      }

      // Stash the pending subscription so the webhook can match it up on approval.
      await db.doc(`users/${userId}`).set(
        {
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
        },
        { merge: true }
      );

      return { url: approveLink };
    } catch (err: any) {
      logger.error("createPayPalCheckout error:", err);
      if (err instanceof HttpsError) throw err;
      throw new HttpsError("internal", err.message || "Failed to create PayPal checkout.");
    }
  }
);

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
export const paypalWebhook = onRequest(async (req, res) => {
  try {
    const event = req.body;
    const eventType = event?.event_type;
    const resource = event?.resource;

    if (eventType === "BILLING.SUBSCRIPTION.ACTIVATED") {
      const paypalSubscriptionId = resource?.id;
      const userId = resource?.custom_id;

      if (userId) {
        const userRef = db.doc(`users/${userId}`);
        const userDoc = await userRef.get();
        const pending = userDoc.data()?.patientDetails?.pendingPaypal;

        await userRef.set(
          {
            patientDetails: {
              quotas: {
                userId,
                planId: pending?.planId || "",
                planName: pending?.planName || "",
                isActive: true,
                subscriptionStatus: "ACTIVE",
                plusConfig: pending?.plusConfig || null,
                willRenew: true,
                requiresPayment: false,
                mockPayment: false,
                paypalSubscriptionId,
                lastPaymentDate: new Date().toISOString(),
                nextBillingDate: new Date(
                  Date.now() + 30 * 24 * 60 * 60 * 1000
                ).toISOString(),
              },
              pendingPaypal: null,
            },
          },
          { merge: true }
        );
        logger.info(`PayPal subscription activated for user ${userId}`);
      }
    }

    if (eventType === "BILLING.SUBSCRIPTION.CANCELLED") {
      const paypalSubscriptionId = resource?.id;
      const usersSnap = await db
        .collection("users")
        .where("patientDetails.quotas.paypalSubscriptionId", "==", paypalSubscriptionId)
        .limit(1)
        .get();
      if (!usersSnap.empty) {
        await usersSnap.docs[0].ref.set(
          {
            patientDetails: {
              quotas: { isActive: false, subscriptionStatus: "CANCELLED" },
            },
          },
          { merge: true }
        );
      }
    }

    res.status(200).send({ received: true });
  } catch (err: any) {
    logger.error("paypalWebhook error:", err);
    res.status(500).send("Webhook handler error");
  }
});
