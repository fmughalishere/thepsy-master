import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { auth, messaging, db, onMessageListener, requestForToken } from "@/lib/firebase";
import { getToken } from "firebase/messaging";
import { doc, updateDoc, arrayUnion, onSnapshot, query, collection, where, orderBy, limit } from "firebase/firestore";
import { Card } from "@/components/ui/card";
import { Bell, CheckCircle, Info, AlertTriangle, UserMinus, ClipboardCheck, CalendarX, UserPlus, Heart, Calendar, AlertCircle, Video, BellOff, Users, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { format, formatDistanceToNow } from "date-fns";
import { de, el, enUS, hr } from "date-fns/locale";
import { useAuth } from "@/contexts/AuthContext";

const Notifications = () => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const { userData } = useAuth(); // Get user data for role
    const [notifications, setNotifications] = useState<any[]>([]);
    const [permissionStatus, setPermissionStatus] = useState(Notification.permission);
    const [hasFCM, setHasFCM] = useState(false);
    const [loading, setLoading] = useState(true);

    // ... FCM Setup (keep as is) ...

    // 3. Listen to Notifications Collection (Persistence)
    useEffect(() => {
        if (!auth.currentUser) return;

        const userId = auth.currentUser.uid;
        const userRole = (userData?.role || "").toUpperCase();
        
        // 1. Target by UserId
        const q1 = query(
            collection(db, "notifications"),
            where("targetUserIds", "array-contains", userId),
            orderBy("timestamp", "desc"),
            limit(50)
        );

        // 2. Target by Role
        const q2 = query(
            collection(db, "notifications"),
            where("targetRoles", "array-contains", userRole),
            orderBy("timestamp", "desc"),
            limit(50)
        );

        // 3. Global
        const q3 = query(
            collection(db, "notifications"),
            where("global", "==", true),
            orderBy("timestamp", "desc"),
            limit(50)
        );

        setLoading(true);
        const allDocsMap = new Map();

        const mergeSnap = (snap: any) => {
            snap.forEach((doc: any) => {
                allDocsMap.set(doc.id, { id: doc.id, ...doc.data() });
            });
            const sorted = Array.from(allDocsMap.values())
                .sort((a: any, b: any) => {
                    const timeA = a.timestamp?.toMillis ? a.timestamp.toMillis() : (a.timestamp || 0);
                    const timeB = b.timestamp?.toMillis ? b.timestamp.toMillis() : (b.timestamp || 0);
                    return timeB - timeA;
                });
            setNotifications(sorted);
            setLoading(false);
        };

        const unsubs = [
            onSnapshot(q1, (snap) => mergeSnap(snap)),
            onSnapshot(q2, (snap) => mergeSnap(snap)),
            onSnapshot(q3, (snap) => mergeSnap(snap)),
        ];

        return () => unsubs.forEach(u => u());
    }, [userData]); // Dependency on userData to trigger when role loads

    const handleNotificationClick = (notif: any) => {
        const userRole = (userData?.role || "").toUpperCase();
        
        if (notif.clickAction) {
            const { type, id, url } = notif.clickAction;
            
            if (type === 'PROFILE' && id) {
                if (userRole === 'ADMIN' || userRole === 'SUPER_ADMIN') {
                    // Navigate directly to user details for admins
                    navigate(`/admin/users/${id}`);
                } else if (userRole === 'THERAPIST') {
                    // Navigate to therapist dashboard instead of individual patient profile as per feedback
                    navigate(`/therapist/dashboard`);
                }
            } else if (type === 'APPOINTMENT' && id) {
                navigate(userRole === 'THERAPIST' ? '/therapist/calendar' : '/calendar');
            } else if (type === 'CHAT' && id) {
                navigate(`/chat?sessionId=${id}`);
            } else if (type === 'URL' && url) {
                window.open(url, '_blank');
            }
            return;
        }

        // Expanded Fallback handling
        const subjectId = notif.userId || (notif.params && notif.params.id) || (notif.params && notif.params.userId) || (notif.clickAction && notif.clickAction.id);
        
        if (userRole === 'ADMIN' || userRole === 'SUPER_ADMIN') {
            // If it's a registration or approval request, try to navigate to the user profile
            const isRegistrationNotif = 
                notif.messageKey === 'notifications.registration_body' || 
                notif.titleKey === 'notifications.registration_title' ||
                notif.messageKey === 'notifications.therapist_approval_body' ||
                notif.titleKey === 'notifications.therapist_approval_title' ||
                (notif.title && notif.title.toLowerCase().includes('registration')) ||
                (notif.body && notif.body.toLowerCase().includes('registered'));

            if (isRegistrationNotif) {
                if (subjectId) {
                    navigate(`/admin/users/${subjectId}`);
                } else {
                    navigate(`/admin/users`);
                }
                return;
            }
        }

        if (notif.type === 'ASSIGNED') {
            const currentUserId = auth.currentUser?.uid;
            const otherUserId = notif.targetUserIds?.find((id: string) => id !== currentUserId);

            if (otherUserId && userRole === 'THERAPIST') {
                // Navigate to therapist dashboard instead of individual patient profile
                navigate(`/therapist/dashboard`);
            }
        }
    };

    const getLocale = () => {
        const currentLang = (i18n.resolvedLanguage || i18n.language || "en").split("-")[0];
        switch (currentLang) {
            case "de":
                return de;
            case "el":
                return el;
            case "hr":
                return hr;
            default:
                return enUS;
        }
    };

    const formatTimeAgo = (timestamp?: any) => {
        if (!timestamp) return "";
        try {
            const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
            return formatDistanceToNow(date, { addSuffix: true, locale: getLocale() });
        } catch (e) {
            return "";
        }
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'ASSIGNED': return { icon: <Users size={20} className="text-blue-500" />, bg: 'bg-blue-50' };
            case 'WELLNESS_TIP': return { icon: <Heart size={20} className="text-green-500" />, bg: 'bg-green-50' };
            case 'APPOINTMENT_RESCHEDULED': return { icon: <Calendar size={20} className="text-amber-500" />, bg: 'bg-amber-50' };
            case 'APPOINTMENT_CANCELLED': return { icon: <AlertCircle size={20} className="text-red-500" />, bg: 'bg-red-50' };
            case 'CONTRACT_TERMINATED': return { icon: <UserMinus size={20} className="text-gray-500" />, bg: 'bg-gray-50' };
            case 'THERAPIST_APPROVED': return { icon: <CheckCircle size={20} className="text-teal-500" />, bg: 'bg-teal-50' };
            case 'REGISTRATION':
            case 'PROFILE':
            case 'NEW_REGISTRATION': return { icon: <UserPlus size={20} className="text-blue-500" />, bg: 'bg-blue-50' };
            case 'THERAPIST_JOINED_CALL':
            case 'PATIENT_JOINED_CALL': return { icon: <Video size={20} className="text-indigo-500" />, bg: 'bg-indigo-50' };
            case 'chat_message': return { icon: <MessageSquare size={20} className="text-[#92C7CF]" />, bg: 'bg-[#92C7CF]/10' };
            default: return { icon: <Bell size={20} className="text-gray-500" />, bg: 'bg-gray-50' };
        }
    };

    const renderTitle = (notif: any) => {
        if (notif.titleKey) {
            return t(notif.titleKey, notif.params || {});
        }
        if (notif.type === 'ASSIGNED') {
            return userData?.role === 'THERAPIST' ? t('notifications.assigned_therapist') : t('notifications.matched_patient');
        }
        return notif.title || t('notifications.title');
    };

    const renderBody = (notif: any) => {
        if (notif.messageKey) {
            return t(notif.messageKey, notif.params || {});
        }
        if (notif.type === 'ASSIGNED') {
            return "";
        }
        const message = notif.body || notif.message || "";
        return message.replace('[role]', userData?.role === 'THERAPIST' ? t('role_selection.therapist.label') : t('role_selection.client.label'));
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#508C96]"></div>
            </div>
        );
    }

    return (
        <div className="relative min-h-screen bg-[#F9FAFB] font-sans overflow-hidden">
            {/* Background Decorative Circles */}
            <div className="absolute top-[-90px] right-[-150px] w-[50vh] h-[50vh] bg-[#92C7CF]/20 rounded-full pointer-events-none" />
            <div className="absolute top-[-150px] left-1/2 transform -translate-x-1/2 w-full h-[50vh] bg-[#AAD7D9]/20 rounded-[50%] pointer-events-none" />

            <div className="relative z-10 p-4 lg:p-8 max-w-4xl mx-auto">
                <div className="flex flex-col items-center mb-10">
                    <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-4">
                        <Bell size={32} className="text-[#508C96]" />
                    </div>
                    <h1 className="text-3xl lg:text-4xl font-kalnia text-[#508C96]">{t('notifications.title', 'Notification')}</h1>
                    {permissionStatus !== 'granted' && (
                        <Button
                            variant="ghost"
                            size="sm"
                            className="mt-4 text-orange-600 bg-orange-50 hover:bg-orange-100 rounded-full px-4"
                            onClick={() => Notification.requestPermission().then(async (perm) => {
                                setPermissionStatus(perm);
                                if (perm === 'granted' && auth.currentUser) {
                                    const token = await requestForToken();
                                    if (token) {
                                        await updateDoc(doc(db, "users", auth.currentUser.uid), { fcmToken: token });
                                    }
                                }
                            })}
                        >
                            {t('notifications.enable_permission', 'Enable Notifications')}
                        </Button>
                    )}
                </div>

                <div className="space-y-4 max-w-2xl mx-auto pb-10">
                    {notifications.length > 0 ? (
                        notifications.map((notif: any) => {
                            const title = renderTitle(notif);
                            const timeAgo = formatTimeAgo(notif.timestamp || notif.timeAgo);
                            const body = renderBody(notif);

                            return (
                                <div
                                    key={notif.id}
                                    onClick={() => handleNotificationClick(notif)}
                                    className={`group flex gap-4 p-5 bg-white/60 backdrop-blur-md rounded-[24px] border border-white shadow-sm hover:shadow-md hover:bg-white transition-all duration-300 transform hover:-translate-y-0.5 cursor-pointer ${notif.type === "ASSIGNED" ? "items-center" : "items-start"}`}
                                >
                                    {/* Icon Container */}
                                    <div className={`flex-shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center transition-transform group-hover:scale-110 ${getIcon(notif.type).bg}`}>
                                        {getIcon(notif.type).icon}
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                        {notif.type === "ASSIGNED" ? (
                                            <div className="flex flex-col items-start text-left">
                                                <h4 className="text-sm font-bold text-gray-900">
                                                    {title}
                                                </h4>
                                                {!!timeAgo && (
                                                    <span className="mt-1 text-[10px] font-medium text-gray-400">
                                                        {timeAgo}
                                                    </span>
                                                )}
                                            </div>
                                        ) : (
                                            <>
                                                <div className="flex justify-between items-start mb-1">
                                                    <h4 className="text-sm font-bold text-gray-900 truncate">
                                                        {title}
                                                    </h4>
                                                    <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wider ml-2 whitespace-nowrap">
                                                        {timeAgo}
                                                    </span>
                                                </div>
                                                {!!body && (
                                                    <p className="text-sm text-gray-600 leading-relaxed line-clamp-2">
                                                        {body}
                                                    </p>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        })
                    ) : (
                        <div className="text-center py-20 bg-white/40 backdrop-blur-sm rounded-[32px] border border-white/60">
                            <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-6">
                                <BellOff className="text-gray-300" size={40} />
                            </div>
                            <h3 className="text-xl font-bold text-gray-900 mb-2">{t('notifications.empty_title', 'No notifications yet')}</h3>
                            <p className="text-gray-500 max-w-xs mx-auto leading-relaxed">
                                {t('notifications.empty_subtitle', 'We will notify you about your appointments and updates here.')}
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default Notifications;
