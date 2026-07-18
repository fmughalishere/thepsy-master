import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { usePayment, PaymentStep } from "@/hooks/usePayment";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  LogOut,
  AlertCircle,
  Tag,
  X,
  Loader2,
  Users,
  User,
  Clock,
  Home,
  Globe,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";
import type {
  TherapySessionPlan,
  SessionFrequency,
  SessionType,
  AddonConfig,
} from "@/types/payment";
import { auth, logAnalyticsEvent } from "@/lib/firebase";
import { signOut } from "firebase/auth";

const ROOM_CATEGORIES = [
  "Loneliness",
  "Men",
  "Women",
  "Parents",
  "Mothers",
  "Fathers",
  "Anxiety",
  "Depression",
  "LGBTQ+",
];

const getFrequencies = (
  t: (key: string) => string,
): { value: SessionFrequency; label: string; sublabel: string }[] => [
  {
    value: "weekly",
    label: t("payment.plan.freq_weekly_label"),
    sublabel: t("payment.plan.freq_weekly_sub"),
  },
  {
    value: "bimonthly",
    label: t("payment.plan.freq_bimonthly_label"),
    sublabel: t("payment.plan.freq_bimonthly_sub"),
  },
  {
    value: "monthly",
    label: t("payment.plan.freq_monthly_label"),
    sublabel: t("payment.plan.freq_monthly_sub"),
  },
];

const isRoomsAddon = (addon: AddonConfig) =>
  addon.id === "rooms" || addon.name?.toLowerCase().includes("room");
const getFrequencyKey = (p: TherapySessionPlan): SessionFrequency => {
  const sessionsPerMonth = (p as any).quotas?.live_sessions_per_month;
  if (sessionsPerMonth === 4) return "weekly";
  if (sessionsPerMonth === 2) return "bimonthly";
  if (sessionsPerMonth === 1) return "monthly";
  if (p.billing_period === "weekly") return "weekly";
  return "monthly";
};

const getCategoryDisplayNames = (
  t: (key: string) => string,
): Record<string, string> => ({
  plus: t("payment.categories.plus_plan"),
  coaching: t("payment.categories.coaching"),
  therapy_couples: t("payment.categories.therapy_couples"),
});

interface DisplayPlanGroup {
  card: TherapySessionPlan;
  frequencyPlanMap?: Partial<Record<SessionFrequency, TherapySessionPlan>>;
}

