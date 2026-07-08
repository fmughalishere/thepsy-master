import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from "react-i18next";
import { Home, Calendar, MessageSquare, Bell, BellOff, BellRing, LogOut, Heart, BookOpen, User, Activity, Globe, Flag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { auth, db, requestForToken } from "@/lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Menu } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState, useEffect } from "react";
import logo from "@/assets/images/logo.webp";
import Footer from "@/components/Footer";

import { useAuth } from "@/contexts/AuthContext";
import { useChatNotifications } from "@/contexts/ChatNotificationContext";


const SidebarLayout: React.FC = () => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const { userData } = useAuth();
    const { unreadChatCount, clearUnreadChat } = useChatNotifications();
    const [notifPermission, setNotifPermission] = useState<NotificationPermission>(
        typeof Notification !== 'undefined' ? Notification.permission : 'default'
    );
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);


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

    const navItems = [
        // Bottom Navigation Items
        { label: t("patient.sidebar.dashboard"), icon: Home, path: "/dashboard" },
        { label: t("patient.sidebar.calendar"), icon: Calendar, path: "/calendar" },
        { label: t("patient.sidebar.chat"), icon: MessageSquare, path: "/chat" },
        { label: t("patient.sidebar.notifications"), icon: Bell, path: "/notifications" },
        // Drawer Menu Items (matching PsyCMp)
        { label: t("patient.sidebar.profile"), icon: User, path: "/profile" },
        { label: t("patient.sidebar.account_settings"), icon: User, path: "/account-settings" },
        { label: t("patient.sidebar.subscription"), icon: Activity, path: "/subscription-status" },
        { label: t("patient.sidebar.therapy_goals"), icon: Flag, path: "/therapy-goals" },
        { label: t("patient.sidebar.contact"), icon: MessageSquare, path: "/contact" },
        { label: t("patient.sidebar.terms"), icon: BookOpen, path: "/terms" },
        { label: t("patient.sidebar.privacy"), icon: Heart, path: "/privacy" },
    ];

    return (
        <div className="flex min-h-screen w-full bg-[#f8f9fa] font-sans">
            {/* Sidebar - Desktop Only */}
            <aside className="hidden w-64 flex-col border-r border-gray-200 bg-white p-6 md:flex fixed h-full shadow-sm">
                <div className="mb-10 flex items-center justify-center gap-2">
                    <img src={logo} alt="PSY Logo" className="h-20 w-auto" />
                </div>

                <nav className="flex-1 space-y-2 overflow-y-auto">
                    {navItems.map((item) => (
                        <Button
                            key={item.path}
                            variant="ghost"
                            className={`w-full justify-start ${location.pathname === item.path
                                ? "bg-[#eef7f8] text-[#92C7CF] font-semibold"
                                : "text-gray-500 hover:text-[#92C7CF] hover:bg-gray-50"
                                }`}
                            onClick={() => {
                                if (item.path === '/chat') clearUnreadChat();
                                if (['/terms', '/privacy', '/contact'].includes(item.path)) {
                                    window.open(item.path, '_blank');
                                } else {
                                    navigate(item.path);
                                }
                            }}
                        >
                            <item.icon className="mr-3 h-5 w-5" />
                            <span className="flex-1 text-left">{item.label}</span>
                            {item.path === '/chat' && unreadChatCount > 0 && (
                                <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[11px] font-bold text-white bg-red-500 rounded-full animate-pulse">
                                    {unreadChatCount > 99 ? '99+' : unreadChatCount}
                                </span>
                            )}
                        </Button>
                    ))}

                    {/* Notification Permission Toggle */}
                    {notifPermission !== 'granted' && (
                        <div className="pt-4 border-t border-gray-100 mt-2">
                            <Button
                                variant="ghost"
                                className="w-full justify-start text-gray-500 hover:text-[#92C7CF] hover:bg-gray-50"
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
                            >
                                <BellOff className="mr-3 h-5 w-5 text-gray-400" />
                                <span className="flex-1 text-left">
                                    {t('notifications.disabled', 'Enable Notifications')}
                                </span>
                            </Button>
                        </div>
                    )}
                </nav>

                <div className="mt-auto pt-4 border-t border-gray-100 space-y-2">
                    {/* Language Selector */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                className="w-full justify-start text-gray-500 hover:text-[#92C7CF] hover:bg-gray-50"
                            >
                                <Globe className="mr-3 h-5 w-5" />
                                {currentLanguage.label}
                            </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48">
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
                        variant="ghost"
                        className="w-full justify-start text-red-500 hover:text-red-600 hover:bg-red-50"
                        onClick={handleLogout}
                    >
                        <LogOut className="mr-3 h-5 w-5" />
                        {t("patient.sidebar.logout")}
                    </Button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col min-h-screen md:ml-64 relative pb-16 md:pb-0">
                {/* Mobile Header */}
                <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6 md:hidden sticky top-0 z-40">
                    <div className="flex items-center gap-4">
                        <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
                            <SheetTrigger asChild>
                                <Button variant="ghost" size="icon" className="md:hidden">
                                    <Menu className="h-6 w-6" />
                                </Button>
                            </SheetTrigger>
                            <SheetContent side="left" className="w-[300px] p-0">
                                <div className="flex flex-col h-full bg-white">
                                    <div className="p-6 border-b border-gray-200">
                                        <img src={logo} alt="PSY Logo" className="h-10 w-auto mx-auto" />
                                    </div>
                                    <nav className="flex-1 space-y-2 p-4 overflow-y-auto">
                                        {navItems.map((item) => (
                                            <Button
                                                key={item.path}
                                                variant="ghost"
                                                className={`w-full justify-start ${location.pathname === item.path
                                                    ? "bg-[#eef7f8] text-[#92C7CF] font-semibold"
                                                    : "text-gray-500 hover:text-[#92C7CF] hover:bg-gray-50"
                                                    }`}
                                                onClick={() => {
                                                    if (item.path === '/chat') clearUnreadChat();
                                                    if (['/terms', '/privacy', '/contact'].includes(item.path)) {
                                                        window.open(item.path, '_blank');
                                                    } else {
                                                        navigate(item.path);
                                                    }
                                                    setIsMobileMenuOpen(false);
                                                }}
                                            >
                                                <item.icon className="mr-3 h-5 w-5" />
                                                <span className="flex-1 text-left">{item.label}</span>
                                                {item.path === '/chat' && unreadChatCount > 0 && (
                                                    <span className="ml-auto inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-[11px] font-bold text-white bg-red-500 rounded-full animate-pulse">
                                                        {unreadChatCount > 99 ? '99+' : unreadChatCount}
                                                    </span>
                                                )}
                                            </Button>
                                        ))}

                                        {/* Notification Permission Toggle */}
                                        {notifPermission !== 'granted' && (
                                            <div className="pt-4 border-t border-gray-100 mt-2">
                                                <Button
                                                    variant="ghost"
                                                    className="w-full justify-start text-gray-500 hover:text-[#92C7CF] hover:bg-gray-50"
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
                                                >
                                                    <BellOff className="mr-3 h-5 w-5 text-gray-400" />
                                                    <span className="flex-1 text-left">
                                                        {t('notifications.disabled', 'Enable Notifications')}
                                                    </span>
                                                </Button>
                                            </div>
                                        )}
                                    </nav>
                                    <div className="p-4 border-t border-gray-100 space-y-2">
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button
                                                    variant="ghost"
                                                    className="w-full justify-start text-gray-500 hover:text-[#92C7CF] hover:bg-gray-50"
                                                >
                                                    <Globe className="mr-3 h-5 w-5" />
                                                    {currentLanguage.label}
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end" className="w-48">
                                                {languages.map((lang) => (
                                                    <DropdownMenuItem
                                                        key={lang.code}
                                                        onClick={() => {
                                                            changeLanguage(lang.code);
                                                            setIsMobileMenuOpen(false);
                                                        }}
                                                        className={i18n.language === lang.code ? "bg-gray-100" : ""}
                                                    >
                                                        {lang.label}
                                                    </DropdownMenuItem>
                                                ))}
                                            </DropdownMenuContent>
                                        </DropdownMenu>

                                        <Button
                                            variant="ghost"
                                            className="w-full justify-start text-red-500 hover:text-red-600 hover:bg-red-50"
                                            onClick={() => {
                                                handleLogout();
                                                setIsMobileMenuOpen(false);
                                            }}
                                        >
                                            <LogOut className="mr-3 h-5 w-5" />
                                            {t("patient.sidebar.logout")}
                                        </Button>
                                    </div>
                                </div>
                            </SheetContent>
                        </Sheet>
                        <img src={logo} alt="PSY Logo" className="h-6 w-auto" />
                    </div>

                    {/* User Profile - Mobile */}
                    {userData && (
                        <div className="flex items-center gap-2">
                            <Avatar className="h-8 w-8">
                                <AvatarImage src={userData.profilePicture} />
                                <AvatarFallback className="bg-[#92C7CF] text-white text-xs">
                                    {userData.displayName?.charAt(0) || "U"}
                                </AvatarFallback>
                            </Avatar>
                        </div>
                    )}


                </header>

                <div className="flex-1 overflow-auto flex flex-col">
                    <div className="flex-1">
                        <Outlet />
                    </div>
                    <Footer />
                </div>
            </main>
        </div>
    );
};

export default SidebarLayout;
