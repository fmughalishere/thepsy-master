import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { auth, db } from "@/lib/firebase";
import {
    doc,
    getDoc,
    query,
    collection,
    where,
    getDocs,
    orderBy,
    limit,
    Timestamp,
    updateDoc,
} from "firebase/firestore";
import {
    ArrowLeft,
    MoreVertical,
    Calendar,
    CheckCircle2,
    Activity,
    AlertTriangle,
    XCircle,
    Shield,
    FileText
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/hooks/use-toast";
import { ScrollArea } from "@/components/ui/scroll-area";

// Interfaces
interface Patient {
    id: string;
    firstName?: string;
    lastName?: string;
    displayName?: string;
    email?: string;
    photoURL?: string;
    gender?: string;
    patientDetails?: {
        phone?: string;
        dateOfBirth?: string; // or Timestamp
        gender?: string;
        maritalStatus?: string;
        medications?: string;
        chronicPain?: boolean;
        questionnaireAnswers?: any;
        selfCareAssessment?: {
            timestamp: Timestamp;
            responses: any[];
        };
        lastPhqTaken?: Timestamp;
        age?: string;
        therapyType?: string;
        quotas?: {
            planId?: string;
        };
    };
    address?: {
        city?: string;
        country?: string;
    };
}

interface Appointment {
    id: string;
    therapistId: string;
    bookedBy?: string; // patientId
    clientName?: string;
    startTimestamp: Timestamp;
    endTimestamp: Timestamp;
    status: 'AVAILABLE' | 'BOOKED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
    notes?: string;
    isBooked?: boolean;
    appointmentType?: string;
    sessionMinutes?: number;
}

interface PHQResult {
    id: string;
    score: number;
    timestamp: Timestamp;
    answers?: number[];
}

const TherapistPatientProfile = () => {
    const { userId } = useParams<{ userId: string }>();
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();

    const [patient, setPatient] = useState<Patient | null>(null);
    const [loading, setLoading] = useState(true);
    const [appointments, setAppointments] = useState<Appointment[]>([]);
    const [upcomingAppointment, setUpcomingAppointment] = useState<Appointment | null>(null);
    const [phqResult, setPhqResult] = useState<PHQResult | null>(null);
    const [planName, setPlanName] = useState<string | null>(null);

    // Dialog States
    const [showAddNote, setShowAddNote] = useState(false);
    const [noteText, setNoteText] = useState("");
    const [showCancelDialog, setShowCancelDialog] = useState(false);
    const [showTerminateDialog, setShowTerminateDialog] = useState(false);
    const [showRescheduleDialog, setShowRescheduleDialog] = useState(false);
    const [showReportDialog, setShowReportDialog] = useState(false);
    const [availableSlots, setAvailableSlots] = useState<Appointment[]>([]);
    const [selectedSlot, setSelectedSlot] = useState<Appointment | null>(null);
    const [reportReason, setReportReason] = useState("");

    useEffect(() => {
        if (userId) {
            fetchPatientData();
            fetchAppointments();
            fetchPHQHistory();
        }
    }, [userId]);

    useEffect(() => {
        const fetchSubscriptionPlan = async () => {
            if (!patient?.patientDetails?.quotas?.planId) {
                setPlanName(t("therapist_patient_profile.no_active_plan", "No Active Plan"));
                return;
            }

            try {
                const { fetchAndActivate, getValue } = await import("firebase/remote-config");
                const { remoteConfig } = await import("@/lib/firebase");
                await fetchAndActivate(remoteConfig);

                const configValue = getValue(remoteConfig, 'payments');
                const configString = configValue.asString();

                if (configString) {
                    const config = JSON.parse(configString);
                    const lang = (i18n.resolvedLanguage || i18n.language || 'en').split('-')[0] || 'en';
                    const plans = (config[`therapy_session_plans_${lang}`] || config['therapy_session_plans_en'] || []) as any[];

                    const foundPlan = plans.find((p: any) => p.id === patient.patientDetails?.quotas?.planId);
                    setPlanName(foundPlan ? foundPlan.name : t("therapist_patient_profile.unknown_plan", "Unknown Plan"));
                }
            } catch (error) {
                console.error("Error fetching plan", error);
                setPlanName(t("therapist_patient_profile.error_loading_plan", "Error loading plan"));
            }
        };

        if (patient) {
            fetchSubscriptionPlan();
        }
    }, [patient, i18n.language, i18n.resolvedLanguage, t]);

    const fetchPatientData = async () => {
        try {
            if (!userId) return;
            const docRef = doc(db, "users", userId);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                setPatient({ id: docSnap.id, ...docSnap.data() } as Patient);
            } else {
                toast({ title: t("therapist_patient_profile.error_load", "Failed to load patient"), variant: "destructive" });
            }
        } catch (error) {
            console.error("Error fetching patient", error);
        } finally {
            setLoading(false);
        }
    };

    const fetchAppointments = async () => {
        try {
            if (!auth.currentUser || !userId) return;

            const q = query(
                collection(db, "appointments"),
                where("therapistId", "==", auth.currentUser.uid),
                where("bookedBy", "==", userId),
                orderBy("startTimestamp", "desc")
            );

            const snapshot = await getDocs(q);
            const appts = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Appointment));
            setAppointments(appts);

            const now = new Date();
            const futureAppts = appts.filter(a =>
                (a.status === 'BOOKED') &&
                a.startTimestamp.toDate() > now
            ).sort((a, b) => a.startTimestamp.toMillis() - b.startTimestamp.toMillis());

            if (futureAppts.length > 0) {
                setUpcomingAppointment(futureAppts[0]);
            } else {
                setUpcomingAppointment(null);
            }

        } catch (error) {
            console.error("Error fetching appointments", error);
        }
    };

    const fetchPHQHistory = async () => {
        try {
            if (!userId) return;
            const q = query(
                collection(db, "phq"),
                where("userId", "==", userId),
                orderBy("timestamp", "desc"),
                limit(1)
            );
            const snapshot = await getDocs(q);
            if (!snapshot.empty) {
                const data = snapshot.docs[0].data();
                setPhqResult({ id: snapshot.docs[0].id, ...data } as PHQResult);
            }
        } catch (error) {
            console.error("Error fetching PHQ", error);
        }
    };

    const handleFetchAvailableSlots = async () => {
        try {
            if (!auth.currentUser) return;

            const start = new Date();
            const end = new Date();
            end.setDate(end.getDate() + 30);

            const q = query(
                collection(db, "appointments"),
                where("therapistId", "==", auth.currentUser.uid),
                where("status", "==", "AVAILABLE"),
                where("startTimestamp", ">=", Timestamp.fromDate(start)),
                orderBy("startTimestamp", "asc")
            );

            const snapshot = await getDocs(q);
            const slots = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Appointment));
            const validSlots = slots.filter(s => s.startTimestamp.toDate() <= end);
            setAvailableSlots(validSlots);
            setShowRescheduleDialog(true);
        } catch (error) {
            console.error("Error fetching slots", error);
            toast({ title: t("therapist_patient_profile.failed_to_load_slots", "Failed to load slots"), variant: "destructive" });
        }
    };

    // Actions
    const handleAddNote = async () => {
        if (!upcomingAppointment || !noteText.trim()) return;
        try {
            await updateDoc(doc(db, "appointments", upcomingAppointment.id), {
                notes: noteText
            });
            toast({ title: t("therapist_patient_profile.note_added", "Note added successfully") });
            setShowAddNote(false);
            setNoteText("");
            fetchAppointments();
        } catch (error) {
            toast({ title: t("therapist_patient_profile.error_adding_note", "Error adding note"), variant: "destructive" });
        }
    };

    const handleCancelAppointment = async () => {
        if (!upcomingAppointment) return;
        try {
            await updateDoc(doc(db, "appointments", upcomingAppointment.id), {
                status: 'CANCELLED',
                isBooked: false,
                bookedBy: null,
                clientName: null
            });
            toast({ title: t("therapist_patient_profile.cancelled", "Appointment cancelled") });
            setShowCancelDialog(false);
            fetchAppointments();
        } catch (error) {
            toast({ title: t("therapist_patient_profile.error_cancelling", "Error cancelling"), variant: "destructive" });
        }
    };

    const handleTerminate = async () => {
        if (!userId) return;
        toast({
            title: t("therapist_patient_profile.contract_terminated", "Contract Terminated"),
            description: t("therapist_patient_profile.feature_simulated", "This feature is simulated for now.")
        });
        setShowTerminateDialog(false);
    };

    const handleReschedule = async () => {
        if (!upcomingAppointment || !selectedSlot) return;
        try {
            await updateDoc(doc(db, "appointments", upcomingAppointment.id), {
                status: 'AVAILABLE',
                isBooked: false,
                bookedBy: null,
                clientName: null
            });

            await updateDoc(doc(db, "appointments", selectedSlot.id), {
                status: 'BOOKED',
                isBooked: true,
                bookedBy: userId,
                clientName: patient?.displayName || t("therapist_patient_profile.patient_fallback_name", "Patient")
            });

            toast({ title: t("therapist_patient_profile.rescheduled_success", "Rescheduled successfully") });
            setShowRescheduleDialog(false);
            fetchAppointments();
        } catch (error) {
            console.error(error);
            toast({ title: t("therapist_patient_profile.reschedule_failed", "Reschedule failed"), variant: "destructive" });
        }
    };

    const handleReport = async () => {
        toast({ title: t("therapist_patient_profile.report_submitted", "Report submitted") });
        setShowReportDialog(false);
    };

    const viewFullPHQReport = () => {
        navigate(`/therapist/patient/${userId}/phq-history`);
    };

    const viewFullSelfCareReport = () => {
        navigate("/therapist/self-care", { state: { userId: userId, readOnly: true } });
    };

    const getInitials = (name?: string) => name ? name.substring(0, 2).toUpperCase() : "??";

    function getSeverity(score: number): string {
        if (score <= 4) return t("therapist_patient_profile.severity_minimal", "Minimal");
        if (score <= 9) return t("therapist_patient_profile.severity_mild", "Mild");
        if (score <= 14) return t("therapist_patient_profile.severity_moderate", "Moderate");
        if (score <= 19) return t("therapist_patient_profile.severity_moderately_severe", "Moderately severe");
        return t("therapist_patient_profile.severity_severe", "Severe");
    }

    function getTimeAgo(date: Date): string {
        const diff = new Date().getTime() - date.getTime();
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        if (days === 0) return t("therapist_patient_profile.time_today", "Today");
        if (days === 1) return t("therapist_patient_profile.time_yesterday", "Yesterday");
        return t("therapist_patient_profile.time_days_ago", { days, defaultValue: `${days} days ago` });
    }

    // Formatting vars
    const totalSessions = appointments.filter(a => a.status === 'COMPLETED').length;
    const locale = i18n.resolvedLanguage || i18n.language || undefined;
    const notAvailable = t("common.na", "N/A");

    const normalizeEnum = (value?: string) => value?.trim().toLowerCase();

    const formatGender = (raw?: string) => {
        const key = normalizeEnum(raw);
        if (!key) return notAvailable;
        if (key === "male") return t("therapist_patient_profile.gender_male", "Male");
        if (key === "female") return t("therapist_patient_profile.gender_female", "Female");
        if (key === "non-binary" || key === "nonbinary") return t("therapist_patient_profile.gender_non_binary", "Non-binary");
        if (key === "prefer not to say" || key === "prefer_not_to_say" || key === "n/a") return t("therapist_patient_profile.gender_prefer_not_to_say", "Prefer not to say");
        if (key === "other") return t("therapist_patient_profile.gender_other", "Other");
        return raw || notAvailable;
    };

    const formatRelationshipStatus = (raw?: string) => {
        const key = normalizeEnum(raw);
        if (!key) return notAvailable;
        if (key === "single") return t("therapist_patient_profile.relationship_single", "Single");
        if (key === "married") return t("therapist_patient_profile.relationship_married", "Married");
        if (key === "divorced") return t("therapist_patient_profile.relationship_divorced", "Divorced");
        if (key === "widowed") return t("therapist_patient_profile.relationship_widowed", "Widowed");
        if (key === "separated") return t("therapist_patient_profile.relationship_separated", "Separated");
        if (key === "in a relationship" || key === "in_relationship" || key === "relationship") return t("therapist_patient_profile.relationship_in_relationship", "In a relationship");
        return raw || notAvailable;
    };

    const formatMedication = (raw?: string) => {
        const key = normalizeEnum(raw);
        if (!key) return t("common.none", "None");
        if (key === "none" || key === "no" || key === "no meds" || key === "no medications" || key === "no medication") {
            return t("common.none", "None");
        }
        if (key === "n/a" || key === "na" || key === "not applicable") return notAvailable;
        return raw || t("common.none", "None");
    };

    const getAgeFromQuestionnaire = () => {
        const answers = patient?.patientDetails?.questionnaireAnswers?.answers;
        if (!answers || !Array.isArray(answers)) return null;
        // Find an optionId that is a number between 18 and 99 (Age question)
        const ageOption = answers.find((a: any) => {
            const val = parseInt(a.optionId);
            return !isNaN(val) && val >= 18 && val <= 99;
        });
        return ageOption ? ageOption.optionId : null;
    };

    const age = patient?.patientDetails?.age ||
        (patient?.patientDetails?.dateOfBirth ?
            (new Date().getFullYear() - new Date(patient.patientDetails.dateOfBirth).getFullYear()) :
            getAgeFromQuestionnaire() || notAvailable);

    const gender = formatGender(patient?.patientDetails?.gender || patient?.gender);

    const relationshipStatus = patient?.patientDetails?.maritalStatus
        ? formatRelationshipStatus(patient.patientDetails.maritalStatus)
        : patient?.patientDetails?.therapyType || notAvailable;

    const medication = formatMedication(patient?.patientDetails?.medications);

    const nextSessionDate = upcomingAppointment ?
        upcomingAppointment.startTimestamp.toDate().toLocaleDateString(locale, { month: 'short', day: 'numeric' }) :
        notAvailable;

    if (loading) return <div className="p-8 flex justify-center">{t("common.loading", "Loading...")}</div>;
    if (!patient) return <div className="p-8">{t("therapist_patient_profile.patient_not_found", "Patient not found")}</div>;

    return (
        <div className="min-h-screen bg-[#FBF9F1] pb-10">
            {/* Header Section */}
            <div className="bg-primary text-white p-6 rounded-b-[30px] shadow-lg relative z-20">
                <div className="flex justify-between items-start mb-6">
                    <Button variant="ghost" className="text-white hover:bg-white/10 p-2 h-auto" onClick={() => navigate(-1)}>
                        <ArrowLeft className="w-6 h-6" />
                    </Button>

                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="text-white hover:bg-white/10 p-2 h-auto">
                                <MoreVertical className="w-6 h-6" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-56">
                            {upcomingAppointment && (
                                <>
                                    <DropdownMenuItem onClick={() => setShowAddNote(true)}>
                                        <FileText className="mr-2 h-4 w-4" />
                                        {t("therapist_patient_profile.bottom_sheet_add_note", "Add Session Note")}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem onClick={() => setShowCancelDialog(true)} className="text-red-600">
                                        <XCircle className="mr-2 h-4 w-4" />
                                        {t("therapist_patient_profile.bottom_sheet_cancel_appointment", "Cancel Appointment")}
                                    </DropdownMenuItem>
                                </>
                            )}
                            <DropdownMenuItem onClick={() => setShowTerminateDialog(true)} className="text-red-600">
                                <AlertTriangle className="mr-2 h-4 w-4" />
                                {t("therapist_patient_profile.bottom_sheet_terminate_contract", "Terminate Contract")}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setShowReportDialog(true)} className="text-orange-600">
                                <Shield className="mr-2 h-4 w-4" />
                                {t("therapist_patient_profile.report_user", "Report User")}
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

                <div className="flex flex-col items-center pb-8">
                    <Avatar className="w-24 h-24 border-4 border-white/30 mb-4">
                        <AvatarImage src={patient.photoURL} />
                        <AvatarFallback className="text-2xl font-bold text-primary bg-white">
                            {getInitials(patient.displayName)}
                        </AvatarFallback>
                    </Avatar>

                    <h1 className="text-2xl font-bold mb-1 font-serif">{patient.displayName || t("therapist_patient_profile.unknown_user", "Unknown User")}</h1>
                    <div className="flex items-center text-white/80 text-sm mb-4">
                        <span>{patient.address?.city || t("therapist_patient_profile.unknown_city", "City")}, {patient.address?.country || t("therapist_patient_profile.unknown_country", "Country")}</span>
                        <span className="mx-2">{"\u2022"}</span>
                        <span className="opacity-70">
                            {t("therapist_patient_profile.id_label", "ID")}: {patient.id.substring(0, 8)}
                        </span>
                    </div>

                    {upcomingAppointment && (
                        <Button
                            variant="secondary"
                            className="bg-white text-primary hover:bg-gray-100 rounded-full px-6 font-medium"
                            onClick={handleFetchAvailableSlots}
                        >
                            <Calendar className="mr-2 h-4 w-4" />
                            {t("therapist_patient_profile.reschedule_button", "Reschedule")}
                        </Button>
                    )}
                </div>
            </div>

            <div className="px-4 -mt-10 max-w-5xl mx-auto space-y-6 relative z-30">
                {/* Client Overview Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Card className="bg-white shadow-md border-none rounded-2xl">
                        <CardContent className="p-4 flex flex-col items-center justify-center text-center py-6">
                            <span className="text-3xl font-bold text-gray-800 mb-1">{totalSessions}</span>
                            <span className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                                {t("therapist_patient_profile.total_sessions_title", "Total Sessions")}
                            </span>
                        </CardContent>
                    </Card>
                    <Card className="bg-white shadow-md border-none rounded-2xl">
                        <CardContent className="p-4 flex flex-col items-center justify-center text-center py-6">
                            <span className="text-lg font-bold text-gray-800 mb-1">{nextSessionDate}</span>
                            <span className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                                {t("therapist_patient_profile.next_session_title", "Next Session")}
                            </span>
                        </CardContent>
                    </Card>
                    <Card className="bg-white shadow-md border-none rounded-2xl">
                        <CardContent className="p-4 flex flex-col items-center justify-center text-center py-6">
                            <span className="text-lg font-bold text-secondary mb-1">
                                {t("therapist_patient_profile.status_stable", "Stable")}
                            </span>
                            <span className="text-xs text-gray-500 uppercase tracking-wide font-medium">
                                {t("therapist_patient_profile.current_status_title", "Current Status")}
                            </span>
                        </CardContent>
                    </Card>
                </div>

                {/* Tabs Section */}
                <Tabs defaultValue="information" className="w-full">
                    <TabsList className="w-full grid grid-cols-2 h-14 bg-white rounded-xl p-1 shadow-sm mb-6">
                        <TabsTrigger value="information" className="rounded-lg h-full data-[state=active]:bg-teal-light data-[state=active]:text-secondary font-medium">
                            {t("therapist_patient_profile.tab_information", "Information")}
                        </TabsTrigger>
                        <TabsTrigger value="session" className="rounded-lg h-full data-[state=active]:bg-teal-light data-[state=active]:text-secondary font-medium">
                            {t("therapist_patient_profile.tab_session", "Session")}
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="information" className="space-y-6">
                        {/* General Information */}
                        <Card className="border-none shadow-sm rounded-xl">
                            <CardHeader>
                                <CardTitle className="text-lg font-semibold text-gray-800 font-serif">
                                    {t("therapist_patient_profile.general_info_title", "General Information")}
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <InfoRow label={t("therapist_patient_profile.info_age_label", "Age")} value={age.toString()} />
                                <InfoRow label={t("therapist_patient_profile.info_gender_label", "Gender")} value={gender} />
                                <InfoRow label={t("therapist_patient_profile.info_relationship_label", "Relationship Status")} value={relationshipStatus} />
                                <InfoRow label={t("therapist_patient_profile.info_medication_label", "Medication")} value={medication} />
                                <InfoRow label={t("therapist_patient_profile.info_chronic_pain_label", "Chronic Pain")} value={patient.patientDetails?.chronicPain ? t("common.yes", "Yes") : t("common.no", "No")} />
                            </CardContent>
                        </Card>

                        {/* PHQ-9 Score Report */}
                        <Card className="border-none shadow-sm overflow-hidden rounded-xl">
                            <div className="h-2 bg-secondary" />
                            <CardContent className="p-6">
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <h3 className="font-semibold text-lg text-gray-900 mb-1 font-serif">
                                            {t("therapist_patient_profile.phq_report_title", "PHQ-9 Score Report")}
                                        </h3>
                                        {phqResult ? (
                                            <>
                                                <div className="text-secondary font-medium mb-1">
                                                    {t("therapist_patient_profile.phq_score_summary", {
                                                        score: phqResult.score,
                                                        severity: getSeverity(phqResult.score),
                                                        defaultValue: "Score: {{score}} - {{severity}}"
                                                    })}
                                                </div>
                                                <div className="text-sm text-gray-500">
                                                    {t("therapist_patient_profile.last_taken", {
                                                        time: getTimeAgo(phqResult.timestamp.toDate()),
                                                        defaultValue: "Last taken {{time}}"
                                                    })}
                                                </div>
                                            </>
                                        ) : (
                                            <div className="text-gray-500 italic">
                                                {t("therapist_patient_profile.no_assessment_history", "No assessment history")}
                                            </div>
                                        )}
                                    </div>
                                    <Activity className="text-secondary w-6 h-6" />
                                </div>
                                <Button
                                    variant="outline"
                                    className="w-full border-secondary text-secondary hover:bg-teal-light hover:text-secondary hover:border-secondary"
                                    onClick={viewFullPHQReport}
                                >
                                    {t("therapist_patient_profile.view_full_report_button", "View Full Report")}
                                </Button>
                            </CardContent>
                        </Card>

                        {/* Self-Care Evaluation */}
                        <Card className="border-none shadow-sm overflow-hidden rounded-xl">
                            <div className="h-2 bg-secondary" />
                            <CardContent className="p-6">
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <h3 className="font-semibold text-lg text-gray-900 mb-1 font-serif">
                                            {t("therapist_patient_profile.self_care_title", "Self-Care Evaluation")}
                                        </h3>
                                        {patient.patientDetails?.selfCareAssessment ? (
                                            <div className="text-sm text-gray-500">
                                                {t("therapist_patient_profile.last_assessment", {
                                                    time: getTimeAgo(patient.patientDetails.selfCareAssessment.timestamp.toDate()),
                                                    defaultValue: "Last assessment {{time}}"
                                                })}
                                            </div>
                                        ) : (
                                            <div className="text-gray-500 italic">
                                                {t("therapist_patient_profile.no_assessment_history", "No assessment history")}
                                            </div>
                                        )}
                                    </div>
                                    <CheckCircle2 className="text-secondary w-6 h-6" />
                                </div>
                                <Button
                                    variant="outline"
                                    className="w-full border-secondary text-secondary hover:bg-teal-light hover:text-secondary hover:border-secondary"
                                    onClick={viewFullSelfCareReport}
                                >
                                    {t("therapist_patient_profile.view_full_report_button", "View Full Report")}
                                </Button>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    <TabsContent value="session" className="space-y-6">
                        <Card className="border-none shadow-sm rounded-xl">
                            <CardHeader>
                                <CardTitle className="font-serif">{t("therapist_patient_profile.therapy_details_card_title", "Therapy Details")}</CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                <InfoRow label={t("therapist_patient_profile.therapy_details_starting_date_label", "Starting Date")}
                                    value={appointments.length > 0 ? new Date(Math.min(...appointments.map(a => a.startTimestamp.toMillis()))).toLocaleDateString(locale) : notAvailable}
                                />
                                <InfoRow label={t("therapist_patient_profile.therapy_details_num_sessions_label", "Number of Sessions")} value={totalSessions.toString()} />
                                <InfoRow label={t("therapist_patient_profile.therapy_details_session_duration_label", "Session Duration")} value={t("therapist_patient_profile.minutes_50", "50 Minutes")} />
                                <InfoRow label={t("therapist_patient_profile.therapy_details_next_session_label", "Next Session")} value={nextSessionDate} />
                                <InfoRow label={t("therapist_patient_profile.therapy_details_subscription_type_label", "Subscription Type")} value={planName ?? t("common.loading", "Loading...")} />
                            </CardContent>
                        </Card>
                    </TabsContent>
                </Tabs>
            </div>

            {/* Dialogs */}

            {/* Add Note Dialog */}
            <Dialog open={showAddNote} onOpenChange={setShowAddNote}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t("therapist_patient_profile.add_note_dialog_title", "Add Session Note")}</DialogTitle>
                    </DialogHeader>
                    <Textarea
                        placeholder={t("therapist_patient_profile.add_note_dialog_placeholder", "Enter note...")}
                        value={noteText}
                        onChange={(e) => setNoteText(e.target.value)}
                        className="min-h-[100px]"
                    />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowAddNote(false)}>
                            {t("therapist_patient_profile.add_note_dialog_cancel_button", "Cancel")}
                        </Button>
                        <Button onClick={handleAddNote}>
                            {t("therapist_patient_profile.add_note_dialog_save_button", "Save Note")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Cancel Appointment Dialog */}
            <AlertDialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t("therapist_patient_profile.cancel_dialog_title", "Cancel Appointment")}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t("therapist_patient_profile.cancel_dialog_message", "Are you sure you want to cancel this appointment?")}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t("therapist_patient_profile.cancel_dialog_keep_button", "No, Keep")}</AlertDialogCancel>
                        <AlertDialogAction onClick={handleCancelAppointment} className="bg-red-600 hover:bg-red-700">
                            {t("therapist_patient_profile.cancel_dialog_cancel_button", "Yes, Cancel")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Terminate Dialog */}
            <AlertDialog open={showTerminateDialog} onOpenChange={setShowTerminateDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t("therapist_patient_profile.terminate_dialog_title", "Terminate Contract")}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t("therapist_patient_profile.terminate_dialog_message", "Are you sure? This cannot be undone.")}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t("therapist_patient_profile.terminate_dialog_cancel_button", "Cancel")}</AlertDialogCancel>
                        <AlertDialogAction onClick={handleTerminate} className="bg-red-600 hover:bg-red-700">
                            {t("therapist_patient_profile.terminate_dialog_terminate_button", "Terminate")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Report Dialog */}
            <Dialog open={showReportDialog} onOpenChange={setShowReportDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t("therapist_patient_profile.report_user", "Report User")}</DialogTitle>
                    </DialogHeader>
                    <Textarea
                        placeholder={t("therapist_patient_profile.report_reason_placeholder", "Reason for reporting...")}
                        value={reportReason}
                        onChange={(e) => setReportReason(e.target.value)}
                        className="min-h-[100px]"
                    />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowReportDialog(false)}>{t("therapist_patient_profile.report_dialog_cancel", "Cancel")}</Button>
                        <Button variant="destructive" onClick={handleReport}>{t("therapist_patient_profile.report_dialog_submit", "Submit Report")}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Reschedule Dialog */}
            <Dialog open={showRescheduleDialog} onOpenChange={setShowRescheduleDialog}>
                <DialogContent className="max-w-xl">
                    <DialogHeader>
                        <DialogTitle>{t("therapist_patient_profile.reschedule_dialog_title", "Reschedule Appointment")}</DialogTitle>
                        <DialogDescription>
                            {t("therapist_patient_profile.reschedule_dialog_desc", "Select a new slot for the upcoming appointment.")}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        {availableSlots.length > 0 ? (
                            <ScrollArea className="h-[300px] w-full pr-4">
                                <div className="grid grid-cols-2 gap-3">
                                    {availableSlots.map(slot => (
                                        <Button
                                            key={slot.id}
                                            variant={selectedSlot?.id === slot.id ? "default" : "outline"}
                                            onClick={() => setSelectedSlot(slot)}
                                            className={`h-auto flex flex-col py-3 items-center justify-center space-y-1 ${selectedSlot?.id === slot.id ? 'bg-secondary text-secondary-foreground' : ''}`}
                                        >
                                            <span className="font-semibold text-sm">
                                                {slot.startTimestamp.toDate().toLocaleDateString(locale, { month: 'short', day: 'numeric', weekday: 'short' })}
                                            </span>
                                            <span className="text-xs">
                                                {slot.startTimestamp.toDate().toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' })}
                                            </span>
                                        </Button>
                                    ))}
                                </div>
                            </ScrollArea>
                        ) : (
                            <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
                                {t("therapist_patient_profile.no_slots_available", "No available slots found for the next 30 days.")}
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowRescheduleDialog(false)}>
                            {t("therapist_patient_profile.reschedule_dialog_cancel", "Cancel")}
                        </Button>
                        <Button
                            onClick={handleReschedule}
                            disabled={!selectedSlot}
                            className="bg-secondary hover:bg-secondary/90 text-secondary-foreground"
                        >
                            {t("therapist_patient_profile.reschedule_dialog_confirm", "Confirm Reschedule")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div >
    );
};

const InfoRow = ({ label, value }: { label: string, value: string }) => (
    <div className="flex justify-between items-center py-3 border-b border-gray-100 last:border-0 hover:bg-gray-50/50 px-2 rounded-lg transition-colors">
        <span className="text-gray-500 text-sm font-medium">{label}</span>
        <span className="font-semibold text-gray-800 text-sm truncate max-w-[60%]">{value}</span>
    </div>
);



export default TherapistPatientProfile;
