import * as admin from "firebase-admin";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { setGlobalOptions } from "firebase-functions/v2";
import { logger } from "firebase-functions/v2";
import { defineSecret } from "firebase-functions/params";

admin.initializeApp();

setGlobalOptions({
  region: "europe-west1",
});

const WEB_API_KEY = defineSecret("WEB_API_KEY");

export const adminSendUserEmailVerification = onCall(
  {
    secrets: [WEB_API_KEY],
    cors: true,
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "You must be logged in.");
    }

    const callerDoc = await admin
      .firestore()
      .collection("users")
      .doc(request.auth.uid)
      .get();

    if (callerDoc.data()?.role !== "ADMIN") {
      throw new HttpsError(
        "permission-denied",
        "Only admins can send verification emails."
      );
    }

    const targetUserId = request.data.targetUserId;

    if (!targetUserId || typeof targetUserId !== "string") {
      throw new HttpsError(
        "invalid-argument",
        "targetUserId is required."
      );
    }

    const user = await admin.auth().getUser(targetUserId);

    if (user.emailVerified) {
      return { alreadyVerified: true };
    }

    if (!user.email) {
      throw new HttpsError(
        "failed-precondition",
        "User has no email."
      );
    }

    const apiKey = WEB_API_KEY.value();

    try {
      const customToken = await admin.auth().createCustomToken(targetUserId);
      const signInRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            token: customToken,
            returnSecureToken: true,
          }),
        }
      );

      if (!signInRes.ok) {
        logger.error(await signInRes.text());
        throw new HttpsError(
          "internal",
          "Failed to obtain ID token."
        );
      }

      const signInData: any = await signInRes.json();
      const sendRes = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            requestType: "VERIFY_EMAIL",
            idToken: signInData.idToken,
          }),
        }
      );

      if (!sendRes.ok) {
        logger.error(await sendRes.text());
        throw new HttpsError(
          "internal",
          "Failed to send verification email."
        );
      }

      logger.info(`Verification email sent to ${user.email}`);

      return {
        success: true,
      };
    } catch (err: any) {
      logger.error(err);

      if (err instanceof HttpsError) {
        throw err;
      }

      throw new HttpsError(
        "internal",
        err?.message || "Unknown error"
      );
    }
  }
);