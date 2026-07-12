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
const admin = __importStar(require("firebase-admin"));
const https_1 = require("firebase-functions/v2/https");
const v2_1 = require("firebase-functions/v2");
const v2_2 = require("firebase-functions/v2");
const params_1 = require("firebase-functions/params");
admin.initializeApp();
(0, v2_1.setGlobalOptions)({
    region: "europe-west1",
});
const WEB_API_KEY = (0, params_1.defineSecret)("WEB_API_KEY");
exports.adminSendUserEmailVerification = (0, https_1.onCall)({
    secrets: [WEB_API_KEY],
    cors: true,
}, async (request) => {
    var _a;
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "You must be logged in.");
    }
    const callerDoc = await admin
        .firestore()
        .collection("users")
        .doc(request.auth.uid)
        .get();
    if (((_a = callerDoc.data()) === null || _a === void 0 ? void 0 : _a.role) !== "ADMIN") {
        throw new https_1.HttpsError("permission-denied", "Only admins can send verification emails.");
    }
    const targetUserId = request.data.targetUserId;
    if (!targetUserId || typeof targetUserId !== "string") {
        throw new https_1.HttpsError("invalid-argument", "targetUserId is required.");
    }
    const user = await admin.auth().getUser(targetUserId);
    if (user.emailVerified) {
        return { alreadyVerified: true };
    }
    if (!user.email) {
        throw new https_1.HttpsError("failed-precondition", "User has no email.");
    }
    const apiKey = WEB_API_KEY.value();
    try {
        const customToken = await admin.auth().createCustomToken(targetUserId);
        const signInRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                token: customToken,
                returnSecureToken: true,
            }),
        });
        if (!signInRes.ok) {
            v2_2.logger.error(await signInRes.text());
            throw new https_1.HttpsError("internal", "Failed to obtain ID token.");
        }
        const signInData = await signInRes.json();
        const sendRes = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                requestType: "VERIFY_EMAIL",
                idToken: signInData.idToken,
            }),
        });
        if (!sendRes.ok) {
            v2_2.logger.error(await sendRes.text());
            throw new https_1.HttpsError("internal", "Failed to send verification email.");
        }
        v2_2.logger.info(`Verification email sent to ${user.email}`);
        return {
            success: true,
        };
    }
    catch (err) {
        v2_2.logger.error(err);
        if (err instanceof https_1.HttpsError) {
            throw err;
        }
        throw new https_1.HttpsError("internal", (err === null || err === void 0 ? void 0 : err.message) || "Unknown error");
    }
});
//# sourceMappingURL=index.js.map