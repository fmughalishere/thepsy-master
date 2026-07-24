import { useState, useEffect } from 'react';
import { fetchAndActivate, getValue } from 'firebase/remote-config';
import { remoteConfig, functions, auth, db } from '@/lib/firebase';
import { doc, onSnapshot, Timestamp, addDoc, collection, updateDoc, getDoc, query, where, getDocs } from 'firebase/firestore';
import { httpsCallable, FunctionsError } from 'firebase/functions';
import {
    mergePlanWithPriceOverride, mergeAddonWithPriceOverride,
    PRICING_PLANS_DOC, PRICING_ADDONS_DOC,
    type PlanPriceOverrideMap, type AddonPriceOverrideMap,
} from '@/lib/pricingOverrides';
import type {
    TherapySessionConfig, TherapySessionPlan, SessionPaymentMethod,
    PlusConfigSelection, SessionFrequency, SessionType,
    CouponValidationResult, Coupon, AddonConfig
} from '@/types/payment';
import { useTranslation } from 'react-i18next';

export enum PaymentStep {
    Subscription = 'subscription',
    PlusConfig = 'plus_config',
    PaymentMethod = 'payment_method',
    Summary = 'summary',
    Processing = 'processing',
    Success = 'success'
}

export interface PaymentState {
    currentStep: PaymentStep;
    selectedPlan: TherapySessionPlan | null;
    selectedPaymentMethod: any | null;
    plans: TherapySessionPlan[];
    paymentMethods: any[];
    isLoading: boolean;
    error: string | null;
    expandedPlanId: string | null;
    paymentSuccessful: boolean;
    checkoutUrl: string | null;
    config: TherapySessionConfig | null;
    packages: Record<string, any>;
    // Plus plan config
    plusConfig: PlusConfigSelection | null;
    // Coupon
    couponCode: string;
    couponResult: CouponValidationResult | null;
    isCouponLoading: boolean;
    // Addons
    availableAddons: AddonConfig[];
    selectedAddons: string[];
    priceOverrides: { plans: PlanPriceOverrideMap; addons: AddonPriceOverrideMap };
}

interface SubscriptionListenerOptions {
    paymentLabel?: string;
    paymentId?: string;
    plansSnapshot?: TherapySessionPlan[];
}

function getCallableErrorMessage(error: any, fallback: string): string {
    if (error instanceof FunctionsError || error?.code?.startsWith?.('functions/')) {
        const code: string = error.code || '';
        const message: string = error.message || '';
        if (code.endsWith('internal') || code.endsWith('unknown') || message.toLowerCase() === 'internal') {
            return `${fallback} (please try again, or contact support if this persists)`;
        }
        return message || fallback;
    }
    return error?.message || fallback;
}

function getAddonNumericPrice(addon: AddonConfig | undefined): number | null {
    if (!addon) return null;
    if (typeof addon.price === 'number' && !Number.isNaN(addon.price)) return addon.price;
    const parsed = parseFloat(addon.price as any);
    return Number.isNaN(parsed) ? null : parsed;
}

