import * as admin from "firebase-admin";
import { setGlobalOptions } from "firebase-functions/v2";

// Initialize once, shared across all function files.
// NOTE: if functions/src/index.ts (the original adminSendUserEmailVerification file)
// already calls admin.initializeApp(), remove that duplicate call to avoid
// "app already exists" errors, and import this file first.
if (admin.apps.length === 0) {
  admin.initializeApp();
}

setGlobalOptions({
  region: "europe-west1",
});

export const db = admin.firestore();
export const authAdmin = admin.auth();
export { admin };
