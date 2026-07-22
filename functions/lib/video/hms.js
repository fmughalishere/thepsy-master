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
exports.generate100msToken = void 0;
const https_1 = require("firebase-functions/v2/https");
const params_1 = require("firebase-functions/params");
const v2_1 = require("firebase-functions/v2");
const jwt = __importStar(require("jsonwebtoken"));
const firebase_admin_1 = require("../lib/firebase-admin");
const HMS_ACCESS_KEY = (0, params_1.defineSecret)("HMS_ACCESS_KEY");
const HMS_SECRET = (0, params_1.defineSecret)("HMS_SECRET");
const HMS_TEMPLATE_ID = (0, params_1.defineSecret)("HMS_TEMPLATE_ID");
/**
 * generate100msToken
 * Called from src/pages/Call.tsx, src/pages/PaymentSuccess.tsx, src/pages/TherapistDetails.tsx
 *
 * Two modes:
 *  - mode: 'create'  -> { appointmentId, userId?, role? }        -> returns { roomId }
 *  - mode: 'token'   -> { roomId, userId, role }                  -> returns { token }
 *
 * Requires a 100ms (100ms.live) account. Set these secrets:
 *   firebase functions:secrets:set HMS_ACCESS_KEY
 *   firebase functions:secrets:set HMS_SECRET
 *   firebase functions:secrets:set HMS_TEMPLATE_ID
 * (Access key / secret from 100ms Dashboard -> Developer, template ID from
 * Templates -> your room template.)
 */
exports.generate100msToken = (0, https_1.onCall)({ secrets: [HMS_ACCESS_KEY, HMS_SECRET, HMS_TEMPLATE_ID], cors: true }, async (request) => {
    if (!request.auth) {
        throw new https_1.HttpsError("unauthenticated", "You must be logged in.");
    }
    const { mode, appointmentId, roomId, userId, role } = request.data || {};
    if (mode === "create") {
        if (!appointmentId) {
            throw new https_1.HttpsError("invalid-argument", "appointmentId is required to create a room.");
        }
        try {
            const managementToken = createManagementToken();
            const res = await fetch("https://api.100ms.live/v2/rooms", {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${managementToken}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    name: `appointment-${appointmentId}-${Date.now()}`,
                    template_id: HMS_TEMPLATE_ID.value(),
                }),
            });
            if (!res.ok) {
                const errText = await res.text();
                v2_1.logger.error("100ms room creation failed:", errText);
                throw new https_1.HttpsError("internal", "Failed to create video room.");
            }
            const data = (await res.json());
            const newRoomId = data.id;
            await firebase_admin_1.db.doc(`appointments/${appointmentId}`).set({ hmsRoomId: newRoomId }, { merge: true });
            return { roomId: newRoomId };
        }
        catch (err) {
            v2_1.logger.error("generate100msToken create error:", err);
            if (err instanceof https_1.HttpsError)
                throw err;
            throw new https_1.HttpsError("internal", err.message || "Failed to create room.");
        }
    }
    if (mode === "token") {
        if (!roomId) {
            throw new https_1.HttpsError("invalid-argument", "roomId is required to generate a token.");
        }
        try {
            const token = createAuthToken({
                roomId,
                userId: userId || request.auth.uid,
                role: role || "guest",
            });
            return { token };
        }
        catch (err) {
            v2_1.logger.error("generate100msToken token error:", err);
            throw new https_1.HttpsError("internal", err.message || "Failed to generate token.");
        }
    }
    throw new https_1.HttpsError("invalid-argument", "mode must be 'create' or 'token'.");
});
function createManagementToken() {
    const payload = {
        access_key: HMS_ACCESS_KEY.value(),
        type: "management",
        version: 2,
        iat: Math.floor(Date.now() / 1000),
        nbf: Math.floor(Date.now() / 1000),
    };
    return jwt.sign(payload, HMS_SECRET.value(), {
        algorithm: "HS256",
        expiresIn: "24h",
        jwtid: cryptoRandomId(),
    });
}
function createAuthToken(opts) {
    const payload = {
        access_key: HMS_ACCESS_KEY.value(),
        room_id: opts.roomId,
        user_id: opts.userId,
        role: opts.role,
        type: "app",
        version: 2,
        iat: Math.floor(Date.now() / 1000),
        nbf: Math.floor(Date.now() / 1000),
    };
    return jwt.sign(payload, HMS_SECRET.value(), {
        algorithm: "HS256",
        expiresIn: "24h",
        jwtid: cryptoRandomId(),
    });
}
function cryptoRandomId() {
    return (Math.random().toString(36).substring(2) + Date.now().toString(36));
}
//# sourceMappingURL=hms.js.map