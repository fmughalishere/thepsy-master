import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db, functions } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, CreditCard, Calendar, CheckCircle } from "lucide-react";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

const SubscriptionStatus = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [subscription, setSubscription] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [cancelling, setCancelling] = useState(false);

    useEffect(() => {
        const fetchSubscription = async () => {
            if (auth.currentUser) {
                const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    let subscriptionData = userData.patientDetails?.quotas || {};

                    // If planName is missing or unknown, try to fetch from Remote Config
                    if (subscriptionData.planId && (!subscriptionData.planName || subscriptionData.planName === "Unknown Plan")) {
                        try {
                            const { fetchAndActivate, getValue } = await import("firebase/remote-config");
                            const { remoteConfig } = await import("@/lib/firebase");

                            await fetchAndActivate(remoteConfig);
                            const configValue = getValue(remoteConfig, 'payments');
                            const configString = configValue.asString();

                            if (configString) {
                                const config = JSON.parse(configString);
                                const lang = navigator.language.split('-')[0] || 'en';
                                // Try language-specific plans, fallback to English
                                const plans = (config[`therapy_session_plans_${lang}`] || config['therapy_session_plans_en'] || []) as any[];
                                const foundPlan = plans.find((p: any) => p.id === subscriptionData.planId);

                                if (foundPlan) {
                                    subscriptionData = {
                                        ...subscriptionData,
                                        planName: foundPlan.name,
                                        pricePerWeek: parseFloat(foundPlan.price || "0"),
                                        currency: foundPlan.currency || "EUR"
                                    };
                                }
                            }
                        } catch (e) {
                            console.error("Error fetching plan details from Remote Config:", e);
                        }
                    }

                    // Calculate next billing date if missing (30 days from last payment)
                    if (subscriptionData.lastPaymentDate && !subscriptionData.nextBillingDate) {
                        const lastPayment = subscriptionData.lastPaymentDate.toDate ? subscriptionData.lastPaymentDate.toDate() : new Date(subscriptionData.lastPaymentDate);
                        const nextBilling = new Date(lastPayment);
                        nextBilling.setDate(nextBilling.getDate() + 30);
                        subscriptionData.nextBillingDate = nextBilling;
                    }

                    // Check for Basic plan and fetch message count
                    if (subscriptionData.planName?.toLowerCase().includes('basic')) {
                        const conversationId = userData.patientDetails?.conversationId;
                        if (conversationId) {
                            // Import necessary firestore functions
                            const { collection, query, where, getCountFromServer, Timestamp } = await import("firebase/firestore");

                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            const todayTimestamp = Timestamp.fromDate(today);

                            const messagesRef = collection(db, "conversations", conversationId, "messages");
                            const q = query(
                                messagesRef,
                                where("senderId", "==", auth.currentUser.uid),
                                where("timestamp", ">=", todayTimestamp)
                            );

                            try {
                                const snapshot = await getCountFromServer(q);
                                subscriptionData = { ...subscriptionData, dailyMessageCount: snapshot.data().count };
                            } catch (e) {
                                console.error("Error fetching message count:", e);
                            }
                        }
                    }

                    setSubscription(subscriptionData);
                }
            }
            setLoading(false);
        };
        fetchSubscription();
    }, []);

    const handleCancelSubscription = async () => {
        setCancelling(true);
        try {
            const cancelSub = httpsCallable(functions, 'cancelSubscription');
            await cancelSub();

            // Refresh subscription data locally
            setSubscription((prev: any) => ({
                ...prev,
                subscriptionStatus: 'CANCELLED',
                isActive: true // Still active until end of period
            }));

            toast.success(t('subscription.cancel_success', "Subscription cancelled successfully. You can still use the app until the end of the billing period."));
        } catch (error) {
            console.error("Error cancelling subscription:", error);
            toast.error(t('subscription.cancel_error', "Failed to cancel subscription. Please try again."));
        } finally {
            setCancelling(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="animate-spin h-8 w-8 border-4 border-[#92C7CF] rounded-full border-t-transparent"></div>
            </div>
        );
    }

    const formatDate = (timestamp: any) => {
        if (!timestamp) return t('common.na', "N/A");
        // Handle both Firestore Timestamp and regular Date objects/strings
        const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'ACTIVE': return 'text-green-600 bg-green-50';
            case 'TRIAL': return 'text-blue-600 bg-blue-50';
            case 'CANCELLED': return 'text-orange-600 bg-orange-50';
            case 'EXPIRED': return 'text-red-600 bg-red-50';
            default: return 'text-gray-600 bg-gray-50';
        }
    };

    const isCancelled = subscription?.subscriptionStatus === 'CANCELLED';

    return (
        <div className="min-h-screen bg-white">
            {/* Header */}
            <div className="border-b border-gray-200 bg-white sticky top-0 z-10">
                <div className="max-w-4xl mx-auto px-6 py-4 flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => navigate(-1)}
                    >
                        <ArrowLeft className="h-5 w-5" />
                    </Button>
                    <h1 className="text-xl font-bold text-gray-900">{t('subscription.title', 'Subscription Status')}</h1>
                </div>
            </div>

            <div className="max-w-4xl mx-auto px-6 py-8">
                {subscription ? (
                    <div className="space-y-6">
                        {/* Status Card */}
                        <Card className="p-6">
                            <div className="flex items-start justify-between mb-6">
                                <div>
                                    <h2 className="text-2xl font-bold text-gray-900 mb-2">
                                        {subscription.planName || t('subscription.default_plan', "Subscription Plan")}
                                    </h2>
                                    <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(subscription.subscriptionStatus)}`}>
                                        <CheckCircle className="w-4 h-4" />
                                        {subscription.subscriptionStatus || t('subscription.status.active', "ACTIVE")}
                                    </div>
                                </div>
                                <CreditCard className="w-8 h-8 text-[#92C7CF]" />
                            </div>

                            <div className="grid grid-cols-2 gap-6">


                                <div>
                                    <p className="text-sm text-gray-600 mb-1">{t('subscription.last_payment', 'Last Payment')}</p>
                                    <p className="text-lg font-semibold text-gray-900">
                                        {formatDate(subscription.lastPaymentDate)}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-sm text-gray-600 mb-1">
                                        {isCancelled ? t('subscription.expires_on', "Expires On") : t('subscription.next_billing', "Next Billing")}
                                    </p>
                                    <p className="text-lg font-semibold text-gray-900">
                                        {formatDate(subscription.nextBillingDate)}
                                    </p>
                                </div>
                            </div>
                        </Card>

                        {/* Features Card */}
                        {subscription.features && subscription.features.length > 0 && (
                            <Card className="p-6">
                                <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('subscription.plan_features', 'Plan Features')}</h3>
                                <ul className="space-y-3">
                                    {subscription.features.map((feature: string, index: number) => (
                                        <li key={index} className="flex items-start gap-3">
                                            <CheckCircle className="w-5 h-5 text-[#92C7CF] flex-shrink-0 mt-0.5" />
                                            <span className="text-gray-700">{feature}</span>
                                        </li>
                                    ))}
                                </ul>
                            </Card>
                        )}



                        {/* Action Buttons */}
                        <div className="flex gap-4 flex-wrap">
                            {/* Upgrade/Downgrade */}
                            <Button
                                className="flex-1 bg-[#92C7CF] hover:bg-[#7FB0B8] text-white"
                                onClick={() => navigate('/payment')}
                            >
                                {t('subscription.change_plan', 'Change Plan')}
                            </Button>

                            {subscription.isActive && !isCancelled && (
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button
                                            variant="outline"
                                            className="flex-1 border-red-300 text-red-600 hover:bg-red-50"
                                        >
                                            {t('subscription.cancel_btn', 'Cancel Subscription')}
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>{t('subscription.cancel_dialog_title', 'Cancel Subscription?')}</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                {t('subscription.cancel_dialog_desc', 'Are you sure you want to cancel your subscription? You will still have access to your plan features until the end of your current billing period')} ({formatDate(subscription.nextBillingDate)}).
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>{t('subscription.keep_btn', 'Keep Subscription')}</AlertDialogCancel>
                                            <AlertDialogAction
                                                onClick={handleCancelSubscription}
                                                className="bg-red-600 hover:bg-red-700 text-white"
                                                disabled={cancelling}
                                            >
                                                {cancelling ? t('subscription.cancelling', "Cancelling...") : t('subscription.confirm_cancel_btn', "Yes, Cancel Subscription")}
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            )}
                        </div>
                    </div>
                ) : (
                    <Card className="p-12 text-center">
                        <Calendar className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                        <h2 className="text-xl font-semibold text-gray-900 mb-2">{t('subscription.no_active', 'No Active Subscription')}</h2>
                        <p className="text-gray-600 mb-6">{t('subscription.no_active_desc', "You don't have an active subscription yet.")}</p>
                        <Button
                            className="bg-[#92C7CF] hover:bg-[#7FB0B8] text-white"
                            onClick={() => navigate('/payment')}
                        >
                            {t('subscription.subscribe_now', 'Subscribe Now')}
                        </Button>
                    </Card>
                )}
            </div>
        </div>
    );
};

export default SubscriptionStatus;
