import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { THERAPIST_SPECIALIZATION_DEFAULT_EN_LABEL, normalizeTherapistSpecializationKeys } from "@/lib/therapistSpecializations";
import { useNavigate } from "react-router-dom";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, collection, query, where, getDocs, orderBy, updateDoc, Timestamp, setDoc, limit, getCountFromServer } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Star, Calendar, Clock, Video, Phone, MoreVertical, MessageCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Slider } from "@/components/ui/slider";
import { functions, remoteConfig } from "@/lib/firebase";
import { httpsCallable } from "firebase/functions";
import { fetchAndActivate, getValue } from "firebase/remote-config";
import { isDevelLocalhost } from "@/lib/firebase-local-target";

interface Therapist {
    uid: string;
    displayName: string;
    profilePicture?: string; // Changed to match PsyCMp
    photoURL?: string; // Keep for fallback
    specialization?: string;
    bio?: string;
    rating?: number;
    reviewCount?: number;
    therapistDetails?: {
        profileSummary?: string;
        specialization?: string;
        specializations?: string[]; // Added list support
    }
}

interface AppointmentSlot {
    id: string;
    therapistId: string;
    startTimestamp: Timestamp;
    endTimestamp: Timestamp;
    isBooked: boolean;
    bookedBy?: string;
    appointmentType?: 'call' | 'chat' | 'video';
    status?: string;
    hmsRoomId?: string;
}

