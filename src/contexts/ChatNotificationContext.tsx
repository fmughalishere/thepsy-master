import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { auth, db, subscribeToForegroundMessages } from '@/lib/firebase';
import { collection, query, where, onSnapshot, orderBy, limit, Timestamp } from 'firebase/firestore';
import type { MessagePayload } from 'firebase/messaging';
import { toast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

interface ChatNotificationContextType {
    unreadChatCount: number;
    clearUnreadChat: () => void;
}

const ChatNotificationContext = createContext<ChatNotificationContextType>({
    unreadChatCount: 0,
    clearUnreadChat: () => { },
});

export const useChatNotifications = () => useContext(ChatNotificationContext);

const safeLocalStorageGetItem = (key: string) => {
    try {
        return localStorage.getItem(key);
    } catch {
        return null;
    }
};

const safeLocalStorageSetItem = (key: string, value: string) => {
    try {
        localStorage.setItem(key, value);
    } catch {
        // ignore (Safari private mode / storage disabled)
    }
};

export const ChatNotificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [unreadChatCount, setUnreadChatCount] = useState(0);
    const { userData } = useAuth();
    const navigate = useNavigate();

    // Track the timestamp of the last time user viewed the chat page
    const [lastChatViewTime, setLastChatViewTime] = useState<number>(() => {
        const stored = safeLocalStorageGetItem('lastChatViewTime');
        const parsed = stored ? parseInt(stored, 10) : NaN;
        return Number.isFinite(parsed) ? parsed : Date.now();
    });

    const clearUnreadChat = useCallback(() => {
        setUnreadChatCount(0);
        const now = Date.now();
        setLastChatViewTime(now);
        safeLocalStorageSetItem('lastChatViewTime', now.toString());
    }, []);

    // Listen for unread messages across all conversations the user is an occupant of
    useEffect(() => {
        const currentUser = auth.currentUser;
        if (!currentUser) return;

        // Listen for conversations where this user is an occupant
        const conversationsQuery = query(
            collection(db, 'conversations'),
            where('occupants', 'array-contains', currentUser.uid)
        );

        const unsubConversations = onSnapshot(conversationsQuery, (snapshot) => {
            let totalUnread = 0;

            snapshot.docs.forEach((convDoc) => {
                const data = convDoc.data();
                // Check lastMessage timestamp vs our lastChatViewTime
                const lastMsg = data.lastMessage;
                if (lastMsg) {
                    const lastMsgTime = lastMsg.timestamp?.toMillis?.() || lastMsg.timestamp?.seconds * 1000 || 0;
                    const lastMsgSender = lastMsg.senderId;

                    // Only count if sender is NOT the current user and message is newer than last view
                    if (lastMsgSender !== currentUser.uid && lastMsgTime > lastChatViewTime) {
                        totalUnread++;
                    }
                }
            });

            setUnreadChatCount(totalUnread);
        });

        return () => unsubConversations();
    }, [lastChatViewTime]);

    // Listen for foreground FCM messages and show toast + handle navigation
    useEffect(() => {
        let cancelled = false;
        let unsubscribe: null | (() => void) = null;

        const setupForegroundListener = async () => {
            try {
                unsubscribe = await subscribeToForegroundMessages((payload: MessagePayload) => {
                    console.log('[FCM] Foreground message received:', payload);
                    if (cancelled) return;

                    const data = payload.data || {};
                    const notification = payload.notification;

                    if (notification && auth.currentUser) {
                        const currentUserId = auth.currentUser.uid;
                        const currentUserRole = userData?.role?.toUpperCase();
                        const senderId = data.senderId;

                        console.log('[FCM] Processing message:', { 
                            type: data.type, 
                            senderId, 
                            currentUserId,
                            isSender: senderId === currentUserId 
                        });

                        let shouldShow = true;

                        // 1. Never show if we are the sender
                        if (senderId === currentUserId) {
                            console.log('[FCM] We are the sender. Skipping.');
                            shouldShow = false;
                        }

                        // 2. Check user-specific targeting
                        if (shouldShow && data.targetUserIds) {
                            const targetUserIds = data.targetUserIds.split(',');
                            if (!targetUserIds.includes(currentUserId)) {
                                console.log('[FCM] currentUserId not in targetUserIds. Skipping.');
                                shouldShow = false;
                            }
                        }

                        // 3. Check role-based targeting
                        if (shouldShow && data.targetRoles) {
                            const targetRoles = data.targetRoles.split(',').map((r) => r.trim().toUpperCase());
                            if (currentUserRole && !targetRoles.includes(currentUserRole)) {
                                console.log('[FCM] currentUserRole not in targetRoles. Skipping.');
                                shouldShow = false;
                            }
                        }

                        if (shouldShow) {
                            const isChatPage = window.location.pathname === '/chat' || window.location.pathname.startsWith('/consultation/');
                             
                            if ((data.type === 'chat_message' || data.type === 'consultation_message') && isChatPage) {
                                console.log('[FCM] User on chat/consultation page. Suppressing toast/badge.');
                                return;
                            }

                            toast({
                                title: notification.title || 'New Notification',
                                description: notification.body || '',
                                duration: 5000,
                            });

                            if (data.type === 'chat_message' || data.type === 'consultation_message') {
                                setUnreadChatCount((prev) => prev + 1);
                            }
                        }
                    } else {
                        console.log('[FCM] Background message or not logged in.');
                    }
                });
            } catch (err) {
                console.error('Foreground message listener error:', err);
            }
        };

        setupForegroundListener();

        return () => {
            cancelled = true;
            unsubscribe?.();
        };
    }, [userData]); // Added userData dependency for role checks

    // Listen for service worker messages (notification click navigation)
    useEffect(() => {
        const handleMessage = (event: MessageEvent) => {
            if (event.data?.type === 'NOTIFICATION_CLICK') {
                const targetUrl = event.data.targetUrl;
                const data = event.data.data || {};
                const currentUser = auth.currentUser;
                
                if (targetUrl && currentUser) {
                    // Safety check: Only navigate if this tab's logged-in user is a target of the notification
                    // data.targetUserIds is a comma-separated string from the Cloud Function
                    const targetUserIds = data.targetUserIds?.split(',') || [];
                    
                    if (targetUserIds.length === 0 || targetUserIds.includes(currentUser.uid)) {
                        console.log('[FCM] Tab matched recipient. Navigating to:', targetUrl);
                        navigate(targetUrl);
                    } else {
                        console.log('[FCM] Tab user did not match notification recipient. Ignoring navigation request.');
                    }
                }
            }
        };

        navigator.serviceWorker?.addEventListener('message', handleMessage);
        return () => {
            navigator.serviceWorker?.removeEventListener('message', handleMessage);
        };
    }, [navigate]);

    return (
        <ChatNotificationContext.Provider value={{ unreadChatCount, clearUnreadChat }}>
            {children}
        </ChatNotificationContext.Provider>
    );
};
