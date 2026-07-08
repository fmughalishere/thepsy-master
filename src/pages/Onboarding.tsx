import React from 'react';
import { useTranslation } from 'react-i18next';

const Onboarding = () => {
    const { t } = useTranslation();

    return (
        <div className="flex items-center justify-center min-h-screen">
            <h1 className="text-2xl font-serif">{t('common.onboarding_placeholder', 'Onboarding Screen (Placeholder)')}</h1>
        </div>
    );
};

export default Onboarding;
