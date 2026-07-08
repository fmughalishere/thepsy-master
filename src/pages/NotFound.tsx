import React from 'react';
import { useTranslation } from 'react-i18next';

const NotFound = () => {
    const { t } = useTranslation();

    return (
        <div className="flex items-center justify-center min-h-screen">
            <h1 className="text-2xl font-serif">{t('common.not_found', '404 - Page Not Found')}</h1>
        </div>
    );
};

export default NotFound;
