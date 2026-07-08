import { useState } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, Mail } from "lucide-react";

const ForgotPassword = () => {
    const { t } = useTranslation();
    const [email, setEmail] = useState("");
    const [isLoading, setIsLoading] = useState(false);
    const [isSent, setIsSent] = useState(false);

    // Hardcoded branding for now to match other auth screens
    const appName = "Psy" // Or use translation

    const handleReset = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!email) {
            toast({ title: t('common.error'), description: t('auth.email_required'), variant: "destructive" });
            return;
        }

        setIsLoading(true);
        try {
            await sendPasswordResetEmail(auth, email);
            setIsSent(true);
            toast({ title: t('common.finish'), description: t('auth.reset_email_sent') });
        } catch (error: any) {
            console.error("Reset pwd error", error);
            let msg = t('auth.errors.failed_send');
            if (error.code === 'auth/user-not-found') msg = t('auth.errors.user_not_found');
            toast({ title: t('common.error'), description: msg, variant: "destructive" });
        }
        setIsLoading(false);
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-[#F0F9FA] to-[#E0F2F5] flex flex-col justify-center items-center p-4">
            <Card className="w-full max-w-md p-8 shadow-xl border-0 bg-white/80 backdrop-blur-sm rounded-3xl">
                <div className="mb-8 text-center">
                    <h1 className="text-3xl font-bold text-[#92C7CF] mb-2">{t('auth.forgot_password.title')}</h1>
                    <p className="text-gray-500">
                        {isSent
                            ? t('auth.reset_check_email')
                            : t('auth.reset_desc')}
                    </p>
                </div>

                {!isSent ? (
                    <form onSubmit={handleReset} className="space-y-6">
                        <div className="space-y-2">
                            <Label htmlFor="email" className="text-gray-700">{t('auth.forgot_password.email')}</Label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-3 h-5 w-5 text-gray-400" />
                                <Input
                                    id="email"
                                    type="email"
                                    placeholder={t('auth.forgot_password.placeholder', 'name@example.com')}
                                    className="pl-10 h-12 bg-gray-50 border-gray-200 focus:border-[#92C7CF] focus:ring-[#92C7CF] rounded-xl"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                />
                            </div>
                        </div>

                        <Button
                            type="submit"
                            disabled={isLoading}
                            className="w-full h-12 bg-[#92C7CF] hover:bg-[#234b53] text-white rounded-xl font-medium text-lg transition-all shadow-lg shadow-[#92C7CF]/20"
                        >
                            {isLoading ? t('common.sending') : t('auth.send_reset_link')}
                        </Button>
                    </form>
                ) : (
                    <div className="text-center space-y-6">
                        <div className="bg-green-100 p-4 rounded-full mx-auto w-16 h-16 flex items-center justify-center">
                            <Mail className="w-8 h-8 text-green-600" />
                        </div>
                        <Button
                            className="w-full h-12 bg-[#92C7CF] hover:bg-[#7fb0b8] text-white rounded-xl"
                            onClick={() => setIsSent(false)} // Or navigate login
                        >
                            {t('auth.resend')}
                        </Button>
                    </div>
                )}

                <div className="mt-8 text-center">
                    <Link to="/login" className="inline-flex items-center text-sm font-medium text-gray-500 hover:text-[#92C7CF] transition-colors">
                        <ArrowLeft className="w-4 h-4 mr-1" />
                        {t('auth.back_to_login')}
                    </Link>
                </div>
            </Card>
        </div>
    );
};

export default ForgotPassword;
