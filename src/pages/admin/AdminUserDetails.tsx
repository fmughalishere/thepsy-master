import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { doc, getDoc, updateDoc, addDoc, collection, Timestamp, query, where, getDocs, setDoc, serverTimestamp } from "firebase/firestore";
import { httpsCallable } from "firebase/functions";
import { db, functions } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ArrowLeft, CheckCircle, XCircle, Mail, Phone, Calendar, Globe, User, FileText, ExternalLink, ShieldAlert, UserCheck, CreditCard, Send } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { reportService } from "@/services/reportService";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import type { Locale } from "date-fns";
import { enUS, de as deLocale, el as elLocale, hr as hrLocale } from "date-fns/locale";
import { THERAPIST_SPECIALIZATION_DEFAULT_EN_LABEL, normalizeTherapistSpecializationKeys } from "@/lib/therapistSpecializations";

const localeMap: Record<string, Locale> = {
    en: enUS,
    de: deLocale,
    el: elLocale,
    hr: hrLocale
};

import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
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

const AdminUserDetails = () => {
    const { userId } = useParams();
    const navigate = useNavigate();
    const { toast } = useToast();
    const { t, i18n } = useTranslation();
    const [user, setUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [processing, setProcessing] = useState(false);
    const [allTherapists, setAllTherapists] = useState<any[]>([]);
    const [selectedTherapistId, setSelectedTherapistId] = useState<string>("");
    const [showConfirmDialog, setShowConfirmDialog] = useState(false);
    // Manual subscription activation state
    const [showActivationDialog, setShowActivationDialog] = useState(false);
    const [activationPlanId, setActivationPlanId] = useState<string>("basic_monthly");
    const [activationDate, setActivationDate] = useState<string>(() => {
        const d = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
        return d.toISOString().split('T')[0];
    });
    const [activationStripeCustomerId, setActivationStripeCustomerId] = useState<string>("");
    const [showVerifyEmailDialog, setShowVerifyEmailDialog] = useState(false);
    const [sendingVerifyEmail, setSendingVerifyEmail] = useState(false);

    const localeKey = i18n.language?.split("-")[0] || "en";
    const dateLocale = localeMap[localeKey as keyof typeof localeMap] ?? enUS;

    const formatMemberSince = (createdAt?: { toDate?: () => Date } | string | number | Date) => {
        if (!createdAt) {
            return t('admin.user_details.status.unknown');
        }

        const date = typeof (createdAt as any)?.toDate === "function"
            ? (createdAt as any).toDate()
            : new Date(createdAt as any);

        if (Number.isNaN(date?.getTime())) {
            return t('admin.user_details.status.unknown');
        }

        return format(date, 'PPP', { locale: dateLocale });
    };

    const getRoleLabel = (role?: string) => {
        if (!role) {
            return t('admin.user_details.status.unknown');
        }
        return t(`admin.user_details.roles.${role.toLowerCase()}`, role);
    };

    useEffect(() => {
        if (userId) {
            fetchUser(userId);
            fetchTherapists();
        }
    }, [userId]);

    const fetchTherapists = async () => {
        try {
            const q = query(
                collection(db, "users"),
                where("role", "==", "THERAPIST"),
                where("therapistDetails.profileStatus", "in", ["APPROVED", "VERIFIED"])
            );
            const querySnapshot = await getDocs(q);
            const therapistsList = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            }));
            setAllTherapists(therapistsList);
        } catch (error) {
            console.error("Error fetching therapists:", error);
        }
    };

    const fetchUser = async (userId: string) => {
        try {
            const docRef = doc(db, "users", userId);
            const docSnap = await getDoc(docRef);
            if (docSnap.exists()) {
                setUser({ id: docSnap.id, ...docSnap.data() });
            }
        } catch (error) {
            console.error("Error fetching user:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleStatusUpdate = async (status: 'approved' | 'rejected') => {
        if (!user) return;
        setProcessing(true);
        try {
            // 1. Update Therapist Status
            await updateDoc(doc(db, "users", user.id), {
                "therapistDetails.profileStatus": status === 'approved' ? 'APPROVED' : 'REJECTED',
                verified: status === 'approved'
            });

            // 2. Create Notification in Firestore
            const notificationTitleKey = status === 'approved'
                ? "notifications.therapist_approved_title"
                : "notifications.therapist_rejected_title";
            const notificationBodyKey = status === 'approved'
                ? "notifications.therapist_approved_body"
                : "notifications.therapist_rejected_body";

            await addDoc(collection(db, "notifications"), {
                targetUserIds: [user.id],
                userId: user.id,
                title: status === 'approved' ? "Profile Approved" : "Profile Rejected",
                body: status === 'approved' 
                    ? `Congratulations ${user.displayName}! Your therapist profile has been approved.`
                    : `We're sorry ${user.displayName}, your therapist profile was not approved at this time.`,
                titleKey: notificationTitleKey,
                messageKey: notificationBodyKey,
                params: {
                    name: user.displayName
                },
                type: status === 'approved' ? "THERAPIST_APPROVED" : "GENERIC",
                timestamp: Timestamp.now(),
                read: false
            });

            // Send Push
            try {
                const { createAndSendNotification } = await import("@/lib/firebase-functions");
                await createAndSendNotification({
                    title: status === 'approved' ? "Profile Approved" : "Profile Rejected",
                    message: status === 'approved' 
                        ? `Congratulations ${user.displayName}! Your therapist profile has been approved.`
                        : `We're sorry ${user.displayName}, your therapist profile was not approved at this time.`,
                    titleKey: notificationTitleKey,
                    messageKey: notificationBodyKey,
                    params: {
                        name: user.displayName
                    },
                    type: status === 'approved' ? "THERAPIST_APPROVED" : "GENERIC",
                    targetUserIds: [user.id],
                    clickAction: {
                        type: status === 'approved' ? "URL" : "URL",
                        url: status === 'approved' ? "/therapist/dashboard" : "/support"
                    }
                });
            } catch (e) {
                console.error("Failed to send push notification:", e);
            }

            // Update local state
            setUser((prev: any) => ({
                ...prev,
                therapistDetails: {
                    ...prev.therapistDetails,
                    profileStatus: status === 'approved' ? 'APPROVED' : 'REJECTED'
                },
                verified: status === 'approved'
            }));

            toast({
                title: status === 'approved' ? t('admin.user_details.messages.success_approve') : t('admin.user_details.messages.success_reject'),
                description: status === 'approved' ? t('admin.user_details.messages.success_approve_desc') : t('admin.user_details.messages.success_reject_desc'),
            });

        } catch (error) {
            console.error("Error updating status:", error);
            toast({
                title: t('admin.user_details.messages.error_title'),
                description: t('admin.user_details.messages.error_update_status'),
                variant: "destructive",
            });
        } finally {
            setProcessing(false);
        }
    };

    const handleToggleBlock = async () => {
        if (!user) return;
        setProcessing(true);
        try {
            const newStatus = await reportService.toggleUserBlockStatus(user.id, !!user.isBlocked, "admin");

            setUser((prev: any) => ({
                ...prev,
                isBlocked: newStatus
            }));

            toast({
                title: newStatus ? t('admin.user_details.messages.success_block') : t('admin.user_details.messages.success_unblock'),
                description: newStatus ? t('admin.user_details.messages.success_block_desc') : t('admin.user_details.messages.success_unblock_desc'),
            });
        } catch (error) {
            console.error("Error toggling block status:", error);
            toast({
                title: t('admin.user_details.messages.error_title'),
                description: t('admin.user_details.messages.error_block_status'),
                variant: "destructive",
            });
        } finally {
            setProcessing(false);
        }
    };

    const handleSendVerificationEmail = async () => {
        if (!user?.id || !user.email) {
            toast({
                title: t("admin.user_details.verification_email.error_title"),
                description: t("admin.user_details.verification_email.no_email"),
                variant: "destructive",
            });
            return;
        }
        setSendingVerifyEmail(true);
        try {
            const fn = httpsCallable(functions, "adminSendUserEmailVerification");
            const result = await fn({ targetUserId: user.id });
            const data = result.data as { success?: boolean; alreadyVerified?: boolean };
            setShowVerifyEmailDialog(false);
            if (data?.alreadyVerified) {
                toast({
                    title: t("admin.user_details.verification_email.already_verified_title"),
                    description: t("admin.user_details.verification_email.already_verified_desc"),
                });
                return;
            }
            toast({
                title: t("admin.user_details.verification_email.success_title"),
                description: t("admin.user_details.verification_email.success_desc"),
            });
        } catch (error: unknown) {
            console.error("adminSendUserEmailVerification:", error);
            const err = error as { message?: string; code?: string };
            toast({
                title: t("admin.user_details.verification_email.error_title"),
                description: err?.message || t("admin.user_details.verification_email.error_generic"),
                variant: "destructive",
            });
        } finally {
            setSendingVerifyEmail(false);
        }
    };

    const handleAssignTherapist = async () => {
        if (!user || !userId || !selectedTherapistId) return;
        setProcessing(true);
        try {
            const therapist = allTherapists.find(t => t.id === selectedTherapistId);
            if (!therapist) return;

            // 1. Check if conversation exists
            const convsQuery = query(
                collection(db, "conversations"),
                where("participants", "array-contains", userId)
            );
            const convsSnap = await getDocs(convsQuery);
            let conversationId = "";
            
            const existingConv = convsSnap.docs.find(doc => {
                const data = doc.data();
                return data.participants.includes(selectedTherapistId);
            });

            if (existingConv) {
                conversationId = existingConv.id;
            } else {
                // Create new conversation
                const newConvRef = doc(collection(db, "conversations"));
                conversationId = newConvRef.id;
                await setDoc(newConvRef, {
                    participants: [userId, selectedTherapistId],
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                    lastMessage: "",
                    lastMessageAt: serverTimestamp(),
                    unreadCount: {
                        [userId]: 0,
                        [selectedTherapistId]: 0
                    }
                });
            }

            // 2. Update Patient Document
            await updateDoc(doc(db, "users", userId), {
                "patientDetails.assignedTherapist": selectedTherapistId,
                "patientDetails.conversationId": conversationId,
                "patientDetails.matchFound": true,
                "patientDetails.matchedAt": serverTimestamp()
            });

            // 3. Send Notification to Patient
            await addDoc(collection(db, "notifications"), {
                targetUserIds: [userId],
                userId: userId,
                title: "Therapist Assigned",
                body: `Administrator has assigned ${therapist.displayName || 'a therapist'} to you.`,
                titleKey: "notifications.assigned_therapist_title",
                messageKey: "notifications.assigned_therapist_body",
                params: { name: therapist.displayName },
                type: "THERAPIST_ASSIGNED",
                timestamp: Timestamp.now(),
                read: false
            });

            // 4. Send Notification to Therapist
            await addDoc(collection(db, "notifications"), {
                targetUserIds: [selectedTherapistId],
                userId: selectedTherapistId,
                title: "New Patient Assigned",
                body: `Administrator has assigned a new patient ${user.displayName} to you.`,
                titleKey: "notifications.matched_patient_title",
                messageKey: "notifications.matched_patient_body",
                params: { name: user.displayName },
                type: "PATIENT_ASSIGNED",
                timestamp: Timestamp.now(),
                read: false
            });

            // Update local state
            setUser((prev: any) => ({
                ...prev,
                patientDetails: {
                    ...prev.patientDetails,
                    assignedTherapist: selectedTherapistId,
                    conversationId: conversationId
                }
            }));

            toast({
                title: t('admin.user_details.messages.success_assignment'),
                variant: "default",
            });
            setShowConfirmDialog(false);
        } catch (error) {
            console.error("Error assigning therapist:", error);
            toast({
                title: t('admin.user_details.messages.error_assignment'),
                variant: "destructive",
            });
        } finally {
            setProcessing(false);
        }
    };

    const handleManualActivation = async () => {
        if (!user || !userId) return;
        setProcessing(true);
        try {
            const now = Timestamp.now();
            const paidUntilDate = new Date(activationDate);
            const paidUntil = Timestamp.fromDate(paidUntilDate);
            const nextBillingDate = Timestamp.fromDate(paidUntilDate);

            // Fetch admin-configured word limit from settings
            let adminWordLimit = 500; // fallback default
            try {
                const { getPayrollSettings } = await import("@/services/payrollService");
                const settings = await getPayrollSettings();
                if (settings?.messageWordLimit) {
                    adminWordLimit = settings.messageWordLimit;
                }
            } catch (e) {
                console.error("Failed to load admin word limit, using default:", e);
            }

            // Determine quotas based on plan ID — matching what getPlanDetails returns in paymentConfigHelper.js
            let messageWordLimit = 0;
            let liveSessionsPerMonth = 0;
            let planName = activationPlanId;
            if (activationPlanId.includes('basic')) {
                messageWordLimit = adminWordLimit;
                liveSessionsPerMonth = 0;
                planName = "Basic Monthly";
            } else if (activationPlanId.includes('full') || activationPlanId.includes('premium')) {
                messageWordLimit = 0;
                liveSessionsPerMonth = 4;
                planName = "Full Support Monthly";
            } else if (activationPlanId === 'one_time_session') {
                messageWordLimit = 0;
                liveSessionsPerMonth = 1;
                planName = "One-Time Session";
            }

            // Build payload matching the exact structure from:
            // 1. stripeWebhookHttp.js handleCheckoutSessionCompleted (lines 193-211)
            // 2. PatientQuotas.kt data model (what the mobile app reads)
            // 3. usePayment.ts mockPayment (what the web mock payment writes)
            const updatePayload: Record<string, any> = {
                "patientDetails.quotas.userId": userId,
                "patientDetails.quotas.planId": activationPlanId,
                "patientDetails.quotas.planName": planName,
                "patientDetails.quotas.isActive": true,
                "patientDetails.quotas.requiresPayment": false,
                "patientDetails.quotas.subscriptionStatus": "ACTIVE",
                "patientDetails.quotas.lastPaymentDate": now,
                "patientDetails.quotas.paidUntil": paidUntil,
                "patientDetails.quotas.nextBillingDate": nextBillingDate,
                "patientDetails.quotas.willRenew": false, // manual activation — no auto-renew
                "patientDetails.quotas.currency": "EUR",
                "patientDetails.quotas.quotas": {
                    messageWordLimit,
                    liveSessionsPerMonth
                },
                "patientDetails.quotas.currentUsage": {
                    remainingLiveSessions: liveSessionsPerMonth,
                    lastMessageDate: null
                },
            };

            // Optionally store Stripe customer ID if provided
            if (activationStripeCustomerId.trim()) {
                updatePayload["patientDetails.quotas.stripeCustomerId"] = activationStripeCustomerId.trim();
            }

            await updateDoc(doc(db, "users", userId), updatePayload);

            // Update local state
            setUser((prev: any) => ({
                ...prev,
                patientDetails: {
                    ...prev.patientDetails,
                    quotas: {
                        ...prev.patientDetails?.quotas,
                        planId: activationPlanId,
                        isActive: true,
                        requiresPayment: false,
                        subscriptionStatus: "ACTIVE",
                        lastPaymentDate: now,
                        paidUntil,
                    }
                }
            }));

            toast({
                title: t('admin.user_details.subscription.success_activate'),
                description: t('admin.user_details.subscription.success_activate_desc', {
                    plan: activationPlanId,
                    date: activationDate
                }),
            });
            setShowActivationDialog(false);
        } catch (error) {
            console.error("Error activating subscription:", error);
            toast({
                title: t('admin.user_details.messages.error_title'),
                description: t('admin.user_details.subscription.error_activate'),
                variant: "destructive",
            });
        } finally {
            setProcessing(false);
        }
    };

    if (loading) return <div className="p-8 text-center text-gray-500">{t('admin.users.loading')}</div>;
    if (!user) return <div className="p-8 text-center text-gray-500">{t('common.user_not_found')}</div>;

    const isTherapist = user.role === 'THERAPIST';
    const currentStatus = user.therapistDetails?.profileStatus;

    return (
        <div className="min-h-screen bg-[#F3F4F6] p-4 lg:p-8 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center justify-between mb-8 max-w-4xl mx-auto">
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate("/admin/users")}
                        className="p-2 hover:bg-white rounded-full transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <div>
                        <h1 className="text-3xl text-[#92C7CF] font-kalnia mb-2">{t('admin.user_details.title')}</h1>
                        <p className="text-sm text-gray-500 font-shippori">{t('admin.user_details.subtitle')}</p>
                    </div>
                </div>

                <Button
                    variant={user.isBlocked ? "outline" : "destructive"}
                    onClick={handleToggleBlock}
                    disabled={processing}
                    className="rounded-full px-6"
                >
                    {user.isBlocked ? (
                        <><UserCheck className="w-4 h-4 mr-2" /> {t('admin.user_details.unblock_user')}</>
                    ) : (
                        <><ShieldAlert className="w-4 h-4 mr-2" /> {t('admin.user_details.block_user')}</>
                    )}
                </Button>
            </div>

            <div className="max-w-4xl mx-auto space-y-6">
                {/* Profile Header Card */}
                <Card className="p-8 border-none shadow-md overflow-hidden relative">
                    {user.isBlocked && (
                        <div className="absolute top-0 right-0 p-4">
                            <Badge variant="destructive" className="animate-pulse">{t('admin.user_details.account_blocked')}</Badge>
                        </div>
                    )}
                    <div className="flex flex-col md:flex-row items-center gap-8">
                        <Avatar className="h-32 w-32 border-4 border-white shadow-lg">
                            <AvatarImage src={user.profilePicture || user.photoUrl} />
                            <AvatarFallback className="text-4xl bg-[#92C7CF] text-white">
                                {user.displayName?.charAt(0) || t('admin.user_details.fallback.initial', 'U')}
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 text-center md:text-left">
                            <h2 className="text-3xl font-bold text-gray-900 mb-1">{user.displayName}</h2>
                            <div className="flex flex-wrap gap-2 mb-4 justify-center md:justify-start">
                                    {isTherapist ? (
                                        (() => {
                                            const details = user.therapistDetails;
                                        const rawSpecs = details?.specializations ||
                                            (Array.isArray(details?.specialization) ? details?.specialization : []) ||
                                            (details?.specialization ? [details.specialization] : []);
                                        const specs = normalizeTherapistSpecializationKeys(rawSpecs);

                                        if (specs.length === 0) return (
                                            <span className="text-[#508C96] font-medium text-sm">
                                                {t('admin.user_details.fallback.clinical_psychologist', 'Clinical Psychologist')}
                                            </span>
                                        );

                                        return specs.map((spec: string, index: number) => (
                                            <Badge
                                                key={index}
                                                variant="outline"
                                                className="text-[11px] py-0.5 px-3 font-medium border-[#508C96] text-[#508C96] bg-[#508C96]/5"
                                            >
                                                {t(`therapist.specializations.${spec}`, THERAPIST_SPECIALIZATION_DEFAULT_EN_LABEL[spec]) as string}
                                            </Badge>
                                        ));
                                    })()
                                ) : (
                                    <span className="text-[#508C96] font-medium text-sm">
                                        {t('admin.users.badges.patient', 'Patient')}
                                    </span>
                                )}
                            </div>
                            <div className="flex flex-wrap gap-2 justify-center md:justify-start">
                                <Badge variant="secondary" className="bg-gray-100 text-gray-600 px-3 py-1">
                                    {getRoleLabel(user.role)}
                                </Badge>
                                {isTherapist && (
                                    <Badge
                                        variant={currentStatus === 'APPROVED' ? 'default' : 'outline'}
                                        className={`${currentStatus === 'APPROVED' ? 'bg-green-600 text-white' :
                                            currentStatus === 'REJECTED' ? 'bg-red-600 text-white' :
                                                'text-orange-600 border-orange-200 bg-orange-50'
                                            } px-3 py-1`}
                                    >
                                        {currentStatus === 'APPROVAL_PENDING' ? t('admin.user_details.status.pending_review') :
                                            currentStatus === 'APPROVED' ? t('admin.user_details.status.active') :
                                                currentStatus === 'COOLDOWN' ? t('admin.user_details.status.cooldown') :
                                                    currentStatus === 'REJECTED' ? t('admin.users.badges.rejected') : t('admin.user_details.status.pending_review')}
                                    </Badge>
                                )}
                            </div>
                        </div>
                    </div>
                </Card>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Personal Details Card */}
                    <Card className="p-6 border-none shadow-md">
                        <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
                            <User className="w-5 h-5 text-[#92C7CF]" />
                            {t('admin.user_details.sections.personal')}
                        </h3>
                        <div className="space-y-6">
                            <div className="flex items-center gap-4">
                                <div className="p-2 bg-gray-50 rounded-lg">
                                    <Mail className="w-5 h-5 text-gray-400" />
                                </div>
                                <div className="flex-1 min-w-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">{t('admin.user_details.labels.email')}</p>
                                        <p className="font-medium text-gray-900 truncate">{user.email || t('admin.user_details.fallback.no_email')}</p>
                                    </div>
                                    {user.email ? (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="shrink-0 rounded-full border-[#508C96] text-[#508C96] hover:bg-[#508C96]/10"
                                            onClick={() => setShowVerifyEmailDialog(true)}
                                            disabled={sendingVerifyEmail || user.isBlocked}
                                        >
                                            <Send className="w-4 h-4 mr-2" />
                                            {t("admin.user_details.verification_email.button")}
                                        </Button>
                                    ) : null}
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                <div className="p-2 bg-gray-50 rounded-lg">
                                    <Phone className="w-5 h-5 text-gray-400" />
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">{t('admin.user_details.labels.phone')}</p>
                                    <p className="font-medium text-gray-900">{user.phoneNumber || t('admin.user_details.fallback.no_phone')}</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                <div className="p-2 bg-gray-50 rounded-lg">
                                    <Globe className="w-5 h-5 text-gray-400" />
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">{t('admin.user_details.labels.country')}</p>
                                    <p className="font-medium text-gray-900">{user.country || t('admin.user_details.fallback.no_country')}</p>
                                </div>
                            </div>
                        </div>
                    </Card>

                    {/* Account Information Card */}
                    <Card className="p-6 border-none shadow-md">
                        <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
                            <Calendar className="w-5 h-5 text-[#92C7CF]" />
                            {t('admin.user_details.sections.account')}
                        </h3>
                        <div className="space-y-6">
                            <div className="flex items-center gap-4">
                                <div className="p-2 bg-gray-50 rounded-lg">
                                    <Calendar className="w-5 h-5 text-gray-400" />
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">{t('admin.user_details.labels.member_since')}</p>
                                    <p className="font-medium text-gray-900">
                                        {formatMemberSince(user.createdAt)}
                                    </p>
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                <div className="p-2 bg-gray-50 rounded-lg">
                                    <User className="w-5 h-5 text-gray-400" />
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">{t('admin.user_details.labels.gender')}</p>
                                    <p className="font-medium text-gray-900 capitalize">{user.gender ? t(`gender.${user.gender.toLowerCase()}`, user.gender) as string : t('admin.user_details.status.not_specified') as string}</p>
                                </div>
                            </div>

                            <div className="flex items-center gap-4">
                                <div className="p-2 bg-gray-50 rounded-lg">
                                    <ShieldAlert className="w-5 h-5 text-gray-400" />
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">{t('admin.user_details.labels.status')}</p>
                                    <Badge variant={user.isBlocked ? "destructive" : "outline"} className="mt-1">
                                        {user.isBlocked ? t('admin.user_details.status.blocked') : t('admin.user_details.status.active')}
                                    </Badge>
                                </div>
                            </div>
                        </div>
                    </Card>
                </div>

                {isTherapist && (
                    <>
                        {/* Professional Information Card */}
                        <Card className="p-8 border-none shadow-md">
                            <h3 className="text-lg font-semibold text-gray-900 mb-6">{t('admin.user_details.sections.professional')}</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div>
                                    <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-2">{t('admin.user_details.labels.specialization')}</p>
                                    <div className="flex flex-wrap gap-2">
                                        {(() => {
                                            const rawSpecs =
                                                user.therapistDetails?.specializations ||
                                                user.therapistDetails?.specialization ||
                                                [];
                                            const specs = normalizeTherapistSpecializationKeys(rawSpecs);

                                            if (specs.length === 0) {
                                                return (
                                                    <p className="font-medium text-gray-900 text-lg">
                                                        {t('admin.user_details.fallback.no_specialization')}
                                                    </p>
                                                );
                                            }

                                            return specs.map((spec, index) => (
                                                <Badge key={index} variant="secondary" className="bg-blue-50 text-blue-700">
                                                    {t(`therapist.specializations.${spec}`, THERAPIST_SPECIALIZATION_DEFAULT_EN_LABEL[spec]) as string}
                                                </Badge>
                                            ));
                                        })()}
                                    </div>
                                </div>

                                <div>
                                    <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-2">{t('admin.user_details.labels.license')}</p>
                                    <Badge variant="outline" className="border-[#92C7CF] text-[#508C96] text-sm px-3 py-1">
                                        {user.therapistDetails?.licenseNo || t('admin.user_details.fallback.no_license')}
                                    </Badge>
                                </div>

                                <div className="md:col-span-2">
                                    <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-3">{t('admin.user_details.labels.cv')}</p>
                                    {user.therapistDetails?.cvLink ? (
                                        <a
                                            href={user.therapistDetails.cvLink}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="inline-flex items-center gap-3 p-4 bg-blue-50 text-blue-700 rounded-xl hover:bg-blue-100 transition-colors w-full md:w-auto"
                                        >
                                            <FileText className="w-5 h-5" />
                                            <span className="font-semibold">
                                                {t('admin.user_details.cv_filename', {
                                                    name: (user.displayName || 'therapist').replace(/\s/g, "_")
                                                })}
                                            </span>
                                            <ExternalLink className="w-4 h-4" />
                                        </a>
                                    ) : (
                                        <div className="p-4 bg-gray-50 text-gray-500 rounded-xl flex items-center gap-2 italic">
                                            <FileText className="w-5 h-5" />
                                            {t('admin.user_details.fallback.no_cv')}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </Card>

                        {/* Profile Summary Card */}
                        <Card className="p-8 border-none shadow-md">
                            <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('admin.user_details.sections.summary')}</h3>
                            <div className="p-4 bg-gray-50 rounded-xl italic text-gray-700 leading-relaxed border-l-4 border-[#92C7CF]">
                                "{user.therapistDetails?.profileSummary || t('admin.user_details.fallback.no_summary')}"
                            </div>
                        </Card>

                        {/* Therapist Approval Actions */}
                        <Card className="p-6 border-none shadow-md bg-white">
                            <div className="flex flex-col md:flex-row gap-4 justify-center">
                                <Button
                                    variant="outline"
                                    size="lg"
                                    className={`border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 min-w-[180px] rounded-full ${currentStatus === 'REJECTED' ? 'opacity-50' : ''}`}
                                    onClick={() => handleStatusUpdate('rejected')}
                                    disabled={processing || currentStatus === 'REJECTED'}
                                >
                                    <XCircle className="w-5 h-5 mr-2" />
                                    {currentStatus === 'REJECTED' ? t('admin.user_details.actions.rejected') : t('admin.user_details.actions.reject')}
                                </Button>

                                <Button
                                    size="lg"
                                    className={`bg-green-600 hover:bg-green-700 text-white min-w-[180px] rounded-full shadow-lg shadow-green-200 ${currentStatus === 'APPROVED' ? 'opacity-50' : ''}`}
                                    onClick={() => handleStatusUpdate('approved')}
                                    disabled={processing || currentStatus === 'APPROVED'}
                                >
                                    <CheckCircle className="w-5 h-5 mr-2" />
                                    {currentStatus === 'APPROVED' ? t('admin.user_details.actions.approved') : t('admin.user_details.actions.approve')}
                                </Button>
                            </div>
                        </Card>
                    </>
                )}

                {!isTherapist && (
                    <>
                    {/* Subscription Management Card */}
                    <Card className="p-8 border-none shadow-md">
                        <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
                            <CreditCard className="w-5 h-5 text-[#92C7CF]" />
                            {t('admin.user_details.subscription.title')}
                        </h3>

                        <div className="space-y-4">
                            {/* Current Subscription Status */}
                            <div>
                                <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-2">
                                    {t('admin.user_details.subscription.current_status')}
                                </p>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                                        <p className="text-xs text-gray-500 mb-1">{t('admin.user_details.subscription.status_label')}</p>
                                        <Badge variant={user.patientDetails?.quotas?.isActive ? 'default' : 'outline'}
                                            className={user.patientDetails?.quotas?.isActive ? 'bg-green-600' : 'text-red-500 border-red-200'}>
                                            {user.patientDetails?.quotas?.subscriptionStatus || t('admin.user_details.subscription.no_subscription')}
                                        </Badge>
                                    </div>
                                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                                        <p className="text-xs text-gray-500 mb-1">{t('admin.user_details.subscription.plan_label')}</p>
                                        <p className="font-medium text-gray-900 text-sm">{user.patientDetails?.quotas?.planId || '—'}</p>
                                    </div>
                                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                                        <p className="text-xs text-gray-500 mb-1">{t('admin.user_details.subscription.active_label')}</p>
                                        <p className="font-medium text-sm">{user.patientDetails?.quotas?.isActive ? '✅ ' + t('common.yes') : '❌ ' + t('common.no')}</p>
                                    </div>
                                    <div className="p-3 bg-gray-50 rounded-xl border border-gray-100">
                                        <p className="text-xs text-gray-500 mb-1">Stripe Customer</p>
                                        <p className="font-medium text-gray-900 text-xs truncate">{user.patientDetails?.quotas?.stripeCustomerId || '—'}</p>
                                    </div>
                                </div>
                            </div>

                            {/* Manual Activation */}
                            <div className="pt-4 border-t border-gray-50">
                                <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-3">
                                    {t('admin.user_details.subscription.manual_activation')}
                                </p>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <div>
                                        <label className="text-xs text-gray-500 mb-1 block">{t('admin.user_details.subscription.plan_label')}</label>
                                        <Select value={activationPlanId} onValueChange={setActivationPlanId}>
                                            <SelectTrigger className="rounded-xl border-gray-200">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="basic_monthly">Basic Monthly</SelectItem>
                                                <SelectItem value="full_support_monthly">Full Support Monthly</SelectItem>
                                                <SelectItem value="one_time_session">One-Time Session</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500 mb-1 block">{t('admin.user_details.subscription.next_billing_date')}</label>
                                        <Input
                                            type="date"
                                            value={activationDate}
                                            onChange={(e) => setActivationDate(e.target.value)}
                                            className="rounded-xl border-gray-200"
                                        />
                                    </div>
                                    <div>
                                        <label className="text-xs text-gray-500 mb-1 block">Stripe Customer ID ({t('common.na')})</label>
                                        <Input
                                            type="text"
                                            value={activationStripeCustomerId}
                                            onChange={(e) => setActivationStripeCustomerId(e.target.value)}
                                            placeholder="cus_..."
                                            className="rounded-xl border-gray-200"
                                        />
                                    </div>
                                </div>
                                <Button
                                    onClick={() => setShowActivationDialog(true)}
                                    disabled={processing}
                                    className="mt-3 rounded-xl px-6 bg-green-600 hover:bg-green-700 text-white"
                                >
                                    <CheckCircle className="w-4 h-4 mr-2" />
                                    {t('admin.user_details.subscription.activate_plan')}
                                </Button>
                            </div>
                        </div>
                    </Card>

                    {/* Therapist Assignment Card */}
                    <Card className="p-8 border-none shadow-md">
                        <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center gap-2">
                            <UserCheck className="w-5 h-5 text-[#92C7CF]" />
                            {t('admin.user_details.therapist_assignment')}
                        </h3>
                        
                        <div className="space-y-4">
                            <div>
                                <p className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-2">
                                    {t('admin.user_details.assigned_therapist')}
                                </p>
                                {user.patientDetails?.assignedTherapist ? (
                                    <div className="flex items-center gap-3 p-3 bg-blue-50 rounded-xl border border-blue-100">
                                        <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold">
                                            {allTherapists.find(t => t.id === user.patientDetails.assignedTherapist)?.displayName?.charAt(0) || 'T'}
                                        </div>
                                        <div className="flex-1">
                                            <p className="font-semibold text-blue-900">
                                                {allTherapists.find(t => t.id === user.patientDetails.assignedTherapist)?.displayName || user.patientDetails.assignedTherapist}
                                            </p>
                                            <p className="text-xs text-blue-600">{allTherapists.find(t => t.id === user.patientDetails.assignedTherapist)?.email}</p>
                                        </div>
                                    </div>
                                ) : (
                                    <p className="text-sm text-gray-400 italic bg-gray-50 p-3 rounded-xl border border-gray-100">
                                        {t('admin.user_details.not_assigned')}
                                    </p>
                                )}
                            </div>

                            <div className="pt-4 border-t border-gray-50 flex flex-col gap-3">
                                <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">
                                    {user.patientDetails?.assignedTherapist ? t('admin.user_details.change_therapist') : t('admin.user_details.assign_therapist')}
                                </p>
                                <div className="flex gap-3">
                                    <Select 
                                        value={selectedTherapistId} 
                                        onValueChange={setSelectedTherapistId}
                                    >
                                        <SelectTrigger className="rounded-xl border-gray-200">
                                            <SelectValue placeholder={t('admin.user_details.select_therapist')} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {allTherapists.map((therapist) => (
                                                <SelectItem key={therapist.id} value={therapist.id}>
                                                    {therapist.displayName} ({therapist.email})
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Button 
                                        onClick={() => setShowConfirmDialog(true)}
                                        disabled={!selectedTherapistId || processing}
                                        className="rounded-xl px-6 bg-[#508C96] hover:bg-[#3d6b73]"
                                    >
                                        {user.patientDetails?.assignedTherapist ? t('common.edit') : t('common.submit')}
                                    </Button>
                                </div>
                            </div>
                        </div>
                    </Card>
                    </>
                )}
            </div>

            <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('admin.user_details.assignment_confirmation.title')}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t('admin.user_details.assignment_confirmation.description', {
                                therapistName: allTherapists.find(t => t.id === selectedTherapistId)?.displayName || 'therapist',
                                patientName: user.displayName
                            })}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t('admin.user_details.assignment_confirmation.cancel')}</AlertDialogCancel>
                        <AlertDialogAction 
                            onClick={handleAssignTherapist}
                            className="bg-[#508C96] hover:bg-[#3d6b73]"
                        >
                            {processing ? t('common.saving') : t('admin.user_details.assignment_confirmation.confirm')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={showVerifyEmailDialog} onOpenChange={setShowVerifyEmailDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t("admin.user_details.verification_email.confirm_title")}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t("admin.user_details.verification_email.confirm_description", { email: user?.email || "" })}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={sendingVerifyEmail}>
                            {t("admin.user_details.verification_email.cancel")}
                        </AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => {
                                e.preventDefault();
                                void handleSendVerificationEmail();
                            }}
                            disabled={sendingVerifyEmail}
                            className="bg-[#508C96] hover:bg-[#3d6b73]"
                        >
                            {sendingVerifyEmail ? t("common.saving") : t("admin.user_details.verification_email.confirm_send")}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Manual Activation Confirmation Dialog */}
            <AlertDialog open={showActivationDialog} onOpenChange={setShowActivationDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('admin.user_details.subscription.confirm_activation_title')}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t('admin.user_details.subscription.confirm_activation_desc', {
                                plan: activationPlanId,
                                date: activationDate,
                                patientName: user?.displayName || 'this user'
                            })}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t('admin.user_details.assignment_confirmation.cancel')}</AlertDialogCancel>
                        <AlertDialogAction 
                            onClick={handleManualActivation}
                            className="bg-green-600 hover:bg-green-700"
                        >
                            {processing ? t('common.saving') : t('admin.user_details.subscription.activate_plan')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

export default AdminUserDetails;
