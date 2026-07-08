import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { auth, db } from "@/lib/firebase";
import { collection, addDoc, query, where, getDocs, orderBy, deleteDoc, doc, getDoc, Timestamp } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import {
    ArrowLeft, ArrowRight, Plus, Phone, X, ChevronUp, ChevronDown
} from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

// Match PsyCMp's Appointment interface
interface Appointment {
    id: string;
    therapistId: string;
    therapistName: string;
    bookedBy?: string;
    clientName?: string;
    profilePicture?: string;
    startTimestamp: Timestamp;
    endTimestamp: Timestamp;
    status: 'AVAILABLE' | 'BOOKED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
    sessionType: string;
    notes: string;
    createdAt: Timestamp;
    updatedAt: Timestamp;
    isBooked: boolean;
    appointmentType: string;
    recurrenceType: string;
    recurrenceEnd?: Timestamp;
    isActive: boolean;
    hmsRoomId?: string;
    sessionStartTime?: Timestamp;
    therapistJoinTime?: Timestamp;
    isTherapistLate: boolean;
    sessionMinutes: number;
}

interface WeekData {
    id: number;
    startDate: Date;
    endDate: Date;
    label: string;
}

const isPastSlot = (date: Date, hour: number) => {
    const now = new Date();
    const slotEnd = new Date(date);
    slotEnd.setHours(hour + 1, 0, 0, 0);
    return slotEnd < now;
};

