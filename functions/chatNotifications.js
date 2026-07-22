const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");

/**
 * Trigger: When a new message is added to any conversation's messages subcollection.
 * Sends a push notification to the OTHER participant(s) in the conversation.
 * 
 * Firestore path: conversations/{conversationId}/messages/{messageId}
 */
exports.onNewChatMessage = onDocumentCreated(
    {
        document: "conversations/{conversationId}/messages/{messageId}",
        region: "europe-west1"
    },
    async (event) => {
        try {
            const messageData = event.data.data();
            const conversationId = event.params.conversationId;
            const senderId = messageData.senderId;

            if (!senderId) {
                console.log("No senderId in message, skipping notification");
                return;
            }

            // 1. Get conversation document to find all occupants
            const conversationDoc = await admin.firestore()
                .collection("conversations")
                .doc(conversationId)
                .get();

            if (!conversationDoc.exists) {
                console.log(`Conversation ${conversationId} not found`);
                return;
            }

            const conversationData = conversationDoc.data();
            const occupants = conversationData.occupants || conversationData.participants || [];

            // 2. Find recipients (all occupants except the sender)
            let recipientIds = occupants.filter(uid => uid !== senderId);

            // Fallback for older conversation format or missing occupants array
            if (recipientIds.length === 0) {
                console.log(`[onNewChatMessage] No recipients in occupants array, checking fallback fields. senderId: ${senderId}`);
                if (conversationData.patientId && conversationData.patientId !== senderId) {
                    recipientIds.push(conversationData.patientId);
                }
                if (conversationData.therapistId && conversationData.therapistId !== senderId) {
                    recipientIds.push(conversationData.therapistId);
                }
            }

            if (recipientIds.length === 0) {
                console.log(`[onNewChatMessage] ABORT: No recipients found. occupants: ${JSON.stringify(occupants)}, patientId: ${conversationData.patientId}, therapistId: ${conversationData.therapistId}`);
                return;
            }

            console.log(`[onNewChatMessage] Found recipients for message from ${senderId}: ${recipientIds.join(', ')}`);

            // 3. Get sender's display name
            let senderName = "Someone";
            try {
                const senderDoc = await admin.firestore()
                    .collection("users")
                    .doc(senderId)
                    .get();
                if (senderDoc.exists) {
                    senderName = senderDoc.data().displayName || "Someone";
                }
            } catch (e) {
                console.error("Error fetching sender name:", e);
            }

            // 4. Get FCM tokens for all recipients
            const tokens = [];
            const recipientRoles = {};

            for (const recipientId of recipientIds) {
                try {
                    const userDoc = await admin.firestore()
                        .collection("users")
                        .doc(recipientId)
                        .get();

                    if (userDoc.exists) {
                        const userData = userDoc.data();
                        recipientRoles[recipientId] = userData.role;

                        // Support both single token and token array
                        if (userData.fcmToken) {
                            tokens.push({ token: userData.fcmToken, recipientId });
                        }
                        if (userData.fcmTokens && Array.isArray(userData.fcmTokens)) {
                            userData.fcmTokens.forEach(t => {
                                if (t && !tokens.some(tt => tt.token === t)) {
                                    tokens.push({ token: t, recipientId });
                                }
                            });
                        }
                    }
                } catch (e) {
                    console.error(`Error fetching user ${recipientId}:`, e);
                }
            }

            if (tokens.length === 0) {
                console.log("No FCM tokens found for recipients");
                return;
            }

            // 5. Determine message preview
            const messageType = messageData.messageType || "TEXT";
            let messagePreview;
            switch (messageType) {
                case "IMAGE":
                    messagePreview = "📷 Sent a photo";
                    break;
                case "DOCUMENT":
                    messagePreview = "📄 Sent a document";
                    break;
                case "AUDIO":
                    messagePreview = "🎵 Sent a voice message";
                    break;
                default:
                    // Don't show decrypted text — just say "New message"
                    messagePreview = "New message";
                    break;
            }

            // 6. Send push notification to each token
            const messages = tokens.map(({ token, recipientId }) => ({
                token: token,
                notification: {
                    title: senderName,
                    body: messagePreview
                },
                data: {
                    type: "chat_message",
                    conversationId: conversationId,
                    senderId: senderId,
                    senderName: senderName,
                    // Include IDs so click handler can navigate correctly
                    ...(recipientRoles[recipientId] === "PATIENT"
                        ? { therapistId: senderId }
                        : { patientId: senderId }
                    )
                },
                // Android-specific config
                android: {
                    priority: "high",
                    notification: {
                        channelId: "psy_notifications",
                        priority: "high",
                        defaultSound: true
                    }
                },
                // Web push config (for psy_web)
                webpush: {
                    headers: {
                        Urgency: "high"
                    },
                    notification: {
                        icon: "/logo.png",
                        badge: "/logo.png",
                        requireInteraction: false
                    },
                    fcmOptions: {
                        link: `/chat?sessionId=${conversationId}`
                    }
                }
            }));

            const response = await admin.messaging().sendEach(messages);

            console.log(
                `✅ Chat notification sent: ${response.successCount} success, ${response.failureCount} failed`
            );

            // 7. Clean up failed tokens
            if (response.failureCount > 0) {
                const failedTokens = [];
                response.responses.forEach((resp, idx) => {
                    if (!resp.success) {
                        const errorCode = resp.error?.code;
                        // Only remove tokens that are permanently invalid
                        if (
                            errorCode === "messaging/registration-token-not-registered" ||
                            errorCode === "messaging/invalid-registration-token"
                        ) {
                            failedTokens.push(messages[idx].token);
                        }
                    }
                });

                if (failedTokens.length > 0) {
                    console.log(`Cleaning up ${failedTokens.length} invalid tokens`);
                    for (const recipientId of recipientIds) {
                        try {
                            const userDoc = await admin.firestore()
                                .collection("users")
                                .doc(recipientId)
                                .get();
                            if (userDoc.exists) {
                                const userData = userDoc.data();
                                const updateData = {};

                                // Clean fcmToken
                                if (userData.fcmToken && failedTokens.includes(userData.fcmToken)) {
                                    updateData.fcmToken = null;
                                }

                                // Clean fcmTokens array
                                if (userData.fcmTokens && Array.isArray(userData.fcmTokens)) {
                                    const cleaned = userData.fcmTokens.filter(t => !failedTokens.includes(t));
                                    if (cleaned.length !== userData.fcmTokens.length) {
                                        updateData.fcmTokens = cleaned;
                                    }
                                }

                                if (Object.keys(updateData).length > 0) {
                                    await admin.firestore().collection("users").doc(recipientId).update(updateData);
                                }
                            }
                        } catch (e) {
                            console.error(`Error cleaning tokens for ${recipientId}:`, e);
                        }
                    }
                }
            }

        } catch (error) {
            console.error("❌ Error in onNewChatMessage trigger:", error);
        }
    }
);
