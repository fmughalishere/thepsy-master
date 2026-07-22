const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");

// Helper to add notification
async function addNotification(notification) {
    try {
        const db = admin.firestore();
        const notificationData = {
            ...notification,
            timeAgo: admin.firestore.Timestamp.now(),
            timestamp: admin.firestore.Timestamp.now()
        };
        await db.collection("notifications").add(notificationData);
        await sendPushForNotification(notificationData);

    } catch (e) {
        console.error("Failed to add notification", e);
    }
}

async function sendPushForNotification(notification) {
    const { targetUserIds, targetRoles, title, message, titleKey, messageKey, params, global } = notification;

    // Logic similar to 'sendPushNotification' callable but internal
    let tokens = [];

    if (global) {
        // Simple logic for global - in production use topics or batching
        const users = await admin.firestore().collection("users").get();
        users.forEach(doc => {
            const data = doc.data();
            if (data.fcmTokens) tokens.push(...data.fcmTokens);
        });
    } else if (targetUserIds && targetUserIds.length > 0) {
        const users = await admin.firestore().collection("users").where("uid", "in", targetUserIds).get();
        users.forEach(doc => {
            const data = doc.data();
            if (data.fcmTokens) tokens.push(...data.fcmTokens);
            if (data.fcmToken) tokens.push(data.fcmToken);
        });
    } else if (targetRoles && targetRoles.length > 0) {
        const users = await admin.firestore().collection("users").where("role", "in", targetRoles).get();
        users.forEach(doc => {
            const data = doc.data();
            if (data.fcmTokens) tokens.push(...data.fcmTokens);
            if (data.fcmToken) tokens.push(data.fcmToken);
        });
    }

    if (tokens.length > 0) {
        // For push, we might still send a fallback message if we don't have client-side l10n for push
        // But the best way is to send data-only push and let app localize
        const messages = tokens.slice(0, 500).map(token => ({
            token: token,
            notification: {
                title: title || "New Notification",
                body: message || ""
            },
            data: {
                titleKey: titleKey || "",
                messageKey: messageKey || "",
                params: JSON.stringify(params || {}),
                clickAction: JSON.stringify(notification.clickAction || {})
            }
        }));
        try {
            await admin.messaging().sendEach(messages);
        } catch (e) {
            console.error("Push failed", e);
        }
    }
}


/**
 * 1. Admin Notification on New User (Therapist/Patient) Registration
 */
exports.notifyAdminOnUserDocumentCreated = onDocumentCreated("users/{userId}", async (event) => {
    const userData = event.data.data();
    const role = userData.role;

    if (!role) return;

    await addNotification({
        title: "New Registration", // Fallback
        message: `New ${role} registered: ${userData.displayName || userData.email}`, // Fallback
        titleKey: "notifications.registration_title",
        messageKey: "notifications.registration_body",
        params: {
            role: role,
            name: userData.displayName || "User",
            email: userData.email || "",
            userId: event.params.userId,
            id: event.params.userId
        },
        type: "NEW_REGISTRATION",
        userId: event.params.userId,
        targetRoles: ["ADMIN", "SUPER_ADMIN"],
        clickAction: {
            type: "PROFILE",
            id: event.params.userId
        }
    });
});

/**
 * 2. Notify Admin on Therapist Profile Update
 */
exports.notifyAdminOnTherapistUpdate = onDocumentUpdated("users/{userId}", async (event) => {
    const newData = event.data.after.data();
    const oldData = event.data.before.data();

    if (newData.role !== "THERAPIST") return;

    const oldStatus = oldData.therapistDetails?.profileStatus;
    const newStatus = newData.therapistDetails?.profileStatus;

    if (oldStatus !== "APPROVAL_PENDING" && newStatus === "APPROVAL_PENDING") {
        await addNotification({
            title: "Therapist Approval Request",
            message: `Therapist ${newData.displayName} has submitted their profile for approval.`,
            titleKey: "notifications.therapist_approval_title",
            messageKey: "notifications.therapist_approval_body",
            params: {
                name: newData.displayName || "Therapist",
                userId: event.params.userId,
                id: event.params.userId
            },
            type: "PROFILE",
            userId: event.params.userId,
            targetRoles: ["ADMIN", "SUPER_ADMIN"],
            clickAction: {
                type: "PROFILE",
                id: event.params.userId
            }
        });
    }
});

/**
 * 3. Notify Counterpart on Appointment Cancellation
 */
