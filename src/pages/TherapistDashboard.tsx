import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, collection, query, where, getDocs, orderBy, limit } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
    Calendar, Clock, Users, CheckCircle,
    BarChart3, Settings, User, MessageCircle,
    Phone, Video, MapPin
} from "lucide-react";
import { useToast } from "../components/ui/use-toast";
import { formatLocalizedTime } from "@/lib/date-utils";


interface Appointment {
    id: string;
    clientName: string;
    clientId: string;
    profilePicture?: string;
    appointmentType: 'call' | 'chat' | 'video';
    sessionType: string;
    startTime: Date;
    endTime: Date;
    status: 'upcoming' | 'completed' | 'rescheduled' | 'in_progress';
    location?: string;
}

interface Patient {
    id: string;
    displayName: string;
    profilePicture?: string;
    mood?: string;
    lastMessage?: {
        text: string;
        timestamp: Date;
    };
}

const TherapistDashboard = () => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const { toast } = useToast();
    const [user, setUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [upcomingAppointment, setUpcomingAppointment] = useState<Appointment | null>(null);
    const [todayStats, setTodayStats] = useState({
        upcoming: 0,
        completed: 0,
        rescheduled: 0
    });
    const [todayPatients, setTodayPatients] = useState<Patient[]>([]);

    useEffect(() => {
        const fetchTherapistData = async () => {
            if (auth.currentUser) {
                try {
                    const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
                    if (userDoc.exists()) {
                        const userData = userDoc.data();
                        setUser(userData);

                        // Fetch therapist-specific data
                        await Promise.all([
                            fetchUpcomingAppointment(),
                            fetchTodayStats(),
                            fetchTodayPatients()
                        ]);
                    }
                } catch (error) {
                    console.error("Error fetching therapist data:", error);
                }
            }
            setLoading(false);
        };

        fetchTherapistData();
    }, []);

    const fetchUpcomingAppointment = async () => {
        try {
            if (auth.currentUser) {
                // Query appointments where therapist is current user and status is valid
                // Filter startTimestamp >= 24 hours ago to avoid fetching very old missed appointments
                // Include in_progress to show the current session if it has started
                const yesterday = new Date();
                yesterday.setHours(yesterday.getHours() - 24);

                const appointmentsQuery = query(
                    collection(db, "appointments"),
                    where("therapistId", "==", auth.currentUser.uid),
                    where("status", "in", ["upcoming", "BOOKED", "booked", "rescheduled", "in_progress", "IN_PROGRESS"]),
                    where("startTimestamp", ">=", yesterday),
                    orderBy("startTimestamp", "asc"),
                    limit(10)
                );

                const querySnapshot = await getDocs(appointmentsQuery);

                // Find the first appointment that hasn't ended yet
                const now = new Date();
                let validAppointmentDoc = null;
                let appointmentData = null;

                for (const docSnapshot of querySnapshot.docs) {
                    const data = docSnapshot.data();
                    const endTime = data.endTimestamp?.toDate() ||
                        (data.startTimestamp ? new Date(data.startTimestamp.toDate().getTime() + 60 * 60 * 1000) : null);

                    // If the appointment ended in the past, skip it
                    if (endTime && endTime > now) {
                        validAppointmentDoc = docSnapshot;
                        appointmentData = data;
                        break;
                    }
                }

                if (validAppointmentDoc && appointmentData) {
                    // Fetch patient details
                    const clientId = appointmentData.bookedBy || appointmentData.patientId;
                    const patientDoc = clientId ? await getDoc(doc(db, "users", clientId)) : null;
                    const patientData = patientDoc?.exists() ? patientDoc.data() : null;

                    const appointment: Appointment = {
                        id: validAppointmentDoc.id,
                        clientName: patientData?.displayName || t('therapist.dashboard.patient_fallback'),
                        clientId: clientId,
                        profilePicture: patientData?.profilePicture,
                        appointmentType: appointmentData.appointmentType || "chat",
                        sessionType: appointmentData.sessionType || t('therapist.sessions.consultation'),
                        startTime: appointmentData.startTimestamp.toDate(),
                        endTime: appointmentData.endTimestamp?.toDate() || appointmentData.startTimestamp.toDate(),
                        status: appointmentData.status.toLowerCase().includes('progress') ? 'in_progress' : 'upcoming',
                        location: patientData?.city || t('common.remote')
                    };
                    setUpcomingAppointment(appointment);
                } else {
                    setUpcomingAppointment(null);
                }
            }
        } catch (error) {
            console.error("Error fetching upcoming appointment:", error);
        }
    };

    const fetchTodayStats = async () => {
        try {
            if (auth.currentUser) {
                // Use same field name as PsyCMp: "startTimestamp" instead of "startTime"
                const today = new Date();
                const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

                const appointmentsQuery = query(
                    collection(db, "appointments"),
                    where("therapistId", "==", auth.currentUser.uid),
                    where("startTimestamp", ">=", startOfDay),
                    where("startTimestamp", "<=", endOfDay),
                    orderBy("startTimestamp", "desc")
                );

                const querySnapshot = await getDocs(appointmentsQuery);
                const todayAppointments = querySnapshot.docs.map(doc => doc.data());

                const now = new Date();

                const stats = {
                    upcoming: todayAppointments.filter(apt => {
                        const isStatusUpcoming = ["upcoming", "booked", "BOOKED", "rescheduled", "in_progress", "IN_PROGRESS"].includes(apt.status);
                        const endTime = apt.endTimestamp?.toDate() ||
                            (apt.startTimestamp ? new Date(apt.startTimestamp.toDate().getTime() + 60 * 60 * 1000) : null);

                        // Only count as upcoming if it hasn't ended yet
                        const isFutureOrActive = endTime ? endTime > now : true;

                        return isStatusUpcoming && isFutureOrActive;
                    }).length,
                    completed: todayAppointments.filter(apt => ["completed", "COMPLETED"].includes(apt.status)).length,
                    rescheduled: todayAppointments.filter(apt => ["rescheduled", "reschedule", "cancelled", "CANCELLED"].includes(apt.status)).length
                };

                setTodayStats(stats);
            }
        } catch (error) {
            console.error("Error fetching today stats:", error);
        }
    };

    const fetchTodayPatients = async () => {
        try {
            if (auth.currentUser) {
                const today = new Date();
                const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
                const endOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

                // Query today's appointments
                const appointmentsQuery = query(
                    collection(db, "appointments"),
                    where("therapistId", "==", auth.currentUser.uid),
                    where("startTimestamp", ">=", startOfDay),
                    where("startTimestamp", "<=", endOfDay),
                    orderBy("startTimestamp", "desc")
                );

                const querySnapshot = await getDocs(appointmentsQuery);

                // Filter for upcoming/active appointments only
                const now = new Date();
                const activeAppointments = querySnapshot.docs.filter(doc => {
                    const data = doc.data();
                    const status = data.status;
                    const isStatusUpcoming = ["upcoming", "booked", "BOOKED", "rescheduled", "in_progress", "IN_PROGRESS"].includes(status);

                    const endTime = data.endTimestamp?.toDate() ||
                        (data.startTimestamp ? new Date(data.startTimestamp.toDate().getTime() + 60 * 60 * 1000) : null);

                    const isFutureOrActive = endTime ? endTime > now : true;

                    return isStatusUpcoming && isFutureOrActive;
                });

                const uniquePatientIds = [...new Set(activeAppointments.map(doc => doc.data().bookedBy || doc.data().patientId))].filter(id => id);

                // Fetch patient details
                const patients: Patient[] = [];
                for (const patientId of uniquePatientIds) {
                    const patientDoc = await getDoc(doc(db, "users", patientId));
                    if (patientDoc.exists()) {
                        const patientData = patientDoc.data();

                        // Get latest mood from mood tracker
                        const moodQuery = query(
                            collection(db, "moodEntries"),
                            where("userId", "==", patientId),
                            orderBy("timestamp", "desc"),
                            limit(1)
                        );
                        const moodSnapshot = await getDocs(moodQuery);
                        const latestMood = moodSnapshot.empty ? null : moodSnapshot.docs[0].data().mood;

                        patients.push({
                            id: patientId,
                            displayName: patientData.displayName || t('therapist.dashboard.patient_fallback'),
                            profilePicture: patientData.profilePicture,
                            mood: latestMood
                        });
                    }
                }

                setTodayPatients(patients);
            }
        } catch (error) {
            console.error("Error fetching today patients:", error);
        }
    };

    const getMoodEmoji = (mood?: string) => {
        switch (mood?.toLowerCase()) {
            case "happy": return "😀";
            case "sad": return "😢";
            case "angry": return "😠";
            case "downcast": return "😔";
            case "sleepy": return "😴";
            default: return "😀";
        }
    };


    const handleJoinSession = (appointment: Appointment) => {
        // 15-minute restriction check for calls
        if (appointment.appointmentType === 'call') {
            const now = new Date();
            const startTime = appointment.startTime;
            if (startTime) {
                const diffMs = startTime.getTime() - now.getTime();
                const diffMins = diffMs / (1000 * 60);

                if (diffMins > 15) {
                    toast({
                        title: t('patient.dashboard.join_call_error_time', "You can only join this call 15 minutes before the scheduled time."),
                        variant: "destructive"
                    });
                    return;
                }
            }
        }

        switch (appointment.appointmentType) {
            case 'chat':
                navigate(`/consultation/${appointment.id}`);
                break;
            case 'call':
            case 'video':
                navigate(`/call/${appointment.id}`);
                break;
            default:
                navigate(`/consultation/${appointment.id}`);
        }
    };

    const getGreetingKey = () => {
        const hour = new Date().getHours();
        if (hour < 12) return 'common.good_morning';
        if (hour < 18) return 'common.good_afternoon';
        return 'common.good_evening';
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white">
                <div className="animate-spin h-8 w-8 border-4 border-[#92C7CF] rounded-full border-t-transparent"></div>
            </div>
        );
    }

    return (
        <div className="bg-[#F9FAFB] pb-24 font-sans">
            {/* Header Section */}
            <div className="bg-[#92C7CF] pt-8 pb-6 px-6">
                <div className="flex justify-between items-center mb-4">
                    <div>
                        <h1 className="text-xl font-bold text-white">
                            {t('therapist.dashboard.greeting', {
                                greeting: t(getGreetingKey()),
                                name: user?.displayName?.split(" ")[0] || t('therapist.dashboard.doctor_fallback')
                            })}
                        </h1>
                        <p className="text-sm text-white/90">
                            {t('therapist.dashboard.hope_well')}
                        </p>
                    </div>
                    <Avatar className="w-10 h-10 border-2 border-white">
                        <AvatarImage src={user?.photoURL} />
                        <AvatarFallback className="bg-white text-[#92C7CF]">
                            {t('therapist.dashboard.doctor_fallback').substring(0, 2)}
                        </AvatarFallback>
                    </Avatar>
                </div>

                {/* Upcoming Appointment Card */}
                {upcomingAppointment && (
                    <Card className="bg-white rounded-2xl shadow-lg">
                        <div className="p-4">
                            <div className="flex items-center gap-3 mb-3">
                                <Avatar className="w-16 h-16">
                                    <AvatarImage src={upcomingAppointment.profilePicture} />
                                    <AvatarFallback>
                                        {upcomingAppointment.clientName.split(' ').map(n => n[0]).join('')}
                                    </AvatarFallback>
                                </Avatar>
                                <div className="flex-1">
                                    <div className="flex justify-between items-center">
                                        <h3 className="font-semibold text-gray-800">
                                            {upcomingAppointment.clientName}
                                        </h3>
                                        <span className="px-3 py-1 bg-[#92C7CF]/20 text-[#508C96] text-xs font-medium rounded-full">
                                            {upcomingAppointment.status === 'in_progress' ? t('therapist.dashboard.status_in_progress', 'IN PROGRESS') : t('therapist.dashboard.status_upcoming')}
                                        </span>
                                    </div>
                                    <p className="text-sm text-gray-500 mt-1">
                                        {upcomingAppointment.sessionType}
                                    </p>
                                </div>
                            </div>

                            <div className="flex justify-between items-center">
                                <Button
                                    onClick={() => handleJoinSession(upcomingAppointment)}
                                    className="bg-[#92C7CF]/20 text-[#508C96] hover:bg-[#92C7CF]/30 border border-[#92C7CF]"
                                    size="sm"
                                >
                                    {upcomingAppointment.appointmentType === 'chat' ? (
                                        <>
                                            <MessageCircle className="w-4 h-4 mr-2" />
                                            {t('therapist.dashboard.join_chat')}
                                        </>
                                    ) : upcomingAppointment.appointmentType === 'video' ? (
                                        <>
                                            <Video className="w-4 h-4 mr-2" />
                                            {t('therapist.dashboard.join_video', 'Join Video')}
                                        </>
                                    ) : (
                                        <>
                                            <Phone className="w-4 h-4 mr-2" />
                                            {t('therapist.dashboard.join_call')}
                                        </>
                                    )}
                                </Button>

                                <div className="flex items-center text-sm text-gray-500">
                                    <Clock className="w-4 h-4 mr-1" />
                                    {formatLocalizedTime(upcomingAppointment.startTime, i18n.language)}
                                </div>
                            </div>
                        </div>
                    </Card>
                )}
            </div>

            {/* Today's Overview */}
            <div className="px-6 py-6">
                <div className="bg-white rounded-2xl shadow-sm p-4 mb-6">
                    <h2 className="text-lg font-medium text-gray-800 mb-4">{t('therapist.dashboard.overview')}</h2>
                    <div className="grid grid-cols-3 gap-4">
                        <div className="bg-[#92C7CF]/10 rounded-2xl p-4 text-center relative">
                            <Calendar className="w-6 h-6 text-[#92C7CF] absolute top-2 right-2" />
                            <div className="text-2xl font-bold text-[#508C96] mb-1">
                                {todayStats.upcoming}
                            </div>
                            <div className="text-xs text-gray-600">{t('therapist.dashboard.upcoming_sessions')}</div>
                        </div>

                        <div className="bg-green-50 rounded-2xl p-4 text-center relative">
                            <CheckCircle className="w-6 h-6 text-green-600 absolute top-2 right-2" />
                            <div className="text-2xl font-bold text-green-700 mb-1">
                                {todayStats.completed}
                            </div>
                            <div className="text-xs text-gray-600">{t('therapist.dashboard.completed_sessions')}</div>
                        </div>

                        <div className="bg-orange-50 rounded-2xl p-4 text-center relative">
                            <Clock className="w-6 h-6 text-orange-600 absolute top-2 right-2" />
                            <div className="text-2xl font-bold text-orange-700 mb-1">
                                {todayStats.rescheduled}
                            </div>
                            <div className="text-xs text-gray-600">{t('therapist.dashboard.rescheduled_sessions')}</div>
                        </div>
                    </div>
                </div>

                {/* Today's Sessions */}
                <h2 className="text-lg font-medium text-gray-800 mb-4">{t('therapist.dashboard.today_sessions')}</h2>
                <div className="flex gap-3 overflow-x-auto pb-4">
                    {todayPatients.map((patient) => (
                        <Card key={patient.id} className="min-w-[160px] bg-white rounded-2xl shadow-sm">
                            <div className="p-4 text-center">
                                <Avatar className="w-12 h-12 mx-auto mb-3">
                                    <AvatarImage src={patient.profilePicture} />
                                    <AvatarFallback>
                                        {patient.displayName.split(' ').map(n => n[0]).join('')}
                                    </AvatarFallback>
                                </Avatar>

                                <h3 className="font-semibold text-sm text-gray-800 mb-2">
                                    {patient.displayName}
                                </h3>

                                <div className="text-2xl mb-2">
                                    {getMoodEmoji(patient.mood)}
                                </div>

                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="w-full text-xs border-[#92C7CF] text-[#508C96] hover:bg-[#92C7CF]/10"
                                    onClick={() => navigate(`/therapist/patient/${patient.id}`)}
                                >
                                    {t('therapist.dashboard.view_profile')}
                                </Button>
                            </div>
                        </Card>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default TherapistDashboard;
