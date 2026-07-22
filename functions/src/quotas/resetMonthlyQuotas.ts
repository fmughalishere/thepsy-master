import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import { db } from "../lib/firebase-admin";

/**
 * resetMonthlyQuotas
 * No frontend caller was found for this — it was almost certainly a scheduled
 * (cron) function, not one invoked from the app. Reconstructed as a monthly
 * scheduled job that resets each active subscriber's `currentUsage` counters
 * back to their plan's quota. CONFIRM the cron schedule and exact reset logic
 * (e.g. should it run on each user's individual billing anniversary instead of
 * a fixed calendar date?) before relying on this in production.
 */
export const resetMonthlyQuotas = onSchedule(
  { schedule: "0 0 1 * *", timeZone: "Europe/Berlin" }, // 1st of every month, midnight
  async () => {
    try {
      const usersSnap = await db
        .collection("users")
        .where("patientDetails.quotas.isActive", "==", true)
        .get();

      if (usersSnap.empty) {
        logger.info("resetMonthlyQuotas: no active subscribers found.");
        return;
      }

      const batchSize = 400; // stay under Firestore's 500 writes/batch limit
      let batch = db.batch();
      let opCount = 0;

      for (const doc of usersSnap.docs) {
        const quotas = doc.data()?.patientDetails?.quotas;
        const liveSessionsPerMonth = quotas?.quotas?.liveSessionsPerMonth ?? 0;

        batch.set(
          doc.ref,
          {
            patientDetails: {
              quotas: {
                currentUsage: {
                  remainingLiveSessions: liveSessionsPerMonth,
                  lastMessageDate: null,
                },
              },
            },
          },
          { merge: true }
        );

        opCount++;
        if (opCount >= batchSize) {
          await batch.commit();
          batch = db.batch();
          opCount = 0;
        }
      }

      if (opCount > 0) {
        await batch.commit();
      }

      logger.info(`resetMonthlyQuotas: reset usage for ${usersSnap.size} users.`);
    } catch (err) {
      logger.error("resetMonthlyQuotas error:", err);
    }
  }
);
