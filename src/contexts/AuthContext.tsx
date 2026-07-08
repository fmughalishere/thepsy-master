import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { auth, db } from '../lib/firebase';
import { doc, onSnapshot, updateDoc } from 'firebase/firestore';
import { requestForToken } from '../lib/firebase';

interface AuthContextType {
    currentUser: User | null;
    userData: any | null;
    loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
    currentUser: null,
    userData: null,
    loading: true,
});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [currentUser, setCurrentUser] = useState<User | null>(null);
    const [userData, setUserData] = useState<any | null>(null);
    const [loading, setLoading] = useState(true);
    const tokenUpdatedRef = useRef<string | null>(null);

    useEffect(() => {
        let unsubscribeUserData: (() => void) | null = null;

        const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
            setCurrentUser(user);

            if (user) {
                // Listen to user data changes (including isBlocked)
                unsubscribeUserData = onSnapshot(doc(db, "users", user.uid), (docSnapshot) => {
                    if (docSnapshot.exists()) {
                        setUserData({ id: docSnapshot.id, ...docSnapshot.data() });
                    } else {
                        // Document doesn't exist yet (e.g., mid-signup or deleted)
                        setUserData(null);
                    }
                    setLoading(false);
                }, (error) => {
                    console.error("Error fetching user data:", error);
                    // Don't set loading false here immediately if it's a transient permission error during auth init
                    // But usually we should.
                    setLoading(false);
                });
            } else {
                setUserData(null);
                setLoading(false);
                // Reset token ref on logout
                tokenUpdatedRef.current = null;
                if (unsubscribeUserData) unsubscribeUserData();
            }
        });

        return () => {
            unsubscribeAuth();
            if (unsubscribeUserData) unsubscribeUserData();
        };
    }, []);

    // Separate effect for FCM Token to avoid race conditions and loops
    useEffect(() => {
        const updateFcmToken = async () => {
            const isLocalhost = window.location.hostname === 'localhost' ||
                window.location.hostname === '127.0.0.1' ||
                window.location.hostname === '';

            const debugLog = (...args: any[]) => {
                if (isLocalhost) console.log(...args);
            };

            debugLog('[FCM Auth] Checking token update...', {
                hasUser: !!currentUser,
                hasUserData: !!userData,
                tokenUpdatedFor: tokenUpdatedRef.current,
                currentUid: currentUser?.uid
            });

            if (currentUser && userData && tokenUpdatedRef.current !== currentUser.uid) {
                try {
                    if (typeof Notification === 'undefined') {
                        debugLog('[FCM Auth] Notification API not supported');
                        return;
                    }

                    let permission = Notification.permission;
                    debugLog('[FCM Auth] Current notification permission:', permission);

                    if (permission === "default") {
                        debugLog('[FCM Auth] Requesting notification permission...');
                        permission = await Notification.requestPermission();
                        debugLog('[FCM Auth] Permission requested. Result:', permission);
                    }

                    if (permission === "granted") {
                        debugLog('[FCM Auth] Permission is granted');
                        const token = await requestForToken();
                        debugLog('[FCM Auth] Token result:', token ? 'obtained' : 'null');

                        if (token && userData.fcmToken !== token) {
                            await updateDoc(doc(db, "users", currentUser.uid), {
                                fcmToken: token
                            });
                            debugLog("FCM Token updated");
                        } else if (token && userData.fcmToken === token) {
                            debugLog('[FCM Auth] Token unchanged, skipping update');
                        }
                        // Mark as updated for this user session
                        tokenUpdatedRef.current = currentUser.uid;
                    } else {
                        debugLog('[FCM Auth] Notification permission not granted (final state:', permission, ')');
                        // Mark as checked for this session even if denied to avoid repeated checks
                        tokenUpdatedRef.current = currentUser.uid; 
                    }
                } catch (error: any) {
                    if (error.code !== 'not-found') {
                        console.error("[FCM Auth] Error updating FCM token:", error);
                    }
                }
            } else if (tokenUpdatedRef.current === currentUser?.uid) {
                console.log('[FCM Auth] Token already updated for this session');
            }
        };

        updateFcmToken();
    }, [currentUser, userData]); // Runs when user or data loads

    const value = {
        currentUser,
        userData,
        loading,
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
};
