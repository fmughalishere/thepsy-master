import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getFunctions } from "firebase/functions";
import { getMessaging, getToken, onMessage, isSupported, type MessagePayload, type Unsubscribe } from "firebase/messaging";
import { getRemoteConfig } from "firebase/remote-config";
import { getStorage } from "firebase/storage";
import { getAnalytics, logEvent } from "firebase/analytics";
import { getLocalhostFirebaseTarget, isDevelLocalhost } from "./firebase-local-target";

const debugFirebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
};

const productionFirebaseConfigForLocalDev = {
    apiKey: import.meta.env.VITE_PRODUCTION_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_PRODUCTION_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_PRODUCTION_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_PRODUCTION_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_PRODUCTION_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_PRODUCTION_FIREBASE_APP_ID,
    measurementId: import.meta.env.VITE_PRODUCTION_FIREBASE_MEASUREMENT_ID
};

function resolveFirebaseConfig() {
    if (
        isDevelLocalhost() &&
        getLocalhostFirebaseTarget() === "production" &&
        import.meta.env.VITE_PRODUCTION_FIREBASE_PROJECT_ID
    ) {
        return productionFirebaseConfigForLocalDev;
    }
    return debugFirebaseConfig;
}

// Vite dev: .env.development (debug by default; production when toggled on localhost).
// Production build: .env.production — never uses localhost localStorage override.
const firebaseConfig = import.meta.env.PROD
    ? {
          apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
          authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
          projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
          storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
          messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
          appId: import.meta.env.VITE_FIREBASE_APP_ID,
          measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID
      }
    : resolveFirebaseConfig();

const app = initializeApp(firebaseConfig);

const isTestingFirebaseProject = firebaseConfig.projectId === "testing-d74ed";
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app, "europe-west1");
export let analytics: any = null;
export let messaging: any = null;
let messagingInitPromise: Promise<boolean> | null = null;

/**
 * Log a custom event to Firebase Analytics
 * @param eventName The name of the event
 * @param eventParams Optional parameters for the event
 */
export const logAnalyticsEvent = (eventName: string, eventParams?: Record<string, any>) => {
    try {
        if (!analytics && typeof window !== 'undefined') {
            analytics = getAnalytics(app);
        }
        if (analytics) {
            logEvent(analytics, eventName, eventParams);
        }
    } catch (error) {
        console.error("[Analytics] Error logging event:", error);
    }
};

const initMessaging = () => {
    if (!messagingInitPromise) {
        messagingInitPromise = isSupported()
            .then((supported) => {
                if (supported) {
                    messaging = getMessaging(app);
                    return true;
                }
                console.warn("[FCM] Messaging is not supported in this browser environment.");
                messaging = null;
                return false;
            })
            .catch((err) => {
                console.error("[FCM] Messaging support check failed:", err);
                messaging = null;
                return false;
            });
    }
    return messagingInitPromise;
};

// Initialize messaging eagerly (non-blocking) so other modules can rely on it later.
initMessaging();

export const subscribeToForegroundMessages = async (
    handler: (payload: MessagePayload) => void
): Promise<null | Unsubscribe> => {
    await initMessaging();
    if (!messaging) return null;
    return onMessage(messaging, handler);
};

export const remoteConfig = getRemoteConfig(app);
export const storage = getStorage(app);

// Remote Config settings
remoteConfig.settings = {
    minimumFetchIntervalMillis: 30000, // 30 seconds for dev/testing
    fetchTimeoutMillis: 60000, // 60 seconds
};

// Set default values for Remote Config (empty - will use Firebase Console values)
remoteConfig.defaultConfig = {};

/**
 * VAPID Key (Web Push certificate key pair) from Firebase Console.
 * Go to: Firebase Console → Project Settings → Cloud Messaging → Web Push certificates
 * Click "Generate key pair" if you don't have one, then paste the key here.
 * Without this key, getToken() will silently fail and push notifications will NOT work.
 * */
const VAPID_KEY = isTestingFirebaseProject
    ? "BGN9QKWVYx3hEiybNEdxRVoWRs28FDTj4lG_yISkjaysgCnrdb4pNIGTTzB3EBEzUnEiMjkoRGqYIt2yU6yiOPE" // Testing Key
    : "BJawApEKtpIvu-x7xTtCvJOefbfo-KVk_XBh7LAfcDZ9QhxaPofyRhNtXcDzdVJYMIQSneIWI5hhV1UthnAc1ko"; // Production Key

export const requestForToken = async () => {
    try {
        if (!messaging) {
            console.warn('[FCM] Messaging not initialized. Browser may not support it.');
            return null;
        }

        const currentToken = await getToken(messaging, { vapidKey: VAPID_KEY });
        if (currentToken) {
            console.log('[FCM] Token obtained successfully');
            return currentToken;
        } else {
            console.log('[FCM] No registration token available. Request permission to generate one.');
            return null;
        }
    } catch (err) {
        console.error('[FCM] An error occurred while retrieving token:', err);
        return null;
    }
};

export const onMessageListener = () =>
    new Promise<MessagePayload | null>(async (resolve) => {
        let unsubscribe: null | Unsubscribe = null;
        unsubscribe = await subscribeToForegroundMessages((payload) => {
            unsubscribe?.();
            resolve(payload);
        });
        if (!unsubscribe) resolve(null);
    });

export { getToken };
export default app;

