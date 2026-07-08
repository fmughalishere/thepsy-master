import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { XCircle, LogOut, Mail, Phone } from "lucide-react";
import { useTranslation } from "react-i18next";

const ApplicationRejected = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [user, setUser] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchUserData = async () => {
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
                        } else if (therapistStatus === "APPROVAL_PENDING") {
                            navigate("/therapist/pending-approval");
                        }
                    }
                } catch (error) {
                    console.error("Error fetching user data:", error);
                }
            }
            setLoading(false);
        };

        fetchUserData();
    }, [navigate]);

    const handleLogout = async () => {
        await auth.signOut();
        navigate("/login");
    };

    const handleContactSupport = () => {
        window.open("mailto:info@thepsy.de?subject=Application Review Request", "_blank");
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB]">
                <div className="animate-spin h-8 w-8 border-4 border-[#92C7CF] rounded-full border-t-transparent"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-4">
            <div className="max-w-md w-full">
                {/* Header */}
                <div className="flex justify-between items-center mb-8">
                    <h1 className="text-xl font-bold text-[#508C96]">PSY</h1>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleLogout}
                        className="text-gray-600"
                    >
                        <LogOut className="w-4 h-4 mr-2" />
                        {t('common.logout', 'Logout')}
                    </Button>
                </div>

                <Card className="p-8 text-center">
                    {/* Status Icon */}
                    <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <XCircle className="w-10 h-10 text-red-600" />
                    </div>

                    {/* Title */}
                    <h2 className="text-2xl font-bold text-gray-900 mb-4">
                        {t('therapist.rejection.title', 'Application Not Approved')}
                    </h2>

                    {/* Description */}
                    <p className="text-gray-600 mb-6 leading-relaxed">
                        {t('therapist.rejection.description', 'Unfortunately, we were unable to approve your therapist application at this time. This may be due to incomplete documentation or credential verification issues.')}
                    </p>

                    {/* Rejection Reason */}
                    {user?.rejectionReason && (
                        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
                            <h3 className="font-semibold text-red-800 mb-2">{t('therapist.rejection.reason', 'Reason for Rejection:')}</h3>
                            <p className="text-sm text-red-700">{user.rejectionReason}</p>
                        </div>
                    )}

                    {/* Next Steps */}
                    <div className="bg-blue-50 rounded-lg p-4 mb-6">
                        <h3 className="font-semibold text-blue-800 mb-2">{t('therapist.rejection.what_can_you_do', 'What you can do:')}</h3>
                        <div className="text-sm text-blue-700 space-y-1 text-left">
                            <div>• {t('therapist.rejection.step1', 'Review and update your credentials')}</div>
                            <div>• {t('therapist.rejection.step2', 'Ensure all required documents are valid')}</div>
                            <div>• {t('therapist.rejection.step3', 'Contact our support team for guidance')}</div>
                            <div>• {t('therapist.rejection.step4', 'Resubmit your application when ready')}</div>
                        </div>
                    </div>

                    {/* Action Buttons */}
                    <div className="space-y-3">
                        <Button
                            onClick={handleContactSupport}
                            className="w-full bg-[#92C7CF] hover:bg-[#7FB0B8]"
                        >
                            <Mail className="w-4 h-4 mr-2" />
                            {t('therapist.rejection.contact_support', 'Contact Support')}
                        </Button>

                        <Button
                            onClick={() => navigate("/therapist/complete-profile")}
                            variant="outline"
                            className="w-full"
                        >
                            {t('therapist.rejection.update_application', 'Update Application')}
                        </Button>
                    </div>

                    {/* Support Contact Info */}
                    <div className="mt-6 pt-6 border-t border-gray-200">
                        <p className="text-xs text-gray-500 mb-2">{t('therapist.rejection.need_help', 'Need help? Contact us:')}</p>
                        <div className="flex justify-center gap-4 text-xs text-gray-600">
                            <div className="flex items-center gap-1">
                                <Mail className="w-3 h-3" />
                                info@thepsy.de
                            </div>
                            <div className="flex items-center gap-1">
                                <Phone className="w-3 h-3" />
                                1-800-PSY-HELP
                            </div>
                        </div>
                    </div>

                    {/* Application Info */}
                    {user && (
                        <div className="mt-4 pt-4 border-t border-gray-200">
                            <div className="text-left space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">{t('therapist.rejection.app_id', 'Application ID:')}</span>
                                    <span className="text-gray-900 font-mono text-xs">
                                        {auth.currentUser?.uid.slice(-8).toUpperCase()}
                                    </span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-gray-500">{t('therapist.rejection.reviewed', 'Reviewed:')}</span>
                                    <span className="text-gray-900">
                                        {user.reviewedAt ?
                                            new Date(user.reviewedAt).toLocaleDateString() :
                                            t('common.recently', 'Recently')
                                        }
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}
                </Card>
            </div>
        </div>
    );
};

export default ApplicationRejected;
