import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuth } from "@/contexts/AuthContext";
// Assets
import logo from "../assets/images/logo.webp";
import introIllustration from "../assets/images/intro_illustration.webp";

// Components
import { Button } from "@/components/ui/button";
import LanguageSwitcher from "@/components/LanguageSwitcher";

const Welcome = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const { currentUser, userData, loading } = useAuth();

    // Redirect if user is already logged in or has seen intro
    useEffect(() => {
        if (!loading) {
            if (currentUser && userData) {
                const userRole = userData.role;

                switch (userRole) {
                    case "ADMIN":
                        navigate("/admin/dashboard");
                        break;
                    case "THERAPIST":
                        const therapistStatus = userData.therapistDetails?.profileStatus;
                        switch (therapistStatus) {
                            case "INCOMPLETE":
                                navigate("/therapist/complete-profile");
                                break;
                            case "APPROVAL_PENDING":
                                navigate("/therapist/pending-approval");
                                break;
                            case "REJECTED":
                                navigate("/therapist/application-rejected");
                                break;
                            case "COOLDOWN":
                                navigate("/therapist/cooldown-period");
                                break;
                            case "APPROVED":
                            default:
                                navigate("/therapist/dashboard");
                                break;
                        }
                        break;
                    case "PATIENT":
                    default:
                        navigate("/dashboard");
                        break;
                }
            } else if (!currentUser) {
                const introShown = localStorage.getItem('introShown');
                if (introShown === 'true') {
                    navigate("/login");
                }
            }
        }
    }, [currentUser, userData, loading, navigate]);

    return (
        <div className="min-h-[100dvh] bg-white p-6 flex flex-col items-center justify-between overflow-x-hidden">
            <LanguageSwitcher />

            <div className="flex-1 flex flex-col items-center justify-center w-full max-w-sm mx-auto">
                {/* Visual Container */}
                <div className="w-full aspect-[340/520] max-h-[70vh] relative flex items-center justify-center">
                    {/* Background Oval Layers - Simplified for performance */}
                    <div className="absolute inset-0 bg-[#FBF9F1] rounded-[150px] md:rounded-[170px]" />
                    <div className="absolute inset-2 bg-white rounded-[140px] md:rounded-[160px]" />
                    <div className="absolute inset-3 bg-[#FBF9F1] rounded-[135px] md:rounded-[156px]" />

                    {/* Content Layer */}
                    <div className="relative z-10 flex flex-col items-center justify-center p-6 w-full text-center">
                        {/* Logo */}
                        <img
                            src={logo}
                            alt="Logo"
                            className="w-[150px] md:w-[165px] h-auto object-contain mb-4"
                            loading="eager"
                        />

                        {/* Intro Illustration */}
                        <img
                            src={introIllustration}
                            alt="Intro Illustration"
                            className="w-[180px] md:w-[200px] h-auto object-contain mb-8"
                            loading="eager"
                        />

                        {/* Title */}
                        <h1 className="text-base md:text-lg text-[#374151] font-normal mb-3 font-kalnia px-2">
                            {t('welcome.intro_title')}
                        </h1>

                        {/* Subtitle */}
                        <p className="text-xs md:text-sm text-[#6B7280] font-normal font-shippori leading-relaxed whitespace-pre-line px-4">
                            {t('welcome.intro_subtitle')}
                        </p>
                    </div>
                </div>
            </div>

            <div className="w-full flex justify-center py-6 mt-auto">
                <Button
                    className="w-[160px] bg-[#92C7CF] hover:bg-[#7FB0B8] text-white rounded-full h-12 text-sm font-medium shadow-md transition-all active:scale-95"
                    onClick={() => {
                        localStorage.setItem('introShown', 'true');
                        navigate("/role");
                    }}
                >
                    {t('welcome.get_started')}
                </Button>
            </div>
        </div>
    );
};

export default Welcome;