const TherapistAvailability = () => {
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();
    const locale = i18n.resolvedLanguage || i18n.language || undefined;
    const [loading, setLoading] = useState(false);
    const [currentWeekIndex, setCurrentWeekIndex] = useState(0);
    const [weeks, setWeeks] = useState<WeekData[]>([]);
    const [selectedDate, setSelectedDate] = useState<Date>(new Date());
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newSlotTime, setNewSlotTime] = useState({ hour: 9, minute: 0 });
    const [recurrenceType, setRecurrenceType] = useState("Single");
    const [selectedSlot, setSelectedSlot] = useState<Appointment | null>(null);
    const [showClientDialog, setShowClientDialog] = useState(false);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [slotToDelete, setSlotToDelete] = useState<Appointment | null>(null);

    useEffect(() => {
        generateWeeks();
        if (auth.currentUser) {
            fetchAppointments();
        }
    }, []);

    useEffect(() => {
        if (auth.currentUser) {
            fetchAppointments();
        }
    }, [currentWeekIndex]);

    const generateWeeks = () => {
        const today = new Date();
        const weeksData: WeekData[] = [];
        let currentStartDate = new Date(today);

        for (let i = 0; i < 12; i++) {
            // Determine end of this week (Sunday)
            const currentDay = currentStartDate.getDay();
            // If Sunday(0), distance is 0. If Thu(4), distance is 3.
            const distanceToSunday = currentDay === 0 ? 0 : 7 - currentDay;

            const weekEnd = new Date(currentStartDate);
            weekEnd.setDate(currentStartDate.getDate() + distanceToSunday);

            weeksData.push({
                id: i,
                startDate: new Date(currentStartDate),
                endDate: new Date(weekEnd),
                label: `${currentStartDate.toLocaleDateString(locale, { month: 'short', day: 'numeric' })} - ${weekEnd.toLocaleDateString(locale, { month: 'short', day: 'numeric' })}`
            });

            // Next week starts on the day after weekEnd
            currentStartDate = new Date(weekEnd);
            currentStartDate.setDate(weekEnd.getDate() + 1);
        }

        setWeeks(weeksData);
    };

    const fetchAppointments = async () => {
        try {
            if (!auth.currentUser) return;

            const appointmentsQuery = query(
                collection(db, "appointments"),
                where("therapistId", "==", auth.currentUser.uid),
                orderBy("startTimestamp", "asc")
            );

            const querySnapshot = await getDocs(appointmentsQuery);
            const appointmentsList: Appointment[] = [];

            for (const appointmentDoc of querySnapshot.docs) {
                const data = appointmentDoc.data();

                // For booked appointments, fetch patient name from users collection
                let resolvedClientName = data.clientName || "";
                let resolvedProfilePicture = data.profilePicture || "";
                const clientId = data.bookedBy || data.patientId;

                if (data.isBooked && clientId) {
                    try {
                        const patientDocRef = await getDoc(doc(db, "users", clientId));
                        if (patientDocRef.exists()) {
                            const patientData = patientDocRef.data();
                            resolvedClientName = patientData?.displayName || patientData?.firstName || resolvedClientName;
                            resolvedProfilePicture = patientData?.profilePicture || patientData?.photoURL || resolvedProfilePicture;
                        }
                    } catch (e) {
                        console.error("Error fetching patient data:", e);
                    }
                }

                appointmentsList.push({
                    id: appointmentDoc.id,
                    therapistId: data.therapistId,
                    therapistName: data.therapistName || "",
                    bookedBy: clientId,
                    clientName: resolvedClientName,
                    profilePicture: resolvedProfilePicture,
                    startTimestamp: data.startTimestamp,
                    endTimestamp: data.endTimestamp,
                    status: data.status || 'AVAILABLE',
                    sessionType: data.sessionType || "",
                    notes: data.notes || "",
                    createdAt: data.createdAt || Timestamp.now(),
                    updatedAt: data.updatedAt || Timestamp.now(),
                    isBooked: data.isBooked || false,
                    appointmentType: data.appointmentType || "",
                    recurrenceType: data.recurrenceType || "Single",
                    recurrenceEnd: data.recurrenceEnd,
                    isActive: data.isActive !== false,
                    hmsRoomId: data.hmsRoomId,
                    sessionStartTime: data.sessionStartTime,
                    therapistJoinTime: data.therapistJoinTime,
                    isTherapistLate: data.isTherapistLate || false,
                    sessionMinutes: data.sessionMinutes || 0
                });
            }

            setAppointments(appointmentsList);
        } catch (error) {
            console.error("Error fetching appointments:", error);
            toast({
                title: t("therapist.availability.error"),
                description: t("therapist.availability.failed_load"),
                variant: "destructive",
            });
        }
    };

    const calculateEndTime = (startHour: number, startMinute: number): { hour: number, minute: number } => {
        // Default 45-minute session like PsyCMp
        const totalMinutes = startHour * 60 + startMinute + 45;
        return {
            hour: Math.floor(totalMinutes / 60),
            minute: totalMinutes % 60
        };
    };

    const getSuggestedStartTimeForCell = (date: Date, hour: number) => {
        const cellStart = new Date(date);
        cellStart.setHours(hour, 0, 0, 0);

        const cellEnd = new Date(date);
        cellEnd.setHours(hour + 1, 0, 0, 0);

        const latestOverlappingEnd = appointments.reduce<Date | null>((latest, appointment) => {
            if (!appointment.isActive) return latest;
            if (appointment.status === "CANCELLED") return latest;

            const start = appointment.startTimestamp.toDate();
            const end = appointment.endTimestamp.toDate();

            if (start.toDateString() !== date.toDateString()) return latest;

            const overlapsCell = start < cellEnd && end > cellStart;
            if (!overlapsCell) return latest;

            if (!latest || end > latest) return end;
            return latest;
        }, null);

        // If something overlaps this hour, start right after it ends (end + 1 minute).
        const afterOverlap = latestOverlappingEnd
            ? new Date(latestOverlappingEnd.getTime() + 60 * 1000)
            : cellStart;

        const now = new Date();
        const minStart = new Date(now.getTime() + 60 * 1000);
        const isSameDay = date.toDateString() === now.toDateString();

        const suggested = isSameDay ? new Date(Math.max(afterOverlap.getTime(), minStart.getTime())) : afterOverlap;

        return { hour: suggested.getHours(), minute: suggested.getMinutes() };
    };

    const createAppointmentSlots = async () => {
        if (!auth.currentUser) return;

        setLoading(true);
        try {
            const slotsToCreate: Partial<Appointment>[] = [];
            const startDate = new Date(selectedDate);
            const startTime = newSlotTime;
            const endTime = calculateEndTime(startTime.hour, startTime.minute);

            // Generate slots based on recurrence type (matching PsyCMp logic)
            switch (recurrenceType) {
                case "Weekly": {
                    // Create slots for remaining days of the current week
                    const currentDate = new Date(startDate);
                    const dayOfWeek = currentDate.getDay(); // 0 = Sunday, 6 = Saturday

                    // Fix: Include Sunday correctly
                    // If Sun(0), days=1. If Thu(4), days=4 (Thu, Fri, Sat, Sun).
                    const daysUntilSunday = dayOfWeek === 0 ? 1 : (7 - dayOfWeek + 1);

                    for (let i = 0; i < daysUntilSunday; i++) {
                        const slotDate = new Date(currentDate);
                        slotDate.setDate(currentDate.getDate() + i);

                        const startDateTime = new Date(slotDate);
                        startDateTime.setHours(startTime.hour, startTime.minute, 0, 0);

                        const endDateTime = new Date(slotDate);
                        endDateTime.setHours(endTime.hour, endTime.minute, 0, 0);

                        slotsToCreate.push({
                            therapistId: auth.currentUser.uid,
                            therapistName: auth.currentUser.displayName || "",
                            startTimestamp: Timestamp.fromDate(startDateTime),
                            endTimestamp: Timestamp.fromDate(endDateTime),
                            status: 'AVAILABLE',
                            sessionType: "",
                            notes: "",
                            createdAt: Timestamp.now(),
                            updatedAt: Timestamp.now(),
                            isBooked: false,
                            appointmentType: "",
                            recurrenceType: "Single", // Individual slots are marked as Single
                            isActive: true,
                            isTherapistLate: false,
                            sessionMinutes: 0
                        });
                    }
                    break;
                }

                case "Monthly": {
                    // Create slots for remaining days of the current month
                    const currentDate = new Date(startDate);
                    const year = currentDate.getFullYear();
                    const month = currentDate.getMonth();
                    const daysInMonth = new Date(year, month + 1, 0).getDate();
                    const currentDay = currentDate.getDate();

                    for (let day = currentDay; day <= daysInMonth; day++) {
                        const slotDate = new Date(year, month, day);

                        const startDateTime = new Date(slotDate);
                        startDateTime.setHours(startTime.hour, startTime.minute, 0, 0);

                        const endDateTime = new Date(slotDate);
                        endDateTime.setHours(endTime.hour, endTime.minute, 0, 0);

                        slotsToCreate.push({
                            therapistId: auth.currentUser.uid,
                            therapistName: auth.currentUser.displayName || "",
                            startTimestamp: Timestamp.fromDate(startDateTime),
                            endTimestamp: Timestamp.fromDate(endDateTime),
                            status: 'AVAILABLE',
                            sessionType: "",
                            notes: "",
                            createdAt: Timestamp.now(),
                            updatedAt: Timestamp.now(),
                            isBooked: false,
                            appointmentType: "",
                            recurrenceType: "Single",
                            isActive: true,
                            isTherapistLate: false,
                            sessionMinutes: 0
                        });
                    }
                    break;
                }

                default: { // Single
                    const startDateTime = new Date(startDate);
                    startDateTime.setHours(startTime.hour, startTime.minute, 0, 0);

                    const endDateTime = new Date(startDate);
                    endDateTime.setHours(endTime.hour, endTime.minute, 0, 0);

                    slotsToCreate.push({
                        therapistId: auth.currentUser.uid,
                        therapistName: auth.currentUser.displayName || "",
                        startTimestamp: Timestamp.fromDate(startDateTime),
                        endTimestamp: Timestamp.fromDate(endDateTime),
                        status: 'AVAILABLE',
                        sessionType: "",
                        notes: "",
                        createdAt: Timestamp.now(),
                        updatedAt: Timestamp.now(),
                        isBooked: false,
                        appointmentType: "",
                        recurrenceType: "Single",
                        isActive: true,
                        isTherapistLate: false,
                        sessionMinutes: 0
                    });
                    break;
                }
            }

            // Create all slots in the appointments collection
            let successCount = 0;
            const now = Timestamp.now();
            for (const slot of slotsToCreate) {
                // Double check it's not in the past
                if (slot.startTimestamp && slot.startTimestamp.seconds < now.seconds) {
                    continue;
                }
                try {
                    await addDoc(collection(db, "appointments"), slot);
                    successCount++;
                } catch (error) {
                    console.error("Error creating slot:", error);
                }
            }

            if (successCount > 0) {
                toast({
                    title: t("therapist.availability.success", "Success"),
                    description: t("therapist.availability.slots_created", "Created {{count}} slots", { count: successCount }),
                });
                await fetchAppointments(); // Refresh the list
                setIsModalOpen(false);
            } else {
                toast({
                    title: t("therapist.availability.error"),
                    description: t("therapist.availability.failed_create"),
                    variant: "destructive",
                });
            }
        } catch (error) {
            console.error("Error creating slots:", error);
            toast({
                title: t("therapist.availability.error"),
                description: t("therapist.availability.failed_create"),
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteClick = (slot: Appointment) => {
        setSlotToDelete(slot);
        setShowDeleteDialog(true);
    };

    const confirmDeleteSlot = async () => {
        if (!slotToDelete) return;

        try {
            await deleteDoc(doc(db, "appointments", slotToDelete.id));
            toast({
                title: t("therapist.availability.success", "Success"),
                description: t("therapist.availability.slot_deleted"),
            });
            await fetchAppointments();
        } catch (error) {
            console.error("Error deleting slot:", error);
            toast({
                title: t("therapist.availability.error"),
                description: t("therapist.availability.failed_delete"),
                variant: "destructive",
            });
        } finally {
            setShowDeleteDialog(false);
            setSlotToDelete(null);
        }
    };

    const getWeekDays = () => {
        const currentWeek = weeks[currentWeekIndex];
        if (!currentWeek) return [];

        const days = [];
        const currentDate = new Date(currentWeek.startDate);
        const endDate = currentWeek.endDate;

        while (currentDate <= endDate) {
            days.push(new Date(currentDate));
            currentDate.setDate(currentDate.getDate() + 1);
        }

        return days;
    };

    const getAppointmentsForDate = (date: Date) => {
        return appointments.filter(appointment => {
            const appointmentDate = appointment.startTimestamp.toDate();
            return appointmentDate.toDateString() === date.toDateString();
        });
    };

    const formatTime = (date: Date) => {
        return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
    };

    const weekDays = getWeekDays();

    return (
        <div className="h-screen flex flex-col bg-[#F9FAFB] overflow-hidden">
            {/* Header with Week Navigation */}
            <div className="bg-white shadow-sm p-4">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-4">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(-1)}
                            className="p-2"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </Button>
                        <h1 className="text-xl font-semibold text-gray-900">{t("therapist.availability.title")}</h1>
                    </div>
                </div>

                {/* Week Navigation */}
                <div className="flex items-center justify-between">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentWeekIndex(Math.max(0, currentWeekIndex - 1))}
                        disabled={currentWeekIndex === 0}
                    >
                        <ArrowLeft className="w-4 h-4" />
                    </Button>

                    <div className="flex gap-2 overflow-x-auto">
                        {weeks.slice(0, 4).map((week, index) => {
                            const isSelected = index === currentWeekIndex;
                            return (
                                <Button
                                    key={week.id}
                                    variant={isSelected ? "default" : "outline"}
                                    size="sm"
                                    onClick={() => setCurrentWeekIndex(index)}
                                    className={`px-3 py-2 text-xs whitespace-nowrap ${isSelected
                                        ? 'bg-[#92C7CF] hover:bg-[#7FB0B8] text-white'
                                        : 'text-gray-600'
                                        }`}
                                >
                                    {t("therapist.availability.week", { number: index + 1 })}
                                    <br />
                                    <span className="text-xs opacity-75">
                                        {week.startDate.toLocaleDateString(locale, { month: 'short', day: 'numeric' })}
                                    </span>
                                </Button>
                            );
                        })}
                    </div>

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentWeekIndex(Math.min(weeks.length - 1, currentWeekIndex + 1))}
                        disabled={currentWeekIndex === weeks.length - 1}
                    >
                        <ArrowRight className="w-4 h-4" />
                    </Button>
                </div>
            </div>

            {/* Time Grid */}
            <div className="flex-1 p-4 overflow-hidden">
                <div className="h-full bg-white rounded-lg shadow-sm overflow-hidden border">
                    <TimeGrid
                        weekDays={getWeekDays()}
                        appointments={appointments}
                        onSlotClick={(slot) => {
                            if (slot.isBooked) {
                                setSelectedSlot(slot);
                                setShowClientDialog(true);
                            } else {
                                handleDeleteClick(slot);
                            }
                        }}
                        onTimeSlotClick={(date, hour) => {
                            if (isPastSlot(date, hour)) return;

                            setSelectedDate(date);
                            setNewSlotTime(getSuggestedStartTimeForCell(date, hour));

                            setIsModalOpen(true);
                        }}
                        t={t}
                    />
                </div>
            </div>

            {/* Add Slot Modal */}
            <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t("therapist.availability.add_slot_title")}</DialogTitle>
                    </DialogHeader>

                    <div className="space-y-4">
                        <div className="flex justify-between items-center">
                            <div>
                                <div className="font-semibold">
                                    {selectedDate.toLocaleDateString(locale, {
                                        weekday: 'long',
                                        month: 'long',
                                        day: 'numeric'
                                    })}
                                </div>
                                <div className="text-sm text-gray-600">{t("therapist.availability.session_duration")}</div>
                            </div>

                            <div className="flex items-center gap-2">
                                <TimeAdjuster
                                    value={newSlotTime.hour}
                                    onChange={(hour) => {
                                        const now = new Date();
                                        const isToday = selectedDate.toDateString() === now.toDateString();
                                        if (isToday && hour < now.getHours()) return;
                                        setNewSlotTime(prev => ({ ...prev, hour }));
                                    }}
                                    max={23}
                                    label="Hour"
                                />
                                <span className="text-2xl font-bold text-gray-400">:</span>
                                <TimeAdjuster
                                    value={newSlotTime.minute}
                                    onChange={(minute) => {
                                        const now = new Date();
                                        const isToday = selectedDate.toDateString() === now.toDateString();
                                        if (isToday && newSlotTime.hour === now.getHours() && minute < now.getMinutes()) return;
                                        setNewSlotTime(prev => ({ ...prev, minute }));
                                    }}
                                    max={55}
                                    step={5}
                                    label="Min"
                                />
                            </div>
                        </div>

                        <div>
                            <Label className="text-sm font-medium">{t("therapist.availability.recurrence")}</Label>
                            <RadioGroup value={recurrenceType} onValueChange={setRecurrenceType} className="mt-2">
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="Single" id="single" />
                                    <Label htmlFor="single" className="text-sm">{t("therapist.availability.single")}</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="Weekly" id="weekly" />
                                    <Label htmlFor="weekly" className="text-sm">{t("therapist.availability.weekly")}</Label>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="Monthly" id="monthly" />
                                    <Label htmlFor="monthly" className="text-sm">{t("therapist.availability.monthly")}</Label>
                                </div>
                            </RadioGroup>
                        </div>

                        <div className="flex gap-2 pt-4">
                            <Button
                                variant="outline"
                                onClick={() => setIsModalOpen(false)}
                                className="flex-1"
                            >
                                {t("therapist.availability.cancel")}
                            </Button>
                            <Button
                                onClick={createAppointmentSlots}
                                disabled={loading}
                                className="flex-1 bg-[#92C7CF] hover:bg-[#7FB0B8]"
                            >
                                {loading ? t("therapist.availability.creating") : t("therapist.availability.add_slot")}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Client Profile Dialog */}
            <Dialog open={showClientDialog} onOpenChange={setShowClientDialog}>
                <DialogContent className="sm:max-w-sm p-0 overflow-hidden border-0 rounded-2xl shadow-xl">
                    {selectedSlot && (
                        <div
                            className="p-5"
                            style={{ background: 'linear-gradient(135deg, #F4A261 0%, #E8956A 100%)' }}
                        >
                            {/* Close button */}
                            <button
                                onClick={() => setShowClientDialog(false)}
                                className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/20 hover:bg-white/40 flex items-center justify-center transition-colors"
                            >
                                <X className="w-4 h-4 text-white" />
                            </button>

                            {/* Patient Name */}
                            <div className="flex items-center gap-2 mb-3">
                                <Phone className="w-4 h-4 text-white" />
                                <span className="text-white font-bold text-base uppercase tracking-wide">
                                    {selectedSlot.clientName || t("therapist.availability.unknown_patient")}
                                </span>
                            </div>

                            {/* Time Range */}
                            <div className="text-white/90 text-sm font-medium mb-5">
                                {formatTime(selectedSlot.startTimestamp.toDate())} - {formatTime(selectedSlot.endTimestamp.toDate())}
                            </div>

                            {/* View Profile Button */}
                            <button
                                onClick={() => {
                                    setShowClientDialog(false);
                                    if (selectedSlot.bookedBy) {
                                        navigate(`/therapist/patient/${selectedSlot.bookedBy}`);
                                    }
                                }}
                                className="w-full bg-white hover:bg-gray-50 text-[#E8956A] font-bold text-sm py-2.5 px-4 rounded-lg transition-colors shadow-sm"
                            >
                                {t("therapist.availability.view_full_profile")}
                            </button>
                        </div>
                    )}
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t("therapist.availability.delete_slot_title", "Delete Slot")}</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                        <p className="text-gray-600">
                            {t("therapist.availability.delete_confirmation", "Are you sure you want to delete this availability slot?")}
                        </p>
                        {slotToDelete && (
                            <div className="mt-4 p-3 bg-gray-50 rounded-lg text-sm">
                                <p className="font-medium text-gray-900">
                                    {slotToDelete.startTimestamp.toDate().toLocaleDateString(locale, {
                                        weekday: 'long',
                                        month: 'long',
                                        day: 'numeric'
                                    })}
                                </p>
                                <p className="text-gray-600">
                                    {formatTime(slotToDelete.startTimestamp.toDate())} - {formatTime(slotToDelete.endTimestamp.toDate())}
                                </p>
                            </div>
                        )}
                    </div>
                    <div className="flex justify-end gap-3">
                        <Button
                            variant="outline"
                            onClick={() => setShowDeleteDialog(false)}
                        >
                            {t("therapist.availability.cancel", "Cancel")}
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={confirmDeleteSlot}
                        >
                            {t("therapist.availability.delete_slot", "Delete Slot")}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
};

