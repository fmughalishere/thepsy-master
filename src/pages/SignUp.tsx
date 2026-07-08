import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { createUserWithEmailAndPassword, updateProfile, sendEmailVerification } from "firebase/auth";
import { doc, setDoc, serverTimestamp, getDoc } from "firebase/firestore";
import { auth, db, logAnalyticsEvent } from "@/lib/firebase";
import { getPayrollSettings } from "@/services/payrollService";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "@/hooks/use-toast";
import { User, Mail, Phone, Eye, EyeOff, Users, Stethoscope, Calendar } from "lucide-react";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import LanguageSwitcher from "@/components/LanguageSwitcher";

// Assets
import logo from "../assets/images/logo.webp";
import introIllustration from "../assets/images/intro_illustration.png";

const SIGNUP_DRAFT_KEY = "signupDraft";

type SignUpDraft = {
    v: 1;
    name: string;
    dob: string;
    email: string;
    phone: string;
    gender: string;
    otherGender: string;
    agreeTerms: boolean;
    selectedRole: string | null;
    updatedAt: number;
};

const readSignUpDraft = (): SignUpDraft | null => {
    try {
        const raw = sessionStorage.getItem(SIGNUP_DRAFT_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Partial<SignUpDraft> | null;
        if (!parsed || parsed.v !== 1) return null;
        return parsed as SignUpDraft;
    } catch {
        return null;
    }
};

const writeSignUpDraft = (draft: SignUpDraft) => {
    try {
        sessionStorage.setItem(SIGNUP_DRAFT_KEY, JSON.stringify(draft));
    } catch {
        // Ignore storage failures (e.g. disabled storage/quota).
    }
};

const clearSignUpDraft = () => {
    try {
        sessionStorage.removeItem(SIGNUP_DRAFT_KEY);
    } catch {
        // Ignore.
    }
};

const SignUp = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [isLoading, setIsLoading] = useState(false);

    // Form State
    const [name, setName] = useState("");
    const [dob, setDob] = useState("");
    const [email, setEmail] = useState("");
    const [phone, setPhone] = useState("");
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const [gender, setGender] = useState("");
    const [otherGender, setOtherGender] = useState("");
    const [agreeTerms, setAgreeTerms] = useState(false);
    const [selectedRole, setSelectedRole] = useState<string | null>(null);
    const [showRoleDialog, setShowRoleDialog] = useState(false);
    const [showSuccessDialog, setShowSuccessDialog] = useState(false);
    const [draftRestored, setDraftRestored] = useState(false);

    const [showPassword, setShowPassword] = useState(false);
    const [showConfirmPassword, setShowConfirmPassword] = useState(false);

    // Restore draft + role from sessionStorage on component mount.
    useEffect(() => {
        const draft = readSignUpDraft();
        if (draft) {
            setName(draft.name ?? "");
            setDob(draft.dob ?? "");
            setEmail(draft.email ?? "");
            setPhone(draft.phone ?? "");
            setGender(draft.gender ?? "");
            setOtherGender(draft.otherGender ?? "");
            setAgreeTerms(!!draft.agreeTerms);
            setSelectedRole(draft.selectedRole ?? null);
        }

        const storedRole = sessionStorage.getItem('userRole');
        if (storedRole && !(draft?.selectedRole)) {
            setSelectedRole(storedRole);
        }

        setDraftRestored(true);
    }, []);

    // Persist non-sensitive signup fields so returning from /terms doesn't wipe inputs.
    useEffect(() => {
        if (!draftRestored) return;
        writeSignUpDraft({
            v: 1,
            name,
            dob,
            email,
            phone,
            gender,
            otherGender,
            agreeTerms,
            selectedRole,
            updatedAt: Date.now(),
        });
    }, [draftRestored, name, dob, email, phone, gender, otherGender, agreeTerms, selectedRole]);

    const persistDraftNow = () => {
        writeSignUpDraft({
            v: 1,
            name,
            dob,
            email,
            phone,
            gender,
            otherGender,
            agreeTerms,
            selectedRole,
            updatedAt: Date.now(),
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Check if role is selected, if not show role selection dialog
        if (!selectedRole) {
            setShowRoleDialog(true);
            return;
        }

        // Validation Checks
        if (!name) { toast({ title: t('signup.error.nameRequired'), variant: "destructive" }); return; }
        if (!dob) { toast({ title: t('signup.error.dobRequired'), variant: "destructive" }); return; }

        // Age check: must be at least 18 years old
        const birthDate = new Date(dob);
        const today = new Date();
        let age = today.getFullYear() - birthDate.getFullYear();
        const m = today.getMonth() - birthDate.getMonth();
        if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
            age--;
        }

        if (age < 18) {
            toast({ title: t('signup.error.ageMin'), variant: "destructive" });
            return;
        }

        if (!email) { toast({ title: t('signup.error.emailRequired'), variant: "destructive" }); return; }
        if (!phone) { toast({ title: t('signup.error.phoneRequired'), variant: "destructive" }); return; }
        if (!gender) { toast({ title: t('signup.error.genderRequired'), variant: "destructive" }); return; }
        if (gender === 'other' && !otherGender) { toast({ title: t('signup.error.specifyGender'), variant: "destructive" }); return; }
        if (!password) { toast({ title: t('signup.error.passwordRequired'), variant: "destructive" }); return; }
        if (password !== confirmPassword) { toast({ title: t('signup.error.passwordMismatch'), variant: "destructive" }); return; }
        if (!agreeTerms) { toast({ title: t('signup.error.agreeTerms'), variant: "destructive" }); return; }

        setIsLoading(true);
        try {
            // 1. Create User in Auth
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // 2. Send Email Verification
            try {
                await sendEmailVerification(user);
                console.log("Verification email sent successfully");
            } catch (err) {
                console.error("Error sending verification email:", err);
            }

            // 3. Update Profile Display Name
            await updateProfile(user, { displayName: name });

            // 3. Create User Document in Firestore (matching Kotlin User model structure)
            const userData: any = {
                uid: user.uid,
                email: user.email,
                displayName: name,
                dateOfBirth: dob,
                phoneNumber: phone,
                role: selectedRole?.toUpperCase(), // Use selected role
                gender: gender === "other" ? otherGender : gender,
                createdAt: serverTimestamp(), // Use Timestamp matching PsyCMp
                fcmTokens: [], // Initialize empty
            };

            // Add therapist-specific fields if role is therapist
            if (selectedRole === 'therapist') {
                userData.therapistDetails = {
                    specialization: null,
                    cvLink: null,
                    licenseNo: null,
                    profileSummary: null,
                    profileStatus: 'INCOMPLETE'
                };
            } else if (selectedRole === 'patient') {
                // Initialize patientDetails for patients with admin-configured word limit
                let wordLimit = 500; // fallback
                try {
                    const settings = await getPayrollSettings();
                    if (settings?.messageWordLimit) {
                        wordLimit = settings.messageWordLimit;
                    }
                } catch (e) {
                    console.error("Failed to load admin word limit during registration:", e);
                }
                userData.patientDetails = {
                    messageWordLimit: wordLimit
                };
            }

            await setDoc(doc(db, "users", user.uid), userData);

            // Clear draft on successful signup so future visits start clean.
            clearSignUpDraft();

            // Notify Admin about new registration
            try {
                const { createAndSendNotification } = await import("@/lib/firebase-functions");
                await createAndSendNotification({
                    title: "New Registration",
                    message: `New ${userData.role} registered: ${userData.displayName} (${userData.email})`,
                    titleKey: "notifications.registration_title",
                    messageKey: "notifications.registration_body",
                    params: {
                        role: userData.role,
                        name: userData.displayName,
                        email: userData.email,
                        id: user.uid,
                        userId: user.uid
                    },
                    type: "NEW_REGISTRATION",
                    userId: user.uid,
                    targetRoles: ["ADMIN", "SUPER_ADMIN"],
                    clickAction: {
                        type: "PROFILE",
                        id: user.uid
                    }
                });
            } catch (e) {
                console.error("Failed to notify admin about signup:", e);
            }

            logAnalyticsEvent("sign_up", { 
                role: selectedRole,
                method: "email"
            });

            setShowSuccessDialog(true);
        } catch (error: any) {
            console.error("Signup Error:", error);
            toast({ title: t('common.error'), description: error.message, variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#F9FAFB] flex flex-col font-sans relative">
            <LanguageSwitcher />

            {/* Main Content Area */}
            <div className="flex-1 flex items-center justify-center p-4 py-8 md:p-8">
                {/* Elevated Card Container */}
                <div className="bg-white rounded-[32px] shadow-xl w-full max-w-6xl flex flex-col md:flex-row overflow-hidden min-h-[700px]">

                    {/* Left Side - Form */}
                    <div className="w-full md:w-1/2 p-6 md:p-10 flex flex-col overflow-y-auto max-h-[90vh] custom-scrollbar">

                        <div className="flex justify-center mb-6">
                            <img src={logo} alt="Logo" className="w-[100px] object-contain" />
                        </div>

                        <h1 className="text-3xl text-[#508C96] text-center mb-6 font-kalnia">
                            {t('signup.title', 'Create Account')}
                        </h1>

                        <form onSubmit={handleSubmit} className="w-full max-w-[400px] mx-auto space-y-3">

                            {/* Name */}
                            <div>
                                <Label text={t('signup.name', 'FullName')} />
                                <div className="relative mt-1">
                                    <Input
                                        value={name} onChange={(e) => setName(e.target.value)}
                                        placeholder={t('signup.placeholders.name', 'Max Mustermann')}
                                        className="pl-9 h-10 text-sm rounded-xl border-gray-200 bg-gray-50 focus:bg-white focus:border-[#92C7CF]"
                                    />
                                    <User className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                                </div>
                            </div>

                            {/* Date of Birth */}
                            <div>
                                <Label text={t('signup.dob', 'Date of Birth')} />
                                <div className="relative mt-1">
                                    <Input
                                        type="date"
                                        value={dob} onChange={(e) => setDob(e.target.value)}
                                        className="pl-9 h-10 text-sm rounded-xl border-gray-200 bg-gray-50 focus:bg-white focus:border-[#92C7CF]"
                                    />
                                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                                </div>
                            </div>

                            {/* Email */}
                            <div>
                                <Label text={t('signup.email', 'Email Address')} />
                                <div className="relative mt-1">
                                    <Input
                                        type="email"
                                        value={email} onChange={(e) => setEmail(e.target.value)}
                                        placeholder={t('signup.placeholders.email', 'name@example.com')}
                                        className="pl-9 h-10 text-sm rounded-xl border-gray-200 bg-gray-50 focus:bg-white focus:border-[#92C7CF]"
                                    />
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                                </div>
                            </div>

                            {/* Phone */}
                            <div>
                                <Label text={t('signup.phone', 'Phone Number')} />
                                <div className="relative mt-1">
                                    <Input
                                        type="tel"
                                        value={phone} onChange={(e) => setPhone(e.target.value)}
                                        placeholder={t('signup.placeholders.phone', '+1 234 567 890')}
                                        className="pl-9 h-10 text-sm rounded-xl border-gray-200 bg-gray-50 focus:bg-white focus:border-[#92C7CF]"
                                    />
                                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
                                </div>
                            </div>

                            {/* Gender */}
                            <div>
                                <Label text={t('signup.gender', 'Gender')} />
                                <div className="flex items-center space-x-4 mt-1.5">
                                    <RadioButton label={t('gender.male', 'Male')} selected={gender === 'male'} onClick={() => setGender('male')} />
                                    <RadioButton label={t('gender.female', 'Female')} selected={gender === 'female'} onClick={() => setGender('female')} />
                                    <RadioButton label={t('gender.other', 'Other')} selected={gender === 'other'} onClick={() => setGender('other')} />
                                </div>
                                {gender === 'other' && (
                                    <Input
                                        value={otherGender} onChange={(e) => setOtherGender(e.target.value)}
                                        placeholder={t('questionnaire.please_specify')}
                                        className="mt-1 h-9 text-sm rounded-xl border-gray-200"
                                    />
                                )}
                            </div>

                            <div className="flex gap-3">
                                {/* Password */}
                                <div className="flex-1">
                                    <Label text={t('signup.password', 'Password')} />
                                    <div className="relative mt-1">
                                        <Input
                                            type={showPassword ? "text" : "password"}
                                            value={password} onChange={(e) => setPassword(e.target.value)}
                                            placeholder={t('signup.password')}
                                            className="h-10 text-sm rounded-xl border-gray-200 pr-8"
                                        />
                                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">
                                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                </div>

                                {/* Confirm Password */}
                                <div className="flex-1">
                                    <Label text={t('signup.confirm', 'Confirm')} />
                                    <div className="relative mt-1">
                                        <Input
                                            type={showConfirmPassword ? "text" : "password"}
                                            value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                                            placeholder={t('signup.confirm')}
                                            className="h-10 text-sm rounded-xl border-gray-200 pr-8"
                                        />
                                        <button type="button" onClick={() => setShowConfirmPassword(!showConfirmPassword)} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400">
                                            {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                                        </button>
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-start space-x-2 pt-2">
                                <Checkbox
                                    id="terms"
                                    checked={agreeTerms}
                                    onCheckedChange={(c) => setAgreeTerms(c as boolean)}
                                    className="mt-0.5 w-4 h-4 data-[state=checked]:bg-[#92C7CF] border-gray-300"
                                />
                                <label htmlFor="terms" className="text-xs text-gray-500 leading-tight">
                                    {t('signup.terms_prefix', 'By signing up you agree to our ')}
                                    <span
                                        className="font-semibold text-[#508C96] cursor-pointer hover:underline"
                                        onClick={() => {
                                            persistDraftNow();
                                            window.open('/terms', '_blank');
                                        }}
                                    >
                                        {t('signup.terms_link', 'Terms & Conditions')}
                                    </span>
                                </label>
                            </div>

                            {/* Role Selection Display */}
                            {selectedRole && (
                                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        {selectedRole === 'therapist' ? (
                                            <Stethoscope className="w-4 h-4 text-blue-600" />
                                        ) : (
                                            <Users className="w-4 h-4 text-blue-600" />
                                        )}
                                        <span className="text-sm font-medium text-blue-800">
                                            {t('signup.registering_as', { role: selectedRole === 'therapist' ? t('role_selection.therapist.label') : t('role_selection.client.label') })}
                                        </span>
                                    </div>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => setShowRoleDialog(true)}
                                        className="text-blue-600 hover:text-blue-800 h-auto p-1"
                                    >
                                        {t('signup.change')}
                                    </Button>
                                </div>
                            )}

                            {/* Submit Button */}
                            <div className="pt-4">
                                <Button
                                    type="submit"
                                    className={`w-full h-11 rounded-full text-sm font-semibold tracking-wide shadow-md transition-all ${isLoading ? 'bg-gray-200 text-gray-400' : 'bg-[#92C7CF] hover:bg-[#7FB0B8] text-white'
                                        }`}
                                    disabled={isLoading}
                                >
                                    {isLoading ? t('common.processing', 'Processing...') : (selectedRole ? t('signup.submit') : t('signup.select_role_submit'))}
                                </Button>
                            </div>
                        </form>

                        {/* Login Link */}
                        <div className="text-center mt-6 pb-4">
                            <p className="text-xs text-gray-500">
                                {t('signup.already_have_account', 'Already have an account?')}
                                <button
                                    onClick={() => {
                                        clearSignUpDraft();
                                        navigate("/login");
                                    }}
                                    className="ml-1 text-[#508C96] font-bold hover:underline"
                                >
                                    {t('signup.login', 'Sign In')}
                                </button>
                            </p>
                        </div>

                    </div>

                    {/* Right Side - Illustration */}
                    <div className="hidden md:flex md:w-1/2 bg-[#FBF9F1] flex-col items-center justify-center p-10 relative">
                        <div className="relative text-center max-w-md bg-white/50 backdrop-blur-sm p-8 rounded-[32px] border border-white/60">
                            <img
                                src={introIllustration}
                                alt="Illustration"
                                className="w-full object-contain mb-6 drop-shadow-md"
                            />
                            <h2 className="text-2xl font-kalnia text-[#508C96] mb-2">
                                {t('signup.illustration.title')}
                            </h2>
                            <p className="text-sm text-gray-600 font-shippori leading-relaxed">
                                {t('signup.illustration.quote')}
                            </p>
                        </div>
                    </div>

                </div>
            </div>
            {/* Role Selection Dialog */}
            <Dialog open={showRoleDialog} onOpenChange={setShowRoleDialog}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="text-center">{t('role_selection.title')}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div
                            className="flex items-center gap-4 p-4 border-2 border-gray-200 rounded-xl cursor-pointer hover:border-[#92C7CF] hover:bg-blue-50 transition-colors"
                            onClick={() => {
                                setSelectedRole('patient');
                                sessionStorage.setItem('userRole', 'patient');
                                setShowRoleDialog(false);
                            }}
                        >
                            <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                                <Users className="w-6 h-6 text-blue-600" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-gray-900">{t('role_selection.client.label')}</h3>
                                <p className="text-sm text-gray-600">{t('role_selection.client.description')}</p>
                            </div>
                        </div>

                        <div
                            className="flex items-center gap-4 p-4 border-2 border-gray-200 rounded-xl cursor-pointer hover:border-[#92C7CF] hover:bg-blue-50 transition-colors"
                            onClick={() => {
                                setSelectedRole('therapist');
                                sessionStorage.setItem('userRole', 'therapist');
                                setShowRoleDialog(false);
                            }}
                        >
                            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                                <Stethoscope className="w-6 h-6 text-green-600" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-gray-900">{t('role_selection.therapist.label')}</h3>
                                <p className="text-sm text-gray-600">{t('role_selection.therapist.description')}</p>
                            </div>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Success Dialog */}
            <AlertDialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('signup.success.title')}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t('signup.success.description')}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogAction onClick={() => {
                            setShowSuccessDialog(false);
                            navigate("/login", {
                                state: {
                                    autoFillEmail: email,
                                    autoFillPassword: password
                                }
                            });
                        }}>
                            {t('common.ok', 'OK')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

// Helper Components
const Label = ({ text }: { text: string }) => (
    <span className="block text-xs font-semibold text-gray-500 uppercase tracking-wider">{text}</span>
);

const RadioButton = ({ label, selected, onClick }: { label: string, selected: boolean, onClick: () => void }) => (
    <div className="flex items-center cursor-pointer group" onClick={onClick}>
        <div className={`w-4 h-4 rounded-full border flex items-center justify-center transition-colors ${selected ? 'border-[#92C7CF]' : 'border-gray-300 group-hover:border-[#92C7CF]'}`}>
            {selected && <div className="w-2 h-2 rounded-full bg-[#92C7CF]" />}
        </div>
        <span className={`ml-1.5 text-xs transition-colors ${selected ? 'text-[#508C96] font-medium' : 'text-gray-500'}`}>{label}</span>
    </div>
);

export default SignUp;
