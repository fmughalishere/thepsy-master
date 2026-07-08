import { useEffect, useMemo, useState } from "react";
import { onSnapshot, setDoc, updateDoc } from "firebase/firestore";
import {
    PRICING_PLANS_DOC, PRICING_ADDONS_DOC,
    type PlanPriceOverride as PlanOverride, type AddonPriceOverride as AddonOverride,
} from "@/lib/pricingOverrides";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
    Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import { AlertTriangle, Save, RefreshCw, Banknote } from "lucide-react";
import { toast } from "sonner";
import {
    DEFAULT_PLAN_PRICING, DEFAULT_ADDON_PRICING, PLAN_CATEGORY_LABELS,
    type PlanPricingDefault, type AddonPricingDefault, type PricingPlanCategory,
} from "@/data/pricingDefaults";

// Firestore documents that hold the live price overrides. Only the fields
// actually edited here are written; everything else (names, features,
// Stripe price IDs, quotas, translations) keeps coming from Remote Config.
const PLANS_DOC = PRICING_PLANS_DOC;
const ADDONS_DOC = PRICING_ADDONS_DOC;

const CATEGORY_ORDER: PricingPlanCategory[] = [
    "basic", "plus", "one_time", "therapy_couples", "coaching",
];

const currencySymbol = (currency: string) => (currency === "EUR" ? "€" : currency + " ");

