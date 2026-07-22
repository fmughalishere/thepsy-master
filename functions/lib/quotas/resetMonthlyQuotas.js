"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resetMonthlyQuotas = void 0;
const scheduler_1 = require("firebase-functions/v2/scheduler");
const v2_1 = require("firebase-functions/v2");
const firebase_admin_1 = require("../lib/firebase-admin");
/**
 * resetMonthlyQuotas
 * No frontend caller was found for this — it was almost certainly a scheduled
 * (cron) function, not one invoked from the app. Reconstructed as a monthly
 * scheduled job that resets each active subscriber's `currentUsage` counters
 * back to their plan's quota. CONFIRM the cron schedule and exact reset logic
 * (e.g. should it run on each user's individual billing anniversary instead of
 * a fixed calendar date?) before relying on this in production.
 */
exports.resetMonthlyQuotas = (0, scheduler_1.onSchedule)({ schedule: "0 0 1 * *", timeZone: "Europe/Berlin" }, // 1st of every month, midnight
async () => {
    var _a, _b, _c, _d;
    try {
        const usersSnap = await firebase_admin_1.db
            .collection("users")
            .where("patientDetails.quotas.isActive", "==", true)
            .get();
        if (usersSnap.empty) {
            v2_1.logger.info("resetMonthlyQuotas: no active subscribers found.");
            return;
        }
        const batchSize = 400; // stay under Firestore's 500 writes/batch limit
        let batch = firebase_admin_1.db.batch();
        let opCount = 0;
        for (const doc of usersSnap.docs) {
            const quotas = (_b = (_a = doc.data()) === null || _a === void 0 ? void 0 : _a.patientDetails) === null || _b === void 0 ? void 0 : _b.quotas;
            const liveSessionsPerMonth = (_d = (_c = quotas === null || quotas === void 0 ? void 0 : quotas.quotas) === null || _c === void 0 ? void 0 : _c.liveSessionsPerMonth) !== null && _d !== void 0 ? _d : 0;
            batch.set(doc.ref, {
                patientDetails: {
                    quotas: {
                        currentUsage: {
                            remainingLiveSessions: liveSessionsPerMonth,
                            lastMessageDate: null,
                        },
                    },
                },
            }, { merge: true });
            opCount++;
            if (opCount >= batchSize) {
                await batch.commit();
                batch = firebase_admin_1.db.batch();
                opCount = 0;
            }
        }
        if (opCount > 0) {
            await batch.commit();
        }
        v2_1.logger.info(`resetMonthlyQuotas: reset usage for ${usersSnap.size} users.`);
    }
    catch (err) {
        v2_1.logger.error("resetMonthlyQuotas error:", err);
    }
});
//# sourceMappingURL=resetMonthlyQuotas.js.map