"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminSendUserEmailVerification = void 0;
const https_1 = require("firebase-functions/v2/https");
const v2_1 = require("firebase-functions/v2");
const admin = __importStar(require("firebase-admin"));
const v2_2 = require("firebase-functions/v2");
admin.initializeApp();
// Set default region for all functions
(0, v2_1.setGlobalOptions)({ region: "europe-west1" });
/**
 * adminSendUserEmailVerification
 *
 * Callable function that lets an admin trigger a verification email
 * for any user via the Firebase Auth REST API.
 *
 * Expects: { targetUserId: string }
 * Returns: { success: true } | { alreadyVerified: true }
 *
 * Requires the WEB_API_KEY environment variable to be set
 * (same value as VITE_FIREBASE_API_KEY for this project).
 */
exports.adminSendUserEmailVerification = (0, https_1.onCall)(async (request) => {
    var _a;
    // 1. Verify the caller is authenticated
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "You must be logged in.");
    }
    // Check admin role from Firestore
    const callerUid = request.auth.uid;
    const callerDoc = await admin
        .firestore()
        .collection("users")
        .doc(callerUid)
        .get();
    const callerRole = (_a = callerDoc.data()) === null || _a === void 0 ? void 0 : _a.role;
    if (callerRole !== "ADMIN") {
        throw new https_1.HttpsError("permission-denied", "Only admins can send verification emails.");
    }
    // 2. Get the target user
    const targetUserId = request.data.targetUserId;
    if (!targetUserId || typeof targetUserId !== "string") {
        throw new https_1.HttpsError("invalid-argument", "targetUserId is required.");
    }
    let targetUser;
    try {
        targetUser = await admin.auth().getUser(targetUserId);
    }
    catch (err) {
        throw new https_1.HttpsError("not-found", "User not found.");
    }
    // 3. Check if already verified
    if (targetUser.emailVerified) {
        return { alreadyVerified: true };
    }
    if (!targetUser.email) {
        throw new https_1.HttpsError("failed-precondition", "User has no email address.");
    }
    // 4. Send verification email via Firebase Auth REST API
    const apiKey = process.env.WEB_API_KEY;
    if (!apiKey) {
        throw new https_1.HttpsError("failed-precondition", "WEB_API_KEY is not configured for Cloud Functions. " +
            "Set the env var to your Firebase Web API key (same as VITE_FIREBASE_API_KEY).");
    }
    try {
        // Step A: Create a custom token for the target user
        const customToken = await admin.auth().createCustomToken(targetUserId);
        // Step B: Exchange the custom token for an ID token via REST API
        const signInUrl = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`;
        const signInRes = await fetch(signInUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                token: customToken,
                returnSecureToken: true,
            }),
        });
        if (!signInRes.ok) {
            const errBody = await signInRes.text();
            v2_2.logger.error("signInWithCustomToken failed:", errBody);
            throw new https_1.HttpsError("internal", "Failed to obtain ID token for user.");
        }
        const signInData = (await signInRes.json());
        const idToken = signInData.idToken;
        if (!idToken) {
            throw new https_1.HttpsError("internal", "No idToken returned from signInWithCustomToken.");
        }
        // Step C: Send verification email using the ID token
        const sendUrl = `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`;
        const sendRes = await fetch(sendUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                requestType: "VERIFY_EMAIL",
                idToken: idToken,
            }),
        });
        if (!sendRes.ok) {
            const errBody = await sendRes.text();
            v2_2.logger.error("sendOobCode failed:", errBody);
            throw new https_1.HttpsError("internal", "Failed to send verification email.");
        }
        v2_2.logger.info(`Verification email sent to ${targetUser.email} (uid: ${targetUserId})`);
        return { success: true };
    }
    catch (err) {
        if (err instanceof https_1.HttpsError)
            throw err;
        v2_2.logger.error("Unexpected error:", err);
        throw new https_1.HttpsError("internal", err.message || "Unexpected error sending verification email.");
    }
});
//# sourceMappingURL=index.js.map