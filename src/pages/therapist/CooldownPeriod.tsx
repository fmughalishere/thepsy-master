import React from "react";
import { useTranslation } from "react-i18next";
import { Clock, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import LanguageSwitcher from "@/components/LanguageSwitcher";

const CooldownPeriod = () => {
    const { t } = useTranslation();

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
            <div className="absolute top-4 right-4">
                <LanguageSwitcher />
            </div>

            <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8 text-center border border-blue-50">
                <div className="w-20 h-20 bg-blue-50 rounded-full flex items-center justify-center mx-auto mb-6">
                    <Clock className="w-10 h-10 text-blue-500" />
                </div>

                <h1 className="text-2xl text-gray-900 mb-4 font-kalnia">
                    {t('cooldown_state.title')}
                </h1>

                <p className="text-gray-600 mb-4 leading-relaxed">
                    {t('cooldown_state.message')}
                </p>

                <p className="text-sm text-gray-500 mb-8 italic">
                    {t('cooldown_state.subtitle')}
                </p>

                <div className="space-y-4">
                    <Button
                        variant="outline"
                        className="w-full flex items-center justify-center gap-2"
                        onClick={() => window.location.href = "mailto:info@thepsy.de"}
                    >
                        <Mail className="w-4 h-4" />
                        {t('cooldown_state.contact_us')}
                    </Button>

                    <Button
                        variant="ghost"
                        className="w-full text-gray-500"
                        onClick={() => window.location.href = "/login"}
                    >
                        {t('login.logout', 'Sign Out')}
                    </Button>
                </div>
            </div>

            <p className="mt-8 text-sm text-gray-400">
                &copy; {new Date().getFullYear()} ThePsy. All rights reserved.
            </p>
        </div>
    );
};

export default CooldownPeriod;