exports.notifyOnAppointmentCancellation = onDocumentUpdated("appointments/{appointmentId}", async (event) => {
    const newData = event.data.after.data();
    const oldData = event.data.before.data();

    if (oldData.status === "BOOKED" && newData.status === "AVAILABLE" && !newData.bookedBy) {
        const patientId = oldData.bookedBy;
        const therapistId = oldData.therapistId;

        if (patientId && therapistId) {
            // Sending to Therapist
            await addNotification({
                title: "Appointment Cancelled",
                message: `Appointment with ${oldData.clientName || 'Patient'} on ${oldData.date} has been cancelled.`,
                titleKey: "notifications.appointment_cancelled_title",
                messageKey: "notifications.appointment_cancelled_body_therapist",
                params: {
                    name: oldData.clientName || "Patient",
                    date: oldData.date
                },
                type: "APPOINTMENT_CANCELLED",
                targetUserIds: [therapistId],
                clickAction: {
                    type: "APPOINTMENT",
                    id: event.params.appointmentId
                }
            });

            // Sending to Patient
            await addNotification({
                title: "Appointment Cancelled",
                message: `Your appointment with ${oldData.therapistName} on ${oldData.date} has been cancelled.`,
                titleKey: "notifications.appointment_cancelled_title",
                messageKey: "notifications.appointment_cancelled_body_patient",
                params: {
                    name: oldData.therapistName,
                    date: oldData.date
                },
                type: "APPOINTMENT_CANCELLED",
                targetUserIds: [patientId],
                clickAction: {
                    type: "APPOINTMENT",
                    id: event.params.appointmentId
                }
            });
        }
    }
});

/**
 * 4. Notify Therapist on Subscription Cancellation
 */
exports.notifyOnSubscriptionChange = onDocumentUpdated("users/{userId}", async (event) => {
    const newData = event.data.after.data();
    const oldData = event.data.before.data();

    if (newData.role !== "PATIENT") return;

    const oldSub = oldData.patientDetails?.quotas?.subscriptionStatus;
    const newSub = newData.patientDetails?.quotas?.subscriptionStatus;

    if (oldSub === "ACTIVE" && (newSub === "CANCELED" || newSub === "UNSUBSCRIBED")) {
        const therapistId = newData.patientDetails?.assignedTherapist;
        if (therapistId) {
            await addNotification({
                title: "Subscription Cancelled",
                message: `Patient ${newData.displayName} has cancelled their subscription.`,
                titleKey: "notifications.subscription_cancelled_title",
                messageKey: "notifications.subscription_cancelled_body",
                params: {
                    name: newData.displayName || "Patient"
                },
                type: "CONTRACT_TERMINATED",
                targetUserIds: [therapistId],
                clickAction: {
                    type: "PROFILE",
                    id: event.params.userId
                }
            });

            await addNotification({
                title: "Subscription Cancelled",
                message: `Patient ${newData.displayName} cancelled subscription.`,
                titleKey: "notifications.subscription_cancelled_title",
                messageKey: "notifications.subscription_cancelled_body_admin",
                params: {
                    name: newData.displayName || "Patient"
                },
                type: "GENERIC",
                targetRoles: ["ADMIN"],
                clickAction: {
                    type: "PROFILE",
                    id: event.params.userId
                }
            });
        }
    }
});

/**
 * 5. Notify on Appointment Rescheduled
 */
exports.notifyOnAppointmentRescheduled = onDocumentUpdated("appointments/{appointmentId}", async (event) => {
    const newData = event.data.after.data();
    const oldData = event.data.before.data();

    if (oldData.status === "BOOKED" && newData.status === "BOOKED") {
        const oldTime = oldData.startTimestamp ? oldData.startTimestamp.toMillis() : 0;
        const newTime = newData.startTimestamp ? newData.startTimestamp.toMillis() : 0;

        if (oldTime !== newTime && newTime > 0) {
            const patientId = newData.bookedBy;
            const therapistId = newData.therapistId;
            const date = newData.date || "Unknown Date";
            const time = newData.timeRange || "Unknown Time";

            if (patientId) {
                await addNotification({
                    title: "Appointment Rescheduled",
                    message: `Your appointment with ${newData.therapistName} has been rescheduled to ${date} at ${time}.`,
                    titleKey: "notifications.appointment_rescheduled_title",
                    messageKey: "notifications.appointment_rescheduled_body_patient",
                    params: {
                        name: newData.therapistName,
                        date: date,
                        time: time
                    },
                    type: "APPOINTMENT_RESCHEDULED",
                    targetUserIds: [patientId],
                    clickAction: {
                        type: "APPOINTMENT",
                        id: event.params.appointmentId
                    }
                });
            }

            if (therapistId) {
                await addNotification({
                    title: "Appointment Rescheduled",
                    message: `Appointment with ${newData.clientName || 'Patient'} rescheduled to ${date} at ${time}.`,
                    titleKey: "notifications.appointment_rescheduled_title",
                    messageKey: "notifications.appointment_rescheduled_body_therapist",
                    params: {
                        name: newData.clientName || "Patient",
                        date: date,
                        time: time
                    },
                    type: "APPOINTMENT_RESCHEDULED",
                    targetUserIds: [therapistId],
                    clickAction: {
                        type: "APPOINTMENT",
                        id: event.params.appointmentId
                    }
                });
            }
        }
    }
});
