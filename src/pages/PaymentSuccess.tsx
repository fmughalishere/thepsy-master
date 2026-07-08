import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { CheckCircle, Loader2 } from "lucide-react";
import { auth, db, functions } from "@/lib/firebase";
import { doc, onSnapshot, getDoc, updateDoc, Timestamp } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";

const PaymentSuccess = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [isVerifying, setIsVerifying] = useState(true);
    const [isActivated, setIsActivated] = useState(false);

    useEffect(() => {
        // Handle mobile app redirect if platform=mobile is in URL
        const params = new URLSearchParams(window.location.search);
        if (params.get('platform') === 'mobile') {
            console.log("📱 Mobile platform detected, attempting redirect to app...");
            window.location.href = "psycmp://payment";
        }

        const appointmentId = params.get('appointmentId');
        const bookingType = params.get('bookingType') || 'call';
        let unsubscribe: (() => void) | null = null;

        const handleOneTimeSessionBooking = async () => {
            if (!auth.currentUser || !appointmentId) return;

            try {
                // Generate HMS Room First
                let generatedRoomId = null;
                try {
                    const generate100msToken = httpsCallable(functions, 'generate100msToken');
                    const result = await generate100msToken({
                        mode: 'create',
                        appointmentId: appointmentId,
                        userId: auth.currentUser.uid,
                        role: 'host'
                    });
                    // @ts-ignore
                    if (result.data && result.data.roomId) {
                        // @ts-ignore
                        generatedRoomId = result.data.roomId;
                    }
                } catch (cfError) {
                    console.error("Cloud Function room creation failed:", cfError);
                }

                const appointmentData = {
                    isBooked: true,
                    bookedBy: auth.currentUser.uid,
                    appointmentType: bookingType,
                    status: 'BOOKED',
                    paymentStatus: 'PAID', // Stripe checkout was successful
                    updatedAt: Timestamp.now(),

                    baseAmount: 0,
                    paymentAmount: 0,
                    penaltyAmount: 0,
                    sessionDurationSeconds: 0,
                    sessionMinutes: 0,

                    isActive: true,
                    recurrenceType: "Single",
                    isTherapistLate: false,
                    sessionSegments: [],
                    sessionType: "",
                    notes: "",

                    patientJoinedAt: null,
                    patientWasLate: false,
                    lateArrivalMinutes: 0,
                    sessionEndedAt: null,
                    therapistJoinTime: null,
                    paidAt: Timestamp.now(),
                    paidBy: auth.currentUser.uid,
                    recurrenceEnd: null,

                    ...(generatedRoomId && { hmsRoomId: generatedRoomId })
                };

                await updateDoc(doc(db, "appointments", appointmentId), appointmentData);
            } catch (error) {
                console.error("Error finalizing booking on success page:", error);
            } finally {
                setIsActivated(true);
                setIsVerifying(false);
            }
        };

        if (appointmentId) {
            handleOneTimeSessionBooking();
            return;
        }

        if (!auth.currentUser) {
            setIsVerifying(false);
            return;
        }

        // Listen for Firestore update confirming subscription is active
        const userDocRef = doc(db, "users", auth.currentUser.uid);
        const subUnsubscribe = onSnapshot(userDocRef, (docSnapshot) => {
            if (docSnapshot.exists()) {
                const userData = docSnapshot.data();
                const quotas = userData.patientDetails?.quotas;
                const isActive = quotas?.isActive === true;
                const status = quotas?.subscriptionStatus;
                const hasActiveStatus = status === "ACTIVE" || status === "RETURNED" || status === "TRIAL";

                if (isActive || hasActiveStatus) {
                    console.log("[PaymentSuccess] Subscription confirmed active:", status);
                    setIsActivated(true);
                    setIsVerifying(false);
                    subUnsubscribe();
                }
            }
        });
        unsubscribe = subUnsubscribe;

        // Timeout after 60 seconds — allow user to proceed regardless
        const timeout = setTimeout(() => {
            console.log("[PaymentSuccess] Verification timeout — allowing navigation anyway");
            setIsVerifying(false);
            subUnsubscribe();
        }, 60000);

        return () => {
            if (unsubscribe) unsubscribe();
            clearTimeout(timeout);
        };
    }, []);

    return (
        <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6 text-center">

            <div className="mb-6 animate-in zoom-in duration-500">
                <CheckCircle className="w-24 h-24 text-[#92C7CF]" />
            </div>

            <h1 className="text-2xl font-bold text-gray-900 mb-2">
                {t('payment.success.title')}
            </h1>

            <p className="text-gray-500 mb-8 max-w-xs mx-auto">
                {isVerifying
                    ? t('payment.success.verifying', 'Verifying your subscription...')
                    : t('payment.success.message')
                }
            </p>

            {isVerifying ? (
                <div className="flex items-center gap-3 text-[#92C7CF]">
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="text-sm font-medium">
                        {t('payment.success.activating', 'Activating your plan...')}
                    </span>
                </div>
            ) : (
                <Button
                    onClick={() => navigate("/matching")}
                    className="w-full max-w-xs h-12 rounded-full bg-[#92C7CF] hover:bg-[#7FB0B8] text-white font-semibold shadow-md"
                >
                    {t('payment.success.continue')}
                </Button>
            )}
        </div>
    );
};

export default PaymentSuccess;
