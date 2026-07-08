import { useNavigate, useLocation } from "react-router-dom";
import { Home, Calendar, MessageSquare, Bell } from "lucide-react";
import { useTranslation } from "react-i18next";

import { useChatNotifications } from "@/contexts/ChatNotificationContext";

const BottomNav = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const { unreadChatCount } = useChatNotifications();

    const tabs = [
        { id: "dashboard", label: t("patient.sidebar.dashboard"), icon: Home, path: "/dashboard" },
        { id: "calendar", label: t("patient.sidebar.calendar"), icon: Calendar, path: "/calendar" },
        { id: "chat", label: t("patient.sidebar.chat"), icon: MessageSquare, path: "/chat" },
        { id: "notifications", label: t("patient.sidebar.notifications"), icon: Bell, path: "/notifications" },
    ];

    return (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 h-16 flex items-center justify-around z-50 md:hidden pb-safe">
            {tabs.map((tab) => {
                const isActive = location.pathname === tab.path;
                return (
                    <button
                        key={tab.id}
                        onClick={() => navigate(tab.path)}
                        className={`flex flex-col items-center justify-center w-full h-full space-y-1 relative ${isActive ? "text-[#92C7CF]" : "text-gray-400"
                            }`}
                    >
                        <div className="relative">
                            <tab.icon className={`w-6 h-6 ${isActive ? "fill-current" : ""}`} />
                            {tab.id === "chat" && unreadChatCount > 0 && (
                                <span className="absolute -top-1 -right-1 flex h-4 min-w-[16px] px-1 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white border-2 border-white">
                                    {unreadChatCount > 9 ? '9+' : unreadChatCount}
                                </span>
                            )}
                        </div>
                        <span className="text-[10px] font-medium">{tab.label}</span>
                    </button>
                );
            })}
        </div>
    );
};

export default BottomNav;
