import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ShieldAlert, Mail, ArrowLeft } from "lucide-react";
import { useTranslation } from "react-i18next";

const AccountRestricted = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const referenceId = useMemo(
        () => `BLK-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
        []
    );

    return (
        <div className="min-h-screen bg-[#F0F7F8] flex items-center justify-center p-4">
            <div className="max-w-md w-full bg-white rounded-[32px] shadow-xl p-8 md:p-12 text-center animate-in zoom-in duration-500">
                <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-8">
                    <ShieldAlert className="w-10 h-10 text-red-500" />
                </div>

                <h1 className="text-3xl text-gray-900 mb-4 font-kalnia">
                    {t('blocked_state.title', 'Account Restricted')}
                </h1>

                <p className="text-gray-600 mb-8 leading-relaxed font-shippori">
                    {t('blocked_state.message', 'Your account has been temporarily blocked due to a policy violation or security concern. Please contact our support team to resolve this issue.')}
                </p>

                <div className="space-y-4">
                    <a
                        href="mailto:info@thepsy.de"
                        className="flex items-center justify-center gap-3 w-full py-4 px-6 bg-[#92C7CF] text-white rounded-2xl font-semibold hover:bg-[#1f454d] transition-all transform hover:scale-[1.02]"
                    >
                        <Mail className="w-5 h-5" />
                        {t('blocked_state.contact_us', 'Contact Support')}
                    </a>

                    <button
                        onClick={() => navigate('/login')}
                        className="flex items-center justify-center gap-2 w-full py-4 text-gray-500 font-medium hover:text-[#92C7CF] transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        {t('common.back_to_login', 'Back to Login')}
                    </button>
                </div>

                <div className="mt-12 pt-8 border-t border-gray-100">
                    <p className="text-xs text-gray-400">
                        {t('blocked_state.reference_id', { code: referenceId, defaultValue: 'Reference ID: {{code}}' })}
                    </p>
                </div>
            </div>
        </div>
    );
};

export default AccountRestricted;
