import { useTranslation } from "react-i18next";
import { useLocation } from "react-router-dom";
import { auth, db } from "@/lib/firebase";
import { doc, updateDoc } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Globe } from "lucide-react";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const LanguageSwitcher = ({ isInline = false }: { isInline?: boolean }) => {
    const { i18n } = useTranslation();
    const location = useLocation();

    // Routes that have a sidebar where the language switcher is moved to
    const sidebarRoutes = [
        '/dashboard',
        '/subscription-status',
        '/mood-tracker',
        '/journal',
        '/self-care',
        '/therapist-profile',
        '/phq-test',
        '/calendar',
        '/chat',
        '/notifications',
        '/therapy-goals',
        '/profile'
    ];

    const shouldHide =
        location.pathname.startsWith('/admin') ||
        location.pathname.includes('/call/') ||
        (location.pathname.startsWith('/therapist/') && ![
            '/therapist/complete-profile',
            '/therapist/pending-approval',
            '/therapist/application-rejected'
        ].includes(location.pathname)) ||
        sidebarRoutes.includes(location.pathname);

    if (shouldHide) return null;

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

    return (
        <div className={isInline ? "inline-block" : "fixed top-4 right-4 z-50"}>
            <DropdownMenu>
                <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="rounded-full bg-white/80 shadow-sm hover:bg-white gap-2 px-3">
                        <Globe className="h-[1.2rem] w-[1.2rem] text-[#508C96]" />
                        <span className="text-xs font-medium uppercase text-[#508C96]">{i18n.language.split('-')[0]}</span>
                        <span className="sr-only">Toggle language</span>
                    </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-white z-[60]">
                    <DropdownMenuItem onClick={() => changeLanguage("en")}>
                        English
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => changeLanguage("de")}>
                        Deutsch
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => changeLanguage("el")}>
                        Ελληνικά
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => changeLanguage("hr")}>
                        Hrvatski
                    </DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>
        </div>
    );
};

export default LanguageSwitcher;
