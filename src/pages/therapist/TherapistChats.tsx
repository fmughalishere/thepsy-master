import { useEffect, useState } from "react";
import { decryptMessage } from "@/lib/encryption";
import { useNavigate } from "react-router-dom";
import { auth, db } from "@/lib/firebase";
import { collection, query, where, getDocs, orderBy, doc, getDoc, limit } from "firebase/firestore";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
    Search, MessageCircle, ArrowLeft
} from "lucide-react";

import { useTranslation } from "react-i18next";
import { useChatNotifications } from "@/contexts/ChatNotificationContext";


interface Patient {
    id: string;
    displayName: string;
    profilePicture?: string;
    lastMessage?: {
        text: string;
        timestamp: Date;
    };
    unreadCount?: number;
    conversationId?: string;
}

const TherapistChats = () => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [patients, setPatients] = useState<Patient[]>([]);
    const [searchQuery, setSearchQuery] = useState("");
    const { clearUnreadChat } = useChatNotifications();

    useEffect(() => {
        clearUnreadChat();
        fetchPatients();
    }, []);

    const fetchPatients = async () => {
        try {
            if (auth.currentUser) {
                // Get all patients assigned to this therapist
                // Matching PsyCMp logic: query users by assignedTherapist
                const patientsQuery = query(
                    collection(db, "users"),
                    where("patientDetails.assignedTherapist", "==", auth.currentUser.uid)
                );

                const querySnapshot = await getDocs(patientsQuery);
                const patientsList: Patient[] = [];

                for (const patientDoc of querySnapshot.docs) {
                    const patientData = patientDoc.data();

                    // Get conversation ID for this patient-therapist pair
                    // Check patientDetails first, then query conversations collection
                    let conversationId = patientData.patientDetails?.conversationId;

                    if (!conversationId) {
                        const conversationQuery = query(
                            collection(db, "conversations"),
                            where("patientId", "==", patientDoc.id),
                            where("therapistId", "==", auth.currentUser.uid),
                            limit(1)
                        );
                        const conversationSnapshot = await getDocs(conversationQuery);
                        if (!conversationSnapshot.empty) {
                            conversationId = conversationSnapshot.docs[0].id;
                        }
                    }

                    let lastMessage = undefined;
                    // Unread count removed to match PsyCMp and avoid index errors
                    const unreadCount = 0;

                    if (conversationId) {
                        // Get last message
                        const lastMessageQuery = query(
                            collection(db, "conversations", conversationId, "messages"),
                            orderBy("timestamp", "desc"),
                            limit(1)
                        );
                        const lastMessageSnapshot = await getDocs(lastMessageQuery);

                        if (!lastMessageSnapshot.empty) {
                            const lastMessageData = lastMessageSnapshot.docs[0].data();
                            const rawText = lastMessageData.message || lastMessageData.text || lastMessageData.content || "";
                            lastMessage = {
                                text: decryptMessage(rawText, conversationId),
                                timestamp: lastMessageData.timestamp.toDate()
                            };
                        }
                    }

                    patientsList.push({
                        id: patientDoc.id,
                        displayName: patientData.displayName || t("therapist.dashboard.patient_fallback"),
                        profilePicture: patientData.profilePicture,
                        lastMessage,
                        unreadCount,
                        conversationId
                    });
                }

                // Sort by last message timestamp
                patientsList.sort((a, b) => {
                    if (!a.lastMessage && !b.lastMessage) return 0;
                    if (!a.lastMessage) return 1;
                    if (!b.lastMessage) return -1;
                    return b.lastMessage.timestamp.getTime() - a.lastMessage.timestamp.getTime();
                });

                // #region agent log
                const withConv = patientsList.filter((p) => !!p.conversationId).length;
                fetch('http://127.0.0.1:7477/ingest/385ee47e-a3ea-4f67-831f-297fb5616e44',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'dbe0d4'},body:JSON.stringify({sessionId:'dbe0d4',runId:'pre-fix',hypothesisId:'H3',location:'TherapistChats.tsx:fetchPatients',message:'therapist chat list conv ids',data:{patientRows:patientsList.length,rowsWithConversationId:withConv,rowsMissingConversationId:patientsList.length-withConv},timestamp:Date.now()})}).catch(()=>{});
                // #endregion

                setPatients(patientsList);
            }
        } catch (error) {
            console.error("Error fetching patients:", error);
        } finally {
            setLoading(false);
        }
    };

    const formatTime = (date: Date) => {
        const now = new Date();
        const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

        if (diffInHours < 1) {
            const minutes = Math.floor(diffInHours * 60);
            return t("therapist.chats.time.m_ago", { minutes });
        } else if (diffInHours < 24) {
            const hours = Math.floor(diffInHours);
            return t("therapist.chats.time.h_ago", { hours });
        } else {
            return date.toLocaleDateString(i18n.language, {
                month: 'short',
                day: 'numeric'
            });
        }
    };

    const handleChatClick = (patient: Patient) => {
        if (patient.conversationId) {
            navigate(`/therapist/chat?sessionId=${patient.conversationId}`);
        } else {
            navigate(`/therapist/chat?patientId=${patient.id}`); // Fallback
        }
    };

    const filteredPatients = patients.filter(patient =>
        patient.displayName.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB]">
                <div className="animate-spin h-8 w-8 border-4 border-[#92C7CF] rounded-full border-t-transparent"></div>
            </div>
        );
    }

    return (
        <div className="bg-[#F9FAFB] min-h-screen w-full overflow-x-hidden">
            {/* Header */}
            <div className="bg-white shadow-sm w-full">
                <div className="flex items-center justify-between p-6">
                    <div className="flex items-center gap-4 min-w-0">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(-1)}
                            className="p-2 shrink-0"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </Button>
                        <h1 className="text-lg font-medium text-gray-900 truncate">{t("therapist.chats.title")}</h1>
                    </div>

                    <Search className="w-5 h-5 text-gray-400 shrink-0" />
                </div>
            </div>

            {/* Search Bar */}
            <div className="p-4 w-full">
                <div className="relative w-full">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                        placeholder={t("therapist.chats.search_placeholder")}
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-10 bg-white border-gray-200 rounded-xl w-full"
                    />
                </div>
            </div>

            {/* Patients List */}
            <div className="px-4 pb-4 space-y-2 w-full overflow-x-hidden">
                {filteredPatients.length === 0 ? (
                    <div className="text-center py-12">
                        <MessageCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                        <p className="text-gray-500">
                            {searchQuery ? t("therapist.chats.no_patients") : t("therapist.chats.no_chats")}
                        </p>
                    </div>
                ) : (
                    filteredPatients.map((patient) => (
                        <Card
                            key={patient.id}
                            className="bg-white border-0 shadow-sm cursor-pointer hover:shadow-md transition-shadow overflow-hidden w-full"
                            onClick={() => handleChatClick(patient)}
                        >
                            <div className="p-4 flex flex-col w-full">
                                <div className="flex items-center gap-4 w-full">
                                    {/* Profile Image */}
                                    <div className="relative shrink-0">
                                        <Avatar className="w-12 h-12">
                                            <AvatarImage src={patient.profilePicture} />
                                            <AvatarFallback className="bg-gray-100 text-gray-600">
                                                {patient.displayName.split(' ').map(n => n[0]).join('')}
                                            </AvatarFallback>
                                        </Avatar>
                                        {patient.unreadCount !== undefined && patient.unreadCount > 0 && (
                                            <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                                                {patient.unreadCount}
                                            </div>
                                        )}
                                    </div>
                                
                                    {/* Chat Info */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex justify-between items-start gap-2">
                                            <h3 className="font-semibold text-gray-900 truncate flex-1">
                                                {patient.displayName}
                                            </h3>
                                            <span className="text-xs text-gray-500 shrink-0">
                                                {patient.lastMessage && formatTime(patient.lastMessage.timestamp)}
                                            </span>
                                        </div>
                                    
                                        {patient.lastMessage && (
                                            <p className="text-sm text-gray-600 truncate mt-1 w-full block">
                                                {patient.lastMessage.text}
                                            </p>
                                        )}
                                    </div>
                                </div>
                                <div className="mt-2 flex justify-end w-full border-t border-gray-50 pt-2">
                                    <Button
                                        variant="link"
                                        size="sm"
                                        className="h-8 px-0 text-[#92C7CF] hover:text-[#7FB0B8] font-medium"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            navigate(`/therapist/patient/${patient.id}`);
                                        }}
                                    >
                                        {t("therapist.chats.view_profile", "View Profile")}
                                    </Button>
                                </div>
                            </div>
                        </Card>
                    ))
                )}
            </div>
        </div>
    );
};

export default TherapistChats;
