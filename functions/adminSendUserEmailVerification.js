const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

// Helper to get config from env or legacy config (same pattern as index.js)
function getConfig(envKey, legacyPath) {
  if (process.env[envKey]) return process.env[envKey];
  try {
    const functions = require("firebase-functions");
    const config = functions.config();
    const parts = legacyPath.split('.');
    let value = config;
    for (const part of parts) value = value?.[part];
    return value;
  } catch (e) {
    return null;
  }
}

// Lazy nodemailer transporter (only initialized if SMTP config exists)
let transporterCache = null;
function getTransporter() {
  if (transporterCache) return transporterCache;
  const host = getConfig("SMTP_HOST", "smtp.host");
  const user = getConfig("SMTP_USER", "smtp.user");
  const pass = getConfig("SMTP_PASS", "smtp.pass");
  const port = getConfig("SMTP_PORT", "smtp.port") || 587;

  if (!host || !user || !pass) {
    console.warn("⚠️  SMTP config not found. Email will not be sent, only link generated.");
    return null;
  }

  const nodemailer = require("nodemailer");
  transporterCache = nodemailer.createTransport({
    host,
    port: Number(port),
    secure: Number(port) === 465,
    auth: { user, pass },
  });
  return transporterCache;
}

/**
 * adminSendUserEmailVerification
 * Admin-only function: generates a Firebase email verification link for a
 * target user and sends it via SMTP (if configured), or returns the link
 * so the admin can share it manually.
 *
 * Expects: request.data = { userId?: string, email?: string }
 * Caller must have role === 'admin' in their Firestore user doc.
 */
exports.adminSendUserEmailVerification = onCall(async (request) => {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError("unauthenticated", "You must be logged in");
  }

  const db = admin.firestore();
  const callerUid = request.auth.uid;

  try {
    // Admin check
    const callerSnap = await db.collection("users").doc(callerUid).get();
    const callerData = callerSnap.exists ? callerSnap.data() : null;

    if (!callerData || callerData.role !== "admin") {
      throw new HttpsError("permission-denied", "Only admins can trigger email verification");
    }

    const { userId, email } = request.data || {};
    if (!userId && !email) {
      throw new HttpsError("invalid-argument", "userId or email is required");
    }

    // Resolve target user
    let targetEmail = email;
    if (!targetEmail && userId) {
      const targetUserRecord = await admin.auth().getUser(userId);
      targetEmail = targetUserRecord.email;
    }

    if (!targetEmail) {
      throw new HttpsError("not-found", "Could not resolve target user's email");
    }

    const verificationLink = await admin.auth().generateEmailVerificationLink(targetEmail);

    // Try to send via SMTP; if not configured, just return the link
    const transporter = getTransporter();
    let emailSent = false;

    if (transporter) {
      const fromAddress = getConfig("SMTP_FROM", "smtp.from") || getConfig("SMTP_USER", "smtp.user");
      await transporter.sendMail({
        from: fromAddress,
        to: targetEmail,
        subject: "Verify your email",
        html: `<p>Please verify your email by clicking the link below:</p><p><a href="${verificationLink}">Verify Email</a></p>`,
      });
      emailSent = true;
    }

    return {
      success: true,
      emailSent,
      verificationLink,
      email: targetEmail,
    };

  } catch (error) {
    console.error("Error sending admin email verification:", error);
    if (error instanceof HttpsError) throw error;
    throw new HttpsError("internal", "Failed to send email verification: " + error.message);
  }
});