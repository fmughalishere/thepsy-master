import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePayment, PaymentStep } from '@/hooks/usePayment';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Check, ChevronDown, LogOut, AlertCircle, Tag, X, Loader2, Users, User, Clock, Home } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import type { TherapySessionPlan, SessionFrequency, SessionType, AddonConfig } from '@/types/payment';
import { auth, logAnalyticsEvent } from '@/lib/firebase';
import { signOut } from 'firebase/auth';

const ROOM_CATEGORIES = [
    'Loneliness',
    'Men',
    'Women',
    'Parents',
    'Mothers',
    'Fathers',
    'Anxiety',
    'Depression',
    'LGBTQ+',
];

const getFrequencies = (t: (key: string) => string): { value: SessionFrequency; label: string; sublabel: string }[] => [
    { value: 'weekly', label: t('payment.plan.freq_weekly_label'), sublabel: t('payment.plan.freq_weekly_sub') },
    { value: 'bimonthly', label: t('payment.plan.freq_bimonthly_label'), sublabel: t('payment.plan.freq_bimonthly_sub') },
    { value: 'monthly', label: t('payment.plan.freq_monthly_label'), sublabel: t('payment.plan.freq_monthly_sub') },
];

const isRoomsAddon = (addon: AddonConfig) =>
    addon.id === 'rooms' || addon.name?.toLowerCase().includes('room');
const getFrequencyKey = (p: TherapySessionPlan): SessionFrequency => {
    if (p.billing_period === 'weekly') return 'weekly';
    const sessionsPerMonth = (p as any).quotas?.live_sessions_per_month;
    if (sessionsPerMonth === 2) return 'bimonthly';
    return 'monthly';
};

const getCategoryDisplayNames = (t: (key: string) => string): Record<string, string> => ({
    plus: t('payment.categories.plus_plan'),
    coaching: t('payment.categories.coaching'),
    therapy_couples: t('payment.categories.therapy_couples'),
});

interface DisplayPlanGroup {
    card: TherapySessionPlan;
    frequencyPlanMap?: Partial<Record<SessionFrequency, TherapySessionPlan>>;
}

const buildDisplayGroups = (categoryPlans: TherapySessionPlan[], t: (key: string) => string): DisplayPlanGroup[] => {
    const byCategory: Record<string, TherapySessionPlan[]> = {};
    categoryPlans.forEach(p => {
        const cat = p.plan_category || 'basic';
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(p);
    });

    const categoryDisplayNames = getCategoryDisplayNames(t);
    const groups: DisplayPlanGroup[] = [];
    Object.entries(byCategory).forEach(([cat, plansInCat]) => {
        if (plansInCat.length > 1) {
            const frequencyPlanMap: Partial<Record<SessionFrequency, TherapySessionPlan>> = {};
            plansInCat.forEach(p => {
                frequencyPlanMap[getFrequencyKey(p)] = p;
            });
            const primary = frequencyPlanMap.weekly || plansInCat[0];
            const virtualPlan: any = {
                ...primary,
                id: `group_${cat}`,
                name: categoryDisplayNames[cat] || primary.name,
                requires_frequency_selection: true,
                available_frequencies: Object.keys(frequencyPlanMap),
                frequency_prices: Object.fromEntries(
                    Object.entries(frequencyPlanMap).map(([k, p]) => [k, (p as TherapySessionPlan).price])
                ),
                features: primary.features,
                display_price: undefined,
                display_billing: undefined,
            };
            groups.push({ card: virtualPlan, frequencyPlanMap });
        } else {
            groups.push({ card: plansInCat[0] });
        }
    });
    return groups;
};

const filterAddonsForPlan = (addons: AddonConfig[], plan: TherapySessionPlan | null) => {
    if (!plan) return [];
    return addons.filter(a =>
        a.available_for_plans === undefined ||
        (a.available_for_plans as string[]).includes(plan.id) ||
        (a.available_for_plans as string[]).includes(plan.plan_category || '') ||
        (a.available_for_plans as string[]).includes('all')
    );
};