export const usePayment = () => {
    const [state, setState] = useState<PaymentState>({
        currentStep: PaymentStep.Subscription,
        selectedPlan: null,
        selectedPaymentMethod: null,
        plans: [],
        paymentMethods: [],
        isLoading: false,
        error: null,
        expandedPlanId: null,
        paymentSuccessful: false,
        checkoutUrl: null,
        config: null,
        packages: {},
        plusConfig: null,
        couponCode: '',
        couponResult: null,
        isCouponLoading: false,
        availableAddons: [],
        selectedAddons: [],
        priceOverrides: { plans: {}, addons: {} },
    });

    const { t, i18n } = useTranslation();

    const fetchPaymentConfig = async (): Promise<TherapySessionConfig | null> => {
        try {
            setState(prev => ({ ...prev, isLoading: true, error: null }));

            const isLocalhost =
                window.location.hostname === 'localhost' ||
                window.location.hostname === '127.0.0.1' ||
                window.location.hostname === '';

            const debugLog = (...args: any[]) => {
                if (isLocalhost) console.log(...args);
            };

            const useDebugPaymentsRc = isLocalhost;
            const configKey = useDebugPaymentsRc ? 'debug_payments' : 'payments';

            debugLog(`🔍 Fetching Remote Config: '${configKey}'`);

            await fetchAndActivate(remoteConfig);

            const packagesValue = getValue(remoteConfig, 'packages');
            const packagesString = packagesValue.asString();
            let packagesConfig = {};
            if (packagesString) {
                try { packagesConfig = JSON.parse(packagesString); } catch (e) { /* ignore malformed packages json */ }
            }

            let configValue = getValue(remoteConfig, configKey);
            let configString = configValue.asString();

            if (!configString && configKey === 'debug_payments') {
                configValue = getValue(remoteConfig, 'payments');
                configString = configValue.asString();
            }

            if (!configString) {
                throw new Error('Payment configuration not found in Remote Config');
            }

            const config: TherapySessionConfig = JSON.parse(configString);
            const lang = i18n.language ? i18n.language.split('-')[0] : 'en';

            const getPlans = (l: string) => (config as any)[`therapy_session_plans_${l}`] as TherapySessionPlan[] | undefined;
            const getMethods = (l: string) => (config as any)[`session_payment_methods_${l}`] as SessionPaymentMethod[] | undefined;

            const selectedPlans = getPlans(lang) || getPlans('en') || [];
            const selectedMethods = getMethods(lang) || getMethods('en') || [];
            const addons: AddonConfig[] = config.addons || [];
            const localizedAddons = addons.map(a => ({
                ...a,
                name: t(`payment.addon_catalog.${a.id}.name`, a.name),
                description: t(`payment.addon_catalog.${a.id}.description`, a.description),
            }));

            setState(prev => ({
                ...prev,
                plans: selectedPlans.map(p => mergePlanWithPriceOverride(p, prev.priceOverrides.plans[p.id])),
                paymentMethods: selectedMethods.filter(m => m.enabled),
                isLoading: false,
                config: config,
                packages: packagesConfig,
                availableAddons: localizedAddons.map(a => mergeAddonWithPriceOverride(a, prev.priceOverrides.addons[a.id])),
            }));

            return config;
        } catch (error: any) {
            console.error('❌ Error fetching payment config:', error);
            setState(prev => ({
                ...prev,
                isLoading: false,
                error: error.message || 'Failed to load payment configuration'
            }));
            return null;
        }
    };

    useEffect(() => {
        fetchPaymentConfig();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [i18n.language]);

    useEffect(() => {
        const unsubPlans = onSnapshot(PRICING_PLANS_DOC, (snap) => {
            const overrides = (snap.data() as any) || {};
            setState(prev => ({
                ...prev,
                priceOverrides: { ...prev.priceOverrides, plans: overrides },
                plans: prev.plans.map(p => mergePlanWithPriceOverride(p, overrides[p.id])),
                selectedPlan: prev.selectedPlan
                    ? mergePlanWithPriceOverride(prev.selectedPlan, overrides[prev.selectedPlan.id])
                    : prev.selectedPlan,
            }));
        });
        const unsubAddons = onSnapshot(PRICING_ADDONS_DOC, (snap) => {
            const overrides = (snap.data() as any) || {};
            setState(prev => ({
                ...prev,
                priceOverrides: { ...prev.priceOverrides, addons: overrides },
                availableAddons: prev.availableAddons.map(a => mergeAddonWithPriceOverride(a, overrides[a.id])),
            }));
        });
        return () => { unsubPlans(); unsubAddons(); };
    }, []);

    const selectPlan = (plan: TherapySessionPlan) => {
        setState(prev => ({
            ...prev,
            selectedPlan: plan,
            expandedPlanId: plan.id,
            plusConfig: null,
            couponResult: null,
            couponCode: '',
            selectedAddons: [],
        }));
    };

    const selectFrequencyPlan = (plan: TherapySessionPlan, groupId: string, frequency: SessionFrequency) => {
        setState(prev => ({
            ...prev,
            selectedPlan: plan,
            expandedPlanId: groupId,
            plusConfig: { ...(prev.plusConfig || {}), frequency } as PlusConfigSelection,
            couponResult: null,
            couponCode: '',
        }));
    };

    const selectPaymentMethod = (method: any) => {
        setState(prev => ({ ...prev, selectedPaymentMethod: method }));
    };

    const togglePlanExpansion = (planId: string | null) => {
        setState(prev => ({
            ...prev,
            expandedPlanId: prev.expandedPlanId === planId ? null : planId
        }));
    };

    const setPlusConfig = (config: PlusConfigSelection) => {
        setState(prev => ({ ...prev, plusConfig: config }));
    };

    const toggleAddon = (addonId: string) => {
        setState(prev => ({
            ...prev,
            selectedAddons: prev.selectedAddons.includes(addonId)
                ? prev.selectedAddons.filter(id => id !== addonId)
                : [...prev.selectedAddons, addonId]
        }));
    };

    const proceedFromPlanSelection = () => {
        if (!state.selectedPlan) {
            setState(prev => ({ ...prev, error: 'Please select a plan' }));
            return;
        }

        const needsFrequency = state.selectedPlan.requires_frequency_selection;
        const needsSessionType = state.selectedPlan.requires_session_type_selection;

        // If plan has addons available, it should still go to config step to let user pick them
        const hasAddons = state.availableAddons.length > 0;

        if (needsFrequency || needsSessionType || hasAddons) {
            setState(prev => ({ ...prev, currentStep: PaymentStep.PlusConfig, error: null }));
        } else {
            setState(prev => ({ ...prev, currentStep: PaymentStep.PaymentMethod, error: null }));
        }
    };

    const proceedFromPlusConfig = () => {
        const plan = state.selectedPlan;
        const needsFrequency = plan?.requires_frequency_selection;
        const needsSessionType = plan?.requires_session_type_selection;

        if (needsFrequency && !state.plusConfig?.frequency) {
            setState(prev => ({ ...prev, error: 'Please select frequency' }));
            return;
        }

        if (needsSessionType && !state.plusConfig?.session_type) {
            setState(prev => ({ ...prev, error: 'Please select session type' }));
            return;
        }

        setState(prev => ({ ...prev, currentStep: PaymentStep.PaymentMethod, error: null }));
    };

    const proceedToPaymentMethod = () => {
        proceedFromPlanSelection();
    };

    const proceedToSummary = () => {
        if (!state.selectedPaymentMethod) {
            setState(prev => ({ ...prev, error: 'Please select a payment method' }));
            return;
        }
        setState(prev => ({ ...prev, currentStep: PaymentStep.Summary, error: null }));
    };

    const setCouponCode = (code: string) => {
        setState(prev => ({ ...prev, couponCode: code, couponResult: null }));
    };

    const validateCoupon = async () => {
        if (!state.couponCode.trim()) return;
        if (!state.selectedPlan) {
            setState(prev => ({ ...prev, couponResult: { valid: false, error: 'No plan selected' } }));
            return;
        }

        setState(prev => ({ ...prev, isCouponLoading: true, couponResult: null }));

        try {
            const code = state.couponCode.trim().toUpperCase();
            const userId = auth.currentUser?.uid;
            const userEmail = auth.currentUser?.email?.trim().toLowerCase();
            const couponsRef = collection(db, 'coupons');
            const q = query(couponsRef, where('code', '==', code), where('status', '==', 'active'));
            const snap = await getDocs(q);

            if (snap.empty) {
                setState(prev => ({
                    ...prev,
                    isCouponLoading: false,
                    couponResult: { valid: false, error: 'Coupon code is invalid.' }
                }));
                return;
            }

            const couponDoc = snap.docs[0];
            const coupon = { id: couponDoc.id, ...couponDoc.data() } as Coupon;
            if (coupon.restricted_to_email) {
                const assignedEmail = coupon.restricted_to_email.trim().toLowerCase();
                if (!userEmail || userEmail !== assignedEmail) {
                    setState(prev => ({
                        ...prev,
                        isCouponLoading: false,
                        couponResult: { valid: false, error: 'Coupon code is invalid.' }
                    }));
                    return;
                }
            }

            const now = new Date();
            const startDate = new Date(coupon.start_date);
            const expiryDate = new Date(coupon.expiry_date);

            if (now < startDate) {
                setState(prev => ({ ...prev, isCouponLoading: false, couponResult: { valid: false, error: 'Coupon is not yet active.' } }));
                return;
            }
            if (now > expiryDate) {
                setState(prev => ({ ...prev, isCouponLoading: false, couponResult: { valid: false, error: 'Coupon code has expired.' } }));
                return;
            }

            if (!coupon.unlimited_usage && coupon.max_redemptions != null) {
                const totalUsed = coupon.total_redemptions || 0;
                if (totalUsed >= coupon.max_redemptions) {
                    setState(prev => ({ ...prev, isCouponLoading: false, couponResult: { valid: false, error: 'Coupon usage limit has been reached.' } }));
                    return;
                }
            }

            if (coupon.applicable_plans !== 'all' && Array.isArray(coupon.applicable_plans)) {
                if (!coupon.applicable_plans.includes(state.selectedPlan.id)) {
                    setState(prev => ({ ...prev, isCouponLoading: false, couponResult: { valid: false, error: 'Coupon code is not valid for this package.' } }));
                    return;
                }
            }

            if (userId && (coupon.one_time_per_customer || (coupon.max_per_customer && coupon.max_per_customer > 0))) {
                const redemptionsRef = collection(db, 'coupon_redemptions');
                const userQ = query(redemptionsRef, where('coupon_id', '==', coupon.id), where('user_id', '==', userId));
                const userSnap = await getDocs(userQ);
                const userUsed = userSnap.size;

                if (coupon.one_time_per_customer && userUsed >= 1) {
                    setState(prev => ({ ...prev, isCouponLoading: false, couponResult: { valid: false, error: 'You have already used this coupon.' } }));
                    return;
                }
                if (coupon.max_per_customer && userUsed >= coupon.max_per_customer) {
                    setState(prev => ({ ...prev, isCouponLoading: false, couponResult: { valid: false, error: 'You have reached the maximum uses for this coupon.' } }));
                    return;
                }
            }

            const planPrice = getBasePrice();
            if (coupon.min_order_value && planPrice < coupon.min_order_value) {
                setState(prev => ({ ...prev, isCouponLoading: false, couponResult: { valid: false, error: `Minimum order value of €${coupon.min_order_value} required.` } }));
                return;
            }

            let discountAmount = 0;
            if (coupon.discount_type === 'percentage') {
                discountAmount = (planPrice * coupon.discount_value) / 100;
            } else {
                discountAmount = Math.min(coupon.discount_value, planPrice);
            }
            const finalPrice = Math.max(0, planPrice - discountAmount);

            setState(prev => ({
                ...prev,
                isCouponLoading: false,
                couponResult: {
                    valid: true,
                    discount_amount: discountAmount,
                    final_price: finalPrice,
                    coupon
                }
            }));
        } catch (error: any) {
            console.error('Coupon validation error:', error);
            setState(prev => ({
                ...prev,
                isCouponLoading: false,
                couponResult: { valid: false, error: 'Failed to validate coupon. Try again.' }
            }));
        }
    };

    const removeCoupon = () => {
        setState(prev => ({ ...prev, couponCode: '', couponResult: null }));
    };

    const getBasePrice = (): number => {
        const plan = state.selectedPlan;
        if (!plan) return 0;
        const frequency = state.plusConfig?.frequency;
        if (plan.frequency_prices && frequency && typeof plan.frequency_prices[frequency] === 'number') {
            return plan.frequency_prices[frequency] as number;
        }
        return plan.actual_charge ?? plan.price;
    };

    const getAddonsTotal = (): number => {
        return state.selectedAddons.reduce((sum, addonId) => {
            const addon = state.availableAddons.find(a => a.id === addonId);
            const price = getAddonNumericPrice(addon);
            return sum + (price ?? 0);
        }, 0);
    };

    const getFinalPrice = (): number => {
        if (!state.selectedPlan) return 0;
        const subtotal = getBasePrice() + getAddonsTotal();
        if (state.couponResult?.valid && typeof state.couponResult.discount_amount === 'number') {
            return Math.max(0, subtotal - state.couponResult.discount_amount);
        }
        return subtotal;
    };
    const validateSelectedAddonsHavePrices = (): string | null => {
        for (const addonId of state.selectedAddons) {
            const addon = state.availableAddons.find(a => a.id === addonId);
            const price = getAddonNumericPrice(addon);
            if (price === null) {
                return `"${addon?.name || addonId}" doesn't have a finalized price yet. Please remove it or choose another add-on.`;
            }
        }
        return null;
    };

    const initiatePayment = async () => {
        const plan = state.selectedPlan;
        const method = state.selectedPaymentMethod;

        if (!plan || !method) {
            setState(prev => ({ ...prev, error: 'Please select a plan and payment method' }));
            return;
        }

        const addonError = validateSelectedAddonsHavePrices();
        if (addonError) {
            setState(prev => ({ ...prev, error: addonError }));
            return;
        }

        try {
            setState(prev => ({
                ...prev,
                currentStep: PaymentStep.Processing,
                isLoading: true,
                error: null
            }));

            if (!auth.currentUser) throw new Error('User not logged in');

            const listenerOptions: SubscriptionListenerOptions = {
                paymentLabel: method.display_name || method.name,
                paymentId: method.id,
                plansSnapshot: state.plans
            };

            const finalPrice = getFinalPrice();
            const couponCode = state.couponResult?.valid ? state.couponCode : undefined;

            if (method.id === 'paypal_checkout') {
                // PayPal checkout is currently DISABLED server-side
                // (see functions/index.js — createPayPalCheckout export is
                // commented out until PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET
                // secrets are created). Re-enable this block once that
                // function is deployed, and call it the same way
                // createCheckoutSession is called below (fetch + Bearer token).
                throw new Error('PayPal checkout is temporarily unavailable. Please use another payment method.');
            }

            // ---- Stripe checkout ----
            // NOTE: createCheckoutSession is an onRequest (plain HTTPS) Cloud
            // Function, NOT an onCall callable — it parses the Firebase Auth
            // token itself from the Authorization header and expects a plain
            // JSON body (not the httpsCallable wrapper format). It must be
            // called with fetch(), not httpsCallable().
            const frequency = state.plusConfig?.frequency;
            const priceId = (frequency && plan.frequency_stripe_price_ids?.[frequency])
                || plan.stripe_price_id;

            if (!priceId) {
                throw new Error('Plan configuration error: Missing Stripe Price ID for this plan/frequency.');
            }

            const token = await auth.currentUser.getIdToken(true);
            const projectId = auth.app?.options?.projectId || import.meta.env.VITE_FIREBASE_PROJECT_ID || 'testing-d74ed';
            const isTest = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

            const stripeFetchUrl = `https://europe-west1-${projectId}.cloudfunctions.net/createCheckoutSession`;

            const response = await fetch(stripeFetchUrl, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    planId: plan.id,
                    priceId,
                    planName: plan.name,
                    mode: plan.plan_type || 'subscription',
                    successUrl: `${window.location.origin}/payment-success`,
                    cancelUrl: `${window.location.origin}/payment`,
                    isTest,
                    couponCode,
                    plusConfig: state.plusConfig,
                    selectedAddons: state.selectedAddons,
                }),
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Checkout session failed: ${errText}`);
            }

            const data: { url?: string; sessionId?: string } = await response.json();
            if (!data?.url) throw new Error('No checkout URL was returned. Please try again.');

            setState(prev => ({ ...prev, checkoutUrl: data.url as string, isLoading: true }));
            window.location.href = data.url;
            startListeningForSubscription(listenerOptions);

        } catch (error: any) {
            console.error('Payment processing failed:', error);
            const message = getCallableErrorMessage(error, 'Payment processing failed');
            setState(prev => ({
                ...prev,
                isLoading: false,
                error: message,
                currentStep: PaymentStep.Summary
            }));
        }
    };

    const startListeningForSubscription = (options?: SubscriptionListenerOptions) => {
        if (!auth.currentUser) return;

        const userDocRef = doc(db, 'users', auth.currentUser.uid);
        const paymentLabel = options?.paymentLabel || state.selectedPaymentMethod?.display_name || 'Stripe';
        const paymentId = options?.paymentId || state.selectedPaymentMethod?.id || 'stripe_checkout';
        const plansSnapshot = options?.plansSnapshot || state.plans;

        const unsubscribe = onSnapshot(userDocRef, (docSnapshot) => {
            if (docSnapshot.exists()) {
                const userData = docSnapshot.data();
                const quotas = userData.patientDetails?.quotas;
                const isActive = quotas?.isActive === true;
                const subscriptionStatus = quotas?.subscriptionStatus;
                const isActiveStatus = subscriptionStatus === 'ACTIVE' || subscriptionStatus === 'TRIAL';

                if (isActive || isActiveStatus) {
                    setState(prev => ({
                        ...prev,
                        isLoading: false,
                        paymentSuccessful: true,
                        currentStep: PaymentStep.Success,
                        checkoutUrl: null
                    }));

                    const planId = quotas?.planId;
                    let planName = quotas?.planName;
                    let amount = "Paid";
                    const originalPrice = state.selectedPlan?.actual_charge || state.selectedPlan?.price || 0;
                    const discountAmount = state.couponResult?.valid ? (state.couponResult.discount_amount || 0) : 0;
                    const finalPrice = getFinalPrice();

                    if (!planName || planName === "Unknown Plan") {
                        const foundPlan = plansSnapshot.find(p => p.id === planId);
                        if (foundPlan) {
                            planName = foundPlan.name;
                            amount = foundPlan.display_price || "Paid";
                        }
                    }

                    const transactionData: any = {
                        userId: auth.currentUser?.uid,
                        userName: auth.currentUser?.displayName || "Unknown User",
                        userEmail: auth.currentUser?.email || "Unknown Email",
                        planName: planName || "Unknown Plan",
                        amount: `€${finalPrice.toFixed(2)}`,
                        original_price: originalPrice,
                        discount_amount: discountAmount,
                        final_charged: finalPrice,
                        status: "Completed",
                        timestamp: Timestamp.now(),
                        paymentMethod: paymentLabel,
                        paymentProvider: paymentId,
                        planId: planId,
                        plusConfig: state.plusConfig || null,
                        selectedAddons: state.selectedAddons || [],
                    };

                    if (state.couponResult?.valid && state.couponCode) {
                        transactionData.coupon_code = state.couponCode;
                        transactionData.coupon_id = state.couponResult.coupon?.id;
                    }

                    addDoc(collection(db, 'transactions'), transactionData)
                        .then(async (txDoc) => {
                            // Record coupon redemption
                            if (state.couponResult?.valid && state.couponResult.coupon && auth.currentUser) {
                                const redemption = {
                                    coupon_id: state.couponResult.coupon.id,
                                    coupon_code: state.couponCode.toUpperCase(),
                                    user_id: auth.currentUser.uid,
                                    plan_purchased: state.selectedPlan?.id || '',
                                    original_price: originalPrice,
                                    discount_amount: discountAmount,
                                    final_price: finalPrice,
                                    transaction_id: txDoc.id,
                                    redeemed_at: new Date().toISOString(),
                                };
                                await addDoc(collection(db, 'coupon_redemptions'), redemption);
                                const couponRef = doc(db, 'coupons', state.couponResult.coupon.id!);
                                const couponSnap = await getDoc(couponRef);
                                if (couponSnap.exists()) {
                                    const current = couponSnap.data();
                                    await updateDoc(couponRef, {
                                        total_redemptions: (current.total_redemptions || 0) + 1,
                                        total_discount_given: (current.total_discount_given || 0) + discountAmount,
                                    });
                                }
                            }
                        })
                        .catch(err => console.error('Failed to record transaction:', err));

                    unsubscribe();
                }
            }
        }, (error) => {
            console.error('Firestore listener error:', error);
        });

        setTimeout(() => {
            unsubscribe();
            setState(prev => ({
                ...prev,
                isLoading: false,
                error: 'Payment verification timeout. Please check your subscription status.'
            }));
        }, 300000);
    };

    const goBack = () => {
        const previousStep = {
            [PaymentStep.PlusConfig]: PaymentStep.Subscription,
            [PaymentStep.PaymentMethod]: state.selectedPlan?.requires_frequency_selection ? PaymentStep.PlusConfig : PaymentStep.Subscription,
            [PaymentStep.Summary]: PaymentStep.PaymentMethod,
            [PaymentStep.Processing]: PaymentStep.Summary,
        }[state.currentStep];

        if (previousStep !== undefined) {
            setState(prev => ({ ...prev, currentStep: previousStep, error: null, checkoutUrl: null }));
        }
    };

    const clearCheckoutUrl = () => setState(prev => ({ ...prev, checkoutUrl: null }));
    const clearError = () => setState(prev => ({ ...prev, error: null }));

    const mockPayment = async () => {
        if (!state.selectedPlan || !auth.currentUser) return;
        setState(prev => ({ ...prev, isLoading: true }));
        try {
            const userDocRef = doc(db, 'users', auth.currentUser!.uid);
            const quotas = state.selectedPlan.quotas;
            await updateDoc(userDocRef, {
                'patientDetails.quotas': {
                    userId: auth.currentUser!.uid,
                    planId: state.selectedPlan.id,
                    planName: state.selectedPlan.name,
                    planCategory: state.selectedPlan.plan_category || 'basic',
                    isActive: true,
                    subscriptionStatus: 'ACTIVE',
                    quotas: {
                        messageWordLimit: quotas.message_word_limit,
                        liveSessionsPerMonth: quotas.live_sessions_per_month,
                        sessionDurationMinutes: quotas.session_duration_minutes || 60,
                    },
                    currentUsage: { remainingLiveSessions: quotas.live_sessions_per_month, lastMessageDate: null },
                    plusConfig: state.plusConfig || null,
                    selectedAddons: state.selectedAddons || [],
                    pricePerWeek: getBasePrice(),
                    currency: 'EUR',
                    features: [],
                    willRenew: true,
                    requiresPayment: false,
                    mockPayment: true,
                    lastPaymentDate: new Date().toISOString(),
                    nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
                }
            });
            await new Promise(resolve => setTimeout(resolve, 1000));
            setState(prev => ({ ...prev, isLoading: false, currentStep: PaymentStep.Success }));
        } catch (error: any) {
            setState(prev => ({ ...prev, isLoading: false, error: error.message || 'Mock payment failed' }));
        }
    };

    const isLocalhost = () =>
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname === '';

    return {
        state,
        selectPlan,
        selectFrequencyPlan,
        selectPaymentMethod,
        togglePlanExpansion,
        setPlusConfig,
        toggleAddon,
        proceedToPaymentMethod,
        proceedFromPlusConfig,
        proceedToSummary,
        initiatePayment,
        goBack,
        clearCheckoutUrl,
        clearError,
        mockPayment,
        isLocalhost,
        setCouponCode,
        validateCoupon,
        removeCoupon,
        getFinalPrice,
        getBasePrice,
    };
};