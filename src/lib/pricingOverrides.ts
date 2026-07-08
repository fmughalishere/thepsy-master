import { doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { TherapySessionPlan, AddonConfig } from '@/types/payment';

export const PRICING_PLANS_DOC = doc(db, 'pricing', 'plans');
export const PRICING_ADDONS_DOC = doc(db, 'pricing', 'addons');

export interface PlanPriceOverride {
    price?: number;
    actual_charge?: number;
    display_price?: string;
    display_billing?: string;
    frequency_prices?: { weekly?: number; bimonthly?: number; monthly?: number };
}

export interface AddonPriceOverride {
    price?: number;
    display_price?: string;
}

export type PlanPriceOverrideMap = Record<string, PlanPriceOverride>;
export type AddonPriceOverrideMap = Record<string, AddonPriceOverride>;

// Merge an admin-edited price override on top of a Remote-Config-sourced plan.
// Everything except price-related fields (name, features, quotas, stripe ids,
// translations) always comes from Remote Config.
export const mergePlanWithPriceOverride = (
    plan: TherapySessionPlan,
    override?: PlanPriceOverride,
): TherapySessionPlan => {
    if (!override) return plan;
    return {
        ...plan,
        price: override.price ?? plan.price,
        actual_charge: override.actual_charge ?? plan.actual_charge,
        display_price: override.display_price ?? plan.display_price,
        display_billing: override.display_billing ?? plan.display_billing,
        frequency_prices: override.frequency_prices
            ? { ...plan.frequency_prices, ...override.frequency_prices }
            : plan.frequency_prices,
    };
};

export const mergeAddonWithPriceOverride = (
    addon: AddonConfig,
    override?: AddonPriceOverride,
): AddonConfig => {
    if (!override) return addon;
    return {
        ...addon,
        price: override.price ?? addon.price,
        display_price: override.display_price ?? addon.display_price,
    };
};
