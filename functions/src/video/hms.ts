import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import * as jwt from "jsonwebtoken";
import { db } from "../lib/firebase-admin";

const HMS_ACCESS_KEY = defineSecret("HMS_ACCESS_KEY");
const HMS_SECRET = defineSecret("HMS_SECRET");
const HMS_TEMPLATE_ID = defineSecret("HMS_TEMPLATE_ID");

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
export const generate100msToken = onCall(
  { secrets: [HMS_ACCESS_KEY, HMS_SECRET, HMS_TEMPLATE_ID], cors: true },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be logged in.");
    }

    const { mode, appointmentId, roomId, userId, role } = request.data || {};

    if (mode === "create") {
      if (!appointmentId) {
        throw new HttpsError("invalid-argument", "appointmentId is required to create a room.");
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
          logger.error("100ms room creation failed:", errText);
          throw new HttpsError("internal", "Failed to create video room.");
        }

        const data = (await res.json()) as any;
        const newRoomId = data.id;

        await db.doc(`appointments/${appointmentId}`).set(
          { hmsRoomId: newRoomId },
          { merge: true }
        );

        return { roomId: newRoomId };
      } catch (err: any) {
        logger.error("generate100msToken create error:", err);
        if (err instanceof HttpsError) throw err;
        throw new HttpsError("internal", err.message || "Failed to create room.");
      }
    }

    if (mode === "token") {
      if (!roomId) {
        throw new HttpsError("invalid-argument", "roomId is required to generate a token.");
      }
      try {
        const token = createAuthToken({
          roomId,
          userId: userId || request.auth.uid,
          role: role || "guest",
        });
        return { token };
      } catch (err: any) {
        logger.error("generate100msToken token error:", err);
        throw new HttpsError("internal", err.message || "Failed to generate token.");
      }
    }

    throw new HttpsError("invalid-argument", "mode must be 'create' or 'token'.");
  }
);

function createManagementToken(): string {
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

function createAuthToken(opts: { roomId: string; userId: string; role: string }): string {
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

function cryptoRandomId(): string {
  return (
    Math.random().toString(36).substring(2) + Date.now().toString(36)
  );
}
