import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "@/lib/firebase";
import { collection, query, where, getDocs, orderBy, doc, getDoc, limit } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
    Calendar, Clock, MapPin, MessageCircle,
    Phone, Video, User, ArrowLeft
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useToast } from "../../components/ui/use-toast";

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

const TherapistSessions = () => {
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();
    const { toast } = useToast();
    const [loading, setLoading] = useState(true);
    const [upcomingAppointments, setUpcomingAppointments] = useState<Appointment[]>([]);
    const [completedAppointments, setCompletedAppointments] = useState<Appointment[]>([]);
    const [activeTab, setActiveTab] = useState("upcoming");

    useEffect(() => {
        fetchAppointments();
    }, []);

    const fetchAppointments = async () => {
        try {
            if (auth.currentUser) {
                // Fetch upcoming and in-progress appointments
                const upcomingQuery = query(
                    collection(db, "appointments"),
                    where("therapistId", "==", auth.currentUser.uid),
                    where("status", "in", ["upcoming", "booked", "BOOKED", "in_progress", "IN_PROGRESS"]),
                    orderBy("startTimestamp", "asc")
                );

                const upcomingSnapshot = await getDocs(upcomingQuery);
                const upcoming: Appointment[] = [];
                const pastBooked: Appointment[] = [];
                const now = new Date();

                for (const appointmentDoc of upcomingSnapshot.docs) {
                    const appointmentData = appointmentDoc.data();

                    // Fetch patient details
                    const clientId = appointmentData.bookedBy || appointmentData.patientId;
                    const patientDoc = clientId ? await getDoc(doc(db, "users", clientId)) : null;
                    const patientData = patientDoc?.exists() ? patientDoc.data() : null;

                    const endTime = appointmentData.endTimestamp?.toDate() ||
                        (appointmentData.startTimestamp ? new Date(appointmentData.startTimestamp.toDate().getTime() + 60 * 60 * 1000) : null);

                    const appointmentObj: Appointment = {
                        id: appointmentDoc.id,
                        clientName: patientData?.displayName || t("common.patient"),
                        clientId: clientId,
                        profilePicture: patientData?.profilePicture,
                        appointmentType: appointmentData.appointmentType || "chat",
                        sessionType: appointmentData.sessionType || t("therapist.sessions.consultation"),
                        startTime: appointmentData.startTimestamp.toDate(),
                        endTime: endTime,
                        status: appointmentData.status.toLowerCase().includes('progress') ? 'in_progress' : 'upcoming',
                        location: patientData?.city || t("common.remote")
                    };

                    // Only show in upcoming if it hasn't ended yet
                    if (endTime > now) {
                        upcoming.push(appointmentObj);
                    } else {
                        appointmentObj.status = "completed";
                        pastBooked.push(appointmentObj);
                    }
                }

                // Fetch completed appointments
                const completedQuery = query(
                    collection(db, "appointments"),
                    where("therapistId", "==", auth.currentUser.uid),
                    where("status", "in", ["completed", "COMPLETED"]),
                    orderBy("startTimestamp", "desc"),
                    limit(20)
                );

                const completedSnapshot = await getDocs(completedQuery);
                const completed: Appointment[] = [];

                for (const appointmentDoc of completedSnapshot.docs) {
                    const appointmentData = appointmentDoc.data();

                    // Fetch patient details
                    const clientId = appointmentData.bookedBy || appointmentData.patientId;
                    const patientDoc = clientId ? await getDoc(doc(db, "users", clientId)) : null;
                    const patientData = patientDoc?.exists() ? patientDoc.data() : null;

                    completed.push({
                        id: appointmentDoc.id,
                        clientName: patientData?.displayName || t("common.patient"),
                        clientId: clientId,
                        profilePicture: patientData?.profilePicture,
                        appointmentType: appointmentData.appointmentType || "chat",
                        sessionType: appointmentData.sessionType || t("therapist.sessions.consultation"),
                        startTime: appointmentData.startTimestamp.toDate(),
                        endTime: appointmentData.endTimestamp?.toDate() || appointmentData.startTimestamp.toDate(),
                        status: "completed",
                        location: patientData?.city || t("common.remote")
                    });
                }

                setUpcomingAppointments(upcoming);
                // Combine past booked and explicitly completed, then sort
                const allCompleted = [...pastBooked, ...completed].sort((a, b) => b.startTime.getTime() - a.startTime.getTime());
                setCompletedAppointments(allCompleted);
            }
        } catch (error) {
            console.error("Error fetching appointments:", error);
        } finally {
            setLoading(false);
        }
    };

    const formatDateTime = (date: Date) => {
        return date.toLocaleDateString(i18n.language, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const handleViewProfile = (patientId: string) => {
        navigate(`/therapist/patient/${patientId}`);
    };

    const handleJoinSession = (appointment: Appointment) => {
        // 15-minute restriction check for calls and video
        if (appointment.appointmentType === 'call' || appointment.appointmentType === 'video') {
            const now = new Date();
            const startTime = appointment.startTime;
            if (startTime) {
                const diffMs = startTime.getTime() - now.getTime();
                const diffMins = diffMs / (1000 * 60);

                if (diffMins > 15) {
                    toast({
                        title: t('consultation.not_started_title', 'Session hasn\'t started'),
                        description: t('consultation.not_started_desc', 'You can only join this session 15 minutes before the scheduled time.'),
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

    const getAppointmentIcon = (type: string) => {
        switch (type) {
            case 'chat':
                return <MessageCircle className="w-4 h-4" />;
            case 'video':
                return <Video className="w-4 h-4" />;
            case 'call':
                return <Phone className="w-4 h-4" />;
            default:
                return <MessageCircle className="w-4 h-4" />;
        }
    };

    const SessionCard = ({ appointment, isUpcoming }: { appointment: Appointment; isUpcoming: boolean }) => (
        <Card className="bg-white rounded-2xl shadow-sm border-0">
            <div className="p-5">
                {/* Date and Time */}
                <div className="text-xs text-gray-500 mb-4">
                    {formatDateTime(appointment.startTime)}
                </div>

                <hr className="mb-6 border-gray-100" />

                {/* Patient Info */}
                <div className="flex items-center gap-4 mb-6">
                    <Avatar className="w-20 h-20">
                        <AvatarImage src={appointment.profilePicture} />
                        <AvatarFallback className="bg-gray-100">
                            {appointment.clientName.split(' ').map(n => n[0]).join('')}
                        </AvatarFallback>
                    </Avatar>

                    <div className="flex-1">
                        <h3 className="font-semibold text-gray-900 mb-2">
                            {appointment.clientName}
                        </h3>

                        <div className="flex items-center gap-2 mb-2 uppercase tracking-tight">
                            {getAppointmentIcon(appointment.appointmentType)}
                            <span className="text-xs font-bold text-gray-700">
                                {t(`common.${appointment.appointmentType}`, appointment.appointmentType)}
                            </span>
                            {appointment.status === 'in_progress' && (
                                <Badge variant="destructive" className="ml-2 bg-red-100 text-red-600 border-red-200 hover:bg-red-100 animate-pulse">
                                    {t('therapist.dashboard.status_in_progress', 'IN PROGRESS')}
                                </Badge>
                            )}
                        </div>

                        <div className="flex items-center gap-1 text-sm text-gray-500">
                            <MapPin className="w-4 h-4" />
                            {appointment.location}
                        </div>
                    </div>
                </div>

                {/* Action Buttons */}
                <div className="flex gap-3">
                    <Button
                        onClick={() => handleViewProfile(appointment.clientId)}
                        className="flex-1 bg-[#92C7CF] hover:bg-[#7FB0B8] text-white rounded-xl"
                    >
                        {t('common.viewProfile')}
                    </Button>

                    {isUpcoming && (
                        <Button
                            onClick={() => handleJoinSession(appointment)}
                            variant="outline"
                            className="flex-1 border-gray-200 text-gray-700 hover:bg-gray-50 rounded-xl"
                        >
                            {t('common.consultationRoom')}
                        </Button>
                    )}
                </div>
            </div>
        </Card>
    );

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB]">
                <div className="animate-spin h-8 w-8 border-4 border-[#92C7CF] rounded-full border-t-transparent"></div>
            </div>
        );
    }

    return (
        <div className="bg-[#F9FAFB] pb-24">
            {/* Header */}
            <div className="flex items-center gap-4 mb-6">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate(-1)}
                    className="p-2"
                >
                    <ArrowLeft className="w-5 h-5" />
                </Button>
                <h1 className="text-2xl font-semibold text-gray-900">{t('common.sessions')}</h1>
            </div>

            {/* Tabs */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <div className="bg-gray-100 rounded-xl p-1 mb-6">
                    <TabsList className="grid w-full grid-cols-2 bg-transparent">
                        <TabsTrigger
                            value="upcoming"
                            className="data-[state=active]:bg-white data-[state=active]:text-[#92C7CF] rounded-lg"
                        >
                            {t('therapist.sessions.upcomingSessions')}
                        </TabsTrigger>
                        <TabsTrigger
                            value="completed"
                            className="data-[state=active]:bg-white data-[state=active]:text-[#92C7CF] rounded-lg"
                        >
                            {t('therapist.sessions.completedSessions')}
                        </TabsTrigger>
                    </TabsList>
                </div>

                <TabsContent value="upcoming" className="space-y-4">
                    {upcomingAppointments.length === 0 ? (
                        <div className="text-center py-12">
                            <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                            <p className="text-gray-500">{t('therapist.sessions.noUpcomingAppointments')}</p>
                        </div>
                    ) : (
                        upcomingAppointments.map((appointment) => (
                            <SessionCard
                                key={appointment.id}
                                appointment={appointment}
                                isUpcoming={true}
                            />
                        ))
                    )}
                </TabsContent>

                <TabsContent value="completed" className="space-y-4">
                    {completedAppointments.length === 0 ? (
                        <div className="text-center py-12">
                            <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                            <p className="text-gray-500">{t('therapist.sessions.noCompletedAppointments')}</p>
                        </div>
                    ) : (
                        completedAppointments.map((appointment) => (
                            <SessionCard
                                key={appointment.id}
                                appointment={appointment}
                                isUpcoming={false}
                            />
                        ))
                    )}
                </TabsContent>
            </Tabs>
        </div>
    );
};

export default TherapistSessions;
