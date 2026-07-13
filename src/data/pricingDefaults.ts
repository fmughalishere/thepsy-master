export type PricingPlanCategory =
    | 'basic'
    | 'plus'
    | 'one_time'
    | 'therapy_couples'
    | 'coaching';

export interface PlanPricingDefault {
    id: string;
    name: string;
    category: PricingPlanCategory;
    currency: string;
    price: number;
    actual_charge?: number;
    display_price: string;
    display_billing?: string;
    has_weekly_frequency?: boolean; // Plus plan uses frequency_prices.weekly
    // How many times `price` repeats to reach the monthly billed total.
    // 4 for "1x per week" plans (billed monthly = price x 4).
    // 1 for bimonthly/monthly/one-time plans (price IS already the billed total).
    // Defaults to 1 if omitted.
    monthly_multiplier?: number;
    unit_label: string; // shown next to the price input, e.g. "/week" or "/month"
}

export interface AddonPricingDefault {
    id: string;
    name: string;
    description?: string;
    currency: string;
    price: number;
    display_price: string;
    unit_label: string;
}

export const PLAN_CATEGORY_LABELS: Record<PricingPlanCategory, string> = {
    basic: 'Basic Plan',
    plus: 'Plus Plan (Individual Therapy)',
    one_time: 'One-Time Session',
    therapy_couples: 'Couples Therapy',
    coaching: 'Coaching',
};

export const DEFAULT_PLAN_PRICING: PlanPricingDefault[] = [
    {
        id: 'basic_monthly', name: 'Basic Plan', category: 'basic', currency: 'EUR',
        price: 9.99, actual_charge: 39.96,
        display_price: '€9.99/week', display_billing: 'Billed monthly at €39.96',
        monthly_multiplier: 4,
        unit_label: '/week',
    },
    {
        id: 'plus_weekly', name: 'Plus Plan — 1x per week', category: 'plus', currency: 'EUR',
        price: 64.99, actual_charge: 259.96,
        display_price: '€64.99/week', display_billing: 'Billed monthly at €259.96 · 1 session per week',
        has_weekly_frequency: true,
        monthly_multiplier: 4,
        unit_label: '/week',
    },
    {
        id: 'plus_bimonthly', name: 'Plus Plan — 2x per month', category: 'plus', currency: 'EUR',
        price: 34.99, actual_charge: 34.99,
        display_price: '€34.99/month', display_billing: '2 sessions per month',
        monthly_multiplier: 1,
        unit_label: '/month',
    },
    {
        id: 'plus_monthly', name: 'Plus Plan — 1x per month', category: 'plus', currency: 'EUR',
        price: 19.99, actual_charge: 19.99,
        display_price: '€19.99/month', display_billing: '1 session per month',
        monthly_multiplier: 1,
        unit_label: '/month',
    },
    {
        id: 'one_time_session', name: 'One-Time Session', category: 'one_time', currency: 'EUR',
        price: 79.99, actual_charge: 79.99,
        display_price: '€79.99/session', display_billing: 'One-time payment',
        monthly_multiplier: 1,
        unit_label: '/session',
    },
    {
        id: 'couples_support_monthly', name: 'Couples Therapy — 1x per week', category: 'therapy_couples', currency: 'EUR',
        price: 84.99, actual_charge: 339.96,
        display_price: '€84.99/week', display_billing: 'Billed monthly at €339.96',
        monthly_multiplier: 4,
        unit_label: '/week',
    },
    {
        id: 'therapy_couples_bimonthly', name: 'Couples Therapy — 2x per month', category: 'therapy_couples', currency: 'EUR',
        price: 44.99, actual_charge: 44.99,
        display_price: '€44.99/month', display_billing: '2 sessions per month',
        monthly_multiplier: 1,
        unit_label: '/month',
    },
    {
        id: 'therapy_couples_monthly', name: 'Couples Therapy — 1x per month', category: 'therapy_couples', currency: 'EUR',
        price: 29.99, actual_charge: 29.99,
        display_price: '€29.99/month', display_billing: '1 session per month',
        monthly_multiplier: 1,
        unit_label: '/month',
    },
    {
        id: 'coaching_weekly', name: 'Coaching — 1x per week', category: 'coaching', currency: 'EUR',
        price: 49.99, actual_charge: 199.96,
        display_price: '€49.99/week', display_billing: 'Billed monthly at €199.96 · 30-minute sessions',
        monthly_multiplier: 4,
        unit_label: '/week',
    },
    {
        id: 'coaching_bimonthly', name: 'Coaching — 2x per month', category: 'coaching', currency: 'EUR',
        price: 24.99, actual_charge: 24.99,
        display_price: '€24.99/month', display_billing: '30-minute sessions · 2x per month',
        monthly_multiplier: 1,
        unit_label: '/month',
    },
    {
        id: 'coaching_monthly', name: 'Coaching — 1x per month', category: 'coaching', currency: 'EUR',
        price: 14.99, actual_charge: 14.99,
        display_price: '€14.99/month', display_billing: '30-minute sessions · 1x per month',
        monthly_multiplier: 1,
        unit_label: '/month',
    },
];

export const DEFAULT_ADDON_PRICING: AddonPricingDefault[] = [
    { id: 'hypnosis', name: 'Hypnosis Session', description: 'Guided hypnotherapy session', currency: 'EUR', price: 0, display_price: 'TBD', unit_label: '/session' },
    { id: 'emdr', name: 'EMDR Session', description: 'Eye Movement Desensitization and Reprocessing', currency: 'EUR', price: 0, display_price: 'TBD', unit_label: '/session' },
    { id: 'rooms', name: 'Rooms (Community Spaces)', description: 'Access to community support spaces', currency: 'EUR', price: 4.99, display_price: '€4.99', unit_label: '' },
    { id: 'group_sessions', name: 'Group Sessions', description: 'Join group therapy sessions', currency: 'EUR', price: 4.99, display_price: '€4.99', unit_label: '/session' },
    { id: 'diagnostics_autism', name: 'Diagnostics — Autism', description: 'Professional autism diagnostic assessment', currency: 'EUR', price: 0, display_price: 'TBD', unit_label: '' },
    { id: 'diagnostics_adhd', name: 'Diagnostics — ADHD', description: 'Professional ADHD diagnostic assessment', currency: 'EUR', price: 0, display_price: 'TBD', unit_label: '' },
    { id: 'diagnostics_depression', name: 'Diagnostics — Depression', description: 'Professional depression diagnostic assessment', currency: 'EUR', price: 0, display_price: 'TBD', unit_label: '' },
    { id: 'reports', name: 'Reports (Findings)', description: 'Detailed therapy progress reports', currency: 'EUR', price: 0, display_price: 'TBD', unit_label: '' },
    { id: 'additional_sessions', name: 'Additional Sessions', description: 'Extra therapy sessions (Basic plan)', currency: 'EUR', price: 0, display_price: 'TBD', unit_label: '/session' },
];
