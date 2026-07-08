import React from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { ArrowRight } from "lucide-react";

// Assets
import topImage from "../assets/images/top_image.png";
import logo from "../assets/images/logo.webp";
import femaleIllustration from "../assets/images/femal_illustration.png";
import maleIllustration from "../assets/images/male_illustration.png";

const RoleSelection = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();

    const handleRoleSelect = (role: 'therapist' | 'patient') => {
        sessionStorage.setItem('userRole', role);
        navigate('/login');
    };

    return (
        <div className="min-h-screen bg-white flex flex-col items-center overflow-x-hidden p-6 md:px-0">

            {/* Top Section */}
            <div className="w-full relative h-[250px] mb-8">
                {/* Top Image Background */}
                <img
                    src={topImage}
                    alt="Decoration"
                    className="w-full h-full object-cover absolute top-0 left-0"
                />

                {/* Logo overlaid */}
                <div className="absolute inset-0 flex items-center justify-center pt-8">
                    <img
                        src={logo}
                        alt="Logo"
                        className="h-[120px] object-contain"
                    />
                </div>
            </div>

            {/* Title */}
            <h1 className="text-2xl text-black font-normal font-kalnia mb-12 text-center">
                {t('role_selection.title')}
            </h1>

            {/* Cards Container - Responsive Grid */}
            <div className="w-full max-w-5xl flex flex-col md:flex-row gap-8 justify-center items-center px-4">

                {/* Therapist Card */}
                <div className="w-full max-w-md md:flex-1">
                    <RoleCard
                        label={t('role_selection.therapist.label')}
                        illustration={femaleIllustration}
                        onClick={() => handleRoleSelect('therapist')}
                        color="#508C96"
                    />
                </div>

                {/* Client Card */}
                <div className="w-full max-w-md md:flex-1">
                    <RoleCard
                        label={t('role_selection.client.label')}
                        illustration={maleIllustration}
                        onClick={() => handleRoleSelect('patient')}
                        color="#508C96"
                    />
                </div>

            </div>
        </div>
    );
};

interface RoleCardProps {
    label: string;
    illustration: string;
    onClick: () => void;
    color: string;
}

const RoleCard: React.FC<RoleCardProps> = ({ label, illustration, onClick, color }) => {
    return (
        <div
            onClick={onClick}
            className="w-full h-[120px] bg-white rounded-xl shadow-[0_10px_20px_rgba(0,0,0,0.1)] relative cursor-pointer hover:shadow-lg transition-transform hover:-translate-y-1 overflow-visible"
        >
            <div className="w-full h-full flex items-center">

                {/* Left Content Container */}
                <div className="h-full w-[65%] bg-[#F5F5DC] rounded-[10px] flex items-center justify-between px-4 ml-1 my-1">
                    <span className="text-xl font-medium text-[#508C96] font-sans">
                        {label}
                    </span>

                    {/* Circle Icon */}
                    <div className="w-[36px] h-[36px] bg-[#92C7CF] rounded-full flex items-center justify-center">
                        <ArrowRight className="w-5 h-5 text-white" />
                    </div>
                </div>

                {/* Right Illustration - Popping out */}
                <div className="absolute right-0 top-0 bottom-0 w-[120px] flex items-end justify-center pointer-events-none">
                    <img
                        src={illustration}
                        alt={label}
                        className="h-[110%] object-contain object-bottom transform -translate-y-2"
                    />
                </div>
            </div>
        </div>
    );
};

export default RoleSelection;
