const { onDocumentUpdated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");

/**
 * Trigger to deduct quota when an appointment is marked as COMPLETED.
 */
exports.deductQuotaOnCompletion = onDocumentUpdated("appointments/{appointmentId}", async (event) => {
    const newData = event.data.after.data();
    const oldData = event.data.before.data();

    // Check if status changed from something else to COMPLETED
    if (oldData.status !== "COMPLETED" && newData.status === "COMPLETED") {
        const patientId = newData.bookedBy;

        if (!patientId) {
            console.warn(`[QuotaTrigger] No patient (bookedBy) found for completed appointment ${event.params.appointmentId}`);
            return;
        }

        console.log(`[QuotaTrigger] Appointment ${event.params.appointmentId} completed. Deducting quota for user ${patientId}`);

        try {
            const db = admin.firestore();
            const userRef = db.collection("users").doc(patientId);

            await db.runTransaction(async (transaction) => {
                const userDoc = await transaction.get(userRef);
                if (!userDoc.exists) {
                    throw new Error(`User ${patientId} not found`);
                }

                const userData = userDoc.data();
                const quotas = userData.patientDetails?.quotas;

                if (!quotas) {
                    console.warn(`[QuotaTrigger] User ${patientId} has no quotas data.`);
                    return;
                }

                const currentRemaining = quotas.currentUsage?.remainingLiveSessions || 0;

                if (currentRemaining <= 0) {
                    console.warn(`[QuotaTrigger] User ${patientId} already has 0 or less remaining sessions.`);
                    // We still set it to 0 or leave as is, but usually we deduct.
                    // If it's already 0, maybe they used a session they didn't "have" or it's a bug.
                    return;
                }

                console.log(`[QuotaTrigger] Deducting quota. Old: ${currentRemaining}, New: ${currentRemaining - 1}`);

                transaction.update(userRef, {
                    "patientDetails.quotas.currentUsage.remainingLiveSessions": currentRemaining - 1
                });
            });

            console.log(`[QuotaTrigger] Quota deducted successfully for user ${patientId}`);

        } catch (error) {
            console.error(`[QuotaTrigger] Failed to deduct quota for user ${patientId}:`, error);
        }
    }
});
