import React from 'react';
import { useTranslation } from 'react-i18next';

const TherapyType = () => {
    const { t } = useTranslation();

    return (
        <div className="flex items-center justify-center min-h-screen">
            <h1 className="text-2xl font-serif">{t('common.therapy_type_placeholder', 'Therapy Type Screen (Placeholder)')}</h1>
        </div>
    );
};

export default TherapyType;
