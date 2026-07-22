const { onCall } = require("firebase-functions/v2/https");
const { setGlobalOptions } = require("firebase-functions/v2");
const { defineSecret } = require("firebase-functions/params");
const axios = require("axios");
const jwt = require("jsonwebtoken");
const admin = require("firebase-admin");

// Set global region to Europe for GDPR compliance
setGlobalOptions({ region: "europe-west1" });

// Helper function to get config value from either .env or legacy config
function getConfigValue(envKey, legacyPath) {
  // Try process.env first (for .env files)
  if (process.env[envKey]) {
    return process.env[envKey];
  }

  // Fallback to legacy functions.config() - Note: This is deprecated
  try {
    const functions = require("firebase-functions");
    const config = functions.config();
    const parts = legacyPath.split('.');
    let value = config;
    for (const part of parts) {
      value = value?.[part];
    }
    return value;
  } catch (e) {
    return null;
  }
}

/**
 * 1. Generate 100ms auth token (For Joining)
 * Input: roomId (100ms Room ID), userId, role
 * Output: token
 */
exports.generate100msToken = onCall(async (request) => {
  try {
    const { mode = "token" } = request.data;

    // Get config values with fallback to legacy config
    const managementToken = getConfigValue("HMS_MANAGEMENT_TOKEN", "hms.management_token");
    const appAccessKey = getConfigValue("HMS_APP_ACCESS_KEY", "hms.app_access_key");
    const appSecret = getConfigValue("HMS_APP_SECRET", "hms.app_secret");
    const templateId = getConfigValue("HMS_TEMPLATE_ID", "hms.template_id");

    console.log(`🔔 Function called in mode: ${mode}`);
    console.log(`🔧 Config check - managementToken: ${managementToken ? 'SET' : 'MISSING'}, appAccessKey: ${appAccessKey ? 'SET' : 'MISSING'}, appSecret: ${appSecret ? 'SET' : 'MISSING'}, templateId: ${templateId ? 'SET' : 'MISSING'}`);

    // MODE: CREATE (Called during booking)
    if (mode === "create") {
      const { appointmentId } = request.data;
      if (!appointmentId) throw new Error("appointmentId is required for create mode");
      if (!appAccessKey || !appSecret) throw new Error("HMS credentials not configured");

      console.log(`Creating HMS Room for appointment: ${appointmentId}`);

      // Generate management token dynamically (valid for 24 hours)
      const managementPayload = {
        access_key: appAccessKey,
        type: "management",
        version: 2,
        iat: Math.floor(Date.now() / 1000),
        nbf: Math.floor(Date.now() / 1000),
      };

      const dynamicManagementToken = jwt.sign(managementPayload, appSecret, {
        algorithm: "HS256",
        expiresIn: "24h",
        jwtid: `mgmt-${Date.now()}`,
      });

      console.log(`🔑 Generated dynamic management token for room creation`);

      // Build room creation payload
      const roomPayload = {
        name: `appointment-${appointmentId}`,
        description: `Video call room for appointment ${appointmentId}`,
      };

      // Only add template_id if it's configured
      if (templateId) {
        roomPayload.template_id = templateId;
        console.log(`📋 Using template ID: ${templateId}`);
      } else {
        console.log(`⚠️  No template ID configured - using default template`);
      }

      const roomResponse = await axios.post(
        "https://api.100ms.live/v2/rooms",
        roomPayload,
        {
          headers: {
            "Authorization": `Bearer ${dynamicManagementToken}`,
            "Content-Type": "application/json",
          },
        },
      );

      const hmsRoomId = roomResponse.data.id;

      // Update Firestore Appointment Document
      await admin.firestore().collection("appointments").doc(appointmentId).update({
        hmsRoomId: hmsRoomId
      });

      console.log(`✅ Created HMS Room ${hmsRoomId} and updated appointment ${appointmentId}`);
      return { roomId: hmsRoomId };
    }

    // MODE: TOKEN (Called during join)
    else {
      const { roomId, userId, role = "guest" } = request.data;

      if (!roomId || !userId) throw new Error("roomId and userId are required for token mode");
      if (!appAccessKey || !appSecret) throw new Error("HMS credentials not configured");

      // Generate JWT token for 100ms using the provided Room ID
      const payload = {
        access_key: appAccessKey,
        room_id: roomId,
        user_id: userId,
        role: role,
        type: "app",
        version: 2,
        iat: Math.floor(Date.now() / 1000),
        nbf: Math.floor(Date.now() / 1000),
      };

      const token = jwt.sign(payload, appSecret, {
        algorithm: "HS256",
        expiresIn: "24h",
        jwtid: `${userId}-${Date.now()}`,
      });

      console.log(`Generated 100ms token for user ${userId} in room ${roomId}`);
      return { token };
    }

  } catch (error) {
    console.error("Error in generate100msToken:", error);
    throw new Error("Function failed: " + error.message);
  }
});

// Deprecated/Unused exports (kept to avoid deployment errors if referenced)
exports.createAppointmentRoom = onCall(async (request) => { return { error: "Use generate100msToken with mode='create'" }; });
