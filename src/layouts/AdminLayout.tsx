import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useTranslation } from "react-i18next";
import { Users, FileText, Settings, LogOut, LayoutDashboard, Shield, CreditCard, MessageSquareQuote, Activity, DollarSign, Flag, BookOpen, Bell, Globe, Menu, Calendar, Tag, Banknote } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { auth, db } from "@/lib/firebase";
import { doc, updateDoc } from "firebase/firestore";
import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import logo from "@/assets/images/logo.webp";
import Footer from "@/components/Footer";

const AdminLayout: React.FC = () => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();
    const { userData, loading } = useAuth();
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    // Protection: Redirect non-admins or if not logged in
    useEffect(() => {
        if (!loading) {
            if (!userData || userData.role !== 'ADMIN') {
                console.warn("Unauthorized access to admin area. Redirecting...");
                navigate("/login");
            }
        }
    }, [userData, loading, navigate]);

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-white">
                <div className="animate-spin h-8 w-8 border-4 border-[#92C7CF] rounded-full border-t-transparent"></div>
            </div>
        );
    }

    if (!userData || userData.role !== 'ADMIN') {
        return null; // Will redirect via useEffect
    }

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

    const handleLogout = async () => {
        await auth.signOut();
        navigate("/login");
    };

    const navItems = [
        { label: t("admin.sidebar.dashboard"), icon: LayoutDashboard, path: "/admin/dashboard" },
        { label: t("admin.sidebar.users"), icon: Users, path: "/admin/users" },
        { label: t("admin.sidebar.payroll"), icon: DollarSign, path: "/admin/payroll" },
        { label: t("admin.sidebar.complaints"), icon: Flag, path: "/admin/complaints" },
        { label: t("admin.sidebar.affirmations"), icon: MessageSquareQuote, path: "/admin/affirmations" },
        { label: t("admin.sidebar.statistics"), icon: Activity, path: "/admin/statistics" },
        { label: t("admin.sidebar.transactions"), icon: CreditCard, path: "/admin/transactions" },
        { label: t("admin.sidebar.content"), icon: BookOpen, path: "/admin/content" },
        { label: t("admin.sidebar.appointments"), icon: Calendar, path: "/admin/appointments" },
        { label: "Coupons", icon: Tag, path: "/admin/coupons" },
        { label: "Pricing", icon: Banknote, path: "/admin/pricing" },
        { label: t("admin.sidebar.notifications"), icon: Bell, path: "/admin/notifications" },
    ];

    return (
        <div className="flex min-h-screen w-full bg-[#f8f9fa] font-sans">
            {/* Sidebar */}
            <aside className="hidden w-64 flex-col border-r border-gray-200 bg-white p-6 md:flex fixed h-full shadow-sm">
                <div className="mb-10 flex items-center justify-center">
                    <img src={logo} alt="ThePsy Logo" className="h-24 w-auto" />
                </div>

                <nav className="flex-1 space-y-2 overflow-y-auto">
                    {navItems.map((item) => (
                        <Button
                            key={item.label}
                            variant="ghost"
                            className={`w-full justify-start ${location.pathname === item.path
                                ? "bg-[#eef7f8] text-[#508C96] font-semibold"
                                : "text-gray-500 hover:text-[#508C96] hover:bg-gray-50"
                                }`}
                            onClick={() => navigate(item.path)}
                        >
                            <item.icon className="mr-3 h-5 w-5" />
                            {item.label}
                        </Button>
                    ))}
                </nav>

                <div className="mt-auto pt-4 border-t border-gray-100 space-y-2">
                    {/* Language Selector */}
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <Button
                                variant="ghost"
                                className="w-full justify-start text-gray-500 hover:text-[#508C96] hover:bg-gray-50"
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
                        {t("admin.sidebar.logout")}
                    </Button>
                </div>
            </aside>

            {/* Main Content */}
            <main className="flex-1 flex flex-col min-h-screen md:ml-64 relative">
                {/* Mobile Header */}
                <header className="flex h-16 items-center justify-between border-b border-gray-200 bg-white px-6 md:hidden sticky top-0 z-40">
                    <div className="flex items-center">
                        <img src={logo} alt="ThePsy Logo" className="h-8 w-auto" />
                    </div>
                    <Sheet open={isMobileMenuOpen} onOpenChange={setIsMobileMenuOpen}>
                        <SheetTrigger asChild>
                            <Button variant="ghost" size="icon" className="md:hidden">
                                <Menu className="h-6 w-6" />
                            </Button>
                        </SheetTrigger>
                        <SheetContent side="left" className="w-64 p-0">
                            <div className="flex flex-col h-full bg-white">
                                <div className="p-6 border-b border-gray-200">
                                    <img src={logo} alt="ThePsy Logo" className="h-12 w-auto mx-auto" />
                                </div>
                                <nav className="flex-1 space-y-2 p-4 overflow-y-auto">
                                    {navItems.map((item) => (
                                        <Button
                                            key={item.label}
                                            variant="ghost"
                                            className={`w-full justify-start ${location.pathname === item.path
                                                ? "bg-[#eef7f8] text-[#508C96] font-semibold"
                                                : "text-gray-500 hover:text-[#508C96] hover:bg-gray-50"
                                                }`}
                                            onClick={() => {
                                                navigate(item.path);
                                                setIsMobileMenuOpen(false);
                                            }}
                                        >
                                            <item.icon className="mr-3 h-5 w-5" />
                                            {item.label}
                                        </Button>
                                    ))}
                                </nav>
                                <div className="p-4 border-t border-gray-100 space-y-2">
                                    <DropdownMenu>
                                        <DropdownMenuTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                className="w-full justify-start text-gray-500 hover:text-[#508C96] hover:bg-gray-50"
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
                                        onClick={() => {
                                            handleLogout();
                                            setIsMobileMenuOpen(false);
                                        }}
                                    >
                                        <LogOut className="mr-3 h-5 w-5" />
                                        {t("admin.sidebar.logout")}
                                    </Button>
                                </div>
                            </div>
                        </SheetContent>
                    </Sheet>
                </header>

                <div className="p-8 pb-0 flex-1">
                    <Outlet />
                </div>
                <Footer />
            </main>
        </div>
    );
};

export default AdminLayout;