// Time Grid Component (matching PsyCMp design)
// Time Grid Component (matching PsyCMp design)
interface TimeGridProps {
    weekDays: Date[];
    appointments: Appointment[];
    onSlotClick: (slot: Appointment) => void;
    onTimeSlotClick: (date: Date, hour: number) => void;
    t: (key: string, defaultValue?: string) => string;
}

const TimeGrid = ({ weekDays, appointments, onSlotClick, onTimeSlotClick, t }: TimeGridProps) => {
    const { i18n } = useTranslation();
    const locale = i18n.resolvedLanguage || i18n.language || undefined;
    const hours = Array.from({ length: 17 }, (_, i) => i + 6); // 6 AM to 10 PM
    const gridStartHour = 6;
    const hourHeight = 65; // Reduced height to fit more hours on screen

    const getAppointmentsForDay = (date: Date) => {
        return appointments.filter(appointment => {
            const appointmentDate = appointment.startTimestamp.toDate();
            return appointmentDate.toDateString() === date.toDateString();
        });
    };

    const formatTimeAxis = (hour: number) => {
        const date = new Date();
        date.setHours(hour, 0, 0, 0);
        return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
    };

    return (
        <div className="h-full overflow-auto bg-white">
            <div className="min-w-[800px] relative">
                {/* Fixed Header */}
                <div className="flex bg-gray-50/80 backdrop-blur-sm border-b sticky top-0 z-30">
                    <div className="w-24 p-4 text-xs font-bold text-gray-400 text-center border-r uppercase tracking-widest">
                        {t("therapist.availability.time", "Time")}
                    </div>
                    {weekDays.map((date, index) => {
                        const isToday = date.toDateString() === new Date().toDateString();
                        return (
                            <div
                                key={index}
                                className={`flex-1 p-4 text-center border-r last:border-r-0 ${isToday ? 'bg-[#92C7CF] text-white' : 'text-gray-700'}`}
                            >
                                <div className="text-xs font-semibold uppercase opacity-80 mb-1">
                                    {date.toLocaleDateString(locale, { weekday: "short" })}
                                </div>
                                <div className={`text-xl font-black ${isToday ? 'text-white' : 'text-gray-900'}`}>
                                    {date.getDate()}
                                </div>
                            </div>
                        );
                    })}
                </div>

                <div className="flex relative">
                    {/* Continuous Time Axis */}
                    <div className="w-24 bg-gray-50/30 border-r">
                        {hours.map((hour) => (
                            <div key={hour} style={{ height: `${hourHeight}px` }} className="relative border-b last:border-b-0 group">
                                <span className="absolute -top-2 left-0 right-0 text-[11px] text-gray-400 font-bold text-center bg-white/50 px-1 py-0.5 rounded shadow-sm opacity-0 group-hover:opacity-100 transition-opacity z-10 mx-2">
                                    {formatTimeAxis(hour)}
                                </span>
                                <div className="pt-2 pr-3 text-[10px] text-gray-500 font-bold text-right">
                                    {formatTimeAxis(hour)}
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Day Columns */}
                    <div className="flex-1 flex relative">
                        {weekDays.map((date, dayIndex) => {
                            const dayAppointments = getAppointmentsForDay(date);
                            const isToday = date.toDateString() === new Date().toDateString();

                            return (
                                <div
                                    key={dayIndex}
                                    className={`flex-1 relative border-r last:border-r-0 ${isToday ? 'bg-blue-50/10' : ''}`}
                                    style={{ height: `${hours.length * hourHeight}px` }}
                                >
                                    {/* Slot background lines */}
                                    {hours.map((hour) => {
                                        const isPast = isPastSlot(date, hour);
                                        return (
                                            <div
                                                key={hour}
                                                style={{ height: `${hourHeight}px` }}
                                                className={`border-b last:border-b-0 transition-all cursor-pointer ${isPast ? 'bg-gray-100/50 cursor-not-allowed' : 'hover:bg-blue-50/40'}`}
                                                onClick={() => !isPast && onTimeSlotClick(date, hour)}
                                            />
                                        );
                                    })}

                                    {/* Appointments Overlay */}
                                    {dayAppointments.map((appointment) => {
                                        const startDate = appointment.startTimestamp.toDate();
                                        const endDate = appointment.endTimestamp.toDate();
                                        
                                        const startMinutes = (startDate.getHours() - gridStartHour) * 60 + startDate.getMinutes();
                                        const endMinutes = (endDate.getHours() - gridStartHour) * 60 + endDate.getMinutes();
                                        const duration = endMinutes - startMinutes;
                                        
                                        const top = (startMinutes / 60) * hourHeight;
                                        const height = (duration / 60) * hourHeight;

                                        return (
                                            <div 
                                                key={appointment.id}
                                                style={{ 
                                                    position: 'absolute',
                                                    top: `${top + 2}px`, // Small padding
                                                    height: `${height - 4}px`, // Small padding
                                                    left: '4px',
                                                    right: '4px',
                                                    zIndex: 20
                                                }}
                                            >
                                                <TimeSlotBox
                                                    appointment={appointment}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        onSlotClick(appointment);
                                                    }}
                                                />
                                            </div>
                                        );
                                    })}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

const TimeSlotBox = ({ appointment, onClick }: { appointment: Appointment; onClick: (e: React.MouseEvent) => void }) => {
    const { t, i18n } = useTranslation();
    const isBooked = appointment.isBooked;
    const startTime = appointment.startTimestamp.toDate();
    const endTime = appointment.endTimestamp.toDate();

    const timeRange = `${startTime.toLocaleTimeString(i18n.language, { hour: 'numeric', minute: '2-digit' })} - ${endTime.toLocaleTimeString(i18n.language, { hour: 'numeric', minute: '2-digit' })}`;

    return (
        <div
            onClick={onClick}
            className={`
                w-full h-full p-2 rounded-xl text-xs cursor-pointer border-2 transition-all flex flex-col justify-center items-center text-center shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-[0.98]
                ${isBooked
                    ? 'bg-orange-50 border-orange-200 text-orange-900'
                    : 'bg-white border-emerald-100 text-emerald-800 hover:border-emerald-300'
                }
            `}
        >
            <div className="flex items-center justify-center gap-1.5 mb-1">
                {isBooked ? (
                    <>
                        <Phone className="w-3 h-3 text-orange-500" />
                        <span className="font-black truncate max-w-[120px]">
                            {appointment.clientName || t("therapist.availability.client", "Client")}
                        </span>
                    </>
                ) : (
                    <span className="font-bold text-[11px] uppercase tracking-wider text-emerald-600">
                        {t("therapist.availability.open", "Available")}
                    </span>
                )}
            </div>
            <div className={`text-[10px] font-black opacity-80 ${isBooked ? 'text-orange-700/70' : 'text-emerald-700/60'}`}>
                {timeRange}
            </div>
        </div>
    );
};

const TimeAdjuster = ({ value, onChange, max, step = 1, label }: TimeAdjusterProps) => {
    return (
        <div className="flex flex-col items-center">
            <Button
                variant="outline"
                size="sm"
                onClick={() => onChange(value + step > max ? 0 : value + step)}
                className="h-8 w-8 p-0 rounded-full bg-[#E0F7FA] hover:bg-[#B2EBF2] border-none shadow-sm"
            >
                <ChevronUp className="w-4 h-4 text-cyan-700" />
            </Button>
            <div className="py-2 text-2xl font-black min-w-[3ch] text-center text-gray-800">
                {value.toString().padStart(2, '0')}
            </div>
            <Button
                variant="outline"
                size="sm"
                onClick={() => onChange(value - step < 0 ? max : value - step)}
                className="h-8 w-8 p-0 rounded-full bg-[#E0F7FA] hover:bg-[#B2EBF2] border-none shadow-sm"
            >
                <ChevronDown className="w-4 h-4 text-cyan-700" />
            </Button>
        </div>
    );
};

export default TherapistAvailability;
