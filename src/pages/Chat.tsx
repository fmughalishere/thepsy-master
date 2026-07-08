import { useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, collection, query, orderBy, onSnapshot, addDoc, serverTimestamp, updateDoc, getDocs, where } from "firebase/firestore";
import { storage } from "@/lib/firebase"; // Make sure to export storage from firebase.ts
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Send, MoreVertical, ArrowLeft, Plus, Image as ImageIcon, FileText, X } from "lucide-react";
import { Dialog, DialogContent, DialogTrigger } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import { encryptMessage, decryptMessage } from "@/lib/encryption";
import { updateSessionTiming, updateAppointmentPayment, getPayrollSettings } from "@/services/payrollService";
import { Timestamp } from "firebase/firestore";
import { useChatNotifications } from "@/contexts/ChatNotificationContext";


interface Message {
    id: string;
    text: string;
    senderId: string;
    senderName: string;
    timestamp: any;
    isFromCurrentUser: boolean;
    attachmentUrl?: string;
    messageType?: 'TEXT' | 'IMAGE' | 'DOCUMENT' | 'AUDIO';
}

const Chat = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const { clearUnreadChat } = useChatNotifications();


    // If appointmentId is passed via URL, we can use it. 
    // Otherwise, we might default to the "current" open appointment with the therapist.
    // For this implementation, we'll try to find the active conversation similarly to PsyCMp.

    const [messages, setMessages] = useState<Message[]>([]);
    const [newMessage, setNewMessage] = useState("");
    const [isLoading, setIsLoading] = useState(true);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const [otherUser, setOtherUser] = useState<{ name: string, image?: string, id: string } | null>(null);
    const [currentUserRole, setCurrentUserRole] = useState<string | null>(null);
    const [isBasicPlan, setIsBasicPlan] = useState(false);
    const [messageLimit, setMessageLimit] = useState(3);
    const [messageWordLimit, setMessageWordLimit] = useState(500);
    const scrollRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    // Auto-resize textarea
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = "auto";
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
        }
    }, [newMessage]);

    const dailyMessageCount = isBasicPlan ? messages.filter(m => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const todayTimestamp = today.getTime();
        const msgTime = m.timestamp ? m.timestamp.toMillis() : Date.now();
        return m.isFromCurrentUser && msgTime >= todayTimestamp;
    }).length : 0;

    // 1. Initialize Conversation (Find Session & Other User)
    useEffect(() => {
        // Clear unread badge when entering chat
        clearUnreadChat();

        const initChat = async () => {
            if (!auth.currentUser) return;
            try {
                const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
                if (!userDoc.exists()) return;

                // Load payroll settings for message limit
                try {
                    const settings = await getPayrollSettings();
                    if (settings && settings.baseDailyMessageLimit) {
                        setMessageLimit(settings.baseDailyMessageLimit);
                    }
                    if (settings && settings.messageWordLimit) {
                        setMessageWordLimit(settings.messageWordLimit);
                    }
                } catch (error) {
                    console.error("Error loading chat limit:", error);
                }

                const userData = userDoc.data();
                setCurrentUserRole(userData.role);

                // Check Plan — message limit only applies to PATIENTS with a basic plan.
                // Therapists are ALWAYS allowed to send unlimited messages.
                console.log(`[Chat] User role detected: ${userData.role}`);
                if (userData.role === 'PATIENT') {
                    const planName = userData.patientDetails?.quotas?.planName || "basic";
                    console.log(`[Chat] Patient plan: ${planName}`);
                    if (planName.toLowerCase().includes('basic')) {
                        setIsBasicPlan(true);
                    } else {
                        setIsBasicPlan(false);
                    }
                } else {
                    console.log(`[Chat] Non-patient user, ensuring message limit is disabled.`);
                    setIsBasicPlan(false);
                }

                // Logic to determine session ID
                // In PsyCMp, patientDetails.conversationId or active appointment is used.
                // We'll mimic checking 'patientDetails' for a linked therapist or conversation.

                let targetSessionId = searchParams.get('sessionId');
                let targetUserId = "";

                let therapistDbg: Record<string, unknown> = {};

                if (userData.role === 'PATIENT') {
                    // If patient, find assigned therapist
                    targetUserId = userData.patientDetails?.assignedTherapist || userData.patientDetails?.therapistId;
                    targetSessionId = userData.patientDetails?.conversationId; // PsyCMp sets this on matching
                    // #region agent log
                    fetch('http://127.0.0.1:7477/ingest/385ee47e-a3ea-4f67-831f-297fb5616e44',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'dbe0d4'},body:JSON.stringify({sessionId:'dbe0d4',runId:'pre-fix',hypothesisId:'H3',location:'Chat.tsx:initChat:PATIENT',message:'patient chat init resolution',data:{hasConversationId:!!targetSessionId,hasAssignedTherapist:!!userData.patientDetails?.assignedTherapist,hasLegacyTherapistId:!!userData.patientDetails?.therapistId},timestamp:Date.now()})}).catch(()=>{});
                    // #endregion
                } else if (userData.role === 'THERAPIST') {
                    // Try to get patient ID from URL or conversation
                    let patientId = searchParams.get('patientId');

                    // If we have patientId, we can also check THAT patient's details for conversationId 
                    // (if we have access to read it, which we should as therapist)
                    if (patientId && !targetSessionId) {
                        const patientDoc = await getDoc(doc(db, "users", patientId));
                        if (patientDoc.exists()) {
                            const pData = patientDoc.data();
                            const assignMatch = pData.patientDetails?.assignedTherapist === auth.currentUser.uid;
                            const legacyTherapistMatch = pData.patientDetails?.therapistId === auth.currentUser.uid;
                            therapistDbg = { ...therapistDbg, patientIdFromUrl: true, assignMatch, legacyTherapistMatch, convFromPatientDoc: !!pData.patientDetails?.conversationId };
                            // Check if this patient is assigned to us
                            if (pData.patientDetails?.assignedTherapist === auth.currentUser.uid) {
                                targetSessionId = pData.patientDetails?.conversationId;
                            }
                        }
                    }

                    if (!patientId && targetSessionId) {
                        const convDoc = await getDoc(doc(db, "conversations", targetSessionId));
                        if (convDoc.exists()) {
                            const convData = convDoc.data();
                            // Find occupant that is NOT the therapist
                            const occupants = convData.occupants || [];
                            therapistDbg = { ...therapistDbg, sessionFromUrl: true, convOccupantsLen: occupants.length, hasParticipantsArray: Array.isArray(convData.participants) };
                            patientId = occupants.find((uid: string) => uid !== auth.currentUser?.uid);
                        }
                    }

                    if (patientId) {
                        targetUserId = patientId;
                        // If we have patientId but no sessionId, try to find conversation
                        if (!targetSessionId) {
                            const conversationsQuery = query(
                                collection(db, "conversations"),
                                where("occupants", "array-contains", auth.currentUser.uid)
                            );
                            const convSnapshot = await getDocs(query(collection(db, "conversations"), where("occupants", "array-contains", auth.currentUser.uid)));
                            // Client-side filter for the other occupant (not ideal but "occupants" is array). 
                            // Better: store pair IDs or distinct fields if possible. 
                            // PsyCMp approach: Check creating new conversation logic.
                            // Actually, we can just query conversations where patientId is X and therapistId is Y if stored like that?
                            // Standard PsyCMp Conversation model: id, occupants: [uid1, uid2].

                            // Let's filter the snapshot
                            const existingConv = convSnapshot.docs.find(doc => {
                                const data = doc.data();
                                const occ = data.occupants;
                                return Array.isArray(occ) && occ.includes(patientId);
                            });

                            therapistDbg = { ...therapistDbg, therapistOccupantQueryCount: convSnapshot.docs.length, foundConvByOccupants: !!existingConv };

                            if (existingConv) {
                                targetSessionId = existingConv.id;
                            }
                        }
                    }
                    // #region agent log
                    fetch('http://127.0.0.1:7477/ingest/385ee47e-a3ea-4f67-831f-297fb5616e44',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'dbe0d4'},body:JSON.stringify({sessionId:'dbe0d4',runId:'pre-fix',hypothesisId:'H1',location:'Chat.tsx:initChat:THERAPIST',message:'therapist chat init resolution',data:{...therapistDbg,hasSessionParam:!!searchParams.get('sessionId'),hasPatientParam:!!searchParams.get('patientId'),resolvedHasSessionId:!!targetSessionId},timestamp:Date.now()})}).catch(()=>{});
                    // #endregion
                }

                if (targetUserId) {
                    const therapistDoc = await getDoc(doc(db, "users", targetUserId));
                    if (therapistDoc.exists()) {
                        const therapistData = therapistDoc.data();
                        setOtherUser({
                            name: (therapistData.displayName || "Therapist").replace(/^Dr\.?\s+/i, ''),
                            image: therapistData.photoURL,
                            id: therapistDoc.id
                        });
                    }
                }

                if (targetSessionId) {
                    setSessionId(targetSessionId);
                } else if (targetUserId && auth.currentUser) {
                    // Fallback: If we have a therapist but no conversationId in profile, 
                    // we might need to find or create one (logic depends on backend).
                    // For now, we'll assume conversationId exists if matched.
                    // Or we could construct a composite ID like in some apps: min(uid1, uid2)_max(uid1, uid2)
                }

                setIsLoading(false);

            } catch (err) {
                console.error("Error initializing chat:", err);
                setIsLoading(false);
            }
        };

        initChat();
    }, [searchParams]);

    // 2. Listen for Messages
    useEffect(() => {
        if (!sessionId) return;

        const q = query(
            collection(db, "conversations", sessionId, "messages"),
            orderBy("timestamp", "asc")
        );

        const unsubscribe = onSnapshot(
            q,
            (snapshot) => {
                const msgs: Message[] = [];
                snapshot.forEach((doc) => {
                    const data = doc.data();
                    msgs.push({
                        id: doc.id,
                        text: decryptMessage(data.message || data.text || "", sessionId),
                        senderId: data.senderId,
                        senderName: data.senderName,
                        timestamp: data.timestamp,
                        isFromCurrentUser: auth.currentUser?.uid === data.senderId,
                        attachmentUrl: data.attachmentUrl,
                        messageType: data.messageType
                    });
                });
                setMessages(msgs);

                setMessages(msgs);

                // #region agent log
                fetch('http://127.0.0.1:7477/ingest/385ee47e-a3ea-4f67-831f-297fb5616e44',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'dbe0d4'},body:JSON.stringify({sessionId:'dbe0d4',runId:'pre-fix',hypothesisId:'H2',location:'Chat.tsx:onSnapshot',message:'messages snapshot ok',data:{messageCount:msgs.length,hasMetadataPendingWrites:snapshot.metadata.hasPendingWrites},timestamp:Date.now()})}).catch(()=>{});
                // #endregion

                // Scroll to bottom
                setTimeout(() => scrollRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
            },
            (err) => {
                // #region agent log
                fetch('http://127.0.0.1:7477/ingest/385ee47e-a3ea-4f67-831f-297fb5616e44',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'dbe0d4'},body:JSON.stringify({sessionId:'dbe0d4',runId:'pre-fix',hypothesisId:'H2',location:'Chat.tsx:onSnapshot:error',message:'messages snapshot failed',data:{code:(err as {code?:string}).code,message:(err as Error).message?.slice(0,120)},timestamp:Date.now()})}).catch(()=>{});
                // #endregion
            }
        );

        return () => unsubscribe();
    }, [sessionId]);

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>, type: 'IMAGE' | 'DOCUMENT') => {
        const file = event.target.files?.[0];
        if (!file || !sessionId || !auth.currentUser) return;

        // Message Limit Check
        if (isBasicPlan && dailyMessageCount >= messageLimit) {
            toast({
                title: t('chat.limit_title'),
                description: t('chat.limit_desc', { count: messageLimit }),
                variant: 'destructive',
            });
            return;
        }

        // Validation
        if (type === 'DOCUMENT') {
            if (file.type !== 'application/pdf') {
                toast({ title: "Invalid File", description: "Only PDF files are allowed.", variant: "destructive" });
                return;
            }
            if (file.size > 500 * 1024) { // 500KB
                toast({ title: "File too large", description: "PDF must be less than 500KB.", variant: "destructive" });
                return;
            }
        } else if (type === 'IMAGE') {
            if (!file.type.startsWith('image/')) {
                toast({ title: "Invalid File", description: "Only image files are allowed.", variant: "destructive" });
                return;
            }
        }

        try {
            const storageRef = ref(storage, `conversations/${sessionId}/${Date.now()}_${file.name}`);
            const snapshot = await uploadBytes(storageRef, file);
            const downloadURL = await getDownloadURL(snapshot.ref);

            await addDoc(collection(db, "conversations", sessionId, "messages"), {
                message: file.name, // Display filename as text fallback or title
                senderId: auth.currentUser.uid,
                conversationId: sessionId,
                messageType: type,
                attachmentUrl: downloadURL,
                timestamp: serverTimestamp()
            });
            toast({ title: "Success", description: "File sent successfully" });

        } catch (error) {
            console.error("Error uploading file:", error);
            toast({ title: "Upload Failed", description: "Could not send file.", variant: "destructive" });
        }
    };

    const currentWordCount = newMessage.trim().split(/\s+/).filter(Boolean).length;

    const handleSendMessage = async () => {
        if (!newMessage.trim() || !sessionId || !auth.currentUser) return;

        // Word limit check
        if (currentWordCount > messageWordLimit) {
            toast({
                title: t('chat.word_limit_title', 'Message Too Long'),
                description: t('chat.word_limit_desc', { limit: messageWordLimit, count: currentWordCount }),
                variant: 'destructive',
            });
            return;
        }

        // Message Limit Check
        if (isBasicPlan && dailyMessageCount >= messageLimit) {
            toast({
                title: t('chat.limit_title'),
                description: t('chat.limit_desc', { count: messageLimit }),
                variant: 'destructive',
            });
            return;
        }

        try {
            const encryptedText = encryptMessage(newMessage.trim(), sessionId);

            await addDoc(collection(db, "conversations", sessionId, "messages"), {
                message: encryptedText,
                senderId: auth.currentUser.uid,
                conversationId: sessionId,
                messageType: 'TEXT',
                timestamp: serverTimestamp()
            });

            // Update parent conversation document for unread count and preview
            await updateDoc(doc(db, "conversations", sessionId), {
                lastMessage: {
                    text: newMessage.trim(), // We can store plaintext here for preview, or encrypted if preferred. 
                    // Cloud function will also update this, but doing it here provides instant feedback.
                    timestamp: serverTimestamp(),
                    senderId: auth.currentUser.uid
                },
                updatedAt: serverTimestamp()
            });

            setNewMessage("");

        } catch (error) {
            console.error("Error sending message:", error);
            toast({ title: "Error", description: "Failed to send message", variant: "destructive" });
        }
    };

    const handleKeyPress = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage();
        }
    };

    if (isLoading) return <div className="flex justify-center items-center h-screen"><div className="animate-spin h-8 w-8 border-4 border-[#92C7CF] rounded-full border-t-transparent" /></div>;

    if (!sessionId && !isLoading) {
        return (
            <div className="flex flex-col items-center justify-center h-screen p-6 text-center">
                <div className="bg-gray-100 p-4 rounded-full mb-4">
                    <Send className="w-8 h-8 text-gray-400" />
                </div>
                <h2 className="text-xl font-bold text-gray-700">{t('chat.no_session')}</h2>
                <p className="text-gray-500 mt-2">{t('chat.no_session_desc')}</p>
                <Button className="mt-6 bg-[#92C7CF]" onClick={() => navigate(currentUserRole === 'THERAPIST' ? '/therapist/dashboard' : '/dashboard')}>
                    {t('common.back_home')}
                </Button>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-screen bg-[#F0F2F5]">
            {/* Header */}
            <div className="bg-white px-4 py-3 shadow-sm flex items-center justify-between sticky top-0 z-10">
                <div className="flex items-center gap-3">
                    <Button variant="ghost" size="icon" className="md:hidden" onClick={() => navigate(-1)}>
                        <ArrowLeft className="w-5 h-5 text-gray-600" />
                    </Button>
                    <Avatar className="h-10 w-10 border border-gray-100">
                        <AvatarImage src={otherUser?.image} />
                        <AvatarFallback className="bg-[#92C7CF] text-white">
                            {otherUser?.name?.charAt(0) || "U"}
                        </AvatarFallback>
                    </Avatar>
                    <div>
                        <h2 className="font-semibold text-gray-800 text-sm md:text-base">{otherUser?.name || t('chat.patient_fallback')}</h2>
                    </div>
                </div>
            </div>

            {/* Chat Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((msg) => (
                    <div
                        key={msg.id}
                        className={`flex ${msg.isFromCurrentUser ? 'justify-end' : 'justify-start'}`}
                    >
                        <div
                            className={`max-w-[75%] md:max-w-[60%] rounded-2xl px-4 py-3 shadow-sm text-sm md:text-base ${msg.isFromCurrentUser
                                ? 'bg-[#AAD7D9] text-white rounded-tr-none'
                                : 'bg-white text-gray-800 rounded-tl-none'
                                }`}
                        >

                            {msg.messageType === 'IMAGE' && msg.attachmentUrl ? (
                                <div className="mb-2">
                                    <img
                                        src={msg.attachmentUrl}
                                        alt="Attachment"
                                        className="max-w-full h-auto rounded-lg cursor-pointer"
                                        onClick={() => window.open(msg.attachmentUrl, '_blank')}
                                    />
                                </div>
                            ) : msg.messageType === 'DOCUMENT' && msg.attachmentUrl ? (
                                <div
                                    className="flex items-center gap-2 bg-white/20 p-2 rounded-lg cursor-pointer hover:bg-white/30 transition-colors"
                                    onClick={() => window.open(msg.attachmentUrl, '_blank')}
                                >
                                    <FileText className="w-8 h-8 text-white" />
                                    <div className="flex flex-col overflow-hidden">
                                        <span className="text-sm font-medium truncate">{msg.text}</span>
                                        <span className="text-[10px] opacity-80 uppercase">PDF</span>
                                    </div>
                                </div>
                            ) : msg.messageType === 'AUDIO' && msg.attachmentUrl ? (
                                <div className="flex flex-col gap-2 min-w-[200px]">
                                    <div className="flex items-center gap-2 bg-black/5 p-2 rounded-xl">
                                        <audio
                                            controls
                                            src={msg.attachmentUrl}
                                            className="h-8 max-w-full"
                                        />
                                    </div>
                                    <span className="text-[10px] opacity-70 italic">{t('chat.voice_message')}</span>
                                </div>
                            ) : (
                                <p>{msg.text}</p>
                            )}

                            <span className={`text-[10px] block mt-1 text-right ${msg.isFromCurrentUser ? 'text-white/80' : 'text-gray-400'}`}>
                                {msg.timestamp ? new Date(msg.timestamp.toMillis()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '...'}
                            </span>
                        </div>
                    </div>
                ))}
                <div ref={scrollRef} />
            </div>

            {/* Input Area */}
            {(currentUserRole === 'PATIENT' || currentUserRole === 'THERAPIST') && (
                <>
                    {isBasicPlan && dailyMessageCount >= messageLimit ? (
                        <div className="bg-white p-6 border-t border-gray-200 text-center shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-20">
                            <div className="max-w-md mx-auto">
                                <h3 className="text-lg font-semibold text-gray-800 mb-2">{t('chat.limit_title')}</h3>
                                <p className="text-gray-600 mb-4">{t('chat.limit_desc', { count: messageLimit })}</p>
                                <Button
                                    onClick={() => navigate('/payment')}
                                    className="bg-[#92C7CF] hover:bg-[#7FB0B8] text-white w-full sm:w-auto"
                                >
                                    {t('chat.upgrade_plan')}
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="bg-white p-3 md:p-4 border-t border-gray-200">
                            <div className="flex items-center gap-2 max-w-4xl mx-auto relative">
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="outline" size="icon" className="rounded-full h-10 w-10 shrink-0 border-gray-200">
                                            <Plus className="w-5 h-5 text-gray-500" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="start">
                                        <DropdownMenuItem className="cursor-pointer" onClick={() => document.getElementById('image-upload')?.click()}>
                                            <ImageIcon className="w-4 h-4 mr-2" />
                                            {t('chat.image')}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem className="cursor-pointer" onClick={() => document.getElementById('doc-upload')?.click()}>
                                            <FileText className="w-4 h-4 mr-2" />
                                            {t('chat.document')}
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>

                                <input
                                    type="file"
                                    id="image-upload"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => handleFileUpload(e, 'IMAGE')}
                                />
                                <input
                                    type="file"
                                    id="doc-upload"
                                    accept="application/pdf"
                                    className="hidden"
                                    onChange={(e) => handleFileUpload(e, 'DOCUMENT')}
                                />

                                <Textarea
                                    ref={textareaRef}
                                    value={newMessage}
                                    onChange={(e) => setNewMessage(e.target.value)}
                                    maxLength={messageWordLimit * 10}
                                    onKeyDown={handleKeyPress}
                                    placeholder={t('chat.placeholder')}
                                    rows={1}
                                    className="flex-1 bg-gray-50 border-gray-200 focus-visible:ring-[#92C7CF] rounded-2xl min-h-[48px] max-h-[200px] resize-none py-3 px-4 scrollbar-hide text-sm md:text-base"
                                />
                                {newMessage.trim().length > 0 && (
                                    <span className={`text-[10px] absolute -top-4 right-24 ${currentWordCount > messageWordLimit ? 'text-red-500 font-bold' : 'text-gray-400'}`}>
                                        {currentWordCount}/{messageWordLimit}
                                    </span>
                                )}
                                <Button
                                    onClick={handleSendMessage}
                                    disabled={!newMessage.trim()}
                                    className="bg-[#92C7CF] hover:bg-[#234b53] rounded-full h-10 w-10 md:h-12 md:w-12 p-0 flex items-center justify-center transition-all"
                                >
                                    <Send className="w-4 h-4 md:w-5 md:h-5 text-white ml-0.5" />
                                </Button>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default Chat;