const TherapistDetails = () => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const [therapist, setTherapist] = useState<Therapist | null>(null);
    const [slots, setSlots] = useState<AppointmentSlot[]>([]);
    const [loading, setLoading] = useState(true);
    const [clientCount, setClientCount] = useState(0);
    const [calculatedRating, setCalculatedRating] = useState<number | null>(null);
    const [calculatedReviewCount, setCalculatedReviewCount] = useState(0);

    const [userPlan, setUserPlan] = useState<string | null>(null);
    const [userQuotas, setUserQuotas] = useState<any>(null);
    const [planId, setPlanId] = useState<string | null>(null);

    // Booking State
    const [selectedDate, setSelectedDate] = useState<string | null>(null); // YYYY-MM-DD
    const [selectedSlot, setSelectedSlot] = useState<AppointmentSlot | null>(null);
    const [showBookingDialog, setShowBookingDialog] = useState(false);
    const [bookingType, setBookingType] = useState<'call' | 'chat' | 'video'>('call');
    const [isBooking, setIsBooking] = useState(false);

    const [showOneTimeDialog, setShowOneTimeDialog] = useState(false);
    const [isProcessingPayment, setIsProcessingPayment] = useState(false);

    // Active Appointment
    const [activeAppointment, setActiveAppointment] = useState<AppointmentSlot | null>(null);

    // New Features State
    const [showTerminateDialog, setShowTerminateDialog] = useState(false);
    const [showCancelDialog, setShowCancelDialog] = useState(false);
    const [showRatingDialog, setShowRatingDialog] = useState(false);
    const [ratingValues, setRatingValues] = useState({
        customerRecommendation: 3,
        diverseCommunication: 3,
        timelyResponse: 3,
        respectAndSupport: 3,
        empathy: 3,
        expertise: 3
    });

    useEffect(() => {
        const fetchData = async () => {
            if (!auth.currentUser) return;

            try {
                // 1. Get User's Matched Therapist ID
                const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
                const userData = userDoc.data();

                if (userData?.patientDetails?.quotas) {
                    setUserPlan(userData.patientDetails.quotas.planName);
                    setUserQuotas(userData.patientDetails.quotas);
                    setPlanId(userData.patientDetails.quotas.planId);
                }
                // Check both fields for compatibility, prioritizing assignedTherapist
                const therapistId = userData?.patientDetails?.assignedTherapist || userData?.patientDetails?.therapistId;

                let targetTherapistId = therapistId;
                if (!targetTherapistId) {
                    // Fallback for demo/development if no therapist assigned
                    const q = query(collection(db, "users"), where("role", "in", ["therapist", "THERAPIST"]), where("therapistDetails.profileStatus", "==", "APPROVED"), limit(1));
                    const querySnapshot = await getDocs(q);
                    if (!querySnapshot.empty) {
                        targetTherapistId = querySnapshot.docs[0].id;
                    }
                }

                if (targetTherapistId) {
                    // Fetch Therapist Profile
                    const therapistDoc = await getDoc(doc(db, "users", targetTherapistId));
                    if (therapistDoc.exists()) {
                        setTherapist({ uid: targetTherapistId, ...therapistDoc.data() } as Therapist);
                    }

                    // Fetch Appointments (Slots)
                    const now = Timestamp.now();
                    const availableStatus = ["AVAILABLE", "available"]; // Handle potential casing issues

                    const slotsQuery = query(
                        collection(db, "appointments"),
                        where("therapistId", "==", targetTherapistId),
                        where("startTimestamp", ">", now),
                        where("status", "in", availableStatus), // Only fetch free slots
                        orderBy("startTimestamp", "asc")
                    );
                    const slotsSnapshot = await getDocs(slotsQuery);

                    // Filter out any that might be booked but status query missed (safety check)
                    // and strictly ensure they are not booked
                    const fetchedSlots = slotsSnapshot.docs
                        .map(d => ({ id: d.id, ...d.data() } as AppointmentSlot))
                        .filter(s => !s.isBooked && !s.bookedBy);

                    setSlots(fetchedSlots);

                    // Check for active appointment for THIS user
                    const activeQuery = query(
                        collection(db, "appointments"),
                        where("bookedBy", "==", auth.currentUser.uid)
                    );
                    const activeSnapshot = await getDocs(activeQuery);
                    if (!activeSnapshot.empty) {
                        const now = new Date();
                        const activeStatuses = new Set(["BOOKED", "IN_PROGRESS", "booked", "in_progress", "upcoming", "RESCHEDULED", "rescheduled"]);
                        // Sort client-side by startTimestamp descending
                        const sortedDocs = [...activeSnapshot.docs]
                            .map(d => ({ id: d.id, ...d.data() } as AppointmentSlot))
                            .filter(data => activeStatuses.has(data.status || ""))
                            .sort((a, b) => {
                                const tA = a.startTimestamp?.toDate()?.getTime() || 0;
                                const tB = b.startTimestamp?.toDate()?.getTime() || 0;
                                return tB - tA; // desc
                            });

                        // Find the most relevant active/upcoming session
                        const found = sortedDocs.find(data => {
                            const status = data.status?.toUpperCase();
                            const startTime = data.startTimestamp?.toDate();
                            const endTime = data.endTimestamp?.toDate() || 
                                (startTime ? new Date(startTime.getTime() + 60 * 60 * 1000) : null);
                            
                            return status === 'IN_PROGRESS' || (startTime && startTime > now) || (endTime && endTime > now);
                        });
                        if (found) {
                            setActiveAppointment(found);
                        }
                    }

                    // Fetch Client Count
                    const clientQuery = query(collection(db, "users"), where("patientDetails.assignedTherapist", "==", targetTherapistId));
                    const clientCountSnap = await getCountFromServer(clientQuery);
                    setClientCount(clientCountSnap.data().count);

                    // Fetch Ratings
                    const ratingQuery = query(collection(db, "therapist_ratings"), where("therapistId", "==", targetTherapistId));
                    const ratingSnap = await getDocs(ratingQuery);
                    if (!ratingSnap.empty) {
                        const ratings = ratingSnap.docs.map(d => d.data());
                        const total = ratings.reduce((sum, r) => sum + (r.averageRating || 0), 0);
                        setCalculatedRating(total / ratings.length);
                        setCalculatedReviewCount(ratings.length);
                    }
                }
            } catch (error) {
                console.error("Error fetching therapist details:", error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    // Helper for consistent local date keys YYYY-MM-DD
    const formatDateKey = (date: Date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    // Derived State: Unique Dates from Slots
    const availableDates = Array.from(new Set(slots.filter(s => {
        if (s.isBooked) return false;
        const now = new Date();
        // Strict Future Check: Slot must be in the future (plus buffer)
        // If slot start time < now + 1 min, hide it.
        return s.startTimestamp.toDate().getTime() > (now.getTime() + 60 * 1000);
    }).map(s => {
        return formatDateKey(s.startTimestamp.toDate());
    }))).sort();

    // Reset selection if date changes or invalid
    useEffect(() => {
        if (availableDates.length > 0) {
            if (!selectedDate || !availableDates.includes(selectedDate)) {
                setSelectedDate(availableDates[0]);
            }
        } else {
            setSelectedDate(null);
        }
    }, [availableDates, selectedDate]);

    const slotsForDate = selectedDate ? slots.filter(s => {
        const slotDate = s.startTimestamp.toDate();
        const now = new Date();

        // 1. Must match selected date
        const matchesDate = !s.isBooked && formatDateKey(slotDate) === selectedDate;
        if (!matchesDate) return false;

        // 2. Must be future
        const isFuture = slotDate.getTime() > (now.getTime() + 60 * 1000);
        return isFuture;
    }) : [];

    const handleBookAppointment = async () => {
        if (!selectedSlot || !auth.currentUser) return;

        // Quota Check
        if (userQuotas && !userPlan?.toLowerCase().includes('basic')) {
            const remaining = userQuotas.currentUsage?.remainingLiveSessions || 0;
            if (remaining <= 0) {
                setShowOneTimeDialog(true);
                return;
            }
        }

        setIsBooking(true);
        try {
            // 1. Generate HMS Room First to ensure we have the ID
            let generatedRoomId = null;
            try {
                const generate100msToken = httpsCallable(functions, 'generate100msToken');
                // We use 'create' mode to ensure a room exists for this appointment
                const result = await generate100msToken({
                    mode: 'create',
                    appointmentId: selectedSlot.id,
                    userId: auth.currentUser.uid,
                    role: 'host'
                });

                // @ts-ignore
                if (result.data && result.data.roomId) {
                    // @ts-ignore
                    generatedRoomId = result.data.roomId;
                    console.log("Generated Room ID:", generatedRoomId);
                }
            } catch (cfError) {
                console.error("Cloud Function room creation failed:", cfError);
                // Continue booking even if room creation fails (can be retried later/on-join)
            }

            // 2. Prepare Data matching mobile app structure
            // Defaulting values to 0/null as per "mobile" example
            const appointmentData = {
                isBooked: true,
                bookedBy: auth.currentUser.uid,
                appointmentType: bookingType,
                status: 'BOOKED',
                updatedAt: Timestamp.now(),

                // Fields to sync with mobile structure
                baseAmount: 0,
                paymentStatus: 'UNPAID',
                paymentAmount: 0,
                penaltyAmount: 0,
                sessionDurationSeconds: 0,
                sessionMinutes: 0,

                // Missing fields requested by user
                isActive: true,
                recurrenceType: "Single",
                isTherapistLate: false,
                sessionSegments: [],
                sessionType: "",
                notes: "",

                // Nullable fields
                patientJoinedAt: null,
                patientWasLate: false,
                lateArrivalMinutes: 0,
                sessionEndedAt: null,
                therapistJoinTime: null,
                paidAt: null,
                paidBy: null,
                recurrenceEnd: null,

                // Room ID (if generated)
                ...(generatedRoomId && { hmsRoomId: generatedRoomId })
            };

            // 3. Update Firestore
            await updateDoc(doc(db, "appointments", selectedSlot.id), appointmentData);

            // 4. Deduct Quota
            if (userQuotas && !userPlan?.toLowerCase().includes('basic')) {
                const userRef = doc(db, "users", auth.currentUser.uid);
                const currentRemaining = userQuotas.currentUsage?.remainingLiveSessions || 0;
                if (currentRemaining > 0) {
                    await updateDoc(userRef, {
                        "patientDetails.quotas.currentUsage.remainingLiveSessions": currentRemaining - 1
                    });
                }
            }

            toast({ title: t('therapist.booking.success', 'Appointment booked successfully!') });
            setShowBookingDialog(false);

            // Refresh local state to show active appointment
            setActiveAppointment({
                ...selectedSlot,
                ...appointmentData,
                // Ensure active appointment has the fields needed for display
                hmsRoomId: generatedRoomId || selectedSlot.hmsRoomId
            } as AppointmentSlot);

            setSlots(prev => prev.map(s => s.id === selectedSlot.id ? { ...s, isBooked: true } : s));

        } catch (error) {
            console.error("Error booking:", error);
            toast({ title: t('therapist.booking.error', "Booking failed"), variant: "destructive" });
        } finally {
            setIsBooking(false);
        }
    };

    const handleBuyOneTimeSession = async () => {
        if (!auth.currentUser) return;
        setIsProcessingPayment(true);
        try {
            const isLocal = isDevelLocalhost();
            let priceId = isLocal ? 'price_1SvziRCIhcbX3ibwYRy690wu' : 'price_1St3aSCIhcbX3ibwNXoBqyMO'; // sandbox vs live fallback
            let planName = 'One-Time Session';
            let planId = 'one_time_session';
            let isTest = isLocal;

            // Fetch payment config from Remote Config (matching usePayment.ts)
            try {
                await fetchAndActivate(remoteConfig);
                const configKey = isLocal ? 'debug_payments' : 'payments';
                const configValue = getValue(remoteConfig, configKey);
                const configString = configValue.asString();
                if (configString) {
                    const config = JSON.parse(configString);
                    const oneTimePlan = config.therapy_session_plans_en?.find((p: any) => p.id === "one_time_session");
                    if (oneTimePlan) {
                        priceId = oneTimePlan.stripe_price_id;
                        planName = oneTimePlan.name;
                        planId = oneTimePlan.id;
                    }
                    isTest = isLocal || config.stripe_config?.publishable_key?.startsWith('pk_test') || false;
                }
            } catch (remoteConfigError) {
                console.error("Error loading Remote Config for one-time purchase, using fallback:", remoteConfigError);
            }

            const token = await auth.currentUser.getIdToken(true);
            const projectId = auth.app?.options?.projectId || import.meta.env.VITE_FIREBASE_PROJECT_ID || 'thepsy-f950e';
            const isTesting = projectId === 'testing-d74ed';
            const stripeFetchUrl = isTesting
                ? "https://createcheckoutsession-tebfrt2jva-ew.a.run.app"
                : `https://europe-west1-${projectId}.cloudfunctions.net/createCheckoutSession`;

            const response = await fetch(stripeFetchUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    planId,
                    priceId,
                    planName,
                    mode: 'payment',
                    successUrl: `${window.location.origin}/payment-success?appointmentId=${selectedSlot?.id || ''}&bookingType=${bookingType}`,
                    cancelUrl: `${window.location.origin}/therapist-profile`,
                    isTest
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            const { url } = data;
            if (!url) {
                throw new Error("No URL returned from checkout session API");
            }
            window.location.href = url;
        } catch (error) {
            console.error("Error initiating one-time purchase:", error);
            toast({ title: t('therapist.booking.error', "Failed to initiate purchase"), variant: "destructive" });
        } finally {
            setIsProcessingPayment(false);
        }
    };

    const handleCancelAppointment = async () => {
        if (!activeAppointment) return;
        try {
            await updateDoc(doc(db, "appointments", activeAppointment.id), {
                isBooked: false,
                bookedBy: null,
                status: 'AVAILABLE',
                appointmentType: null
            });
            toast({ title: t('therapist.booking.cancel_success', "Appointment cancelled successfully") });
            setShowCancelDialog(false);
            setActiveAppointment(null);

            // Refresh slots
            setSlots(prev => prev.map(s => s.id === activeAppointment.id ? { ...s, isBooked: false, bookedBy: undefined } : s));
        } catch (error) {
            console.error("Error cancelling:", error);
            toast({ title: t('therapist.booking.cancel_error', "Failed to cancel appointment"), variant: "destructive" });
        }
    };

    const handleTerminateContract = async () => {
        if (!auth.currentUser || !therapist) return;
        try {
            await updateDoc(doc(db, "users", auth.currentUser.uid), {
                "patientDetails.assignedTherapist": null,
                "patientDetails.therapistId": null, // Legacy field
                "patientDetails.conversationId": null
            });

            toast({ title: t('therapist.contract.success', 'Contract terminated successfully') });
            setShowTerminateDialog(false);
            navigate('/matching', { state: { excludedTherapistId: therapist.uid } });
        } catch (error) {
            console.error("Error terminating:", error);
            toast({ title: t('therapist.contract.error', 'Error terminating contract'), variant: "destructive" });
        }
    };

    const handleSubmitRating = async () => {
        if (!auth.currentUser || !therapist) return;
        try {
            const values = Object.values(ratingValues);
            const average = values.reduce((a, b) => a + b, 0) / values.length;
            const ratingId = `${therapist.uid}_${auth.currentUser.uid}`;

            await setDoc(doc(db, "therapist_ratings", ratingId), {
                therapistId: therapist.uid,
                patientId: auth.currentUser.uid,
                ...ratingValues,
                averageRating: average,
                timestamp: Timestamp.now()
            }, { merge: true });

            toast({ title: t('therapist.rating.success', 'Rating submitted successfully') });
            setShowRatingDialog(false);
        } catch (error) {
            console.error("Error rating:", error);
            toast({ title: t('therapist.rating.error', 'Failed to submit rating'), variant: "destructive" });
        }
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin h-8 w-8 border-4 border-[#92C7CF] rounded-full border-t-transparent"></div></div>;

    if (!therapist) return <div className="p-6 text-center">{t('therapist.profile.not_found', 'Therapist not found. Please complete matching first.')}</div>;

    return (
        <div className="min-h-screen bg-white pb-24">
            {/* Header / Hero */}
            <div className="pt-8 pb-10 px-6 rounded-b-[40px] relative" style={{ backgroundColor: "rgba(102, 170, 215, 0.4)" }}>
                <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")} className="absolute left-4 top-4 bg-white/50 rounded-full">
                    <ArrowLeft className="w-6 h-6 text-gray-800" />
                </Button>

                <div className="absolute right-4 top-4">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="bg-white/50 rounded-full">
                                <MoreVertical className="w-6 h-6 text-gray-800" />
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setShowRatingDialog(true)}>
                                {t('therapist.profile.give_rating', 'Give Rating')}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setShowTerminateDialog(true)} className="text-red-500 hover:text-red-600">
                                {t('therapist.profile.terminate_contract', 'Terminate Contract')}
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>

                <div className="flex flex-col items-center text-center mt-4 pt-8">
                    <Avatar className="w-32 h-32 border-4 border-white shadow-lg mb-4 bg-[#92C7CF]">
                        {/* Use profilePicture first, then photoURL, then generated avatar */}
                        <AvatarImage src={therapist.profilePicture || therapist.photoURL || ""} className="object-cover" />
                        <AvatarFallback className="text-2xl text-white bg-[#92C7CF]">
                            {therapist.displayName.charAt(0).toUpperCase()}
                        </AvatarFallback>
                    </Avatar>
                    <h1 className="text-2xl font-medium text-[#508C96] font-sans mb-1">
                        {therapist.displayName.replace(/^Dr\.?\s+/i, '')}
                    </h1>
                    <div className="flex flex-wrap justify-center gap-1 mb-6 max-w-[90%]">
                        {(() => {
                            const details = therapist.therapistDetails;
                            const rawSpecs =
                                details?.specializations ||
                                (Array.isArray(therapist.specialization) ? therapist.specialization : []) ||
                                (details?.specialization ? [details.specialization] : []);
                            const specs = normalizeTherapistSpecializationKeys(rawSpecs);

                            if (specs.length === 0) return (
                                <p className="text-gray-600 text-sm">
                                    {t('therapist.profile.specialization_fallback', "Clinical Psychologist")}
                                </p>
                            );

                            return specs.map((spec, index) => (
                                <Badge
                                    key={index}
                                    variant="outline"
                                    className="text-[10px] py-0 px-2 font-normal border-[#508C96] text-[#508C96] bg-white/50"
                                >
                                    {t(`therapist.specializations.${spec}`, THERAPIST_SPECIALIZATION_DEFAULT_EN_LABEL[spec])}
                                </Badge>
                            ));
                        })()}
                    </div>

                    <div className="flex gap-4">
                        {/* Rating Stats Box */}
                        <div className="bg-white p-3 rounded-2xl shadow-sm w-24 h-24 flex flex-col items-center justify-center">
                            <span className="text-lg font-bold text-gray-800 block">
                                {(calculatedRating || therapist.rating || 4.9).toFixed(1)}
                            </span>
                            <span className="text-xs text-gray-500 mb-1">{t('therapist.profile.rating_label', 'Rating')}</span>
                            <Star className="w-4 h-4 text-yellow-400 fill-current" />
                        </div>


                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="px-6 py-8">
                {/* About */}
                <div className="mb-8">
                    <h3 className="font-bold text-gray-800 mb-2">{t('therapist.profile.about', 'About')}</h3>
                    <p className="text-gray-600 text-sm leading-relaxed">
                        {therapist.therapistDetails?.profileSummary || therapist.bio || t('therapist.profile.no_bio', "No bio available.")}
                    </p>
                </div>

                {/* Specializations */}
                <div className="mb-8">
                    <h3 className="font-bold text-gray-800 mb-3">{t('therapist.profile.specialization', 'Specialization')}</h3>
                    <div className="flex flex-wrap gap-2">
                        {(() => {
                            const rawSpecs = therapist.therapistDetails?.specializations
                                || (Array.isArray(therapist.specialization) ? therapist.specialization : null)
                                || (therapist.specialization ? [therapist.specialization] : ["ANXIETY", "DEPRESSION", "STRESS"]);
                            const specs = normalizeTherapistSpecializationKeys(rawSpecs);

                            return specs.map((tag, i) => (
                                <Badge key={i} variant="secondary" className="bg-[#E0F2F1] text-[#26A69A] hover:bg-[#B2DFDB]">
                                    {t(`therapist.specializations.${tag}`, THERAPIST_SPECIALIZATION_DEFAULT_EN_LABEL[tag])}
                                </Badge>
                            ));
                        })()}
                    </div>
                </div>

                {/* Active Appointment or Booking Section */}
                {activeAppointment ? (
                    <div className="mb-8">
                        <h3 className="text-lg font-semibold text-gray-800 mb-4 font-sans">
                            {t('therapist.booking.upcoming_title', 'Your Upcoming Appointment')}
                        </h3>
                        <Card className="p-6 border-2 border-[#92C7CF] bg-[#F0F7F8] rounded-[24px] shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-3">
                                <Badge variant="secondary" className="bg-[#92C7CF] text-white hover:bg-[#92C7CF]">
                                    {t(`therapist.booking.type_${activeAppointment.appointmentType || 'video'}`, (activeAppointment.appointmentType || 'Video').charAt(0).toUpperCase() + (activeAppointment.appointmentType || 'Video').slice(1))}
                                </Badge>
                            </div>
                            
                            <div className="flex items-start gap-4 mb-6">
                                <div className="w-12 h-12 bg-white rounded-2xl flex items-center justify-center shadow-sm">
                                    <Calendar className="w-6 h-6 text-[#508C96]" />
                                </div>
                                <div>
                                    <p className="text-lg font-bold text-gray-800">
                                        {activeAppointment.startTimestamp.toDate().toLocaleDateString(i18n.language, { 
                                            weekday: 'long', 
                                            month: 'long', 
                                            day: 'numeric' 
                                        })}
                                    </p>
                                    <div className="flex items-center gap-2 text-gray-600 mt-1">
                                        <Clock className="w-4 h-4" />
                                        <span>
                                            {activeAppointment.startTimestamp.toDate().toLocaleTimeString(i18n.language, { 
                                                hour: '2-digit', 
                                                minute: '2-digit' 
                                            })}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="flex gap-3">
                                <Button 
                                    variant="outline" 
                                    onClick={() => setShowCancelDialog(true)}
                                    className="flex-1 rounded-full border-red-200 text-red-500 hover:bg-red-50 hover:text-red-600 h-11"
                                >
                                    {t('therapist.booking.cancel_button', 'Cancel Appointment')}
                                </Button>
                                {activeAppointment.appointmentType !== 'chat' && (
                                    <Button 
                                        onClick={() => navigate(`/call/${activeAppointment.id}`)}
                                        className="flex-1 rounded-full bg-[#92C7CF] hover:bg-[#7FB0B8] text-white h-11"
                                    >
                                        <Video className="w-4 h-4 mr-2" />
                                        {t('therapist.booking.join_button', 'Join')}
                                    </Button>
                                )}
                            </div>
                        </Card>
                        <p className="text-center text-sm text-gray-500 mt-4 px-4 italic">
                            {t('therapist.booking.one_at_a_time', 'To ensure quality care, you can only have one active appointment at a time.')}
                        </p>
                    </div>
                ) : availableDates.length > 0 ? (
                    <>
                        <div className="bg-[#FCF9F2] rounded-[16px] p-4 mb-6">
                            <h3 className="text-lg font-semibold text-[#1E1E1E] mb-4 font-sans">
                                {new Date().toLocaleString(i18n.language, { month: 'short' })} {new Date().getFullYear()}
                            </h3>
                            <div className="flex space-x-3 overflow-x-auto pb-2 no-scrollbar">
                                {availableDates.map(dateStr => {
                                    const date = new Date(dateStr);
                                    const isSelected = selectedDate === dateStr;
                                    return (
                                        <div
                                            key={dateStr}
                                            onClick={() => setSelectedDate(dateStr)}
                                            className={`
                                                       flex flex-col items-center justify-center min-w-[50px] py-3 px-2 rounded-[24px] cursor-pointer border transition-all
                                                       ${isSelected ? 'bg-white border-[#79C9C0] border-2 shadow-sm' : 'bg-white border-[#E0E0E0] border'}
                                                   `}
                                        >
                                            <span className={`text-xs font-medium mb-1 ${isSelected ? 'text-[#1E1E1E]' : 'text-[#616161]'}`}>
                                                {date.toLocaleDateString(i18n.language, { weekday: 'short' })}
                                            </span>
                                            <span className={`text-xl font-medium ${isSelected ? 'font-bold text-[#1E1E1E]' : 'text-[#1E1E1E]'}`}>
                                                {date.getDate()}
                                            </span>
                                        </div>
                                    )
                                })}
                            </div>
                        </div>

                        {/* Available Slots Flow */}
                        <div className="bg-[rgba(170,215,217,0.4)] rounded-[16px] p-4 mb-6">
                            <h3 className="text-lg font-semibold text-[#1E1E1E] mb-4 font-sans">
                                {t('therapist.booking.available_slots', 'Available Slots')}
                            </h3>
                            <div className="flex flex-wrap gap-3">
                                {slotsForDate.map(slot => (
                                    <Button
                                        key={slot.id}
                                        onClick={() => {
                                            setSelectedSlot(slot);
                                            setShowBookingDialog(true);
                                        }}
                                        className={`
                                                    bg-white hover:bg-gray-50 text-[#1E1E1E] font-semibold text-sm h-10 px-4 rounded-[12px] shadow-sm border
                                                    ${selectedSlot?.id === slot.id ? 'border-[#79C9C0] border-2' : 'border-[#E0E0E0]'}
                                                `}
                                    >
                                        {slot.startTimestamp.toDate().toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })}
                                    </Button>
                                ))}
                            </div>
                        </div>
                        <div className="text-center mt-4">
                            <Button
                                onClick={() => {
                                    // Check for Basic Plan
                                    if (userPlan?.toLowerCase().includes('basic')) {
                                        toast({
                                            title: t('therapist.booking.plan_restriction_title', "Plan Restriction"),
                                            description: t('therapist.booking.plan_restriction_desc', "Video sessions are not available on the Basic Plan. Please upgrade to book appointments."),
                                            variant: "destructive"
                                        });
                                        return;
                                    }

                                    if (slotsForDate.length > 0) {
                                        setSelectedSlot(slotsForDate[0]); // Select first logic? Or explicit selection
                                        setShowBookingDialog(true);
                                    } else {
                                        toast({ title: t('therapist.booking.select_slot_error', "Please select a slot"), variant: "destructive" });
                                    }
                                }}
                                disabled={!selectedSlot || userPlan?.toLowerCase().includes('basic')} // Wait for selection?
                                // Actually PsyCMp has "Book Appointment" button floating or at bottom
                                className="w-full h-12 rounded-full font-semibold text-white bg-[#92C7CF] hover:bg-[#7FB0B8] shadow-lg max-w-sm mx-auto"
                            >
                                {t('therapist.booking.title', 'Book Appointment')}
                            </Button>
                        </div>

                    </>
                ) : (
                    <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-xl border border-gray-100 mb-6">
                        <Calendar className="w-10 h-10 mx-auto text-gray-300 mb-2" />
                        <p>{t('therapist.profile.no_available_slots', 'No available appointments')}</p>
                    </div>
                )}
            </div>

            {/* Booking Confirmation Dialog */}
            <Dialog open={showBookingDialog} onOpenChange={setShowBookingDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('therapist.booking.confirm_title', 'Confirm Appointment')}</DialogTitle>
                    </DialogHeader>

                    <div className="py-4">
                        <div className="flex items-center mb-6 bg-gray-50 p-4 rounded-lg">
                            <Clock className="w-5 h-5 text-[#508C96] mr-3" />
                            <div>
                                <p className="font-semibold text-gray-700">
                                    {selectedSlot?.startTimestamp.toDate().toLocaleDateString(i18n.language, { weekday: 'long', month: 'short', day: 'numeric' })}
                                </p>
                                <p className="text-sm text-gray-500">
                                    {selectedSlot?.startTimestamp.toDate().toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })}
                                </p>
                            </div>
                        </div>

                        <Label className="mb-3 block">{t('therapist.booking.session_type', 'Session Type')}</Label>
                        <RadioGroup defaultValue="call" onValueChange={(v) => setBookingType(v as 'call' | 'chat' | 'video')}>
                            <div className="flex items-center space-x-2 border p-3 rounded-lg cursor-pointer hover:bg-gray-50">
                                <RadioGroupItem value="call" id="call" />
                                <Label htmlFor="call" className="flex items-center cursor-pointer flex-1">
                                    <Phone className="w-4 h-4 mr-2 text-blue-500" />
                                    {t('therapist.booking.audio_call', 'Audio Call')}
                                </Label>
                            </div>
                            <div className="flex items-center space-x-2 border p-3 rounded-lg cursor-pointer hover:bg-gray-50">
                                <RadioGroupItem value="video" id="video" />
                                <Label htmlFor="video" className="flex items-center cursor-pointer flex-1">
                                    <Video className="w-4 h-4 mr-2 text-purple-500" />
                                    {t('therapist.booking.video_call', 'Video Call')}
                                </Label>
                            </div>
                            <div className="flex items-center space-x-2 border p-3 rounded-lg cursor-pointer hover:bg-gray-50">
                                <RadioGroupItem value="chat" id="chat" />
                                <Label htmlFor="chat" className="flex items-center cursor-pointer flex-1">
                                    <MessageCircle className="w-4 h-4 mr-2 text-green-500" />
                                    {t('therapist.booking.chat_session', 'Chat Session')}
                                </Label>
                            </div>
                        </RadioGroup>
                    </div>

                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowBookingDialog(false)}>{t('therapist.contract.cancel_button', 'Cancel')}</Button>
                        <Button
                            onClick={handleBookAppointment}
                            disabled={isBooking}
                            className="bg-[#92C7CF] hover:bg-[#7FB0B8] text-white"
                        >
                            {isBooking ? t('common.booking', "Booking...") : t('therapist.booking.confirm_booking', "Confirm Booking")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Rating Dialog */}
            <Dialog open={showRatingDialog} onOpenChange={setShowRatingDialog}>
                <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>{t('therapist.rating.title', 'Rate Your Therapist')}</DialogTitle>
                        <DialogDescription>{t('therapist.rating.description', 'Please rate your experience with this therapist.')}</DialogDescription>
                    </DialogHeader>
                    <div className="py-2 space-y-6">
                        {Object.entries(ratingValues).map(([key, value]) => (
                            <div key={key} className="space-y-2">
                                <Label>{t(`therapist.rating.categories.${key}`, key.replace(/([A-Z])/g, ' $1').trim())}</Label>
                                <Slider
                                    value={[value]}
                                    min={1}
                                    max={5}
                                    step={1}
                                    onValueChange={([val]) => setRatingValues(prev => ({ ...prev, [key]: val }))}
                                />
                                <div className="text-xs text-right text-muted-foreground">{value} / 5</div>
                            </div>
                        ))}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowRatingDialog(false)}>{t('therapist.contract.cancel_button', 'Cancel')}</Button>
                        <Button onClick={handleSubmitRating} className="bg-[#92C7CF] text-white">{t('therapist.rating.submit', 'Submit')}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Terminate Dialog */}
            <Dialog open={showTerminateDialog} onOpenChange={setShowTerminateDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('therapist.contract.terminate_title', 'Terminate Contract')}</DialogTitle>
                        <DialogDescription>
                            {t('therapist.contract.terminate_message', 'Are you sure you want to terminate this contract?')}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowTerminateDialog(false)}>{t('therapist.contract.cancel_button', 'Cancel')}</Button>
                        <Button variant="destructive" onClick={handleTerminateContract}>{t('therapist.contract.terminate_button', 'Terminate')}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Cancel Appointment Dialog */}
            <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('therapist.booking.cancel_title', 'Cancel Appointment')}</DialogTitle>
                        <DialogDescription>
                            {t('therapist.booking.cancel_message', 'Are you sure you want to cancel this appointment?')}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowCancelDialog(false)}>{t('therapist.booking.cancel_no', 'No, Keep')}</Button>
                        <Button variant="destructive" onClick={handleCancelAppointment}>{t('therapist.booking.cancel_yes', 'Yes, Cancel')}</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
            {/* One-Time Session Dialog */}
            <Dialog open={showOneTimeDialog} onOpenChange={setShowOneTimeDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t('therapist_details.one_time_dialog.title', 'Plan Limit Reached')}</DialogTitle>
                        <DialogDescription>
                            {t('therapist_details.one_time_dialog.message', 'You have exhausted your plan\'s session limit for this month. You can purchase a one-time session to book this appointment without changing your current plan.')}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowOneTimeDialog(false)}>{t('therapist_details.one_time_dialog.cancel_button', 'Not Now')}</Button>
                        <Button
                            onClick={handleBuyOneTimeSession}
                            disabled={isProcessingPayment}
                            className="bg-[#92C7CF] hover:bg-[#7FB0B8] text-white"
                        >
                            {isProcessingPayment ? t('common.processing', 'Processing...') : t('therapist_details.one_time_dialog.buy_button', 'Buy One Session (€79.99)')}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default TherapistDetails;
