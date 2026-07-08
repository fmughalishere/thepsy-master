import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Clock, CheckCircle, AlertCircle, LogOut } from "lucide-react";
import { useTranslation } from "react-i18next";

const PendingApproval = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [user, setUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const checkUserStatus = async () => {
            if (auth.currentUser) {
                try {
                    const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
                    if (userDoc.exists()) {
                        const userData = userDoc.data();
                        setUser(userData);

                        // If status changed to approved, redirect to dashboard
                        const therapistStatus = userData.therapistDetails?.profileStatus;
                        if (therapistStatus === "APPROVED") {
                            navigate("/therapist/dashboard");
                        } else if (therapistStatus === "REJECTED") {
                            navigate("/therapist/application-rejected");
                        }
                    }
                } catch (error) {
                    console.error("Error fetching user data:", error);
                }
            }
            setLoading(false);
        };

        checkUserStatus();

        // Check status every 30 seconds
        const interval = setInterval(checkUserStatus, 30000);

        return () => clearInterval(interval);
    }, [navigate]);

    const handleLogout = async () => {
        await auth.signOut();
        navigate("/login");
    };



    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB]">
                <div className="animate-spin h-8 w-8 border-4 border-[#92C7CF] rounded-full border-t-transparent"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-6 sm:p-8 font-sans">
            <div className="max-w-lg w-full">
                {/* Header */}
                <div className="flex justify-between items-center mb-10">
                    <h1 className="text-2xl font-bold text-[#508C96] tracking-tight">PSY</h1>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleLogout}
                        className="text-gray-600 hover:text-[#508C96] hover:bg-[#eef7f8]"
                    >
                        <LogOut className="w-4 h-4 mr-2" />
                        {t('common.logout', 'Logout')}
                    </Button>
                </div>

                <Card className="p-8 sm:p-10 text-center border-none shadow-xl rounded-[32px]">
                    {/* Status Icon */}
                    <div className="w-24 h-24 bg-orange-50 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner">
                        <Clock className="w-12 h-12 text-orange-500" />
                    </div>

                    {/* Title */}
                    <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 mb-6 font-kalnia leading-tight">
                        {t('therapist.pending.title', 'Profile Under Review')}
                    </h2>

                    {/* Description */}
                    <div className="bg-[#f0f7f8] rounded-2xl p-6 mt-8 border border-[#e0eff1]">
                        <div className="flex items-center justify-center gap-3 text-[#508C96] mb-4">
                            <AlertCircle className="w-5 h-5 flex-shrink-0" />
                            <span className="text-sm sm:text-base font-semibold uppercase tracking-wider">{t('therapist.pending.what_happens_next', 'What happens next?')}</span>
                        </div>
                        <div className="text-sm text-gray-600 text-left space-y-3 font-shippori leading-relaxed">
                            <div className="flex gap-2">
                                <span className="text-[#92C7CF] font-bold">•</span>
                                <span>{t('therapist.pending.step1', 'We verify your credentials and license')}</span>
                            </div>
                            <div className="flex gap-2">
                                <span className="text-[#92C7CF] font-bold">•</span>
                                <span>{t('therapist.pending.step2', 'Review your professional background')}</span>
                            </div>
                            <div className="flex gap-2">
                                <span className="text-[#92C7CF] font-bold">•</span>
                                <span>{t('therapist.pending.step3', 'Approve your profile for patient matching')}</span>
                            </div>
                        </div>
                    </div>

                    {/* Profile Info */}
                    {user && (
                        <div className="mt-10 pt-8 border-t border-gray-100 flex flex-col gap-4">
                            <div className="flex flex-col sm:flex-row justify-between text-left sm:text-right gap-1 sm:gap-4">
                                <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{t('therapist.pending.submitted', 'Submitted')}</span>
                                <span className="text-sm font-medium text-gray-900">
                                    {user.createdAt ?
                                        (typeof user.createdAt.toDate === 'function'
                                            ? new Date(user.createdAt.toDate()).toLocaleDateString()
                                            : new Date(user.createdAt).toLocaleDateString())
                                        : t('common.recently', 'Recently')
                                    }
                                </span>
                            </div>

                            <div className="flex flex-col sm:flex-row justify-between text-left sm:text-right gap-1 sm:gap-4">
                                <span className="text-xs font-semibold text-gray-400 uppercase tracking-widest">{t('therapist.pending.country', 'Country')}</span>
                                <span className="text-sm font-medium text-gray-900 truncate">{user.country || t('common.not_specified', 'Not specified')}</span>
                            </div>
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
};

export default PendingApproval;
