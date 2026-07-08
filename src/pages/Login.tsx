import { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { Eye, EyeOff } from "lucide-react";
import { useTranslation } from "react-i18next";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase";
import {
    getLocalhostFirebaseTarget,
    isDevelLocalhost,
    reloadWithNewFirebaseTarget,
} from "@/lib/firebase-local-target";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";

import LanguageSwitcher from "@/components/LanguageSwitcher";
import Footer from "@/components/Footer";

// Assets
import logo from "../assets/images/logo.webp";
import introIllustration from "../assets/images/intro_illustration.png";

const Login = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const { t } = useTranslation();
    const [isLoading, setIsLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);
    const [formData, setFormData] = useState({
        email: "",
        password: "",
    });
    const [isResettingPassword, setIsResettingPassword] = useState(false);

    // Auto-fill from signup navigation
    useEffect(() => {
        if (location.state?.autoFillEmail && location.state?.autoFillPassword) {
            setFormData({
                email: location.state.autoFillEmail,
                password: location.state.autoFillPassword,
            });
        }
    }, [location.state]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!formData.email || !formData.password) {
            toast({
                title: t('common.error', "Error"),
                description: t('login.fieldsRequired', "Please fill in all fields"),
                variant: "destructive",
            });
            return;
        }

        setIsLoading(true);
        try {
            const userCredential = await signInWithEmailAndPassword(auth, formData.email, formData.password);
            const user = userCredential.user;

            // Check email verification
            const isDebug = import.meta.env.MODE === 'development';
            if (!user.emailVerified && !isDebug) {
                await auth.signOut();
                toast({
                    title: t('common.error', "Error"),
                    description: t('login.errors.emailNotVerified', "Please verify your email before logging in. Check your inbox for the verification link."),
                    variant: "destructive",
                });
                setIsLoading(false);
                return;
            }


            // Get user role from Firestore
            const { doc, getDoc } = await import("firebase/firestore");
            const { db } = await import("@/lib/firebase");
            const userDoc = await getDoc(doc(db, "users", user.uid));

            if (userDoc.exists()) {
                const userData = userDoc.data();

                // Check if user is blocked
                if (userData.isBlocked) {
                    await auth.signOut();
                    setIsLoading(false);
                    navigate("/account-restricted");
                    return;
                }

                const userRole = userData.role;

                toast({
                    title: t('login.success.title', "Welcome back!"),
                    description: t('login.success.desc', "Successfully logged in."),
                });

                // Navigate based on user role
                switch (userRole) {
                    case "ADMIN":
                        navigate("/admin/dashboard", { replace: true });
                        break;
                    case "THERAPIST":
                        // Check therapist profile status from therapistDetails
                        const therapistStatus = userData.therapistDetails?.profileStatus;
                        switch (therapistStatus) {
                            case "INCOMPLETE":
                                navigate("/therapist/complete-profile", { replace: true });
                                break;
                            case "APPROVAL_PENDING":
                                navigate("/therapist/pending-approval", { replace: true });
                                break;
                            case "REJECTED":
                                navigate("/therapist/application-rejected", { replace: true });
                                break;
                            case "COOLDOWN":
                                navigate("/therapist/cooldown-period", { replace: true });
                                break;
                            case "APPROVED":
                            default:
                                navigate("/therapist/dashboard", { replace: true });
                                break;
                        }
                        break;
                    case "PATIENT":
                    default:
                        navigate("/dashboard", { replace: true });
                        break;
                }
            } else {
                // Fallback if user document doesn't exist
                navigate("/dashboard", { replace: true });
            }
        } catch (error: any) {
            console.error("Login Error:", error);

            // Provide user-friendly error messages
            let errorMessage = error.message;
            if (error.code === 'auth/user-not-found') {
                errorMessage = t('login.errors.userNotFound');
            } else if (error.code === 'auth/wrong-password') {
                errorMessage = t('login.errors.wrongPassword');
            } else if (error.code === 'auth/invalid-email') {
                errorMessage = t('login.errors.invalidEmail');
            } else if (error.code === 'auth/user-disabled') {
                errorMessage = t('login.errors.userDisabled');
            } else if (error.code === 'auth/too-many-requests') {
                errorMessage = t('login.errors.tooManyRequests');
            }

            toast({
                title: t('common.error', "Error"),
                description: errorMessage,
                variant: "destructive",
            });
        } finally {
            setIsLoading(false);
        }
    };

    const handleForgotPassword = async () => {
        if (!formData.email) {
            toast({
                title: t('common.error'),
                description: t('login.forgotPassword.emailRequired'),
                variant: "destructive",
            });
            return;
        }

        setIsResettingPassword(true);
        try {
            await sendPasswordResetEmail(auth, formData.email);
            toast({
                title: t('login.forgotPassword.success.title'),
                description: t('login.forgotPassword.success.desc'),
            });
        } catch (error: any) {
            console.error("Password Reset Error:", error);

            let errorMessage = error.message;
            if (error.code === 'auth/user-not-found') {
                errorMessage = t('login.errors.userNotFound', 'No account found with this email address');
            } else if (error.code === 'auth/invalid-email') {
                errorMessage = t('login.errors.invalidEmail', 'Invalid email address');
            }

            toast({
                title: t('common.error', "Error"),
                description: errorMessage,
                variant: "destructive",
            });
        } finally {
            setIsResettingPassword(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#F9FAFB] flex flex-col font-sans relative">
            <LanguageSwitcher />

            {/* Main Content Area */}
            <div className="flex-1 flex items-center justify-center p-4 py-8 md:p-8">
                {/* Elevated Card Container */}
                <div className="bg-white rounded-[32px] shadow-xl w-full max-w-5xl flex flex-col md:flex-row overflow-hidden min-h-[600px]">

                    {/* Left Side - Form */}
                    <div className="w-full md:w-1/2 p-6 md:p-12 flex flex-col justify-center items-center">

                        <img
                            src={logo}
                            alt="Logo"
                            className="w-[120px] object-contain mb-6"
                        />

                        <h1 className="text-3xl text-[#508C96] mb-2 font-kalnia">
                            {t('login.title')}
                        </h1>
                        <p className="text-sm text-gray-500 mb-8 text-center font-shippori">
                            {t('login.subtitle')}
                        </p>

                        <form onSubmit={handleSubmit} className="w-full max-w-sm space-y-4">

                            {/* Email Field */}
                            <div>
                                <Label htmlFor="email" className="block text-xs font-medium text-[#508C96] mb-1.5 uppercase tracking-wide">
                                    {t('login.email')}
                                </Label>
                                <Input
                                    id="email"
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                    placeholder={t('login.placeholders.email', 'name@example.com')}
                                    className="w-full rounded-xl border-gray-200 bg-gray-50 focus:bg-white focus:border-[#92C7CF] focus:ring-0 text-sm h-11 transition-all"
                                    disabled={isLoading}
                                />
                            </div>

                            {/* Password Field */}
                            <div>
                                <div className="flex justify-between items-center mb-1.5">
                                    <Label htmlFor="password" className="block text-xs font-medium text-[#508C96] uppercase tracking-wide">
                                        {t('login.password')}
                                    </Label>
                                    <button
                                        type="button"
                                        onClick={handleForgotPassword}
                                        disabled={isResettingPassword}
                                        className="text-xs text-[#92C7CF] hover:underline font-medium disabled:opacity-50"
                                    >
                                        {isResettingPassword ? t('common.loading') : t('login.forgotPassword.link')}
                                    </button>
                                </div>
                                <div className="relative">
                                    <Input
                                        id="password"
                                        type={showPassword ? "text" : "password"}
                                        value={formData.password}
                                        onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                                        placeholder={t('login.placeholders.password', 'Enter your password')}
                                        className="w-full rounded-xl border-gray-200 bg-gray-50 focus:bg-white focus:border-[#92C7CF] focus:ring-0 text-sm h-11 transition-all pr-10"
                                        disabled={isLoading}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                                    >
                                        {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                    </button>
                                </div>
                            </div>

                            {/* Login Button */}
                            <div className="pt-4">
                                <Button
                                    type="submit"
                                    className="w-full bg-[#92C7CF] hover:bg-[#7FB0B8] text-white rounded-full h-[48px] shadow-lg shadow-[#92C7CF]/20 text-sm font-semibold tracking-wide transition-all transform hover:scale-[1.02]"
                                    disabled={isLoading}
                                >
                                    {isLoading ? t('common.processing', 'Processing...') : t('login.submit')}
                                </Button>
                            </div>

                            {isDevelLocalhost() && (
                                <div className="mt-5 w-full rounded-xl border border-amber-200 bg-amber-50/90 p-3 text-left">
                                    <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-900/80 mb-1">
                                        Localhost · Firestore backend
                                    </p>
                                    <p className="text-xs text-amber-950/90 mb-2">
                                        {getLocalhostFirebaseTarget() === "production"
                                            ? `Production (${import.meta.env.VITE_PRODUCTION_FIREBASE_PROJECT_ID})`
                                            : `Debug (${import.meta.env.VITE_FIREBASE_PROJECT_ID})`}
                                    </p>
                                    <div className="flex gap-2">
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant={getLocalhostFirebaseTarget() === "debug" ? "default" : "outline"}
                                            className={
                                                getLocalhostFirebaseTarget() === "debug"
                                                    ? "flex-1 text-xs h-8 bg-amber-800 hover:bg-amber-900 text-white"
                                                    : "flex-1 text-xs h-8 border-amber-300 text-amber-950"
                                            }
                                            onClick={() => {
                                                if (getLocalhostFirebaseTarget() === "debug") return;
                                                reloadWithNewFirebaseTarget("debug");
                                            }}
                                        >
                                            Debug
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant={getLocalhostFirebaseTarget() === "production" ? "default" : "outline"}
                                            className={
                                                getLocalhostFirebaseTarget() === "production"
                                                    ? "flex-1 text-xs h-8 bg-amber-800 hover:bg-amber-900 text-white"
                                                    : "flex-1 text-xs h-8 border-amber-300 text-amber-950"
                                            }
                                            disabled={!import.meta.env.VITE_PRODUCTION_FIREBASE_PROJECT_ID}
                                            onClick={() => {
                                                if (getLocalhostFirebaseTarget() === "production") return;
                                                reloadWithNewFirebaseTarget("production");
                                            }}
                                        >
                                            Production
                                        </Button>
                                    </div>
                                    <p className="text-[10px] text-amber-900/65 mt-2 leading-snug">
                                        Reloads the app. Sign in again if you change project (Auth users differ).
                                    </p>
                                </div>
                            )}
                        </form>

                        {/* Sign up link */}
                        <div className="mt-8 text-center">
                            <p className="text-xs text-gray-500">
                                {t('login.noAccount')}{" "}
                                <button
                                    onClick={() => navigate("/signup")}
                                    className="text-[#508C96] font-bold hover:underline ml-1"
                                >
                                    {t('login.signUp')}
                                </button>
                            </p>
                        </div>
                    </div>

                    {/* Right Side - Illustration */}
                    <div className="hidden md:flex md:w-1/2 bg-[#FBF9F1] items-center justify-center p-12 relative overflow-hidden">
                        {/* Decorative circles */}
                        <div className="absolute top-[-20%] right-[-10%] w-[300px] h-[300px] rounded-full bg-[#92C7CF]/10 blur-3xl" />
                        <div className="absolute bottom-[-10%] left-[-10%] w-[250px] h-[250px] rounded-full bg-[#508C96]/10 blur-3xl" />

                        <div className="relative z-10 text-center">
                            <img
                                src={introIllustration}
                                alt="Illustration"
                                className="w-full max-w-[400px] object-contain mb-8 drop-shadow-xl"
                            />
                            <h2 className="text-2xl font-kalnia text-[#508C96] mb-4">
                                {t('login.illustration.title')}
                            </h2>
                            <p className="text-sm text-gray-600 font-shippori max-w-xs mx-auto leading-relaxed">
                                {t('login.illustration.quote')}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default Login;
