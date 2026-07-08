import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { auth, db } from '@/lib/firebase';
import {
    doc,
    getDoc,
    collection,
    query,
    orderBy,
    onSnapshot,
    addDoc,
    serverTimestamp,
    updateDoc,
    Timestamp
} from 'firebase/firestore';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Send, ArrowLeft, X } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { updateSessionTiming, updateAppointmentPayment } from '@/services/payrollService';
import { encryptMessage, decryptMessage } from '@/lib/encryption';

interface Message {
    id: string;
    message: string;
    senderId: string;
    senderName: string;
    timestamp: any;
    isFromCurrentUser: boolean;
}

const ConsultationRoom = () => {
    const { appointmentId } = useParams();
    const navigate = useNavigate();
    const { t } = useTranslation();

    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState('');
    const [isLoading, setIsLoading] = useState(true);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [otherUser, setOtherUser] = useState<{ name: string; image?: string } | null>(null);
    const [isTherapist, setIsTherapist] = useState(false);
    const [bothConnected, setBothConnected] = useState(false);
    const [isSessionActive, setIsSessionActive] = useState(true);
    const [showEndDialog, setShowEndDialog] = useState(false);
    const [hasSentJoinNotif, setHasSentJoinNotif] = useState(false);
    const [patientId, setPatientId] = useState<string | null>(null);
    const [therapistId, setTherapistId] = useState<string | null>(null);

    const [accumulatedDuration, setAccumulatedDuration] = useState(0);
    const [lastActiveTimestamp, setLastActiveTimestamp] = useState<Timestamp | null>(null);
    const [currentDuration, setCurrentDuration] = useState(0);

    const scrollRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
        }
    }, [newMessage]);

    // Initialize consultation session
    useEffect(() => {
        let unsubscribeApp: (() => void) | undefined;

        const initConsultation = async () => {
            if (!appointmentId || !auth.currentUser) return;

            try {
                const appRef = doc(db, 'appointments', appointmentId);
                const appointmentDoc = await getDoc(appRef);
                if (!appointmentDoc.exists()) {
                    toast({ title: 'Error', description: 'Appointment not found', variant: 'destructive' });
                    navigate(-1);
                    return;
                }

                const appointment = appointmentDoc.data();

                // Join Restriction: 15 mins before
                const startTimestamp = appointment.startTimestamp;
                if (startTimestamp) {
                    const startTime = startTimestamp.toDate();
                    const now = new Date();
                    const diffMinutes = (startTime.getTime() - now.getTime()) / (1000 * 60);

                    if (diffMinutes > 15) {
                        toast({
                            title: t('consultation.not_started_title', 'Session hasn\'t started'),
                            description: t('consultation.not_started_desc', `You can only join this session 15 minutes before the scheduled time ({{time}}).`, {
                                time: startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            }),
                            variant: 'destructive'
                        });
                        navigate(-1);
                        return;
                    }
                }

                if (appointment.status === 'COMPLETED') {
                    toast({
                        title: t('consultation.status_completed', 'Session Completed'),
                        description: t('consultation.status_completed_desc', 'This session has already been completed.'),
                        variant: 'default'
                    });
                    setIsSessionActive(false);
                }

                setSessionId(appointmentDoc.id);
                const isUserTherapist = appointment.therapistId === auth.currentUser.uid;
                setIsTherapist(isUserTherapist);

                // Update connection status
                const connectionField = isUserTherapist ? 'therapistConnected' : 'patientConnected';
                await updateDoc(appRef, { [connectionField]: true });

                setAccumulatedDuration(appointment.accumulatedDurationSeconds || 0);
                setLastActiveTimestamp(appointment.lastActiveTimestamp || null);
                setPatientId(appointment.bookedBy || appointment.patientId);
                setTherapistId(appointment.therapistId);
                if (appointment.status !== 'COMPLETED') {
                    setIsSessionActive(true);
                }

                const otherUserId = isUserTherapist ? appointment.bookedBy : appointment.therapistId;
                if (otherUserId) {
                    const userDoc = await getDoc(doc(db, "users", otherUserId));
                    if (userDoc.exists()) {
                        const userData = userDoc.data();
                        setOtherUser({ name: userData.displayName || 'User', image: userData.profilePicture });
                    }
                }

                // Listen for both connected and sync timer
                unsubscribeApp = onSnapshot(appRef, (docSnap) => {
                    if (docSnap.exists()) {
                        const data = docSnap.data();
                        const isBoth = data.therapistConnected === true && data.patientConnected === true;
                        setBothConnected(isBoth);

                        if (!isUserTherapist) {
                            setAccumulatedDuration(data.accumulatedDurationSeconds || 0);
                            setLastActiveTimestamp(data.lastActiveTimestamp);
                        }
                    }
                });

                setIsLoading(false);
            } catch (error) {
                console.error('Error initializing consultation:', error);
                toast({ title: 'Error', description: 'Failed to load consultation', variant: 'destructive' });
                navigate(-1);
            }
        };

        initConsultation();

        return () => {
            if (unsubscribeApp) unsubscribeApp();
            if (appointmentId && auth.currentUser) {
                const appRef = doc(db, 'appointments', appointmentId);
                getDoc(appRef).then(snap => {
                    if (snap.exists()) {
                        const data = snap.data();
                        const connectionField = (data.therapistId === auth.currentUser?.uid) ? 'therapistConnected' : 'patientConnected';
                        updateDoc(appRef, { [connectionField]: false });
                    }
                });
            }
        };
    }, [appointmentId, navigate]);

    // Send Join Notification
    useEffect(() => {
        const sendJoinNotification = async () => {
            if (sessionId && !hasSentJoinNotif && patientId && therapistId && auth.currentUser) {
                const targetUserId = isTherapist ? patientId : therapistId;
                const body = isTherapist
                    ? t('notifications.therapist_joined', 'Therapist has joined the session')
                    : t('notifications.patient_joined', 'Patient has joined the session');

                try {
                    await addDoc(collection(db, "notifications"), {
                        title: t('notifications.call_update', 'Call Update'),
                        body: body,
                        timestamp: Timestamp.now(),
                        targetUserIds: [targetUserId],
                        type: 'SESSION_JOINED'
                    });
                    setHasSentJoinNotif(true);
                } catch (e) {
                    console.error("Error sending join notification:", e);
                }
            }
        };
        sendJoinNotification();
    }, [sessionId, hasSentJoinNotif, patientId, therapistId, isTherapist, t]);

    // Timer sync logic for Therapist
    useEffect(() => {
        if (!isTherapist || !appointmentId) return;

        const syncTimer = async () => {
            const appRef = doc(db, 'appointments', appointmentId);
            const now = Timestamp.now();

            if (bothConnected) {
                // Start/Resume if not already running
                if (!lastActiveTimestamp) {
                    await updateDoc(appRef, {
                        lastActiveTimestamp: now,
                        status: 'IN_PROGRESS'
                    });
                    setLastActiveTimestamp(now);
                }
            } else {
                // Pause if running
                if (lastActiveTimestamp) {
                    const diffSeconds = Math.floor((now.seconds - lastActiveTimestamp.seconds));
                    const newAccumulated = accumulatedDuration + diffSeconds;

                    await updateDoc(appRef, {
                        lastActiveTimestamp: null,
                        accumulatedDurationSeconds: newAccumulated
                    });
                    setAccumulatedDuration(newAccumulated);
                    setLastActiveTimestamp(null);
                }
            }
        };

        syncTimer();
    }, [bothConnected, isTherapist, appointmentId]);

    // Listen for messages
    useEffect(() => {
        if (!sessionId) return;

        const messagesRef = collection(db, 'consultationSessions', sessionId, 'messages');
        const q = query(messagesRef, orderBy('timestamp', 'asc'));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const msgs: Message[] = snapshot.docs.map(doc => {
                const data = doc.data();
                const rawMessage = data.message || '';
                const decrypted = decryptMessage(rawMessage, sessionId);
                return {
                    id: doc.id,
                    message: decrypted,
                    senderId: data.senderId || '',
                    senderName: data.senderName || '',
                    timestamp: data.timestamp,
                    isFromCurrentUser: data.senderId === auth.currentUser?.uid
                };
            });

            setMessages(msgs);
            setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
        });

        return () => unsubscribe();
    }, [sessionId]);

    // Timer countdown
    // Timer Logic
    useEffect(() => {
        if (!isSessionActive) return;

        const interval = setInterval(() => {
            if (lastActiveTimestamp && bothConnected) {
                let diffSeconds = 0;
                // Safety check if it's a Timestamp object or plain object
                if (typeof lastActiveTimestamp.toDate === 'function') {
                    const now = new Date();
                    diffSeconds = Math.floor((now.getTime() - lastActiveTimestamp.toDate().getTime()) / 1000);
                } else if ((lastActiveTimestamp as any).seconds) {
                    // Fallback for plain object
                    const now = Date.now() / 1000;
                    diffSeconds = Math.floor(now - (lastActiveTimestamp as any).seconds);
                } else if (lastActiveTimestamp instanceof Date) {
                    const now = new Date();
                    diffSeconds = Math.floor((now.getTime() - lastActiveTimestamp.getTime()) / 1000);
                }

                const total = (accumulatedDuration || 0) + diffSeconds;
                setCurrentDuration(isNaN(total) ? 0 : total);
            } else {
                setCurrentDuration(accumulatedDuration || 0);
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [isSessionActive, lastActiveTimestamp, accumulatedDuration]);

    // Save state on unload/close
    useEffect(() => {
        const handleUnload = () => {
            if (lastActiveTimestamp && appointmentId) {
                const now = new Date();
                const diffSeconds = Math.floor((now.getTime() - lastActiveTimestamp.toDate().getTime()) / 1000);
                const newAccumulated = accumulatedDuration + diffSeconds;

                // Using sendBeacon or similar is ideal, but for Firestore we try best effort
                // We'll queue this update. Note: async/await doesn't block unload reliably.
                // For a robust app, we assume the server might also auto-close via heartbeat, 
                // but here we just try to save.

                // Note: We cannot easily use Firestore SDK in unload handler reliably.
                // However, we can at least warn the user.
            }
        };

        const handleBeforeUnload = (e: BeforeUnloadEvent) => {
            e.preventDefault();
            e.returnValue = '';
        };

        window.addEventListener('beforeunload', handleBeforeUnload);
        // We can't actually "save" reliably on close without service workers or sync beacon.
        // But we will save on unmount of component if navigation happens within app.

        return () => {
            window.removeEventListener('beforeunload', handleBeforeUnload);

            // If component unmounts (navigates away), we pause.
            if (lastActiveTimestamp && appointmentId) {
                const now = new Date();
                const diffSeconds = Math.floor((now.getTime() - lastActiveTimestamp.toDate().getTime()) / 1000);
                const newAccumulated = accumulatedDuration + diffSeconds;

                updateDoc(doc(db, 'appointments', appointmentId), {
                    lastActiveTimestamp: null,
                    accumulatedDurationSeconds: newAccumulated
                }).catch(err => console.error("Failed to pause session", err));
            }
        };
    }, [appointmentId, lastActiveTimestamp, accumulatedDuration]);

    const formatTime = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const handleSendMessage = async () => {
        if (!newMessage.trim() || !sessionId || !auth.currentUser) return;

        try {
            // Track patient join time on first message
            // Track first message time if needed, but we use session start now
            /* if (!patientJoinTime) {
                 // Logic handled by session Init
            } */

            const encrypted = encryptMessage(newMessage.trim(), sessionId);

            await addDoc(collection(db, 'consultationSessions', sessionId, 'messages'), {
                message: encrypted,
                senderId: auth.currentUser.uid,
                senderName: auth.currentUser.displayName || 'User',
                timestamp: serverTimestamp()
            });

            setNewMessage('');
        } catch (error) {
            console.error('Error sending message:', error);
            toast({ title: 'Error', description: 'Failed to send message', variant: 'destructive' });
        }
    };

    const handleEndSession = async () => {
        if (!appointmentId) {
            navigate(-1);
            return;
        }

        try {
            const sessionEndTime = Timestamp.now();
            // Final duration calculation
            let finalDuration = currentDuration;
            if (lastActiveTimestamp) {
                const diffSeconds = Math.floor((sessionEndTime.toDate().getTime() - lastActiveTimestamp.toDate().getTime()) / 1000);
                finalDuration = accumulatedDuration + diffSeconds;
            }

            // Update appointment with completion and payroll data
            await updateDoc(doc(db, 'appointments', appointmentId), {
                status: 'COMPLETED',
                sessionEndedAt: sessionEndTime,
                sessionDurationSeconds: finalDuration,
                lastActiveTimestamp: null,
                accumulatedDurationSeconds: finalDuration
            });

            // Update payroll timing and calculate payment
            // Hack: Create a fake "start time" that matches the duration ending at "now"
            const fakeStartTime = new Timestamp(sessionEndTime.seconds - finalDuration, 0);
            await updateSessionTiming(appointmentId, fakeStartTime, sessionEndTime);
            await updateAppointmentPayment(appointmentId);

            console.log(`Consultation completed: ${finalDuration} seconds`);

            toast({ title: t('common.success', 'Success'), description: t('consultation.session_completed_toast', 'Session completed successfully') });
            navigate(-1);
        } catch (error) {
            console.error('Error ending session:', error);
            toast({ title: t('common.error', 'Error'), description: t('consultation.error_end_session', 'Failed to end session'), variant: 'destructive' });
            navigate(-1);
        }
    };

    const handleLeaveOnly = async () => {
        navigate(-1);
    };

    if (isLoading) {
        return (
            <div className="h-screen flex items-center justify-center bg-gray-50">
                <div className="text-center">
                    <div className="animate-spin h-10 w-10 border-4 border-[#92C7CF] rounded-full border-t-transparent mx-auto mb-4" />
                    <p className="text-gray-600 font-sans">{t('consultation.loading', 'Loading consultation...')}</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-gray-50">
            {/* Header */}
            <div className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setShowEndDialog(true)}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5 text-gray-600" />
                    </button>

                    <Avatar className="w-10 h-10">
                        <AvatarImage src={otherUser?.image} />
                        <AvatarFallback>{otherUser?.name?.[0] || 'U'}</AvatarFallback>
                    </Avatar>

                    <div>
                        <h2 className="font-semibold text-gray-900">{otherUser?.name || 'User'}</h2>
                        <p className="text-xs text-gray-500">Chat</p>
                    </div>
                </div>

                {/* Timer - Visible only to therapist */}
                {isTherapist && (
                    <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-[#92C7CF]/10 border border-[#92C7CF]/30 mr-20">
                        <div className={`w-2 h-2 rounded-full ${bothConnected ? 'bg-[#508C96] animate-pulse' : 'bg-gray-400'}`}></div>
                        <span className="font-mono font-bold text-[#508C96] text-lg tabular-nums">
                            {formatTime(currentDuration)}
                        </span>
                        {!bothConnected && <span className="text-[10px] text-[#508C96]/60 ml-1 uppercase tracking-tighter">Paused</span>}
                    </div>
                )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((msg) => (
                    <div
                        key={msg.id}
                        className={`flex ${msg.isFromCurrentUser ? 'justify-end' : 'justify-start'}`}
                    >
                        <div
                            className={`max-w-[70%] rounded-2xl px-4 py-2 ${msg.isFromCurrentUser
                                ? 'bg-[#92C7CF] text-white'
                                : 'bg-white text-gray-900 border border-gray-200'
                                }`}
                        >
                            {!msg.isFromCurrentUser && (
                                <p className="text-xs font-medium mb-1 opacity-70">{msg.senderName}</p>
                            )}
                            <p className="text-sm">{msg.message}</p>
                            <p className={`text-xs mt-1 ${msg.isFromCurrentUser ? 'text-white/80' : 'text-gray-500'}`}>
                                {msg.timestamp?.toDate?.()?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) || ''}
                            </p>
                        </div>
                    </div>
                ))}
                <div ref={scrollRef} />
            </div>

            {/* Input */}
            <div className="bg-white border-t border-gray-200 p-4">
                <div className="flex gap-2">
                    <Textarea
                        ref={textareaRef}
                        value={newMessage}
                        onChange={(e) => setNewMessage(e.target.value)}
                        onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                                e.preventDefault();
                                handleSendMessage();
                            }
                        }}
                        placeholder={t('chat.placeholder', 'Type a message...')}
                        disabled={!isSessionActive}
                        rows={1}
                        className="flex-1 bg-white border-gray-200 focus-visible:ring-[#92C7CF] rounded-xl min-h-[48px] max-h-[200px] resize-none py-3 px-4 scrollbar-hide text-sm md:text-base"
                    />
                    <Button
                        onClick={handleSendMessage}
                        disabled={!newMessage.trim() || !isSessionActive}
                        className="bg-[#92C7CF] hover:bg-[#7FB0B8]"
                    >
                        <Send className="w-5 h-5" />
                    </Button>
                </div>
                {!isSessionActive && (
                    <p className="text-sm text-red-600 mt-2 text-center font-medium">
                        {t('consultation.status_completed', 'Session Completed')}
                    </p>
                )}
            </div>

            {/* End Session Dialog */}
            {showEndDialog && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-in fade-in duration-200">
                    <div className="bg-white rounded-[24px] p-8 max-w-md w-full mx-4 shadow-2xl">
                        <h3 className="text-2xl font-bold text-gray-900 mb-2 font-sans">
                            {t('consultation.end_session_title', 'End Session?')}
                        </h3>
                        <p className="text-gray-600 mb-8 font-sans leading-relaxed">
                            {t('consultation.leave_confirm_desc', 'You can leave the room and rejoin later as long as the session time hasn\'t expired.')}
                        </p>

                        <div className="flex flex-col gap-3">
                            <div className="flex gap-3">
                                <Button
                                    onClick={() => setShowEndDialog(false)}
                                    variant="outline"
                                    className="flex-1 h-12 rounded-xl font-medium border-gray-200"
                                >
                                    {t('consultation.cancel', 'Cancel')}
                                </Button>
                                <Button
                                    onClick={handleLeaveOnly}
                                    className="flex-1 h-12 rounded-xl bg-gray-100 hover:bg-gray-200 text-gray-900 border-none font-medium"
                                >
                                    {t('consultation.leave_session', 'Leave Room')}
                                </Button>
                            </div>

                            {isTherapist && (
                                <Button
                                    onClick={handleEndSession}
                                    className="w-full h-12 rounded-xl bg-[#508C96] hover:bg-[#3A8F9B] text-white font-bold transition-all"
                                >
                                    {t('consultation.end_session', 'End Session Permanently')}
                                </Button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default ConsultationRoom;