const PlanCard = ({
    plan, override, onSave,
}: {
    plan: PlanPricingDefault;
    override?: PlanOverride;
    onSave: (id: string, values: PlanOverride) => Promise<void>;
}) => {
    const initial: PlanOverride = {
        price: override?.price ?? plan.price,
        actual_charge: override?.actual_charge ?? plan.actual_charge,
        display_price: override?.display_price ?? plan.display_price,
        display_billing: override?.display_billing ?? plan.display_billing,
        frequency_prices: {
            weekly: override?.frequency_prices?.weekly ?? plan.price,
        },
    };
    const [values, setValues] = useState<PlanOverride>(initial);
    const [saving, setSaving] = useState(false);

    // Keep local form in sync if another admin changes it live.
    useEffect(() => {
        setValues(initial);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(override)]);

    const handleSave = async () => {
        setSaving(true);
        try {
            await onSave(plan.id, values);
            toast.success(`${plan.name} price updated`);
        } catch (e: any) {
            toast.error(e?.message || "Failed to save price");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card className="border-gray-200">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                    <CardTitle className="text-base font-semibold">{plan.name}</CardTitle>
                    <Badge variant="outline" className="text-xs font-mono">{plan.id}</Badge>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <Label className="text-xs text-gray-500">Price ({plan.currency}{plan.unit_label})</Label>
                        <div className="relative mt-1">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                                {currencySymbol(plan.currency)}
                            </span>
                            <Input
                                type="number" step="0.01" min="0"
                                className="pl-7"
                                value={values.price ?? 0}
                                onChange={(e) => setValues(v => ({ ...v, price: parseFloat(e.target.value) || 0 }))}
                            />
                        </div>
                    </div>

                    {plan.has_weekly_frequency && (
                        <div>
                            <Label className="text-xs text-gray-500">Weekly frequency price</Label>
                            <div className="relative mt-1">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                                    {currencySymbol(plan.currency)}
                                </span>
                                <Input
                                    type="number" step="0.01" min="0"
                                    className="pl-7"
                                    value={values.frequency_prices?.weekly ?? 0}
                                    onChange={(e) => setValues(v => ({
                                        ...v, frequency_prices: { weekly: parseFloat(e.target.value) || 0 },
                                    }))}
                                />
                            </div>
                        </div>
                    )}

                    {plan.actual_charge !== undefined && (
                        <div>
                            <Label className="text-xs text-gray-500">Billed amount (monthly total)</Label>
                            <div className="relative mt-1">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                                    {currencySymbol(plan.currency)}
                                </span>
                                <Input
                                    type="number" step="0.01" min="0"
                                    className="pl-7"
                                    value={values.actual_charge ?? 0}
                                    onChange={(e) => setValues(v => ({ ...v, actual_charge: parseFloat(e.target.value) || 0 }))}
                                />
                            </div>
                        </div>
                    )}

                    <div>
                        <Label className="text-xs text-gray-500">Display price text</Label>
                        <Input
                            className="mt-1"
                            value={values.display_price ?? ""}
                            onChange={(e) => setValues(v => ({ ...v, display_price: e.target.value }))}
                        />
                    </div>

                    {plan.display_billing !== undefined && (
                        <div className="sm:col-span-2">
                            <Label className="text-xs text-gray-500">Display billing text</Label>
                            <Input
                                className="mt-1"
                                value={values.display_billing ?? ""}
                                onChange={(e) => setValues(v => ({ ...v, display_billing: e.target.value }))}
                            />
                        </div>
                    )}
                </div>

                <div className="flex justify-end">
                    <Button size="sm" onClick={handleSave} disabled={saving} className="bg-[#92C7CF] hover:bg-[#7fb5be] text-white">
                        {saving ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                        Save
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
};

const AddonCard = ({
    addon, override, onSave,
}: {
    addon: AddonPricingDefault;
    override?: AddonOverride;
    onSave: (id: string, values: AddonOverride) => Promise<void>;
}) => {
    const initial: AddonOverride = {
        price: override?.price ?? addon.price,
        display_price: override?.display_price ?? addon.display_price,
    };
    const [values, setValues] = useState<AddonOverride>(initial);
    const [saving, setSaving] = useState(false);

    useEffect(() => {
        setValues(initial);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [JSON.stringify(override)]);

    const handleSave = async () => {
        setSaving(true);
        try {
            await onSave(addon.id, values);
            toast.success(`${addon.name} price updated`);
        } catch (e: any) {
            toast.error(e?.message || "Failed to save price");
        } finally {
            setSaving(false);
        }
    };

    return (
        <Card className="border-gray-200">
            <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                    <CardTitle className="text-base font-semibold">{addon.name}</CardTitle>
                    <Badge variant="outline" className="text-xs font-mono">{addon.id}</Badge>
                </div>
                {addon.description && <CardDescription>{addon.description}</CardDescription>}
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <Label className="text-xs text-gray-500">Price ({addon.currency}{addon.unit_label})</Label>
                        <div className="relative mt-1">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                                {currencySymbol(addon.currency)}
                            </span>
                            <Input
                                type="number" step="0.01" min="0"
                                className="pl-7"
                                value={values.price ?? 0}
                                onChange={(e) => setValues(v => ({ ...v, price: parseFloat(e.target.value) || 0 }))}
                            />
                        </div>
                    </div>
                    <div>
                        <Label className="text-xs text-gray-500">Display price text</Label>
                        <Input
                            className="mt-1"
                            value={values.display_price ?? ""}
                            onChange={(e) => setValues(v => ({ ...v, display_price: e.target.value }))}
                        />
                    </div>
                </div>
                <div className="flex justify-end">
                    <Button size="sm" onClick={handleSave} disabled={saving} className="bg-[#92C7CF] hover:bg-[#7fb5be] text-white">
                        {saving ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
                        Save
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
};

const PricingManagement = () => {
    const [planOverrides, setPlanOverrides] = useState<Record<string, PlanOverride>>({});
    const [addonOverrides, setAddonOverrides] = useState<Record<string, AddonOverride>>({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Ensure both docs exist so later updateDoc() calls don't fail on first use.
        setDoc(PLANS_DOC, {}, { merge: true }).catch(() => { });
        setDoc(ADDONS_DOC, {}, { merge: true }).catch(() => { });

        let plansLoaded = false;
        let addonsLoaded = false;
        const maybeStopLoading = () => { if (plansLoaded && addonsLoaded) setLoading(false); };

        const unsubPlans = onSnapshot(PLANS_DOC, (snap) => {
            setPlanOverrides((snap.data() as Record<string, PlanOverride>) || {});
            plansLoaded = true;
            maybeStopLoading();
        });
        const unsubAddons = onSnapshot(ADDONS_DOC, (snap) => {
            setAddonOverrides((snap.data() as Record<string, AddonOverride>) || {});
            addonsLoaded = true;
            maybeStopLoading();
        });
        return () => { unsubPlans(); unsubAddons(); };
    }, []);

    const savePlan = async (id: string, values: PlanOverride) => {
        const payload: Record<string, any> = {
            [`${id}.price`]: values.price,
            [`${id}.display_price`]: values.display_price,
        };
        if (values.actual_charge !== undefined) payload[`${id}.actual_charge`] = values.actual_charge;
        if (values.display_billing !== undefined) payload[`${id}.display_billing`] = values.display_billing;
        if (values.frequency_prices?.weekly !== undefined) payload[`${id}.frequency_prices.weekly`] = values.frequency_prices.weekly;
        await updateDoc(PLANS_DOC, payload);
    };

    const saveAddon = async (id: string, values: AddonOverride) => {
        await updateDoc(ADDONS_DOC, {
            [`${id}.price`]: values.price,
            [`${id}.display_price`]: values.display_price,
        });
    };

    const plansByCategory = useMemo(() => {
        const grouped: Record<string, PlanPricingDefault[]> = {};
        DEFAULT_PLAN_PRICING.forEach(plan => {
            grouped[plan.category] = grouped[plan.category] || [];
            grouped[plan.category].push(plan);
        });
        return grouped;
    }, []);

    if (loading) {
        return (
            <div className="flex items-center justify-center py-24">
                <RefreshCw className="h-6 w-6 animate-spin text-[#92C7CF]" />
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto space-y-6 pb-10">
            <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-[#eef7f8] flex items-center justify-center">
                    <Banknote className="h-5 w-5 text-[#508C96]" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">Pricing Management</h1>
                    <p className="text-sm text-gray-500">Manage all plan, therapy, coaching and add-on prices from one place.</p>
                </div>
            </div>

            <Alert className="border-amber-300 bg-amber-50">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <AlertTitle className="text-amber-800">Display only — not connected to Stripe yet</AlertTitle>
                <AlertDescription className="text-amber-700">
                    Changing a price here updates what users <strong>see</strong> in the app instantly. It does <strong>not</strong> change
                    what Stripe actually charges — that still depends on the Stripe Price ID configured for each plan/add-on.
                    Keep both in sync manually until Stripe automation is added.
                </AlertDescription>
            </Alert>

            <Accordion type="multiple" defaultValue={["basic", "plus"]} className="space-y-3">
                {CATEGORY_ORDER.map((category) => (
                    <AccordionItem key={category} value={category} className="border border-gray-200 rounded-lg px-4 bg-white">
                        <AccordionTrigger className="hover:no-underline">
                            <span className="font-semibold text-gray-800">{PLAN_CATEGORY_LABELS[category]}</span>
                            <Badge variant="secondary" className="ml-3">{plansByCategory[category]?.length || 0} plan(s)</Badge>
                        </AccordionTrigger>
                        <AccordionContent className="space-y-4 pt-2">
                            {(plansByCategory[category] || []).map(plan => (
                                <PlanCard
                                    key={plan.id}
                                    plan={plan}
                                    override={planOverrides[plan.id]}
                                    onSave={savePlan}
                                />
                            ))}
                        </AccordionContent>
                    </AccordionItem>
                ))}

                <AccordionItem value="addons" className="border border-gray-200 rounded-lg px-4 bg-white">
                    <AccordionTrigger className="hover:no-underline">
                        <span className="font-semibold text-gray-800">Add-ons (Rooms, Group Sessions, Hypnosis, EMDR, Diagnostics, Reports...)</span>
                        <Badge variant="secondary" className="ml-3">{DEFAULT_ADDON_PRICING.length} item(s)</Badge>
                    </AccordionTrigger>
                    <AccordionContent className="space-y-4 pt-2">
                        {DEFAULT_ADDON_PRICING.map(addon => (
                            <AddonCard
                                key={addon.id}
                                addon={addon}
                                override={addonOverrides[addon.id]}
                                onSave={saveAddon}
                            />
                        ))}
                    </AccordionContent>
                </AccordionItem>
            </Accordion>
        </div>
    );
};

export default PricingManagement;
