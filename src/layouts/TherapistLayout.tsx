import { useState, useEffect } from "react";
import { Outlet, useNavigate, useLocation } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { auth, db, requestForToken } from "@/lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
    Home, Calendar, MessageCircle, BarChart3,
    Settings, User, Phone, HelpCircle,
    FileText, Shield, LogOut, Menu, X,
    Clock, Users, Bell, BellOff, BellRing, Euro, Globe,
    ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight
} from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import logo from "@/assets/images/logo.webp";
import Footer from "@/components/Footer";

import { useAuth } from "@/contexts/AuthContext";
import { useChatNotifications } from "@/contexts/ChatNotificationContext";


const TherapistLayout = () => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [isCollapsed, setIsCollapsed] = useState(false);
    const { userData } = useAuth();
    const { unreadChatCount, clearUnreadChat } = useChatNotifications();
    const [notifPermission, setNotifPermission] = useState<NotificationPermission>(
        typeof Notification !== 'undefined' ? Notification.permission : 'default'
    );


    const changeLanguage = async (lng: string) => {
        i18n.changeLanguage(lng);
        if (auth.currentUser) {
            try {
                await updateDoc(doc(db, "users", auth.currentUser.uid), { language: lng });
            } catch (e) {
                console.error("Error updating language in Firestore:", e);
            }
        }
    };

    const languages = [
        { code: 'en', label: 'English' },
        { code: 'de', label: 'Deutsch' },
        { code: 'el', label: 'Ελληνικά' },
        { code: 'hr', label: 'Hrvatski' }
    ];

    const currentLanguage = languages.find(lang => i18n.language.startsWith(lang.code)) || languages[0];

    useEffect(() => {
        if (userData?.isBlocked) {
            auth.signOut();
            navigate("/account-restricted");
        }
    }, [userData, navigate]);

    const handleLogout = async () => {
        await auth.signOut();
        navigate("/login");
    };

    const navItems = [
        // Main Navigation (equivalent to bottom nav in mobile)
        {
            label: t("therapist.sidebar.dashboard"),
            icon: Home,
            path: "/therapist/dashboard",
            section: "main"
        },
        {
            label: t("therapist.sidebar.sessions"),
            icon: Calendar,
            path: "/therapist/sessions",
            section: "main"
        },
        {
            label: t("therapist.sidebar.chats"),
            icon: MessageCircle,
            path: "/therapist/chats",
            section: "main"
        },

        // Therapist Specific Features (from drawer menu)
        {
            label: t("therapist.sidebar.availability"),
            icon: Clock,
            path: "/therapist/availability",
            section: "features"
        },
        {
            label: t("therapist.sidebar.notifications"),
            icon: Bell,
            path: "/therapist/notifications",
            section: "features"
        },
        {
            label: t("therapist.sidebar.statistics"),
            icon: BarChart3,
            path: "/therapist/statistics",
            section: "features"
        },
        {
            label: t("therapist.sidebar.earnings"),
            icon: Euro,
            path: "/therapist/earnings",
            section: "features"
        },

        // Profile & Settings
        {
            label: t("therapist.sidebar.profile"),
            icon: User,
            path: "/profile",
            section: "profile"
        },
        {
            label: t("therapist.sidebar.account_settings"),
            icon: Settings,
            path: "/account-settings",
            section: "profile"
        },

        // Support
        {
            label: t("therapist.sidebar.contact"),
            icon: Phone,
            path: "/contact",
            section: "support"
        },
        {
            label: t("therapist.sidebar.terms"),
            icon: FileText,
            path: "/terms",
            section: "support"
        },
        {
            label: t("therapist.sidebar.privacy"),
            icon: Shield,
            path: "/privacy",
            section: "support"
        }
    ];

    const isActive = (path: string) => location.pathname === path;

    const NavItem = ({ item }: { item: typeof navItems[0] }) => {
        const Icon = item.icon;
        const active = isActive(item.path);

        return (
            <button
                onClick={() => {
                    if (item.path === '/therapist/chats') clearUnreadChat();
                    if (['/terms', '/privacy', '/contact'].includes(item.path)) {
                        window.open(item.path, '_blank');
                    } else {
                        navigate(item.path);
                    }
                    setSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-all ${active
                    ? "bg-[#92C7CF] text-white"
                    : "text-gray-700 hover:bg-gray-100"
                    } ${isCollapsed ? "justify-center px-0" : ""}`}
                title={isCollapsed ? item.label : ""}
            >
                <Icon className={`w-5 h-5 flex-shrink-0 ${isCollapsed ? "mx-auto" : ""}`} />
                {!isCollapsed && <span className="font-medium flex-1 truncate">{item.label}</span>}
                {!isCollapsed && item.path === '/therapist/chats' && unreadChatCount > 0 && (
                    <span className={`inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[11px] font-bold rounded-full animate-pulse ${active ? 'bg-white text-[#92C7CF]' : 'bg-red-500 text-white'}`}>
                        {unreadChatCount > 99 ? '99+' : unreadChatCount}
                    </span>
                )}
            </button>
        );
    };

    const SectionHeader = ({ title }: { title: string }) => (
        <div className={`px-4 py-2 ${isCollapsed ? "hidden" : ""}`}>
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                {title}
            </h3>
        </div>
    );

    return (
        <div className="min-h-screen bg-[#F9FAFB] flex relative overflow-x-hidden">
            {/* Sidebar */}
            <div className={`fixed inset-y-0 left-0 z-50 bg-white shadow-lg transition-all duration-300 ease-in-out flex flex-col ${sidebarOpen ? "translate-x-0 w-64" : "-translate-x-full lg:translate-x-0"
                } ${isCollapsed ? "lg:w-20" : "lg:w-64"}`}>

                {/* Sidebar Header */}
                <div className={`flex items-center p-6 border-b border-gray-200 relative ${isCollapsed ? "justify-center" : "justify-between"}`}>
                    {!isCollapsed && (
                        <div className="flex items-center gap-3">
                            <img src={logo} alt="PSY Logo" className="h-20 w-auto transition-all" />
                        </div>
                    )}
                    {isCollapsed && (
                        <div className="flex items-center justify-center">
                            <img src={logo} alt="PSY Logo" className="h-10 w-auto transition-all" />
                        </div>
                    )}
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSidebarOpen(false)}
                        className="lg:hidden"
                    >
                        <X className="w-5 h-5" />
                    </Button>

                    {/* Collapse Toggle - Desktop only */}
                    {!sidebarOpen && (
                        <button
                            onClick={() => setIsCollapsed(!isCollapsed)}
                            className="hidden lg:flex absolute -right-3 top-12 w-6 h-6 bg-white border border-gray-200 rounded-full items-center justify-center text-gray-400 hover:text-[#92C7CF] shadow-sm z-50 transition-transform hover:scale-110"
                        >
                            {isCollapsed ? <ChevronsRight className="w-4 h-4" /> : <ChevronsLeft className="w-4 h-4" />}
                        </button>
                    )}
                </div>

                {/* User Profile Section */}
                {userData && (
                    <div className={`p-4 border-b border-gray-200 ${isCollapsed ? "flex justify-center" : ""}`}>
                        <div className="flex items-center gap-3">
                            <Avatar className={`${isCollapsed ? "h-10 w-10" : "h-12 w-12"} transition-all`}>
                                <AvatarImage src={userData.profilePicture} />
                                <AvatarFallback className="bg-[#92C7CF] text-white">
                                    {userData.displayName?.charAt(0) || "T"}
                                </AvatarFallback>
                            </Avatar>
                            {!isCollapsed && (
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-gray-900 truncate">
                                        {userData.displayName || t("common.therapist", "Therapist")}
                                    </p>
                                    <p className="text-xs text-gray-500">{t("common.therapist", "Therapist")}</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}



                {/* Navigation */}
                <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                    {/* Main Navigation */}
                    <SectionHeader title={t("therapist.sidebar.sections.main")} />
                    {navItems.filter(item => item.section === "main").map((item) => (
                        <NavItem key={item.path} item={item} />
                    ))}

                    {/* Features */}
                    <div className="pt-4">
                        <SectionHeader title={t("therapist.sidebar.sections.features")} />
                        {navItems.filter(item => item.section === "features").map((item) => (
                            <NavItem key={item.path} item={item} />
                        ))}
                    </div>

                    {/* Profile & Settings */}
                    <div className="pt-4">
                        <SectionHeader title={t("therapist.sidebar.sections.profile")} />
                        {navItems.filter(item => item.section === "profile").map((item) => (
                            <NavItem key={item.path} item={item} />
                        ))}
                    </div>

                    {/* Support */}
                    <div className="pt-4">
                        <SectionHeader title={t("therapist.sidebar.sections.support")} />
                        {navItems.filter(item => item.section === "support").map((item) => (
                            <NavItem key={item.path} item={item} />
                        ))}
                    </div>

                    {/* Notification Permission Toggle */}
                    {notifPermission !== 'granted' && (
                        <div className="pt-4 border-t border-gray-100 mt-2">
                            <button
                                onClick={async () => {
                                    if (notifPermission === 'denied') {
                                        alert(t('notifications.denied_message', 'Notifications are blocked. Please enable them in your browser settings.'));
                                    } else {
                                        const perm = await Notification.requestPermission();
                                        setNotifPermission(perm);
                                        if (perm === 'granted' && auth.currentUser) {
                                            const token = await requestForToken();
                                            if (token) {
                                                await updateDoc(doc(db, "users", auth.currentUser.uid), { fcmToken: token });
                                            }
                                        }
                                    }
                                }}
                                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left transition-colors text-gray-700 hover:bg-gray-100 ${isCollapsed ? "justify-center px-0" : ""}`}
                                title={isCollapsed ? t('notifications.disabled', 'Enable Notifications') : ""}
                            >
                                <BellOff className={`w-5 h-5 text-gray-400 ${isCollapsed ? "mx-auto" : ""}`} />
                                {!isCollapsed && (
                                    <span className="font-medium flex-1">
                                        {t('notifications.disabled', 'Enable Notifications')}
                                    </span>
                                )}
                            </button>
                        </div>
                    )}
                </nav>

                {/* Logout Button */}
                <div className="p-4 border-t border-gray-200">
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                className={`w-full justify-start text-gray-700 hover:bg-gray-100 mb-2 ${isCollapsed ? "px-0 justify-center" : ""}`}
                                title={isCollapsed ? currentLanguage.label : ""}
                            >
                                <Globe className={`w-5 h-5 ${isCollapsed ? "mx-auto" : "mr-3"}`} />
                                {!isCollapsed && currentLanguage.label}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align={isCollapsed ? "center" : "end"} className="w-48">
                            {languages.map((lang) => (
                                <DropdownMenuItem
                                    key={lang.code}
                                    onClick={() => changeLanguage(lang.code)}
                                    className={i18n.language === lang.code ? "bg-gray-100" : ""}
                                >
                                    {lang.label}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>

                    <Button
                        onClick={handleLogout}
                        variant="ghost"
                        className={`w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50 ${isCollapsed ? "px-0 justify-center" : ""}`}
                        title={isCollapsed ? t("therapist.sidebar.logout") : ""}
                    >
                        <LogOut className={`w-5 h-5 ${isCollapsed ? "mx-auto" : "mr-3"}`} />
                        {!isCollapsed && t("therapist.sidebar.logout")}
                    </Button>
                </div>
            </div>

            {/* Main Content */}
            <div className={`flex-1 min-w-0 transition-all duration-300 ease-in-out ${isCollapsed ? "lg:ml-20" : "lg:ml-64"} ml-0`}>
                {/* Mobile Header */}
                <div className="lg:hidden bg-white shadow-sm p-4 flex items-center justify-between">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSidebarOpen(true)}
                    >
                        <Menu className="w-6 h-6" />
                    </Button>
                    <img src={logo} alt="PSY Logo" className="h-6 w-auto" />
                    {userData && (
                        <Avatar className="h-8 w-8">
                            <AvatarImage src={userData.profilePicture} />
                            <AvatarFallback className="bg-[#92C7CF] text-white text-xs">
                                {userData.displayName?.charAt(0) || "T"}
                            </AvatarFallback>
                        </Avatar>
                    )}
                </div>

                {/* Page Content */}
                <main className="flex-1 flex flex-col min-h-screen min-w-0">
                    <div className="flex-1 min-w-0">
                        <Outlet />
                    </div>
                    <Footer />
                </main>
            </div>

            {/* Sidebar Overlay */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}
        </div>
    );
};

export default TherapistLayout;