const Payment = () => {

    const navigate = useNavigate();
    const { t } = useTranslation();
    const {
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
    } = usePayment();

    useEffect(() => {
        logAnalyticsEvent("view_payment_screen");
        const params = new URLSearchParams(window.location.search);
        if (params.get('platform') === 'mobile') {
            window.location.href = "psycmp://payment";
        }
    }, []);

    useEffect(() => {
        if (state.error) {
            toast({ title: t('common.error'), description: state.error, variant: "destructive" });
            clearError();
        }
    }, [state.error]);

    if (state.isLoading && state.currentStep !== PaymentStep.Subscription) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white/80">
                <div className="text-center p-6 bg-white rounded-2xl shadow-xl border border-gray-100 max-w-sm mx-4">
                    <div className="animate-spin h-12 w-12 border-4 border-[#92C7CF] rounded-full border-t-transparent mx-auto mb-4"></div>
                    <p className="text-lg font-medium text-gray-800">{t('payment.summary.processing')}</p>
                    <p className="text-sm text-gray-500 mt-2 mb-6">{t('payment.processing_overlay.desc')}</p>
                    {state.checkoutUrl && (
                        <div className="space-y-3">
                            <p className="text-sm text-gray-600">{t('payment.processing_overlay.popup_failed')}</p>
                            <Button
                                onClick={() => window.location.href = state.checkoutUrl!}
                                className="w-full bg-[#92C7CF] hover:bg-[#7FB0B8] text-white rounded-full"
                            >
                                {t('payment.processing_overlay.click_here')}
                            </Button>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-white">
            {state.currentStep === PaymentStep.Subscription && (
                <SubscriptionSelector
                    plans={state.plans}
                    expandedPlanId={state.expandedPlanId}
                    selectedPlan={state.selectedPlan}
                    onExpand={togglePlanExpansion}
                    onPlanSelected={selectPlan}
                    onContinue={proceedToPaymentMethod}
                    availableAddons={state.availableAddons}
                    selectedAddons={state.selectedAddons}
                    onToggleAddon={toggleAddon}
                    plusConfig={state.plusConfig}
                    onConfigChange={setPlusConfig}
                    onSelectFrequencyPlan={selectFrequencyPlan}
                />
            )}

            {state.currentStep === PaymentStep.PlusConfig && (
                <PlusConfigStep
                    selectedPlan={state.selectedPlan!}
                    plusConfig={state.plusConfig}
                    onConfigChange={setPlusConfig}
                    onContinue={proceedFromPlusConfig}
                    onBack={goBack}
                    availableAddons={filterAddonsForPlan(state.availableAddons, state.selectedPlan)}
                    selectedAddons={state.selectedAddons}
                    onToggleAddon={toggleAddon}
                />
            )}

            {state.currentStep === PaymentStep.PaymentMethod && (
                <PaymentMethodSelector
                    selectedPlan={state.selectedPlan!}
                    paymentMethods={state.paymentMethods}
                    selectedMethod={state.selectedPaymentMethod}
                    onMethodSelected={selectPaymentMethod}
                    onContinue={proceedToSummary}
                    onBack={goBack}
                />
            )}

            {(state.currentStep === PaymentStep.Summary || state.currentStep === PaymentStep.Processing) && (
                <InvoiceSummary
                    selectedPlan={state.selectedPlan!}
                    paymentMethodName={state.selectedPaymentMethod?.display_name || 'Card'}
                    onConfirm={initiatePayment}
                    onBack={goBack}
                    isLoading={state.isLoading}
                    mockPayment={mockPayment}
                    isLocalhost={isLocalhost()}
                    plusConfig={state.plusConfig}
                    couponCode={state.couponCode}
                    couponResult={state.couponResult}
                    isCouponLoading={state.isCouponLoading}
                    onCouponCodeChange={setCouponCode}
                    onApplyCoupon={validateCoupon}
                    onRemoveCoupon={removeCoupon}
                    getFinalPrice={getFinalPrice}
                    getBasePrice={getBasePrice}
                    selectedAddons={state.selectedAddons}
                    availableAddons={state.availableAddons}
                />
            )}

            {state.currentStep === PaymentStep.Success && (
                <SuccessScreen onContinue={() => {
                    logAnalyticsEvent("payment_complete", {
                        plan: state.selectedPlan?.name,
                        amount: state.selectedPlan?.display_price
                    });
                    navigate('/matching');
                }} />
            )}
        </div>
    );
};

const SubscriptionSelector = ({
    plans, expandedPlanId, selectedPlan, onExpand, onPlanSelected, onContinue,
    availableAddons, selectedAddons, onToggleAddon, plusConfig, onConfigChange,
    onSelectFrequencyPlan,
}: any) => {
    const { t } = useTranslation();
    const navigate = useNavigate();

    const handleLogout = async () => {
        try {
            await signOut(auth);
            navigate('/login');
        } catch (error) {
            toast({ title: t('common.error'), description: "Failed to log out", variant: 'destructive' });
        }
    };

    const groupedPlans: Record<string, TherapySessionPlan[]> = {};
    plans.forEach((plan: TherapySessionPlan) => {
        const cat = plan.plan_category || 'basic';
        if (!groupedPlans[cat]) groupedPlans[cat] = [];
        groupedPlans[cat].push(plan);
    });

    const categoryLabels: Record<string, string> = {
        basic: t('payment.categories.basic'),
        plus: t('payment.categories.plus'),
        coaching: t('payment.categories.coaching'),
        therapy_couples: t('payment.categories.therapy_couples'),
    };
    const canContinue = !!selectedPlan;

    return (
        <div className="relative min-h-screen">
            <div className="flex items-center px-4 py-3 bg-white/50 backdrop-blur-sm sticky top-0 z-10">
                <Button variant="ghost" size="sm" onClick={handleLogout}
                    className="text-gray-500 hover:text-red-500 h-9 rounded-full px-4 hover:bg-red-50">
                    <LogOut className="w-4 h-4 mr-2" />
                    {t('common.logout')}
                </Button>
            </div>

            <div className="max-w-2xl mx-auto px-4 pb-32">
                <h1 className="text-3xl font-bold text-center mb-2">{t('payment.subscription.title')}</h1>
                <p className="text-center text-gray-600 mb-8">{t('payment.subscription.subtitle')}</p>

                <div className="mb-8 p-4 bg-orange-50 rounded-xl border border-orange-200 flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-orange-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-orange-800">
                        {t('payment.subscription.already_paid_disclaimer', 'If you have already paid, please contact us at info@thepsy.de')}
                    </p>
                </div>

                {Object.keys(groupedPlans).length > 0 ? (
                    Object.entries(groupedPlans).map(([category, categoryPlans]) => {
                        const displayGroups = buildDisplayGroups(categoryPlans, t);
                        return (
                            <div key={category} className="mb-6">
                                <div className="flex items-center gap-2 mb-3">
                                    <span className="text-xs font-semibold uppercase tracking-wider text-gray-400 bg-gray-100 px-3 py-1 rounded-full">
                                        {categoryLabels[category] || category}
                                    </span>
                                </div>
                                <div className="space-y-3">
                                    {displayGroups.map(({ card, frequencyPlanMap }) => (
                                        <PlanCard
                                            key={card.id}
                                            plan={card}
                                            expanded={expandedPlanId === card.id}
                                            onClick={() => {
                                                onExpand(card.id);
                                                if (!frequencyPlanMap) onPlanSelected({ ...card, requires_frequency_selection: true });
                                            }}
                                            plusConfig={plusConfig}
                                            onConfigChange={onConfigChange}
                                            frequencyPlanMap={frequencyPlanMap}
                                            onSelectFrequencyPlan={onSelectFrequencyPlan}
                                        />
                                    ))}
                                </div>
                            </div>
                        );
                    })
                ) : (
                    <div className="space-y-4">
                        {buildDisplayGroups(plans, t).map(({ card, frequencyPlanMap }) => (
                            <PlanCard
                                key={card.id}
                                plan={card}
                                expanded={expandedPlanId === card.id}
                                onClick={() => {
                                    onExpand(card.id);
                                    if (!frequencyPlanMap) onPlanSelected({ ...card, requires_frequency_selection: true });
                                }}
                                plusConfig={plusConfig}
                                onConfigChange={onConfigChange}
                                frequencyPlanMap={frequencyPlanMap}
                                onSelectFrequencyPlan={onSelectFrequencyPlan}
                            />
                        ))}
                    </div>
                )}
            </div>

            <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t">
                <div className="max-w-2xl mx-auto">
                    <Button
                        onClick={onContinue}
                        disabled={!canContinue}
                        className="w-full h-14 rounded-full bg-[#92C7CF] hover:bg-[#7FB0B8] text-white text-lg disabled:bg-gray-300"
                    >
                        {t('payment.subscription.continue')}
                    </Button>
                </div>
            </div>
        </div>
    );
};

const PlanCard = ({
    plan, expanded, onClick,
    plusConfig, onConfigChange,
    frequencyPlanMap, onSelectFrequencyPlan,
}: {
    plan: TherapySessionPlan; expanded: boolean; onClick: () => void;
    plusConfig?: any; onConfigChange?: (c: any) => void;
    frequencyPlanMap?: Partial<Record<SessionFrequency, TherapySessionPlan>>;
    onSelectFrequencyPlan?: (plan: TherapySessionPlan, groupId: string, frequency: SessionFrequency) => void;
}) => {
    const { t } = useTranslation();
    const bgColor = expanded ? 'bg-[#92C7CF]' : 'bg-[#F7F7F7]';
    const textColor = expanded ? 'text-white' : 'text-black';
    const nameColor = expanded ? 'text-white' : 'text-[#92C7CF]';

    const availableFreqs: SessionFrequency[] = (plan as any).available_frequencies || [];
    const freqOptions = getFrequencies(t).filter(f => availableFreqs.includes(f.value));
    const isFrequencyCard = plan.requires_frequency_selection && freqOptions.length > 0;

    // The group/virtual card's `features` field is frozen to whichever plan was
    // picked as "primary" when the group was built (usually the weekly plan) -
    // see buildDisplayGroups(). That means the checklist below would otherwise
    // always show the weekly plan's features even when the user picks a
    // different frequency (2x/month, 1x/month, etc). To keep the checklist in
    // sync with the selected frequency, resolve the features from the actual
    // per-frequency plan whenever one has been picked, and only fall back to
    // the group card's own features before any frequency has been chosen yet.
    const displayFeatures = (isFrequencyCard && plusConfig?.frequency && frequencyPlanMap?.[plusConfig.frequency]?.features)
        ? frequencyPlanMap[plusConfig.frequency]!.features
        : plan.features;

    // Selecting a frequency must keep this card expanded (it stays the same
    // group card, e.g. "group_plus") and must not wipe out the frequency we
    // just picked - both of those used to happen because this used to call
    // the generic selectPlan(), which resets expandedPlanId to the *real*
    // plan's id (different from the group card's id) and resets plusConfig.
    const handleFrequencyPick = (freqValue: SessionFrequency) => {
        const realPlan = frequencyPlanMap?.[freqValue];
        if (realPlan && onSelectFrequencyPlan) {
            onSelectFrequencyPlan({ ...realPlan, requires_frequency_selection: true }, plan.id, freqValue);
        }
    };

    return (
        <div>
            <Card
                className={`${bgColor} ${textColor} cursor-pointer transition-all ${expanded ? 'shadow-lg' : 'shadow'} ${expanded ? 'rounded-t-3xl rounded-b-none' : 'rounded-3xl'}`}
                onClick={onClick}
            >
                <div className="p-6 flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <p className={`text-sm font-medium ${nameColor}`}>{plan.name}</p>
                            {plan.popular && (
                                <Badge className="bg-white/20 text-white text-xs">{t('payment.plan.popular')}</Badge>
                            )}
                            {plan.session_duration && (
                                <Badge className="bg-white/20 text-white text-xs flex items-center gap-1">
                                    <Clock className="w-3 h-3" />{plan.session_duration} {t('payment.plan.min_suffix')}
                                </Badge>
                            )}
                        </div>
                        {isFrequencyCard ? (
                            <p className={`text-sm mt-0.5 ${expanded ? 'text-white/90' : 'text-black'}`}>{t('payment.plan.choose_your_frequency')}</p>
                        ) : (
                            <>
                                <p className="text-2xl font-extrabold">{plan.display_price}</p>
                                {plan.display_billing && (
                                    <p className={`text-xs mt-0.5 ${expanded ? 'text-white/70' : 'text-gray-500'}`}>{plan.display_billing}</p>
                                )}
                            </>
                        )}
                    </div>
                    <ChevronDown className={`w-6 h-6 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                </div>
            </Card>

            {expanded && (
                <div className="bg-white border border-[#92C7CF] rounded-b-3xl p-6 space-y-3">
                    {isFrequencyCard && (
                        <div className="pb-3 mb-1 border-b border-gray-100" onClick={(e) => e.stopPropagation()}>
                            <p className="text-sm font-semibold text-gray-500 mb-3">{t('payment.plan.choose_frequency')}</p>
                            <div className="space-y-3">
                                {freqOptions.map(freq => {
                                    const freqPrice = (plan as any).frequency_prices?.[freq.value];
                                    const isSelected = plusConfig?.frequency === freq.value;
                                    return (
                                        <div
                                            key={freq.value}
                                            onClick={() => handleFrequencyPick(freq.value)}
                                            className="flex items-center justify-between cursor-pointer"
                                        >
                                            <div className="flex items-center gap-3">
                                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${isSelected ? 'border-[#92C7CF]' : 'border-gray-300'}`}>
                                                    {isSelected && <div className="w-2.5 h-2.5 rounded-full bg-[#92C7CF]" />}
                                                </div>
                                                <span className="text-gray-800">{freq.label}</span>
                                            </div>
                                            {typeof freqPrice === 'number' && (
                                                <span className="text-[#92C7CF] font-semibold">
                                                    €{freqPrice.toFixed(2)}/{freq.value === 'weekly' ? t('payment.plan.per_week') : t('payment.plan.per_month')}
                                                </span>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                            {plusConfig?.frequency && frequencyPlanMap?.[plusConfig.frequency] && (
                                <div className="mt-4 p-3 rounded-xl bg-[#eef7f8] flex items-center justify-between">
                                    <span className="text-sm text-gray-600">
                                        {getFrequencies(t).find(f => f.value === plusConfig.frequency)?.label}
                                    </span>
                                    <div className="text-right">
                                        <p className="text-sm font-semibold text-[#92C7CF]">
                                            {frequencyPlanMap[plusConfig.frequency]?.display_price}
                                        </p>
                                        {frequencyPlanMap[plusConfig.frequency]?.display_billing && (
                                            <p className="text-xs text-gray-500">
                                                {frequencyPlanMap[plusConfig.frequency]?.display_billing}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {displayFeatures.map((feature, index) => (
                        <div key={index} className="flex items-start gap-2">
                            <Check className="w-5 h-5 text-[#92C7CF] flex-shrink-0 mt-0.5" />
                            <span className="text-gray-700">{feature}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

const AddonsPicker = ({ availableAddons, selectedAddons, onToggleAddon, plusConfig, onConfigChange }: {
    availableAddons: AddonConfig[]; selectedAddons: string[]; onToggleAddon: (id: string) => void;
    plusConfig: any; onConfigChange: (c: any) => void;
}) => {
    const { t } = useTranslation();
    const roomsAddon = availableAddons.find(isRoomsAddon);
    const roomsSelected = !!roomsAddon && selectedAddons.includes(roomsAddon.id);
    const selectedRoomCategories: string[] = plusConfig?.room_categories || [];

    const toggleRoomCategory = (cat: string) => {
        const updated = selectedRoomCategories.includes(cat)
            ? selectedRoomCategories.filter((c: string) => c !== cat)
            : [...selectedRoomCategories, cat];
        onConfigChange({ ...plusConfig, room_categories: updated });
    };

    if (availableAddons.length === 0) return null;

    return (
        <div>
            <h2 className="text-lg font-semibold mb-1">{t('payment.addons.title')}</h2>
            <p className="text-sm text-gray-500 mb-4">{t('payment.addons.subtitle')}</p>
            <div className="space-y-3">
                {availableAddons.map((addon: AddonConfig) => {
                    const isRooms = isRoomsAddon(addon);
                    const isSelected = selectedAddons.includes(addon.id);
                    return (
                        <div key={addon.id}>
                            <Card
                                onClick={() => onToggleAddon(addon.id)}
                                className={`p-4 cursor-pointer transition-all ${isSelected
                                    ? `border-2 border-[#92C7CF] bg-[#eef7f8] ${isRooms ? 'rounded-b-none' : ''}`
                                    : 'border hover:border-[#92C7CF]/50'}`}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        {isRooms && <Home className="w-4 h-4 text-[#92C7CF] flex-shrink-0" />}
                                        <div>
                                            <p className="font-medium">{addon.name}</p>
                                            {addon.description && <p className="text-sm text-gray-500">{addon.description}</p>}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="font-bold text-[#92C7CF]">{addon.display_price}</span>
                                        {isSelected && (
                                            <div className="w-6 h-6 rounded-full bg-[#92C7CF] flex items-center justify-center">
                                                <Check className="w-4 h-4 text-white" />
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </Card>
                            {isRooms && isSelected && (
                                <div className="border border-t-0 border-[#92C7CF] rounded-b-xl p-4 bg-white space-y-3">
                                    <p className="text-sm text-gray-500">{t('payment.addons.choose_rooms')}</p>
                                    <div className="flex flex-wrap gap-2">
                                        {ROOM_CATEGORIES.map(cat => {
                                            const active = selectedRoomCategories.includes(cat);
                                            return (
                                                <button
                                                    key={cat}
                                                    type="button"
                                                    onClick={(e) => { e.stopPropagation(); toggleRoomCategory(cat); }}
                                                    className={`px-3 py-1.5 rounded-full text-sm border transition-all ${active
                                                        ? 'bg-[#92C7CF] text-white border-[#92C7CF]'
                                                        : 'bg-white text-gray-600 border-gray-200 hover:border-[#92C7CF]/50'}`}
                                                >
                                                    {cat}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    {selectedRoomCategories.length === 0 && (
                                        <p className="text-xs text-red-500 flex items-center gap-1">
                                            <AlertCircle className="w-3 h-3" />
                                            {t('payment.addons.select_room_warning')}
                                        </p>
                                    )}
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

const PlusConfigStep = ({ selectedPlan, plusConfig, onConfigChange, onContinue, onBack, availableAddons, selectedAddons, onToggleAddon }: any) => {
    const { t } = useTranslation();
    const sessionTypes: { value: SessionType; label: string; icon: any }[] = [
        { value: 'individual', label: t('payment.config.individual'), icon: User },
        { value: 'couple', label: t('payment.config.couple'), icon: Users },
    ];

    const availableTypes: SessionType[] = selectedPlan?.available_session_types || [];
    const typeOptions = sessionTypes.filter(s => availableTypes.includes(s.value));
    const showSessionType = selectedPlan?.requires_frequency_selection && typeOptions.length > 0;

    const selectedFrequencyLabel = getFrequencies(t).find(f => f.value === plusConfig?.frequency)?.label;

    const roomsAddon = (availableAddons as AddonConfig[]).find(isRoomsAddon);
    const roomsSelected = !!roomsAddon && selectedAddons.includes(roomsAddon.id);
    const selectedRoomCategories: string[] = plusConfig?.room_categories || [];
    const roomsValid = !roomsSelected || selectedRoomCategories.length > 0;

    const canContinue =
        (!showSessionType || plusConfig?.session_type) &&
        roomsValid;

    return (
        <div className="min-h-screen px-4 py-6">
            <div className="max-w-2xl mx-auto">
                <div className="flex items-center gap-4 mb-6">
                    <Button variant="ghost" size="icon" onClick={onBack}>
                        <ArrowLeft className="w-6 h-6" />
                    </Button>
                    <div>
                        <h1 className="text-2xl font-bold">{t('payment.config.title')}</h1>
                        <p className="text-sm text-gray-500">
                            {selectedPlan?.name}
                            {selectedFrequencyLabel ? ` · ${selectedFrequencyLabel}` : ''}
                        </p>
                    </div>
                </div>

                {showSessionType && (
                    <div className="mb-8">
                        <h2 className="text-lg font-semibold mb-4">{t('payment.config.session_type')}</h2>
                        <div className="grid grid-cols-2 gap-3">
                            {typeOptions.map(sType => {
                                const Icon = sType.icon;
                                return (
                                    <Card
                                        key={sType.value}
                                        onClick={() => onConfigChange({ ...plusConfig, session_type: sType.value })}
                                        className={`p-4 cursor-pointer transition-all text-center ${plusConfig?.session_type === sType.value
                                            ? 'border-2 border-[#92C7CF] bg-[#eef7f8]'
                                            : 'border hover:border-[#92C7CF]/50'}`}
                                    >
                                        <Icon className={`w-8 h-8 mx-auto mb-2 ${plusConfig?.session_type === sType.value ? 'text-[#92C7CF]' : 'text-gray-400'}`} />
                                        <p className="font-medium">{sType.label}</p>
                                    </Card>
                                );
                            })}
                        </div>
                    </div>
                )}

                {availableAddons.length > 0 && (
                    <div className="mb-8">
                        <AddonsPicker
                            availableAddons={availableAddons}
                            selectedAddons={selectedAddons}
                            onToggleAddon={onToggleAddon}
                            plusConfig={plusConfig}
                            onConfigChange={onConfigChange}
                        />
                    </div>
                )}

                <Button
                    onClick={onContinue}
                    disabled={!canContinue}
                    className="w-full h-14 rounded-full bg-[#92C7CF] hover:bg-[#7FB0B8] text-white text-lg disabled:bg-gray-300"
                >
                    {t('payment.config.continue')}
                </Button>
            </div>
        </div>
    );
};

const PaymentMethodSelector = ({ selectedPlan, paymentMethods, selectedMethod, onMethodSelected, onContinue, onBack }: any) => {
    const { t } = useTranslation();
    return (
        <div className="min-h-screen px-4 py-6">
            <div className="max-w-2xl mx-auto">
                <div className="flex items-center gap-4 mb-6">
                    <Button variant="ghost" size="icon" onClick={onBack}>
                        <ArrowLeft className="w-6 h-6" />
                    </Button>
                    <h1 className="text-2xl font-bold">{t('payment.method.title')}</h1>
                </div>

                <p className="text-gray-600 text-center mb-8">{t('payment.method.subtitle')}</p>

                <RadioGroup value={selectedMethod?.id || ''} onValueChange={(value) => {
                    const method = paymentMethods.find((m: any) => m.id === value);
                    onMethodSelected(method);
                }}>
                    <div className="space-y-4">
                        {paymentMethods.map((method: any) => (
                            <Card
                                key={method.id}
                                className={`p-4 cursor-pointer ${selectedMethod?.id === method.id ? 'border-2 border-[#92C7CF]' : 'border'}`}
                                onClick={() => onMethodSelected(method)}
                            >
                                <div className="flex items-center gap-4">
                                    <RadioGroupItem value={method.id} id={method.id} />
                                    <Label htmlFor={method.id} className="text-lg font-medium cursor-pointer flex-1">
                                        {method.display_name}
                                    </Label>
                                </div>
                            </Card>
                        ))}
                    </div>
                </RadioGroup>

                <Button
                    onClick={onContinue}
                    disabled={!selectedMethod}
                    className="w-full h-14 rounded-full bg-[#92C7CF] hover:bg-[#7FB0B8] text-white text-lg mt-8 disabled:bg-gray-300"
                >
                    {t('payment.method.continue')}
                </Button>
            </div>
        </div>
    );
};

const InvoiceSummary = ({
    selectedPlan, paymentMethodName, onConfirm, onBack, isLoading,
    mockPayment, isLocalhost, plusConfig,
    couponCode, couponResult, isCouponLoading,
    onCouponCodeChange, onApplyCoupon, onRemoveCoupon, getFinalPrice, getBasePrice,
    selectedAddons, availableAddons,
}: any) => {
    const { t } = useTranslation();
    const originalPrice = getBasePrice ? getBasePrice() : (selectedPlan.actual_charge || selectedPlan.price);
    const finalPrice = getFinalPrice();
    const hasDiscount = couponResult?.valid && couponResult.discount_amount > 0;

    const frequencyLabel: Record<string, string> = {
        weekly: t('payment.frequency_label.weekly'),
        bimonthly: t('payment.frequency_label.bimonthly'),
        monthly: t('payment.frequency_label.monthly'),
    };

    const selectedAddonDetails = availableAddons.filter((a: AddonConfig) => selectedAddons.includes(a.id));
    const selectedRoomCategories: string[] = plusConfig?.room_categories || [];
    const addonsTotal = selectedAddonDetails.reduce((sum: number, a: AddonConfig) => {
        const price = typeof (a as any).price === 'number' ? (a as any).price : parseFloat((a as any).price) || 0;
        return sum + price;
    }, 0);

    return (
        <div className="min-h-screen px-4 py-6">
            <div className="max-w-2xl mx-auto pb-40">
                <div className="flex items-center gap-4 mb-6">
                    <Button variant="ghost" size="icon" onClick={onBack}>
                        <ArrowLeft className="w-6 h-6" />
                    </Button>
                    <h1 className="text-2xl font-bold">{t('payment.summary.title')}</h1>
                </div>

                <div className="space-y-4">
                    <Card className="p-6 bg-[#F7F7F7]">
                        <p className="text-sm text-gray-500 mb-2">{t('payment.summary.overview_label')}</p>
                        <p className="text-xl font-bold">{selectedPlan.name}</p>
                        <p className="text-2xl font-extrabold text-[#92C7CF]">€{originalPrice.toFixed(2)}{selectedPlan.plan_type !== 'one_time' ? ` / ${t('payment.plan.per_week')}` : ''}</p>
                        {plusConfig && (
                            <div className="mt-3 flex flex-wrap gap-2">
                                {plusConfig.frequency && (
                                    <Badge variant="outline" className="text-[#92C7CF] border-[#92C7CF]">
                                        {frequencyLabel[plusConfig.frequency]}
                                    </Badge>
                                )}
                                {plusConfig.session_type && (
                                    <Badge variant="outline" className="text-[#92C7CF] border-[#92C7CF] capitalize">
                                        {plusConfig.session_type} {t('payment.frequency_label.session_suffix')}
                                    </Badge>
                                )}
                            </div>
                        )}
                    </Card>
                    {selectedAddonDetails.length > 0 && (
                        <Card className="p-6 bg-[#F7F7F7]">
                            <p className="text-sm text-gray-500 mb-3">{t('payment.addons.selected_title')}</p>
                            <div className="space-y-2">
                                {selectedAddonDetails.map((addon: AddonConfig) => (
                                    <div key={addon.id}>
                                        <div className="flex justify-between items-center">
                                            <span className="text-sm text-gray-700">{addon.name}</span>
                                            <span className="text-sm font-medium">{addon.display_price}</span>
                                        </div>
                                        {isRoomsAddon(addon) && selectedRoomCategories.length > 0 && (
                                            <div className="flex flex-wrap gap-1 mt-1">
                                                {selectedRoomCategories.map((cat) => (
                                                    <span key={cat} className="text-xs px-2 py-0.5 bg-white border border-gray-200 rounded-full text-gray-500">
                                                        {cat}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </Card>
                    )}
                    <Card className="p-6 bg-[#F7F7F7]">
                        <p className="text-sm text-gray-500 mb-2">{t('payment.summary.method_label')}</p>
                        <p className="text-lg font-medium">{paymentMethodName}</p>
                    </Card>
                    <Card className="p-6 border border-gray-200">
                        <div className="flex items-center gap-2 mb-3">
                            <Tag className="w-4 h-4 text-[#92C7CF]" />
                            <p className="font-medium text-gray-700">{t('payment.coupon.have_code')}</p>
                        </div>

                        {couponResult?.valid ? (
                            <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-xl">
                                <Check className="w-5 h-5 text-green-500 flex-shrink-0" />
                                <div className="flex-1">
                                    <p className="font-semibold text-green-700">{couponCode.toUpperCase()}</p>
                                    <p className="text-sm text-green-600">
                                        -{couponResult.coupon?.discount_type === 'percentage'
                                            ? `${couponResult.coupon.discount_value}%`
                                            : `€${couponResult.discount_amount?.toFixed(2)}`} {t('payment.coupon.discount_applied')}
                                    </p>
                                </div>
                                <Button variant="ghost" size="sm" onClick={onRemoveCoupon} className="text-gray-400 hover:text-red-500 p-1">
                                    <X className="w-4 h-4" />
                                </Button>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                <div className="flex gap-2">
                                    <Input
                                        placeholder={t('payment.coupon.placeholder')}
                                        value={couponCode}
                                        onChange={(e) => onCouponCodeChange(e.target.value.toUpperCase())}
                                        className="uppercase"
                                        onKeyDown={(e) => e.key === 'Enter' && onApplyCoupon()}
                                    />
                                    <Button
                                        onClick={onApplyCoupon}
                                        disabled={!couponCode.trim() || isCouponLoading}
                                        className="bg-[#92C7CF] hover:bg-[#7FB0B8] text-white px-6 rounded-xl"
                                    >
                                        {isCouponLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : t('payment.coupon.apply')}
                                    </Button>
                                </div>
                                {couponResult?.error && (
                                    <p className="text-sm text-red-500 flex items-center gap-1">
                                        <AlertCircle className="w-4 h-4" />
                                        {couponResult.error}
                                    </p>
                                )}
                            </div>
                        )}
                    </Card>
                    <Card className="p-6 border border-gray-300">
                        <div className="space-y-3">
                            <div className="flex justify-between">
                                <span className="text-gray-600">{t('payment.summary.subtotal')}</span>
                                <span className="font-medium">€{originalPrice.toFixed(2)}</span>
                            </div>

                            {addonsTotal > 0 && (
                                <div className="flex justify-between">
                                    <span className="text-gray-600">{t('payment.summary.addons_label')}</span>
                                    <span className="font-medium">€{addonsTotal.toFixed(2)}</span>
                                </div>
                            )}

                            {hasDiscount && (
                                <div className="flex justify-between text-green-600">
                                    <span>{t('payment.summary.discount_label')} ({couponCode.toUpperCase()})</span>
                                    <span className="font-medium">-€{couponResult.discount_amount?.toFixed(2)}</span>
                                </div>
                            )}

                            <div className="border-t pt-3 flex justify-between">
                                <span className="text-lg font-bold">{t('payment.summary.total')}</span>
                                <span className="text-lg font-bold text-[#92C7CF]">€{finalPrice.toFixed(2)}</span>
                            </div>

                            {selectedPlan.plan_type !== 'one_time' && (
                                <p className="text-xs text-gray-400 text-center">{t('payment.summary.billed_note')}</p>
                            )}
                        </div>
                    </Card>
                </div>
            </div>

            <div className="fixed bottom-0 left-0 right-0 p-4 bg-white border-t">
                <div className="max-w-2xl mx-auto space-y-3">
                    <Button
                        onClick={onConfirm}
                        disabled={isLoading}
                        className="w-full h-14 rounded-full bg-[#92C7CF] hover:bg-[#7FB0B8] text-white text-lg disabled:bg-gray-400"
                    >
                        {isLoading ? (
                            <div className="flex items-center gap-2">
                                <div className="animate-spin h-5 w-5 border-2 border-white rounded-full border-t-transparent"></div>
                                {t('payment.summary.processing')}
                            </div>
                        ) : (
                            `${t('payment.summary.pay_button')} €${finalPrice.toFixed(2)}`
                        )}
                    </Button>

                    {isLocalhost && (
                        <Button
                            onClick={mockPayment}
                            disabled={isLoading}
                            variant="outline"
                            className="w-full h-12 rounded-full border-2 border-orange-500 text-orange-500 hover:bg-orange-50 disabled:opacity-50"
                        >
                            🎭 {t('payment.mock_dev')}
                        </Button>
                    )}
                </div>
            </div>
        </div>
    );
};

const SuccessScreen = ({ onContinue }: { onContinue: () => void }) => {
    const { t } = useTranslation();
    return (
        <div className="min-h-screen flex items-center justify-center p-6">
            <div className="max-w-md text-center">
                <div className="w-24 h-24 bg-[#F7F7F7] rounded-full flex items-center justify-center mx-auto mb-6">
                    <Check className="w-12 h-12 text-[#92C7CF]" />
                </div>
                <h1 className="text-3xl font-bold mb-4">{t('payment.success.title')}</h1>
                <p className="text-gray-600 mb-8">{t('payment.success.message')}</p>
                <Button
                    onClick={onContinue}
                    className="w-full h-14 rounded-full bg-[#92C7CF] hover:bg-[#7FB0B8] text-white text-lg"
                >
                    {t('payment.subscription.continue')}
                </Button>
            </div>
        </div>
    );
};

export default Payment;