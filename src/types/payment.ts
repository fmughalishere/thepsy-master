// Payment Configuration Models matching PsyCMp

export type PlanCategory = 'basic' | 'plus' | 'coaching' | 'therapy_couples';
export type SessionFrequency = 'weekly' | 'bimonthly' | 'monthly';
export type SessionType = 'individual' | 'couple';

export interface TherapySessionConfig {
    therapy_session_plans_en?: TherapySessionPlan[];
    therapy_session_plans_de?: TherapySessionPlan[];
    therapy_session_plans_hr?: TherapySessionPlan[];
    therapy_session_plans_el?: TherapySessionPlan[];
    session_payment_methods_en?: SessionPaymentMethod[];
    session_payment_methods_de?: SessionPaymentMethod[];
    session_payment_methods_hr?: SessionPaymentMethod[];
    session_payment_methods_el?: SessionPaymentMethod[];
    paypal_config?: PaypalConfig;
    stripe_config: StripeConfig;
    addons?: AddonConfig[];
}

export interface TherapySessionPlan {
    id: string;
    name: string;
    price: number;
    currency: string;
    billing_period: string;
    billing_cycle?: string;
    actual_charge?: number;
    stripe_price_id?: string;
    stripe_product_id?: string;
    features: string[];
    quotas: PlanQuotas;
    display_price: string;
    display_billing?: string;
    popular: boolean;
    plan_type?: 'subscription' | 'one_time';
    // New fields
    plan_category?: PlanCategory;
    session_duration?: 30 | 60;
    available_frequencies?: SessionFrequency[];
    available_session_types?: SessionType[];
    available_addons?: string[]; // addon ids
    requires_frequency_selection?: boolean;
    requires_session_type_selection?: boolean;
    // Frequency-based pricing
    frequency_prices?: FrequencyPricing;
    frequency_stripe_price_ids?: Partial<Record<SessionFrequency, string>>;
}

export interface FrequencyPricing {
    weekly?: number;
    bimonthly?: number;
    monthly?: number;
}

export interface PlanQuotas {
    message_word_limit: number;
    live_sessions_per_month: number;
    session_duration_minutes?: number;
}

export interface AddonConfig {
    id: string;
    name: string;
    description?: string;
    price: number;
    currency: string;
    display_price: string;
    category?: string;
    stripe_price_id?: string;
    available_for_plans?: string[]; // plan ids or 'all'
}

export interface SessionPaymentMethod {
    id: string;
    name: string;
    enabled: boolean;
    logo_url?: string;
    display_name: string;
    supported_cards?: string[];
    require_3ds?: boolean;
    require_redirect?: boolean;
    supported_countries?: string[];
    client_id?: string;
    webhook_id?: string;
    plan_ids?: PaypalPlanMap;
    frequency_plan_ids?: Record<string, Partial<Record<SessionFrequency, string>>>;
}

export type PaypalPlanMap = Record<string, string>;

export interface PaypalConfig {
    environment: 'production' | 'sandbox';
    client_id: string;
    webhook_id: string;
    plan_ids: PaypalPlanMap;
    frequency_plan_ids?: Record<string, Partial<Record<SessionFrequency, string>>>;
    return_url?: string;
    cancel_url?: string;
}

export interface StripeConfig {
    publishable_key: string;
    backend_url: string;
    webhook_endpoint: string;
    success_url: string;
    cancel_url: string;
}

// Coupon Types
export type DiscountType = 'percentage' | 'fixed';
export type CustomerRestriction = 'all' | 'new' | 'existing';
export type CouponStatus = 'active' | 'inactive';

export interface Coupon {
    id?: string;
    code: string;
    name?: string;
    description?: string;
    discount_type: DiscountType;
    discount_value: number;
    status: CouponStatus;
    start_date: string;
    expiry_date: string;
    created_at?: string;
    // Restrictions
    customer_restriction: CustomerRestriction;
    one_time_per_customer: boolean;
    max_redemptions?: number | null;
    max_per_customer?: number | null;
    unlimited_usage: boolean;
    // Package restrictions
    applicable_plans: string[] | 'all';
    min_order_value?: number;
    // Tracking
    source?: string; // influencer, campaign name etc
    total_redemptions?: number;
    total_discount_given?: number;
}

export interface CouponRedemption {
    id?: string;
    coupon_id: string;
    coupon_code: string;
    user_id: string;
    plan_purchased: string;
    original_price: number;
    discount_amount: number;
    final_price: number;
    transaction_id?: string;
    redeemed_at: string;
}

export interface CouponValidationResult {
    valid: boolean;
    error?: string;
    discount_amount?: number;
    final_price?: number;
    coupon?: Coupon;
}

// Plan selection state for Plus plan config
export interface PlusConfigSelection {
    frequency: SessionFrequency;
    session_type: SessionType;
}
