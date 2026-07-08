import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { THERAPIST_SPECIALIZATION_DEFAULT_EN_LABEL, normalizeTherapistSpecializationKeys } from "@/lib/therapistSpecializations";
import { useNavigate } from "react-router-dom";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, collection, query, where, orderBy, limit, getDocs } from "firebase/firestore";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
    Star,
    ArrowRight,
    Calendar as CalendarIcon,
    Clock,
    Phone,
    ChevronRight,
    Lightbulb,
    Bell,
    MessageCircle
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/use-toast";
import { formatLocalizedDate, formatLocalizedTime } from "@/lib/date-utils";

// Colors from PsyCMp Theme
const COLORS = {
    primary: "#92C7CF",
    secondary: "#508C96",
    background: "#FBF9F1",
    cardLight: "#FCF9F2", // cardBackgroundLight
    cardMedium: "#AAD7D9", // cardBackgroundMedium
    textPrimary: "#1F2937",
    topSectionBg: "rgba(170, 215, 217, 0.4)" // 0x66AAD7D9 (approx 40% opacity)
};

const Dashboard = () => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const { toast } = useToast();
    const [user, setUser] = useState<any>(null);
    const [therapist, setTherapist] = useState<any>(null);
    const [upcomingAppointment, setUpcomingAppointment] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [ratingData, setRatingData] = useState<{ average: number, count: number }>({ average: 0, count: 0 });
    const [todayAffirmation, setTodayAffirmation] = useState<{ text: string; text_de?: string; text_el?: string; text_hr?: string; } | null>(null);
    const [showPhq, setShowPhq] = useState(true);
    const [showSelfCare, setShowSelfCare] = useState(true);
    const [canJoin, setCanJoin] = useState(false);

    useEffect(() => {
        if (!upcomingAppointment) return;

        const checkTime = () => {
            const now = new Date();
            const startTime = upcomingAppointment.startTimestamp?.toDate();
            if (startTime) {
                const diffMs = startTime.getTime() - now.getTime();
                const diffMins = diffMs / (1000 * 60);
                // Can join 15 mins before or any time after (in case it started)
                setCanJoin(diffMins <= 15);
            }
        };

        checkTime();
        const interval = setInterval(checkTime, 30000); // Check every 30s
        return () => clearInterval(interval);
    }, [upcomingAppointment]);

    useEffect(() => {
        const fetchUserData = async () => {
            if (auth.currentUser) {
                const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    setUser(userData);

                    // Onboarding Guard
                    if (userData.role === "PATIENT") {
                        // Check if onboarding is completed either via flag or data presence
                        // Check both root and nested locations for compatibility
                        const qAnswers = userData.questionnaireAnswers || userData.patientDetails?.questionnaireAnswers;
                        const hasOnboardingData = qAnswers && Object.keys(qAnswers).length > 0;

                        console.log("Dashboard Onboarding Check:", {
                            onboardingCompleted: userData.onboardingCompleted,
                            hasQAnswers: !!qAnswers,
                            keys: qAnswers ? Object.keys(qAnswers) : []
                        });

                        if (!userData.onboardingCompleted && !hasOnboardingData) {
                            console.log("Redirecting to Get-To-Know");
                            navigate("/get-to-know");
                            return;
                        }

                        // Check subscription (handle both root level and nested quotas)
                        const quotas = userData.patientDetails?.quotas || userData.quotas;
                        const hasActiveSubscription = quotas?.isActive === true;
                        const subscriptionStatus = quotas?.subscriptionStatus;
                        const hasActiveStatus = subscriptionStatus === 'ACTIVE' || subscriptionStatus === 'RETURNED' || subscriptionStatus === 'TRIAL';
                        const hasRemainingSessions = (quotas?.currentUsage?.remainingLiveSessions || 0) > 0;

                        // Grace period: if payment was made recently (within 5 min), don't redirect
                        // This prevents a race condition where Stripe webhook hasn't processed yet
                        let recentlyPaid = false;
                        const lastPayment = quotas?.lastPaymentDate;
                        if (lastPayment) {
                            const paymentTime = typeof lastPayment?.toDate === 'function'
                                ? lastPayment.toDate().getTime()
                                : typeof lastPayment === 'string'
                                    ? new Date(lastPayment).getTime()
                                    : typeof lastPayment?.seconds === 'number'
                                        ? lastPayment.seconds * 1000
                                        : 0;
                            if (paymentTime > 0) {
                                const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
                                recentlyPaid = paymentTime > fiveMinutesAgo;
                            }
                        }

                        console.log("Dashboard Subscription Check:", {
                            isActive: hasActiveSubscription,
                            subscriptionStatus,
                            hasActiveStatus,
                            remainingSessions: quotas?.currentUsage?.remainingLiveSessions,
                            hasRemaining: hasRemainingSessions,
                            recentlyPaid
                        });

                        if (!hasActiveSubscription && !hasActiveStatus && !hasRemainingSessions && !recentlyPaid) {
                            console.log("Redirecting to Payment - No active subscription or remaining sessions");
                            navigate("/payment");
                            return;
                        }

                        const assignedTherapistId = userData.patientDetails?.assignedTherapist;
                        if (!assignedTherapistId) {
                            navigate("/matching");
                            return;
                        }

                        const therapistDoc = await getDoc(doc(db, "users", assignedTherapistId));
                        if (therapistDoc.exists()) {
                            setTherapist(therapistDoc.data());

                            // Fetch Ratings
                            try {
                                const ratingsQuery = query(
                                    collection(db, "therapist_ratings"),
                                    where("therapistId", "==", assignedTherapistId)
                                );
                                const ratingsSnapshot = await getDocs(ratingsQuery);
                                if (!ratingsSnapshot.empty) {
                                    const ratings = ratingsSnapshot.docs.map(d => d.data());
                                    const total = ratings.reduce((acc: number, curr: any) => acc + (curr.rating || 0), 0);
                                    setRatingData({
                                        average: Number((total / ratings.length).toFixed(1)),
                                        count: ratings.length
                                    });
                                }
                            } catch (e) {
                                console.error("Error fetching ratings:", e);
                            }
                        }

                        // Fetch upcoming appointment
                        const appointmentsQuery = query(
                            collection(db, "appointments"),
                            where("bookedBy", "==", auth.currentUser.uid),
                            where("status", "in", ["BOOKED", "booked", "upcoming", "IN_PROGRESS", "in_progress", "rescheduled", "RESCHEDULED"]),
                            orderBy("startTimestamp", "asc"),
                            limit(10)
                        );
                        const appointmentsSnapshot = await getDocs(appointmentsQuery);

                        let foundUpcoming = null;
                        const now = new Date();

                        for (const docSnapshot of appointmentsSnapshot.docs) {
                            const data = docSnapshot.data();
                            const endTime = data.endTimestamp?.toDate() ||
                                (data.startTimestamp ? new Date(data.startTimestamp.toDate().getTime() + 60 * 60 * 1000) : null);

                            // If appointment is still active (end time is in future), show it
                            if (endTime && endTime > now) {
                                foundUpcoming = { ...data, id: docSnapshot.id };
                                break;
                            }
                        }

                        // Also check if we found one via the loop. If the query returned items but loop skipped (all ended?), 
                        // we might miss upcoming ones that haven't started.
                        // If we didn't find an active one, pick the first upcoming one that hasn't started yet.
                        // The loop above already checks (endTime > now), so if foundUpcoming is null, 
                        // it means none of the top 10 appointments are currently active or in the future.

                        setUpcomingAppointment(foundUpcoming);

                        // Fetch Today's Affirmation
                        try {
                            const now = new Date();
                            const day = String(now.getDate()).padStart(2, "0");
                            const month = String(now.getMonth() + 1).padStart(2, "0");
                            const year = now.getFullYear();
                            // Stored in Firestore as yyyy-MM-dd (see src/types/affirmation.ts + admin affirmations UI)
                            const todayString = `${year}-${month}-${day}`;

                            const affirmationQuery = query(
                                collection(db, "affirmations"),
                                where("date", "==", todayString),
                                where("isActive", "==", true),
                                limit(1)
                            );
                            const affirmationSnapshot = await getDocs(affirmationQuery);
                            if (!affirmationSnapshot.empty) {
                                setTodayAffirmation(affirmationSnapshot.docs[0].data() as { text: string; text_de?: string; text_el?: string; text_hr?: string; });
                            }
                        } catch (e) {
                            console.error("Error fetching affirmation:", e);
                        }

                        // Fetch PHQ Status
                        try {
                            const phqQuery = query(
                                collection(db, "phq"),
                                where("userId", "==", userDoc.id),
                                limit(1)
                            );
                            const phqSnapshot = await getDocs(phqQuery);
                            if (!phqSnapshot.empty) {
                                setShowPhq(false);
                            }
                        } catch (e) {
                            console.error("Error fetching PHQ status:", e);
                        }
                        // Check Self Care Status
                        const selfCareTimestamp = userData.patientDetails?.selfCareAssessment?.timestamp;
                        if (selfCareTimestamp) {
                            const lastTaken = selfCareTimestamp.toDate ? selfCareTimestamp.toDate() : new Date(selfCareTimestamp.seconds * 1000);
                            const now = new Date();
                            const diffTime = Math.abs(now.getTime() - lastTaken.getTime());
                            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                            if (diffDays <= 30) {
                                setShowSelfCare(false);
                            }
                        }
                    }
                }
                setLoading(false);
            }
        };

        fetchUserData();
    }, [navigate]);

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-white">
                <div className="animate-spin h-8 w-8 border-4 border-[#92C7CF] rounded-full border-t-transparent"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-white font-['Inter'] relative">

            {/* --- Top Gradient Section --- */}
            <div
                className="w-full rounded-b-[24px] px-6 pt-8 pb-[90px] relative"
                style={{ backgroundColor: COLORS.topSectionBg }}
            >
                {/* Header */}
                <div className="flex justify-between items-start">
                    <div>
                        <p className="text-sm font-normal mb-1" style={{ color: COLORS.secondary }}>
                            {t('patient.dashboard.matched_therapist', 'Matched Therapist')}
                        </p>
                        <h1 className="text-2xl font-bold mb-1" style={{ color: COLORS.secondary }}>
                            {therapist?.displayName?.replace(/^Dr\.?\s+/i, '') || t('patient.dashboard.therapist_fallback')}
                        </h1>
                        <div className="flex flex-wrap gap-1 mt-2 max-w-[80%]">
                            {(() => {
                                const details = therapist?.therapistDetails;
                                const rawSpecs = details?.specializations ||
                                    (Array.isArray(details?.specialization) ? details?.specialization : []) ||
                                    (details?.specialization ? [details.specialization] : []);
                                const specs = normalizeTherapistSpecializationKeys(rawSpecs);

                                if (specs.length === 0) return (
                                    <p className="text-sm font-normal" style={{ color: COLORS.secondary }}>
                                        {t('patient.dashboard.specialization_fallback')}
                                    </p>
                                );

                                return specs.map((spec, index) => (
                                    <Badge
                                        key={index}
                                        variant="outline"
                                        className="text-[10px] py-0 px-2 font-normal"
                                        style={{
                                            color: COLORS.secondary,
                                            borderColor: `${COLORS.secondary}40`,
                                            backgroundColor: "white"
                                        }}
                                    >
                                        {t(`therapist.specializations.${spec}`, THERAPIST_SPECIALIZATION_DEFAULT_EN_LABEL[spec])}
                                    </Badge>
                                ));
                            })()}
                        </div>
                    </div>


                </div>

                {/* Rating */}
                {ratingData.count > 0 && (
                    <div className="flex items-center mt-4">
                        <span className="text-base font-semibold" style={{ color: COLORS.secondary }}>{ratingData.average}</span>
                        <Star className="w-4 h-4 ml-1 fill-[#FFCE31] text-[#FFCE31]" />
                        <span className="text-sm ml-1" style={{ color: COLORS.secondary }}>({ratingData.count})</span>
                    </div>
                )}

                {/* View Profile Button */}
                <div className="mt-8">
                    <button
                        onClick={() => navigate('/therapist-profile')}
                        className="flex items-center bg-white rounded-full pl-1.5 pr-2 py-1.5 border"
                        style={{ borderColor: COLORS.primary }}
                    >
                        <span className="mx-3 text-base font-medium" style={{ color: COLORS.primary }}>
                            {t('patient.dashboard.view_profile', 'View Profile')}
                        </span>
                        <div className="w-6 h-6 rounded-full flex items-center justify-center" style={{ backgroundColor: COLORS.primary }}>
                            <ChevronRight className="w-3 h-3 text-white" />
                        </div>
                    </button>
                </div>
            </div>

            {/* --- Profile Image (Overlapping) --- */}
            <div className="absolute top-[100px] right-6">
                <div className="w-32 h-32 rounded-full border-4 border-white shadow-sm overflow-hidden bg-white">
                    <Avatar className="w-full h-full">
                        <AvatarImage src={therapist?.profilePicture} className="object-cover" />
                        <AvatarFallback className="text-4xl text-gray-400 bg-gray-100">
                            {therapist?.displayName?.charAt(0)}
                        </AvatarFallback>
                    </Avatar>
                </div>
            </div>

            {/* --- Bottom Content --- */}
            <div className="px-6 pb-24 -mt-4">
                {/* Greeting */}
                <div className="mb-6 mt-8">
                    <h2 className="text-xl font-semibold" style={{ color: COLORS.primary }}>
                        {t('patient.dashboard.hi', { name: user?.displayName || t('patient.dashboard.patient_fallback') })}
                    </h2>
                    <p className="text-base" style={{ color: COLORS.primary }}>
                        {t('patient.dashboard.greeting')}
                    </p>
                </div>

                {/* Upcoming Appointment Joining Component */}
                {upcomingAppointment && (
                    <div className="mb-8 mt-6">
                        <Card 
                            className="p-6 border-none shadow-lg rounded-[28px] relative overflow-hidden"
                            style={{ backgroundColor: COLORS.cardMedium }}
                        >
                            <div className="flex justify-between items-start mb-6">
                                <div className="flex items-center gap-3">
                                    <div className="w-11 h-11 rounded-full bg-white/20 flex items-center justify-center">
                                        <CalendarIcon className="w-5 h-5 text-white" />
                                    </div>
                                    <h3 className="font-bold text-lg text-white">
                                        {t('patient.dashboard.upcoming_appointment', 'Upcoming Appointment')}
                                    </h3>
                                </div>
                                <div className="flex flex-col items-end gap-2">
                                    <Bell className="w-6 h-6 text-white opacity-80" />
                                    <Badge variant="secondary" className="bg-white/20 text-white hover:bg-white/30 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border-none">
                                        {t(`patient.dashboard.type_${upcomingAppointment.appointmentType || 'video'}`, (upcomingAppointment.appointmentType || 'Video').charAt(0).toUpperCase() + (upcomingAppointment.appointmentType || 'Video').slice(1))}
                                    </Badge>
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-6 mb-8 px-2">
                                <div className="flex flex-col text-white">
                                    <p className="text-xl font-bold">
                                        {formatLocalizedDate(upcomingAppointment.startTimestamp?.toDate(), 'PPPP', i18n.language)}
                                    </p>
                                    <div className="flex items-center gap-2 opacity-90 mt-1 font-medium">
                                        <Clock className="w-4 h-4" />
                                        <span>
                                            {formatLocalizedTime(upcomingAppointment.startTimestamp?.toDate(), i18n.language)}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <Button 
                                    variant="outline" 
                                    onClick={() => navigate('/calendar')}
                                    className="flex-1 rounded-full border-white/30 text-white bg-white/10 hover:bg-white/20 h-11 font-semibold"
                                >
                                    {t('patient.dashboard.view_details', 'View Details')}
                                </Button>
                                <Button 
                                    onClick={() => {
                                        if (upcomingAppointment.appointmentType === 'chat') {
                                            navigate(`/consultation/${upcomingAppointment.id}`);
                                        } else {
                                            navigate(`/call/${upcomingAppointment.id}`);
                                        }
                                    }}
                                    disabled={!canJoin && upcomingAppointment.appointmentType !== 'chat'}
                                    className={`flex-1 rounded-full h-11 font-bold transition-all shadow-md ${
                                        canJoin || upcomingAppointment.appointmentType === 'chat'
                                        ? 'bg-white text-[#508C96] hover:bg-gray-50' 
                                        : 'bg-white/20 text-white/50 cursor-not-allowed border-none'
                                    }`}
                                >
                                    {upcomingAppointment.appointmentType === 'chat' ? (
                                        <>
                                            <MessageCircle className="w-5 h-5 mr-2" />
                                            {t('patient.dashboard.join_button', 'Open Chat')}
                                        </>
                                    ) : (
                                        <>
                                            <Phone className="w-5 h-5 mr-2" />
                                            {t('patient.dashboard.join_button', 'Join Session')}
                                        </>
                                    )}
                                </Button>
                            </div>
                            
                            {!canJoin && upcomingAppointment.appointmentType !== 'chat' && (
                                <div className="mt-4 flex items-center justify-center gap-2 text-white/70">
                                    <Clock className="w-3 h-3" />
                                    <p className="text-[11px] font-medium italic">
                                        {t('patient.dashboard.join_call_error_time', 'You can join 15 minutes before the session starts.')}
                                    </p>
                                </div>
                            )}
                        </Card>
                    </div>
                )}

                {/* Action Cards (Mood & Journal) */}
                <div className="flex gap-4 mb-4">
                    <Card
                        className="flex-1 p-5 border-none shadow-sm rounded-[32px] cursor-pointer relative min-h-[170px]"
                        style={{ backgroundColor: COLORS.cardLight }}
                        onClick={() => navigate('/mood-tracker')}
                    >
                        <div className="flex flex-col h-full">
                            <h3 className="font-bold text-lg leading-tight mb-2 pr-10" style={{ color: "#3A8F9B" }}>
                                {t('patient.dashboard.mood_check_in', 'Daily Mood Check-in')}
                            </h3>
                            <p className="text-sm" style={{ color: `${COLORS.primary}CC` }}>
                                {t('patient.dashboard.check_in_daily', 'Log how you feel today using the given emojies.')}
                            </p>
                        </div>
                        {/* White circle arrow */}
                        <div className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center">
                            <ArrowRight className="w-5 h-5" style={{ color: COLORS.primary }} />
                        </div>
                    </Card>

                    <Card
                        className="flex-1 p-5 border-none shadow-sm rounded-[32px] cursor-pointer relative min-h-[170px]"
                        style={{ backgroundColor: COLORS.cardLight }}
                        onClick={() => navigate('/journal')}
                    >
                        <div className="flex flex-col h-full">
                            <h3 className="font-bold text-lg leading-tight mb-2 pr-10" style={{ color: "#3A8F9B" }}>
                                {t('patient.dashboard.daily_journaling', 'Daily Journaling Practice')}
                            </h3>
                            <p className="text-sm" style={{ color: `${COLORS.primary}CC` }}>
                                {t('patient.dashboard.write_thoughts', 'Everyday journaling. Small habit, deep impact.')}
                            </p>
                        </div>
                        {/* White circle arrow */}
                        <div className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center">
                            <ArrowRight className="w-5 h-5" style={{ color: COLORS.primary }} />
                        </div>
                    </Card>
                </div>

                {showSelfCare && (
                    <Card
                        className="mb-4 border-none shadow-md rounded-[16px]"
                        style={{ backgroundColor: COLORS.cardMedium }}
                    >
                        <div className="p-5">
                            <h3 className="font-semibold text-base text-white mb-2">{t('patient.dashboard.self_care_eval', 'Self-Care Evaluation')}</h3>
                            <p className="text-sm text-white mb-3 leading-snug">
                                {t('patient.dashboard.self_care_desc', 'Take a moment to assess your self-care routine.')}
                            </p>
                            <Button
                                className="bg-white hover:bg-gray-50 border border-[#AAD7D9] rounded-full h-auto py-2 px-4 shadow-sm"
                                onClick={() => navigate('/self-care')}
                            >
                                <span className="text-sm font-semibold" style={{ color: COLORS.cardMedium }}>
                                    {t('patient.dashboard.start_questionnaire', 'Start Questionnaire')}
                                </span>
                            </Button>
                        </div>
                    </Card>
                )}

                {showPhq && (
                    <Card
                        className="mb-4 border-none shadow-none rounded-[16px]"
                        style={{ backgroundColor: COLORS.cardLight }}
                    >
                        <div className="p-5">
                            <h3 className="font-semibold text-base mb-2" style={{ color: "#3A8F9B" }}>{t('patient.dashboard.phq_test', 'PHQ-9 Test')}</h3>
                            <p className="text-sm mb-3 leading-snug" style={{ color: "#59A2AC" }}>
                                {t('patient.dashboard.phq_desc', 'Measure your depression severity.')}
                            </p>
                            <Button
                                className="bg-[#AAD7D9] hover:bg-[#8ecbd0] rounded-full h-auto py-2 px-4 shadow-md"
                                onClick={() => navigate('/phq-test')}
                            >
                                <span className="text-sm font-semibold text-white">
                                    {t('patient.dashboard.start_test', 'Start Test')}
                                </span>
                            </Button>
                        </div>
                    </Card>
                )}

                {/* Today's Tip */}
                {todayAffirmation && (
                    <Card
                        className="border-none shadow-md rounded-[16px]"
                        style={{ backgroundColor: COLORS.cardMedium }}
                    >
                        <div className="p-5">
                            <div className="flex justify-between items-start mb-2">
                                <h3 className="font-semibold text-base text-white">{t('patient.dashboard.todays_tip', "Today's Tip")}</h3>
                                <Lightbulb className="w-8 h-8 text-white" />
                            </div>
                            <p className="text-sm text-white leading-relaxed">
                                {(() => {
                                    const lang = i18n.resolvedLanguage || i18n.language || "en";
                                    if (lang.startsWith('de')) return todayAffirmation.text_de || todayAffirmation.text;
                                    if (lang.startsWith('el')) return todayAffirmation.text_el || todayAffirmation.text;
                                    if (lang.startsWith('hr')) return todayAffirmation.text_hr || todayAffirmation.text;
                                    return todayAffirmation.text;
                                })()}
                            </p>
                        </div>
                    </Card>
                )}

            </div>
        </div>
    );
};

export default Dashboard;