const buildDisplayGroups = (
  categoryPlans: TherapySessionPlan[],
  t: (key: string) => string,
): DisplayPlanGroup[] => {
  const byCategory: Record<string, TherapySessionPlan[]> = {};
  categoryPlans.forEach((p) => {
    const cat = p.plan_category || "basic";
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(p);
  });

  const categoryDisplayNames = getCategoryDisplayNames(t);
  const groups: DisplayPlanGroup[] = [];
  Object.entries(byCategory).forEach(([cat, plansInCat]) => {
    if (plansInCat.length > 1) {
      const frequencyPlanMap: Partial<
        Record<SessionFrequency, TherapySessionPlan>
      > = {};
      plansInCat.forEach((p) => {
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
          Object.entries(frequencyPlanMap).map(([k, p]) => [
            k,
            (p as TherapySessionPlan).price,
          ]),
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

const filterAddonsForPlan = (
  addons: AddonConfig[],
  plan: TherapySessionPlan | null,
) => {
  if (!plan) return [];
  return addons.filter(
    (a) =>
      a.available_for_plans === undefined ||
      (a.available_for_plans as string[]).includes(plan.id) ||
      (a.available_for_plans as string[]).includes(plan.plan_category || "") ||
      (a.available_for_plans as string[]).includes("all"),
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
    if (params.get("platform") === "mobile") {
      window.location.href = "psycmp://payment";
    }
  }, []);

  useEffect(() => {
    if (state.error) {
      toast({
        title: t("common.error"),
        description: state.error,
        variant: "destructive",
      });
      clearError();
    }
  }, [state.error]);

  if (state.isLoading && state.currentStep !== PaymentStep.Subscription) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white/80">
        <div className="text-center p-6 bg-white rounded-2xl shadow-xl border border-gray-100 max-w-sm mx-4">
          <div className="animate-spin h-12 w-12 border-4 border-[#92C7CF] rounded-full border-t-transparent mx-auto mb-4"></div>
          <p className="text-lg font-medium text-gray-800">
            {t("payment.summary.processing")}
          </p>
          <p className="text-sm text-gray-500 mt-2 mb-6">
            {t("payment.processing_overlay.desc")}
          </p>
          {state.checkoutUrl && (
            <div className="space-y-3">
              <p className="text-sm text-gray-600">
                {t("payment.processing_overlay.popup_failed")}
              </p>
              <Button
                onClick={() => (window.location.href = state.checkoutUrl!)}
                className="w-full bg-[#92C7CF] hover:bg-[#7FB0B8] text-white rounded-full"
              >
                {t("payment.processing_overlay.click_here")}
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
          availableAddons={filterAddonsForPlan(
            state.availableAddons,
            state.selectedPlan,
          )}
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

      {(state.currentStep === PaymentStep.Summary ||
        state.currentStep === PaymentStep.Processing) && (
        <InvoiceSummary
          selectedPlan={state.selectedPlan!}
          paymentMethodName={
            state.selectedPaymentMethod?.display_name || "Card"
          }
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
        <SuccessScreen
          onContinue={() => {
            logAnalyticsEvent("payment_complete", {
              plan: state.selectedPlan?.name,
              amount: state.selectedPlan?.display_price,
            });
            navigate("/matching");
          }}
        />
      )}
    </div>
  );
};

const SubscriptionSelector = ({
  plans,
  expandedPlanId,
  selectedPlan,
  onExpand,
  onPlanSelected,
  onContinue,
  plusConfig,
  onConfigChange,
  onSelectFrequencyPlan,
}: any) => {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const handleLogout = async () => {
    try {
      await signOut(auth);
      navigate("/login");
    } catch (error) {
      toast({
        title: t("common.error"),
        description: "Failed to log out",
        variant: "destructive",
      });
    }
  };

  const canContinue = !!selectedPlan;

  return (
    <div className="relative min-h-screen bg-white">
      <div className="flex items-center justify-start gap-3 px-6 py-4 bg-white sticky top-0 z-20">
        <Button
          variant="ghost"
          size="icon"
          onClick={handleLogout}
          className="text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-full w-10 h-10 transition-all"
        >
          <LogOut className="w-6 h-6" />
        </Button>
      </div>

      <div className="max-w-2xl mx-auto px-6 pb-40">
        <h1 className="text-[28px] font-bold text-center mb-1 text-black">
          {t("payment.subscription.title", "Choose Your Plan")}
        </h1>
        <p className="text-center text-gray-400 text-[15px] mb-10">
          {t("payment.subscription.subtitle", "Select the plan that works for you")}
        </p>

        <div className="space-y-4">
          {plans.length > 0 && buildDisplayGroups(plans, t).map(({ card, frequencyPlanMap }) => (
            <PlanCard
              key={card.id}
              plan={card}
              expanded={expandedPlanId === card.id}
              onClick={() => {
                onExpand(card.id);
                if (!frequencyPlanMap)
                  onPlanSelected(card); // FIXED: Removed forced frequency flag
              }}
              plusConfig={plusConfig}
              onConfigChange={onConfigChange}
              frequencyPlanMap={frequencyPlanMap}
              onSelectFrequencyPlan={onSelectFrequencyPlan}
            />
          ))}
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-6 bg-white/80 backdrop-blur-md border-t border-gray-50 z-20">
        <div className="max-w-2xl mx-auto">
          <Button
            onClick={onContinue}
            disabled={!canContinue}
            className="w-full h-[58px] rounded-full bg-[#92C7CF] hover:bg-[#7FB0B8] text-white text-lg font-bold shadow-md transition-all active:scale-[0.98] disabled:bg-gray-300"
          >
            {t("payment.subscription.continue", "Continue to Payment")}
          </Button>
        </div>
      </div>
    </div>
  );
};

const PlanCard = ({
  plan,
  expanded,
  onClick,
  plusConfig,
  frequencyPlanMap,
  onSelectFrequencyPlan,
}: {
  plan: TherapySessionPlan;
  expanded: boolean;
  onClick: () => void;
  plusConfig?: any;
  onConfigChange?: (c: any) => void;
  frequencyPlanMap?: Partial<Record<SessionFrequency, TherapySessionPlan>>;
  onSelectFrequencyPlan?: (
    plan: TherapySessionPlan,
    groupId: string,
    frequency: SessionFrequency,
  ) => void;
}) => {
  const { t } = useTranslation();
  
  const bgColor = expanded ? "bg-[#92C7CF]" : "bg-[#F7F9FA]";
  const titleColor = expanded ? "text-white" : "text-[#92C7CF]";
  const subtextColor = expanded ? "text-white/90" : "text-black";

  const availableFreqs: SessionFrequency[] =
    (plan as any).available_frequencies || [];
  const freqOptions = getFrequencies(t).filter((f) =>
    availableFreqs.includes(f.value),
  );
  
  const isFrequencyCard =
    plan.requires_frequency_selection && freqOptions.length > 1;

  const displayFeatures =
    isFrequencyCard &&
    plusConfig?.frequency &&
    frequencyPlanMap?.[plusConfig.frequency]?.features
      ? frequencyPlanMap[plusConfig.frequency]!.features
      : plan.features;

  const handleFrequencyPick = (freqValue: SessionFrequency) => {
    const realPlan = frequencyPlanMap?.[freqValue];
    if (realPlan && onSelectFrequencyPlan) {
      onSelectFrequencyPlan(
        { ...realPlan, requires_frequency_selection: true },
        plan.id,
        freqValue,
      );
    }
  };

  return (
    <div className="transition-all duration-300">
      <Card
        className={`${bgColor} border-none shadow-sm cursor-pointer transition-all duration-300 ${
          expanded ? "rounded-t-[24px] rounded-b-none" : "rounded-[24px]"
        }`}
        onClick={onClick}
      >
        <div className="p-6 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <p className={`text-[20px] font-bold ${titleColor}`}>{plan.name}</p>
              {plan.popular && (
                <Badge className="bg-white/20 text-white text-xs border-none font-medium">
                  {t("payment.plan.popular")}
                </Badge>
              )}
            </div>
            
            <div className="mt-1">
              {/* Only show 'Choose frequency' if it has multiple options and is closed */}
              {isFrequencyCard && !expanded && (
                <p className={`text-[14px] font-medium ${subtextColor}`}>
                  {t("payment.plan.choose_your_frequency", "Choose your frequency")}
                </p>
              )}
              
              {/* Show price ONLY when expanded (Open karne par) */}
              {expanded && (
                <p className="text-[18px] font-medium text-white">
                  {frequencyPlanMap && plusConfig?.frequency 
                    ? frequencyPlanMap[plusConfig.frequency]?.display_price 
                    : plan.display_price}
                </p>
              )}
            </div>
          </div>
          <ChevronDown
            className={`w-5 h-5 transition-transform duration-300 ${
              expanded ? "rotate-180 text-white" : "text-black"
            }`}
          />
        </div>
      </Card>

      {expanded && (
        <div className="bg-white border-2 border-[#92C7CF] border-t-0 rounded-b-[24px] p-6 space-y-4 shadow-md">
          {isFrequencyCard && (
            <div
              className="pb-4 mb-2 border-b border-gray-100"
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-[13px] font-bold text-gray-400 uppercase tracking-wide mb-4">
                {t("payment.plan.choose_frequency", "Choose frequency")}
              </p>
              <div className="space-y-4">
                {freqOptions.map((freq) => {
                  const freqPrice = (plan as any).frequency_prices?.[
                    freq.value
                  ];
                  const isSelected = plusConfig?.frequency === freq.value;
                  return (
                    <div
                      key={freq.value}
                      onClick={() => handleFrequencyPick(freq.value)}
                      className="flex items-center justify-between cursor-pointer group"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                            isSelected ? "border-[#92C7CF]" : "border-gray-200"
                          }`}
                        >
                          {isSelected && (
                            <div className="w-2.5 h-2.5 rounded-full bg-[#92C7CF]" />
                          )}
                        </div>
                        <span className={`text-[15px] font-medium ${isSelected ? "text-black" : "text-gray-500"}`}>
                          {freq.label}
                        </span>
                      </div>
                      {typeof freqPrice === "number" && (
                        <span className="text-[#92C7CF] font-bold text-[15px]">
                          €{freqPrice.toFixed(2)}/{t("payment.plan.per_week", "week")}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-3 pt-2">
            {displayFeatures.map((feature, index) => (
              <div key={index} className="flex items-start gap-3">
                <Check className="w-5 h-5 text-[#92C7CF] flex-shrink-0" />
                <span className="text-[15px] text-gray-600 leading-tight">{feature}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const PlusConfigStep = ({
  selectedPlan,
  plusConfig,
  onConfigChange,
  onContinue,
  onBack,
  availableAddons,
  selectedAddons,
  onToggleAddon,
}: any) => {
  const { t } = useTranslation();
  const sessionTypes: { value: SessionType; label: string; icon: any }[] = [
    { value: "individual", label: t("payment.config.individual"), icon: User },
    { value: "couple", label: t("payment.config.couple"), icon: Users },
  ];

  const availableTypes: SessionType[] =
    selectedPlan?.available_session_types || [];
  const typeOptions = sessionTypes.filter((s) =>
    availableTypes.includes(s.value),
  );
  const showSessionType =
    selectedPlan?.requires_frequency_selection && typeOptions.length > 0;

  const selectedFrequencyLabel = getFrequencies(t).find(
    (f) => f.value === plusConfig?.frequency,
  )?.label;

  const roomsAddon = (availableAddons as AddonConfig[]).find(isRoomsAddon);
  const roomsSelected = !!roomsAddon && selectedAddons.includes(roomsAddon.id);
  const selectedRoomCategories: string[] = plusConfig?.room_categories || [];
  const roomsValid = !roomsSelected || selectedRoomCategories.length > 0;

  const canContinue =
    (!showSessionType || plusConfig?.session_type) && roomsValid;

  return (
    <div className="min-h-screen px-6 py-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full h-10 w-10">
            <ArrowLeft className="w-6 h-6" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">{t("payment.config.title")}</h1>
            <p className="text-sm text-gray-500 font-medium">
              {selectedPlan?.name}
              {selectedFrequencyLabel ? ` · ${selectedFrequencyLabel}` : ""}
            </p>
          </div>
        </div>

        {showSessionType && (
          <div className="mb-8">
            <h2 className="text-lg font-bold mb-4">
              {t("payment.config.session_type")}
            </h2>
            <div className="grid grid-cols-2 gap-4">
              {typeOptions.map((sType) => {
                const Icon = sType.icon;
                return (
                  <Card
                    key={sType.value}
                    onClick={() =>
                      onConfigChange({
                        ...plusConfig,
                        session_type: sType.value,
                      })
                    }
                    className={`p-5 cursor-pointer transition-all text-center rounded-[24px] border-2 ${
                      plusConfig?.session_type === sType.value
                        ? "border-[#92C7CF] bg-[#f0f9fa]"
                        : "border-gray-100 hover:border-[#92C7CF]/50"
                    }`}
                  >
                    <Icon
                      className={`w-8 h-8 mx-auto mb-3 ${plusConfig?.session_type === sType.value ? "text-[#92C7CF]" : "text-gray-400"}`}
                    />
                    <p className="font-bold text-[15px]">{sType.label}</p>
                  </Card>
                );
              })}
            </div>
          </div>
        )}

        {availableAddons.length > 0 && (
          <div className="mb-10">
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
          className="w-full h-14 rounded-full bg-[#92C7CF] hover:bg-[#7FB0B8] text-white text-lg font-bold disabled:bg-gray-300"
        >
          {t("payment.config.continue")}
        </Button>
      </div>
    </div>
  );
};

const AddonsPicker = ({
  availableAddons,
  selectedAddons,
  onToggleAddon,
  plusConfig,
  onConfigChange,
}: {
  availableAddons: AddonConfig[];
  selectedAddons: string[];
  onToggleAddon: (id: string) => void;
  plusConfig: any;
  onConfigChange: (c: any) => void;
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
      <h2 className="text-lg font-bold mb-1">
        {t("payment.addons.title")}
      </h2>
      <p className="text-[14px] text-gray-500 mb-5 font-medium">
        {t("payment.addons.subtitle")}
      </p>
      <div className="space-y-4">
        {availableAddons.map((addon: AddonConfig) => {
          const isRooms = isRoomsAddon(addon);
          const isSelected = selectedAddons.includes(addon.id);
          return (
            <div key={addon.id}>
              <Card
                onClick={() => onToggleAddon(addon.id)}
                className={`p-5 cursor-pointer transition-all rounded-[24px] ${
                  isSelected
                    ? `border-2 border-[#92C7CF] bg-[#f0f9fa] ${isRooms ? "rounded-b-none" : ""}`
                    : "border-gray-100 border-2 hover:border-[#92C7CF]/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {isRooms && (
                      <Home className="w-5 h-5 text-[#92C7CF] flex-shrink-0" />
                    )}
                    <div>
                      <p className="font-bold text-[16px]">{addon.name}</p>
                      {addon.description && (
                        <p className="text-[13px] text-gray-500 font-medium">
                          {addon.description}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-bold text-[#92C7CF] text-[16px]">
                      {addon.display_price}
                    </span>
                    {isSelected && (
                      <div className="w-6 h-6 rounded-full bg-[#92C7CF] flex items-center justify-center">
                        <Check className="w-4 h-4 text-white" />
                      </div>
                    )}
                  </div>
                </div>
              </Card>
              {isRooms && isSelected && (
                <div className="border-2 border-t-0 border-[#92C7CF] rounded-b-[24px] p-5 bg-white space-y-4">
                  <p className="text-[13px] font-bold text-gray-400 uppercase">
                    {t("payment.addons.choose_rooms")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {ROOM_CATEGORIES.map((cat) => {
                      const active = selectedRoomCategories.includes(cat);
                      return (
                        <button
                          key={cat}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleRoomCategory(cat);
                          }}
                          className={`px-4 py-2 rounded-full text-[13px] font-bold border-2 transition-all ${
                            active
                              ? "bg-[#92C7CF] text-white border-[#92C7CF]"
                              : "bg-white text-gray-500 border-gray-100 hover:border-[#92C7CF]/50"
                          }`}
                        >
                          {cat}
                        </button>
                      );
                    })}
                  </div>
                  {selectedRoomCategories.length === 0 && (
                    <p className="text-[12px] text-red-500 font-bold flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {t("payment.addons.select_room_warning")}
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

const PaymentMethodSelector = ({
  paymentMethods,
  selectedMethod,
  onMethodSelected,
  onContinue,
  onBack,
}: any) => {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen px-6 py-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full">
            <ArrowLeft className="w-6 h-6" />
          </Button>
          <h1 className="text-2xl font-bold">{t("payment.method.title")}</h1>
        </div>

        <p className="text-gray-500 font-medium text-center mb-10">
          {t("payment.method.subtitle")}
        </p>

        <RadioGroup
          value={selectedMethod?.id || ""}
          onValueChange={(value) => {
            const method = paymentMethods.find((m: any) => m.id === value);
            onMethodSelected(method);
          }}
        >
          <div className="space-y-4">
            {paymentMethods.map((method: any) => (
              <Card
                key={method.id}
                className={`p-5 cursor-pointer rounded-[24px] border-2 transition-all ${selectedMethod?.id === method.id ? "border-[#92C7CF] bg-[#f0f9fa]" : "border-gray-100"}`}
                onClick={() => onMethodSelected(method)}
              >
                <div className="flex items-center gap-4">
                  <RadioGroupItem value={method.id} id={method.id} />
                  <Label
                    htmlFor={method.id}
                    className="text-[17px] font-bold cursor-pointer flex-1"
                  >
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
          className="w-full h-14 rounded-full bg-[#92C7CF] hover:bg-[#7FB0B8] text-white text-lg font-bold mt-10 disabled:bg-gray-300"
        >
          {t("payment.method.continue")}
        </Button>
      </div>
    </div>
  );
};

const InvoiceSummary = ({
  selectedPlan,
  paymentMethodName,
  onConfirm,
  onBack,
  isLoading,
  mockPayment,
  isLocalhost,
  plusConfig,
  couponCode,
  couponResult,
  isCouponLoading,
  onCouponCodeChange,
  onApplyCoupon,
  onRemoveCoupon,
  getFinalPrice,
  getBasePrice,
  selectedAddons,
  availableAddons,
}: any) => {
  const { t } = useTranslation();
  const originalPrice = getBasePrice
    ? getBasePrice()
    : selectedPlan.actual_charge || selectedPlan.price;
  const finalPrice = getFinalPrice();
  const hasDiscount = couponResult?.valid && couponResult.discount_amount > 0;

  const frequencyLabel: Record<string, string> = {
    weekly: t("payment.frequency_label.weekly"),
    bimonthly: t("payment.frequency_label.bimonthly"),
    monthly: t("payment.frequency_label.monthly"),
  };

  const selectedAddonDetails = availableAddons.filter((a: AddonConfig) =>
    selectedAddons.includes(a.id),
  );
  const selectedRoomCategories: string[] = plusConfig?.room_categories || [];
  const addonsTotal = selectedAddonDetails.reduce(
    (sum: number, a: AddonConfig) => {
      const price =
        typeof (a as any).price === "number"
          ? (a as any).price
          : parseFloat((a as any).price) || 0;
      return sum + price;
    },
    0,
  );

  return (
    <div className="min-h-screen px-6 py-8">
      <div className="max-w-2xl mx-auto pb-40">
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" onClick={onBack} className="rounded-full">
            <ArrowLeft className="w-6 h-6" />
          </Button>
          <h1 className="text-2xl font-bold">{t("payment.summary.title")}</h1>
        </div>

        <div className="space-y-6">
          <Card className="p-6 bg-[#F7F9FA] border-none rounded-[24px]">
            <p className="text-[13px] font-bold text-gray-400 uppercase mb-3">
              {t("payment.summary.overview_label")}
            </p>
            <p className="text-[20px] font-bold">{selectedPlan.name}</p>
            <p className="text-[24px] font-bold text-[#92C7CF] mt-1">
              €{originalPrice.toFixed(2)}
              {selectedPlan.plan_type !== "one_time"
                ? ` / ${t("payment.plan.per_week")}`
                : ""}
            </p>
            {plusConfig && (
              <div className="mt-4 flex flex-wrap gap-2">
                {plusConfig.frequency && (
                  <Badge
                    variant="outline"
                    className="text-[#92C7CF] border-[#92C7CF] font-bold bg-white"
                  >
                    {frequencyLabel[plusConfig.frequency]}
                  </Badge>
                )}
                {plusConfig.session_type && (
                  <Badge
                    variant="outline"
                    className="text-[#92C7CF] border-[#92C7CF] capitalize font-bold bg-white"
                  >
                    {plusConfig.session_type}{" "}
                    {t("payment.frequency_label.session_suffix")}
                  </Badge>
                )}
              </div>
            )}
          </Card>
          
          {selectedAddonDetails.length > 0 && (
            <Card className="p-6 bg-[#F7F9FA] border-none rounded-[24px]">
              <p className="text-[13px] font-bold text-gray-400 uppercase mb-4">
                {t("payment.addons.selected_title")}
              </p>
              <div className="space-y-3">
                {selectedAddonDetails.map((addon: AddonConfig) => (
                  <div key={addon.id}>
                    <div className="flex justify-between items-center">
                      <span className="text-[15px] font-bold text-gray-700">
                        {addon.name}
                      </span>
                      <span className="text-[15px] font-bold text-[#92C7CF]">
                        {addon.display_price}
                      </span>
                    </div>
                    {isRoomsAddon(addon) &&
                      selectedRoomCategories.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {selectedRoomCategories.map((cat) => (
                            <span
                              key={cat}
                              className="text-[11px] font-bold px-2.5 py-1 bg-white border border-gray-100 rounded-full text-gray-400"
                            >
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

          <Card className="p-6 bg-[#F7F9FA] border-none rounded-[24px]">
            <p className="text-[13px] font-bold text-gray-400 uppercase mb-3">
              {t("payment.summary.method_label")}
            </p>
            <p className="text-[17px] font-bold">{paymentMethodName}</p>
          </Card>

          <Card className="p-6 border-2 border-gray-100 rounded-[24px]">
            <div className="flex items-center gap-2 mb-4">
              <Tag className="w-4 h-4 text-[#92C7CF]" />
              <p className="font-bold text-[15px] text-gray-700">
                {t("payment.coupon.have_code")}
              </p>
            </div>

            {couponResult?.valid ? (
              <div className="flex items-center gap-4 p-4 bg-green-50 border-2 border-green-100 rounded-[20px]">
                <Check className="w-5 h-5 text-green-500 flex-shrink-0" />
                <div className="flex-1">
                  <p className="font-bold text-green-700">
                    {couponCode.toUpperCase()}
                  </p>
                  <p className="text-[13px] text-green-600 font-medium">
                    -
                    {couponResult.coupon?.discount_type === "percentage"
                      ? `${couponResult.coupon.discount_value}%`
                      : `€${couponResult.discount_amount?.toFixed(2)}`}{" "}
                    {t("payment.coupon.discount_applied")}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onRemoveCoupon}
                  className="text-gray-400 hover:text-red-500 h-8 w-8 p-0"
                >
                  <X className="w-5 h-5" />
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-3">
                  <Input
                    placeholder={t("payment.coupon.placeholder")}
                    value={couponCode}
                    onChange={(e) =>
                      onCouponCodeChange(e.target.value.toUpperCase())
                    }
                    className="uppercase rounded-[16px] h-12 font-bold border-gray-100"
                    onKeyDown={(e) => e.key === "Enter" && onApplyCoupon()}
                  />
                  <Button
                    onClick={onApplyCoupon}
                    disabled={!couponCode.trim() || isCouponLoading}
                    className="bg-[#92C7CF] hover:bg-[#7FB0B8] text-white px-6 rounded-[16px] h-12 font-bold"
                  >
                    {isCouponLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      t("payment.coupon.apply")
                    )}
                  </Button>
                </div>
                {couponResult?.error && (
                  <p className="text-[13px] text-red-500 font-bold flex items-center gap-1 px-1">
                    <AlertCircle className="w-4 h-4" />
                    {couponResult.error}
                  </p>
                )}
              </div>
            )}
          </Card>

          <Card className="p-6 border-2 border-gray-100 rounded-[24px]">
            <div className="space-y-4">
              <div className="flex justify-between">
                <span className="text-gray-500 font-bold text-[15px]">
                  {t("payment.summary.subtotal")}
                </span>
                <span className="font-bold text-[15px]">€{originalPrice.toFixed(2)}</span>
              </div>

              {addonsTotal > 0 && (
                <div className="flex justify-between">
                  <span className="text-gray-500 font-bold text-[15px]">
                    {t("payment.summary.addons_label")}
                  </span>
                  <span className="font-bold text-[15px]">€{addonsTotal.toFixed(2)}</span>
                </div>
              )}

              {hasDiscount && (
                <div className="flex justify-between text-green-600">
                  <span className="font-bold text-[15px]">
                    {t("payment.summary.discount_label")} (
                    {couponCode.toUpperCase()})
                  </span>
                  <span className="font-bold text-[15px]">
                    -€{couponResult.discount_amount?.toFixed(2)}
                  </span>
                </div>
              )}

              <div className="border-t pt-4 flex justify-between items-center">
                <span className="text-[18px] font-bold">
                  {t("payment.summary.total")}
                </span>
                <span className="text-[22px] font-bold text-[#92C7CF]">
                  €{finalPrice.toFixed(2)}
                </span>
              </div>

              {selectedPlan.plan_type !== "one_time" && (
                <p className="text-[12px] text-gray-400 text-center font-medium pt-2">
                  {t("payment.summary.billed_note")}
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-6 bg-white/90 backdrop-blur-md border-t border-gray-50">
        <div className="max-w-2xl mx-auto space-y-4">
          <Button
            onClick={onConfirm}
            disabled={isLoading}
            className="w-full h-14 rounded-full bg-[#92C7CF] hover:bg-[#7FB0B8] text-white text-lg font-bold shadow-md transition-all active:scale-[0.98] disabled:bg-gray-400"
          >
            {isLoading ? (
              <div className="flex items-center gap-3">
                <Loader2 className="h-5 w-5 animate-spin" />
                {t("payment.summary.processing")}
              </div>
            ) : (
              `${t("payment.summary.pay_button")} €${finalPrice.toFixed(2)}`
            )}
          </Button>

          {isLocalhost && (
            <Button
              onClick={mockPayment}
              disabled={isLoading}
              variant="outline"
              className="w-full h-12 rounded-full border-2 border-orange-500 text-orange-500 hover:bg-orange-50 font-bold disabled:opacity-50"
            >
              🎭 {t("payment.mock_dev")}
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
    <div className="min-h-screen flex items-center justify-center p-8 bg-white">
      <div className="max-w-md w-full text-center">
        <div className="w-28 h-28 bg-[#F7F9FA] rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner">
          <Check className="w-14 h-14 text-[#92C7CF]" />
        </div>
        <h1 className="text-[32px] font-bold mb-4 text-black leading-tight">
          {t("payment.success.title")}
        </h1>
        <p className="text-gray-500 mb-10 text-[16px] font-medium px-4">
          {t("payment.success.message")}
        </p>
        <Button
          onClick={onContinue}
          className="w-full h-14 rounded-full bg-[#92C7CF] hover:bg-[#7FB0B8] text-white text-lg font-bold shadow-lg transition-all active:scale-[0.98]"
        >
          {t("payment.subscription.continue")}
        </Button>
      </div>
    </div>
  );
};

export default Payment;