const admin = require("firebase-admin");

function parseRemoteConfigParam(param) {
    if (!param || !param.defaultValue || !param.defaultValue.value) return null;
    try {
        return JSON.parse(param.defaultValue.value);
    } catch (error) {
        console.error("[PaymentConfigHelper] Failed to parse Remote Config JSON:", error);
        return null;
    }
}

async function getPaymentConfig(isTest = false) {
    const template = await admin.remoteConfig().getTemplate();
    const primaryKey = isTest ? "debug_payments" : "payments";
    let config = parseRemoteConfigParam(template.parameters[primaryKey]);

    if (!config && isTest && primaryKey === "debug_payments") {
        console.warn("[PaymentConfigHelper] Missing debug_payments config, falling back to payments");
        config = parseRemoteConfigParam(template.parameters["payments"]);
    }

    if (!config) {
        console.error(`[PaymentConfigHelper] Remote Config parameter ${primaryKey} is missing or invalid`);
    }

    return config;
}

function findPlan(config, planId) {
    if (!config || !planId) return null;

    const langKeys = Object.keys(config).filter((key) => key.startsWith("therapy_session_plans_"));
    for (const key of ["therapy_session_plans_en", ...langKeys]) {
        const plans = config[key];
        if (Array.isArray(plans)) {
            const match = plans.find((plan) => plan.id === planId);
            if (match) {
                return match;
            }
        }
    }
    return null;
}

async function getPlanDetails(planId, isTest = false) {
    const config = await getPaymentConfig(isTest);
    if (!config) return null;

    const plan = findPlan(config, planId);
    if (!plan) {
        console.error(`[PaymentConfigHelper] Plan ${planId} not found in Remote Config`);
        return null;
    }

    return {
        id: plan.id,
        name: plan.name,
        price: plan.price,
        currency: plan.currency,
        displayPrice: plan.display_price,
        quotas: {
            messageWordLimit: plan.quotas?.message_word_limit || 0,
            liveSessionsPerMonth: plan.quotas?.live_sessions_per_month || 0
        }
    };
}

async function getPaypalConfig(isTest = false) {
    const config = await getPaymentConfig(isTest);
    if (!config || !config.paypal_config) {
        console.error("[PaymentConfigHelper] paypal_config missing from Remote Config");
        return null;
    }
    return config.paypal_config;
}

module.exports = {
    getPaymentConfig,
    getPlanDetails,
    getPaypalConfig,
};
