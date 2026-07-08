// Scripts for firebase messaging
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// Initialize the Firebase app conditionally based on environment
const isTestingEnv = self.location.hostname === 'localhost' || self.location.hostname === '127.0.0.1';

const config = isTestingEnv ? {
    // Development Config (testing-d74ed)
    apiKey: "AIzaSyAx3FG4WxNO0VZLFDrJNdRiBStqku9SFBA",
    authDomain: "testing-d74ed.firebaseapp.com",
    projectId: "testing-d74ed",
    storageBucket: "testing-d74ed.firebasestorage.app",
    messagingSenderId: "1080448563743",
    appId: "1:1080448563743:web:34ce19c4affa2e6905332a",
} : {
    // Production Config (thepsy-f950e)
    apiKey: "AIzaSyDXFnaCRtEa0OCU1_S0RPGKdOAdR-ghSEg",
    authDomain: "thepsy-f950e.firebaseapp.com",
    projectId: "thepsy-f950e",
    storageBucket: "thepsy-f950e.firebasestorage.app",
    messagingSenderId: "646094400569",
    appId: "1:646094400569:web:590334659f3dbc2f1b31e8",
    measurementId: "G-3NYGLQN0LL"
};

firebase.initializeApp(config);

// Retrieve an instance of Firebase Messaging so that it can handle background messages.
const messaging = firebase.messaging();

messaging.onBackgroundMessage(function (payload) {
    console.log('[firebase-messaging-sw.js] Received background message ', payload);

    // To prevent duplicate notifications (one from browser handling 'notification' block, 
    // and one from this manual call), we only show manual notification if the payload 
    // is data-only (no notification block).
    if (payload.notification) {
        console.log('[firebase-messaging-sw.js] Standard notification block present. Skipping manual display to prevent duplicates.');
        return;
    }

    const data = payload.data || {};
    const notificationTitle = data.senderName || 'New Message';

    const notificationOptions = {
        body: data.message || data.text || 'You have a new message',
        icon: '/logo.png',
        badge: '/logo.png',
        tag: data.type === 'chat_message' ? `chat-${data.conversationId}` : undefined,
        data: data,
    };

    self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification click — navigate to the relevant page
self.addEventListener('notificationclick', function (event) {
    event.notification.close();

    const data = event.notification.data || {};
    const recipientRole = data.recipientRole || (data.targetRoles && data.targetRoles.includes('THERAPIST') ? 'THERAPIST' : 'PATIENT');
    const isTherapistNotif = recipientRole === 'THERAPIST';
    
    let targetUrl;

    if (data.type === 'chat_message' && data.conversationId) {
        // Redirection should go directly to the chat session
        targetUrl = isTherapistNotif ? `/therapist/chat?sessionId=${data.conversationId}` : `/chat?sessionId=${data.conversationId}`;
    } else if (data.type === 'consultation_message' && data.appointmentId) {
        targetUrl = `/consultation/${data.appointmentId}`;
    } else if (data.type === 'session_reminder' || data.type === 'appointment') {
        targetUrl = isTherapistNotif ? '/therapist/calendar' : '/calendar';
    } else if (data.type === 'ASSIGNED' || data.type === 'PROFILE' || data.type === 'THERAPIST_APPROVED') {
        targetUrl = isTherapistNotif ? '/therapist/dashboard' : '/notifications';
    } else {
        targetUrl = isTherapistNotif ? '/therapist/dashboard' : '/dashboard';
    }

    console.log('[SW] Notification Clicked. Type:', data.type, 'Target URL:', targetUrl, 'Role:', recipientRole);

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
            // Find any open window of our app
            for (const client of clientList) {
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    client.focus();
                    // Send message to let the tab handle the actual navigation
                    // (Context will check if it's the right user)
                    client.postMessage({
                        type: 'NOTIFICATION_CLICK',
                        data: data,
                        targetUrl: targetUrl
                    });
                    return;
                }
            }
            // If no window is open, open a new one with the target URL
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});
