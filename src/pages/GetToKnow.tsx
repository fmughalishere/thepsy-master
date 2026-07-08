import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";

// Assets
import topImage from "../assets/images/top_image.png";
import logo from "../assets/images/logo.webp";
import letGetToKnow from "../assets/images/let_get_to_know.png";

const GetToKnow = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();

    return (
        <div className="min-h-screen bg-white flex flex-col items-center">

            {/* Top Section with Background and Logo */}
            <div className="relative w-full">
                <img
                    src={topImage}
                    alt="Background"
                    className="w-full object-cover max-h-[220px]"
                />
                <div className="absolute inset-0 flex items-center justify-center pt-8">
                    <img
                        src={logo}
                        alt="Logo"
                        className="w-[120px] object-contain"
                    />
                </div>
            </div>

            <div className="flex-1 flex flex-col items-center px-6 max-w-md w-full">

                <div className="flex-1 flex items-center justify-center w-full">
                    <img
                        src={letGetToKnow}
                        alt="Illustration"
                        className="w-full max-w-[280px] object-contain"
                    />
                </div>

                <div className="pb-12 flex flex-col items-center text-center">
                    <h1 className="text-2xl text-[#374151] font-normal font-kalnia mb-2">
                        {t('questionnaire.getToKnow.title')}
                    </h1>

                    <p className="text-sm text-[#827D7D] font-normal font-sans mb-8 leading-relaxed max-w-xs">
                        {t('questionnaire.getToKnow.description')}
                    </p>

                    <Button
                        onClick={() => navigate("/questionnaire")}
                        className="w-auto min-w-[150px] px-8 h-[50px] bg-[#92C7CF] hover:bg-[#7FB0B8] text-white rounded-[25px] font-medium font-sans shadow-md"
                    >
                        {t('questionnaire.getToKnow.begin')}
                    </Button>
                </div>

            </div>
        </div>
    );
};

export default GetToKnow;
