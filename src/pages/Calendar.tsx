import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { auth, db } from "@/lib/firebase";
import { collection, query, where, getDocs, updateDoc, doc, Timestamp, orderBy, increment, getDoc } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Calendar as CalendarIcon, Clock, MapPin, User, Video, MessageSquare, Phone } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "@/hooks/use-toast";
import { format } from "date-fns";

interface Appointment {
    id: string;
    therapistId: string;
    therapistName: string;
    status: 'BOOKED' | 'cancelled' | 'completed' | 'pending';
    appointmentType: 'call' | 'chat' | 'video' | 'in-person';
    startTimestamp: any;
    endTimestamp: any;
    therapistImage?: string;
    specialization?: string;
    location?: string;
}

const Calendar = () => {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState<'upcoming' | 'completed'>('upcoming');
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [selectedAppointment, setSelectedAppointment] = useState<Appointment | null>(null);
    const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
    const [isRescheduleModalOpen, setIsRescheduleModalOpen] = useState(false);
    const [availableSlots, setAvailableSlots] = useState<Appointment[]>([]);
    const [selectedSlot, setSelectedSlot] = useState<Appointment | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const fetchAppointments = async () => {
        if (!auth.currentUser) return;
        setIsLoading(true);
        try {
            // Fetch appointments where patientId == currentUid
            // In a real app, might need compound index on status + time
            const q = query(
                collection(db, "appointments"),
                where("bookedBy", "==", auth.currentUser.uid),
                // orderBy("startTimestamp", "desc") // requires index
            );

            const snapshot = await getDocs(q);
            const fetched: Appointment[] = [];

            // Enrich with therapist details if needed
            // For now assume basic details are in appointment or we fetch them. 
            // Better to store denormalized name/image on appointment creation.

            for (const docSnap of snapshot.docs) {
                const data = docSnap.data();
                fetched.push({
                    id: docSnap.id,
                    therapistId: data.therapistId,
                    therapistName: data.therapistName || t("common.therapist"),
                    status: data.status,
                    appointmentType: data.appointmentType || 'call',
                    startTimestamp: data.startTimestamp,
                    endTimestamp: data.endTimestamp,
                    therapistImage: data.therapistImage,
                    specialization: data.specialization,
                    location: t("common.online")
                });
            }

            // Sort manually if index not present
            fetched.sort((a, b) => b.startTimestamp.seconds - a.startTimestamp.seconds);
            setAppointments(fetched);
        } catch (error) {
            console.error("Error fetching appointments:", error);
        }
        setIsLoading(false);
    };

    useEffect(() => {
        fetchAppointments();
    }, []);

    const filteredAppointments = appointments.filter(appt => {
        const status = appt.status?.toUpperCase();
        const startTime = appt.startTimestamp.seconds * 1000;
        const isPast = startTime < Date.now();

        if (activeTab === 'upcoming') {
            return (status === 'BOOKED' || status === 'PENDING' || status === 'IN_PROGRESS') && !isPast;
        } else {
            return status === 'COMPLETED' || status === 'CANCELLED' || isPast;
        }
    });

    const handleCancel = async () => {
        if (!selectedAppointment) return;
        setIsSubmitting(true);
        try {
            await updateDoc(doc(db, "appointments", selectedAppointment.id), {
                status: 'AVAILABLE',
                isBooked: false,
                bookedBy: null,
                clientName: null,
                appointmentType: null
            });

            // Refund Quota
            if (auth.currentUser) {
                const userRef = doc(db, "users", auth.currentUser.uid);
                const userDoc = await getDoc(userRef);
                const userData = userDoc.data();
                const quotas = userData?.patientDetails?.quotas;
                const planName = quotas?.planName || "";

                if (quotas && !planName.toLowerCase().includes('basic')) {
                    await updateDoc(userRef, {
                        "patientDetails.quotas.currentUsage.remainingLiveSessions": increment(1)
                    });
                }
            }

            // Notify Therapist
            try {
                const { createAndSendNotification } = await import("@/lib/firebase-functions");
                await createAndSendNotification({
                    title: "Appointment Cancelled",
                    message: `Appointment with ${auth.currentUser?.displayName || 'a patient'} on ${format(selectedAppointment.startTimestamp.toDate(), 'PPP')} was cancelled.`,
                    titleKey: "notifications.appointment_cancelled_title",
                    messageKey: "notifications.appointment_cancelled_body_therapist",
                    params: {
                        name: auth.currentUser?.displayName || 'a patient',
                        date: format(selectedAppointment.startTimestamp.toDate(), 'PPP')
                    },
                    type: "APPOINTMENT_CANCELLED",
                    targetUserIds: [selectedAppointment.therapistId],
                    appointmentId: selectedAppointment.id,
                    clickAction: {
                        type: "APPOINTMENT",
                        id: selectedAppointment.id
                    }
                });
            } catch (e) {
                console.error("Failed to notify therapist:", e);
            }

            toast({ title: t('calendar.cancelled_success', "Appointment cancelled") });
            setIsCancelModalOpen(false);
            fetchAppointments();
        } catch (error) {
            console.error("Error cancelling:", error);
            toast({ title: t('common.error', "Error"), variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    const fetchAvailableSlots = async (therapistId: string) => {
        try {
            const start = new Date();
            const q = query(
                collection(db, "appointments"),
                where("therapistId", "==", therapistId),
                where("status", "==", "AVAILABLE"),
                where("startTimestamp", ">=", Timestamp.fromDate(start)),
                orderBy("startTimestamp", "asc")
            );

            const snapshot = await getDocs(q);
            const slots = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as any));
            setAvailableSlots(slots);
            setIsRescheduleModalOpen(true);
        } catch (error) {
            console.error("Error fetching slots:", error);
            toast({ title: t('common.error_loading_slots', "Error loading available slots"), variant: "destructive" });
        }
    };

    const handleReschedule = async () => {
        if (!selectedAppointment || !selectedSlot) return;
        setIsSubmitting(true);
        try {
            // 1. Mark old slot as AVAILABLE
            await updateDoc(doc(db, "appointments", selectedAppointment.id), {
                status: 'AVAILABLE',
                bookedBy: null,
                therapistName: null // or keep it if it's the same therapist
            });

            // 2. Mark new slot as BOOKED
            await updateDoc(doc(db, "appointments", selectedSlot.id), {
                status: 'BOOKED',
                bookedBy: auth.currentUser?.uid,
                therapistName: selectedAppointment.therapistName
            });

            // 3. Notify Therapist
            try {
                const { createAndSendNotification } = await import("@/lib/firebase-functions");
                await createAndSendNotification({
                    title: "Appointment Rescheduled",
                    message: `Appointment with ${auth.currentUser?.displayName || 'a patient'} was rescheduled to ${format(selectedSlot.startTimestamp.toDate(), 'PPP p')}.`,
                    titleKey: "notifications.appointment_rescheduled_title",
                    messageKey: "notifications.appointment_rescheduled_body_therapist",
                    params: {
                        name: auth.currentUser?.displayName || 'a patient',
                        date: format(selectedSlot.startTimestamp.toDate(), 'PPP'),
                        time: format(selectedSlot.startTimestamp.toDate(), 'p')
                    },
                    type: "APPOINTMENT_RESCHEDULED",
                    targetUserIds: [selectedAppointment.therapistId],
                    appointmentId: selectedSlot.id,
                    clickAction: {
                        type: "APPOINTMENT",
                        id: selectedSlot.id
                    }
                });
            } catch (e) {
                console.error("Failed to notify therapist:", e);
            }

            toast({ title: t('calendar.rescheduled_success', "Appointment rescheduled successfully") });
            setIsRescheduleModalOpen(false);
            fetchAppointments();
        } catch (error) {
            console.error("Error rescheduling:", error);
            toast({ title: t('common.error', "Error"), variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }
    };

    const getIcon = (type: string) => {
        switch (type) {
            case 'video': return <Video className="w-4 h-4" />;
            case 'call': return <Phone className="w-4 h-4" />;
            case 'chat': return <MessageSquare className="w-4 h-4" />;
            default: return <User className="w-4 h-4" />;
        }
    };

    return (
        <div className="p-6 min-h-screen bg-[#F9FAFB] font-sans">
            <h1 className="text-2xl font-bold text-gray-800 mb-6">{t('calendar.title', 'My Appointments')}</h1>

            {/* Tabs */}
            <div className="bg-[#F3F4F6] p-1 rounded-xl flex mb-8 max-w-md mx-auto">
                <button
                    onClick={() => setActiveTab('upcoming')}
                    className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 ${activeTab === 'upcoming'
                        ? 'bg-white text-[#92C7CF] shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                        }`}
                >
                    {t('calendar.upcoming', 'Upcoming')}
                </button>
                <button
                    onClick={() => setActiveTab('completed')}
                    className={`flex-1 py-2.5 text-sm font-semibold rounded-lg transition-all duration-200 ${activeTab === 'completed'
                        ? 'bg-white text-[#92C7CF] shadow-sm'
                        : 'text-gray-500 hover:text-gray-700'
                        }`}
                >
                    {t('calendar.history', 'History')}
                </button>
            </div>

            {/* List */}
            <div className="space-y-4">
                {isLoading ? (
                    <div className="flex justify-center py-10"><div className="animate-spin h-8 w-8 border-4 border-[#92C7CF] rounded-full border-t-transparent" /></div>
                ) : filteredAppointments.length > 0 ? (
                    filteredAppointments.map(appt => (
                        <Card key={appt.id} className="p-5 border-none shadow-sm hover:shadow-md transition-all">
                            <div className="flex flex-col md:flex-row gap-4">
                                {/* Date Box */}
                                <div className="hidden md:flex flex-col items-center justify-center bg-[#F0F9FA] rounded-xl p-4 w-24 h-24 text-[#92C7CF]">
                                    <span className="text-xl font-bold">{format(appt.startTimestamp.toDate(), "d")}</span>
                                    <span className="text-sm uppercase font-semibold">{format(appt.startTimestamp.toDate(), "MMM")}</span>
                                </div>

                                <div className="flex-1">
                                    <div className="flex justify-between items-start mb-2">
                                        <div>
                                            <p className="text-sm text-gray-500 flex items-center gap-2 mb-1">
                                                <CalendarIcon className="w-4 h-4" />
                                                <span className="md:hidden">{format(appt.startTimestamp.toDate(), "MMM d, yyyy")} • </span>
                                                {format(appt.startTimestamp.toDate(), "h:mm a")}
                                            </p>
                                            <h3 className="text-lg font-bold text-gray-800">{appt.therapistName}</h3>
                                            <p className="text-sm text-[#92C7CF] font-medium">{appt.specialization || t("common.psychologist")}</p>
                                        </div>
                                        <Badge variant="secondary" className={`${appt.status?.toUpperCase() === 'BOOKED' ? 'bg-green-100 text-green-700' :
                                            appt.status?.toUpperCase() === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700' :
                                            appt.status?.toUpperCase() === 'CANCELLED' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'
                                            }`}>
                                            {t(`common.status_${appt.status?.toLowerCase()}`)}
                                        </Badge>
                                    </div>

                                    <div className="flex gap-4 mt-4 pt-4 border-t border-gray-100">
                                        <div className="flex items-center gap-2 text-sm text-gray-500">
                                            {getIcon(appt.appointmentType)}
                                            {t('common.sessionType', { type: t(`common.${appt.appointmentType}`) })}
                                        </div>
                                        <div className="flex items-center gap-2 text-sm text-gray-500">
                                            <MapPin className="w-4 h-4" />
                                            {t('common.online')}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {activeTab === 'upcoming' && appt.status === 'BOOKED' && (
                                <div className="flex gap-3 mt-4 md:ml-28">
                                    <Button
                                        variant="outline"
                                        className="flex-1 border-[#92C7CF] text-[#92C7CF] hover:bg-[#F0F9FA]"
                                        onClick={() => { setSelectedAppointment(appt); setIsCancelModalOpen(true); }}
                                    >
                                        {t('common.cancel', 'Cancel')}
                                    </Button>
                                    <Button
                                        className="flex-1 bg-[#92C7CF] hover:bg-[#7FB0B8] text-white shadow-sm"
                                        onClick={() => { setSelectedAppointment(appt); fetchAvailableSlots(appt.therapistId); }}
                                    >
                                        {t('common.reschedule')}
                                    </Button>
                                </div>
                            )}
                        </Card>
                    ))
                ) : (
                    <div className="text-center py-12">
                        <p className="text-gray-500">{t('calendar.empty', 'No appointments found.')}</p>
                    </div>
                )}
            </div>

            {/* Reschedule Modal */}
            <Dialog open={isRescheduleModalOpen} onOpenChange={setIsRescheduleModalOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>{t('therapist_patient_profile.reschedule_dialog_title', 'Reschedule Appointment')}</DialogTitle>
                        <DialogDescription>
                            {t('therapist_patient_profile.reschedule_dialog_desc', 'Select a new time for your appointment.')}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid grid-cols-2 gap-2 max-h-[300px] overflow-y-auto p-2">
                        {availableSlots.length > 0 ? (
                            availableSlots.map(slot => (
                                <Button
                                    key={slot.id}
                                    variant={selectedSlot?.id === slot.id ? "default" : "outline"}
                                    className={`text-xs p-2 h-auto flex flex-col gap-1 ${selectedSlot?.id === slot.id ? 'bg-[#92C7CF] hover:bg-[#7FB0B8]' : ''}`}
                                    onClick={() => setSelectedSlot(slot)}
                                >
                                    <span className="font-bold">{format(slot.startTimestamp.toDate(), "MMM d")}</span>
                                    <span>{format(slot.startTimestamp.toDate(), "h:mm a")}</span>
                                </Button>
                            ))
                        ) : (
                            <p className="col-span-2 text-center text-gray-500 py-4">{t('therapist_patient_profile.no_slots_available', 'No available slots found.')}</p>
                        )}
                    </div>
                    <DialogFooter className="gap-2">
                        <Button variant="outline" onClick={() => setIsRescheduleModalOpen(false)}>{t('common.cancel')}</Button>
                        <Button
                            className="bg-[#92C7CF] hover:bg-[#7FB0B8]"
                            onClick={handleReschedule}
                            disabled={!selectedSlot || isSubmitting}
                        >
                            {isSubmitting ? t('common.saving') : t('common.confirm')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Cancel Modal */}
            <Dialog open={isCancelModalOpen} onOpenChange={setIsCancelModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('calendar.cancel_title', 'Cancel Appointment?')}</DialogTitle>
                        <DialogDescription>
                            {t('calendar.cancel_desc', 'Are you sure you want to cancel this appointment? This action cannot be undone.')}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCancelModalOpen(false)} disabled={isSubmitting}>{t('common.keep')}</Button>
                        <Button 
                            variant="destructive" 
                            onClick={handleCancel}
                            disabled={isSubmitting}
                        >
                            {isSubmitting ? t('common.saving') : t('common.cancel_confirm')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};
export default Calendar;
