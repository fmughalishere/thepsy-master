import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import Stripe from "stripe";
import { db, authAdmin } from "../lib/firebase-admin";

const STRIPE_SECRET_KEY = defineSecret("STRIPE_SECRET_KEY");
const STRIPE_WEBHOOK_SECRET = defineSecret("STRIPE_WEBHOOK_SECRET");

function getStripe(key: string) {
  return new Stripe(key, { apiVersion: "2023-10-16" });
}

function mapStripeError(err: any): HttpsError {
  if (err instanceof HttpsError) return err;

  const stripeType = err?.type as string | undefined;
  const stripeCode = err?.code as string | undefined;
  if (stripeType === "StripeInvalidRequestError" && stripeCode === "resource_missing") {
    logger.error("Stripe resource_missing (likely price/mode mismatch):", err);
    return new HttpsError(
      "failed-precondition",
      "This plan isn't available for checkout right now. Please try a different plan or contact support."
    );
  }
  if (stripeType === "StripeCardError") {
    return new HttpsError("failed-precondition", err.message || "Your card was declined.");
  }

  if (stripeType === "StripeInvalidRequestError") {
    logger.error("Stripe invalid request:", err);
    return new HttpsError(
      "invalid-argument",
      "There was a problem with the checkout request. Please try again or contact support."
    );
  }

  if (stripeType === "StripeAPIError" || stripeType === "StripeConnectionError") {
    logger.error("Stripe API/connection error:", err);
    return new HttpsError("unavailable", "Payment provider is temporarily unavailable. Please try again shortly.");
  }
  logger.error("Unhandled error in Stripe function:", err);
  return new HttpsError("internal", err?.message || "Failed to process payment request.");
}
export const createCheckoutSession = onCall(
  { secrets: [STRIPE_SECRET_KEY], cors: true },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be logged in.");
    }

    const {
      planId,
      priceId,
      planName,
      mode,
      successUrl,
      cancelUrl,
      couponCode,
      plusConfig,
      selectedAddons,
    } = request.data || {};

    if (!priceId || typeof priceId !== "string") {
      throw new HttpsError("invalid-argument", "priceId is required.");
    }
    if (!successUrl || !cancelUrl) {
      throw new HttpsError("invalid-argument", "successUrl and cancelUrl are required.");
    }
    if (selectedAddons !== undefined && !Array.isArray(selectedAddons)) {
      throw new HttpsError("invalid-argument", "selectedAddons must be an array.");
    }

    const stripe = getStripe(STRIPE_SECRET_KEY.value());
    const userId = request.auth.uid;
    const stripeMode: Stripe.Checkout.SessionCreateParams.Mode =
      mode === "one_time" ? "payment" : "subscription";

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
        throw new HttpsError("unavailable", "Stripe did not return a checkout URL. Please try again.");
      }

      return { url: session.url };
    } catch (err: any) {
      throw mapStripeError(err);
    }
  }
);

export const stripeWebhook = onRequest(
  { secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET], cors: false },
  async (req, res) => {
    const stripe = getStripe(STRIPE_SECRET_KEY.value());
    const sig = req.headers["stripe-signature"] as string;

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(
        req.rawBody,
        sig,
        STRIPE_WEBHOOK_SECRET.value()
      );
    } catch (err: any) {
      logger.error("Webhook signature verification failed:", err.message);
      res.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    try {
      switch (event.type) {
        case "checkout.session.completed": {
          const session = event.data.object as Stripe.Checkout.Session;
          const userId = session.metadata?.userId || session.client_reference_id;
          if (!userId) {
            logger.error("No userId on checkout session metadata:", session.id);
            break;
          }

          const planId = session.metadata?.planId || "";
          const planName = session.metadata?.planName || "";
          const plusConfig = session.metadata?.plusConfig
            ? JSON.parse(session.metadata.plusConfig)
            : null;
          const selectedAddons = session.metadata?.selectedAddons
            ? JSON.parse(session.metadata.selectedAddons)
            : [];

          await db.doc(`users/${userId}`).set(
            {
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
                  nextBillingDate:
                    session.mode === "subscription"
                      ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
                      : null,
                },
              },
            },
            { merge: true }
          );

          logger.info(`Activated plan ${planId} for user ${userId}`);
          break;
        }

        case "customer.subscription.deleted": {
          const sub = event.data.object as Stripe.Subscription;
          const usersSnap = await db
            .collection("users")
            .where("patientDetails.quotas.stripeSubscriptionId", "==", sub.id)
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
          break;
        }

        case "invoice.payment_failed": {
          const invoice = event.data.object as Stripe.Invoice;
          logger.warn(`Payment failed for invoice ${invoice.id}, customer ${invoice.customer}`);
          break;
        }

        default:
          logger.info(`Unhandled Stripe event type: ${event.type}`);
      }

      res.status(200).send({ received: true });
    } catch (err: any) {
      logger.error("Error processing Stripe webhook:", err);
      res.status(500).send("Webhook handler error");
    }
  }
);

export const cancelSubscription = onCall(
  { secrets: [STRIPE_SECRET_KEY], cors: true },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be logged in.");
    }
    const userId = request.auth.uid;

    const userDoc = await db.doc(`users/${userId}`).get();
    const stripeSubscriptionId = userDoc.data()?.patientDetails?.quotas?.stripeSubscriptionId;

    if (!stripeSubscriptionId) {
      throw new HttpsError("failed-precondition", "No active Stripe subscription found.");
    }

    const stripe = getStripe(STRIPE_SECRET_KEY.value());

    try {
      await stripe.subscriptions.update(stripeSubscriptionId, {
        cancel_at_period_end: true,
      });

      await userDoc.ref.set(
        {
          patientDetails: {
            quotas: {
              subscriptionStatus: "CANCELLED",
              willRenew: false,
            },
          },
        },
        { merge: true }
      );

      return { success: true };
    } catch (err: any) {
      throw mapStripeError(err);
    }
  }
);

export const checkSubscriptionStatus = onCall(
  { secrets: [STRIPE_SECRET_KEY], cors: true },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be logged in.");
    }
    const userId = request.auth.uid;

    const userDoc = await db.doc(`users/${userId}`).get();
    const stripeSubscriptionId = userDoc.data()?.patientDetails?.quotas?.stripeSubscriptionId;

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
    } catch (err: any) {
      throw mapStripeError(err);
    }
  }
);

void authAdmin;