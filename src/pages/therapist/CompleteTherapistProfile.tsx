import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { auth, db } from "@/lib/firebase";
import { doc, updateDoc } from "firebase/firestore";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { ChevronDown, FileText, ExternalLink, Check, X, ChevronsUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useTranslation } from "react-i18next";
import { THERAPIST_SPECIALIZATION_DEFAULT_EN_LABEL, THERAPIST_SPECIALIZATION_KEYS, type TherapistSpecializationKey } from "@/lib/therapistSpecializations";

// Assets
import logo from "@/assets/images/logo.webp";
import introIllustration from "@/assets/images/intro_illustration.png";

const CompleteTherapistProfile = () => {
    console.log("CompleteTherapistProfile: Rendering...");
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const { currentUser } = useAuth();
    const [loading, setLoading] = useState(false);
    const [formData, setFormData] = useState<{
        specialization: TherapistSpecializationKey[];
        country: string;
        cvLink: string;
        licenseNo: string;
        message: string;
        agreedToTerms: false | boolean;
    }>({
        specialization: [],
        country: "",
        cvLink: "",
        licenseNo: "",
        message: "",
        agreedToTerms: false
    });
    const [open, setOpen] = useState(false);

    useEffect(() => {
        console.log("CompleteTherapistProfile: Mounted. Current User:", currentUser?.uid);
    }, [currentUser]);

    const specializations = THERAPIST_SPECIALIZATION_KEYS;

    // Countries list from PsyCMp (abbreviated for demo)
    const countries = [
        "Afghanistan", "Albania", "Algeria", "Andorra", "Angola", "Argentina", "Armenia", "Australia", "Austria",
        "Bahrain", "Bangladesh", "Belgium", "Brazil", "Bulgaria",
        "Canada", "Chile", "China", "Colombia", "Croatia", "Cyprus",
        "Denmark", "Dominican Republic",
        "Ecuador", "Egypt", "Estonia", "Ethiopia",
        "Finland", "France",
        "Germany", "Ghana", "Greece",
        "Hungary",
        "Iceland", "India", "Indonesia", "Ireland", "Israel", "Italy",
        "Japan", "Jordan",
        "Kenya", "Kuwait",
        "Lebanon", "Lithuania", "Luxembourg",
        "Malaysia", "Mexico", "Morocco",
        "Netherlands", "New Zealand", "Nigeria", "Norway",
        "Pakistan", "Philippines", "Poland", "Portugal",
        "Qatar",
        "Romania", "Russia",
        "Saudi Arabia", "Singapore", "South Africa", "Spain", "Sweden", "Switzerland",
        "Thailand", "Turkey",
        "Ukraine", "United Arab Emirates", "United Kingdom", "United States",
        "Vietnam"
    ];

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();

        // Validation - matching PsyCMp requirements
        if (formData.specialization.length === 0 || !formData.country || !formData.agreedToTerms) {
            toast({
                title: t('therapist.complete_profile.messages.error_title', 'Error'),
                description: t('therapist.complete_profile.messages.error_fields', 'Please fill in all required fields and agree to terms'),
                variant: "destructive",
            });
            return;
        }

        setLoading(true);
        try {
            if (currentUser) {
                // Normalize CV URL if it's provided and doesn't have a protocol
                let normalizedCvLink = formData.cvLink.trim();
                if (normalizedCvLink && !/^https?:\/\//i.test(normalizedCvLink)) {
                    normalizedCvLink = `https://${normalizedCvLink}`;
                }

                await updateDoc(doc(db, "users", currentUser.uid), {
                    // Main User fields
                    country: formData.country,

                    // TherapistDetails nested object
                    therapistDetails: {
                        specialization: formData.specialization[0] ?? "",
                        specializations: formData.specialization,
                        cvLink: normalizedCvLink,
                        licenseNo: formData.licenseNo,
                        profileSummary: formData.message,
                        profileStatus: "APPROVAL_PENDING"
                    }
                });

                toast({
                    title: t('therapist.complete_profile.messages.success_title', 'Application Submitted!'),
                    description: t('therapist.complete_profile.messages.success_desc', 'Your application has been submitted for review.'),
                });

                // Notify Admin about profile completion
                try {
                    const { createAndSendNotification } = await import("@/lib/firebase-functions");
                    await createAndSendNotification({
                        title: "Therapist Approval Request",
                        message: `Therapist ${currentUser.displayName || 'New Therapist'} has submitted their profile for approval.`,
                        titleKey: "notifications.therapist_approval_title",
                        messageKey: "notifications.therapist_approval_body",
                        params: {
                            name: currentUser.displayName || 'Therapist',
                            id: currentUser.uid,
                            userId: currentUser.uid
                        },
                        type: "PROFILE",
                        userId: currentUser.uid,
                        targetRoles: ["ADMIN", "SUPER_ADMIN"],
                        clickAction: {
                            type: "PROFILE",
                            id: currentUser.uid
                        }
                    });
                } catch (e) {
                    console.error("Failed to notify admin about profile completion:", e);
                }

                navigate("/therapist/pending-approval");
            }
        } catch (error: any) {
            console.error("Error updating profile:", error);
            toast({
                title: t('therapist.complete_profile.messages.error_title', 'Error'),
                description: error.message,
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div key={i18n.resolvedLanguage} className="min-h-screen bg-[#F9FAFB] flex items-center justify-center p-4 font-sans">
            {/* Elevated Card Container - Same as Login/SignUp */}
            <div className="bg-white rounded-[32px] shadow-xl w-full max-w-6xl flex overflow-hidden min-h-[700px]">

                {/* Left Side - Form */}
                <div className="w-full md:w-1/2 p-8 md:p-10 flex flex-col overflow-y-auto max-h-[90vh]">

                    <div className="flex justify-center mb-6">
                        <img src={logo} alt="Logo" className="w-[100px] object-contain" />
                    </div>

                    <h1 className="text-3xl text-[#508C96] text-center mb-6 font-kalnia">
                        {t('therapist.complete_profile.title', 'Complete Your Profile')}
                    </h1>

                    <form onSubmit={handleSubmit} className="w-full max-w-[400px] mx-auto space-y-4">

                        {/* Specialization */}
                        <div>
                            <Label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                                {t('therapist.complete_profile.form.specialization', 'Specialization *')}
                            </Label>
                            <Popover open={open} onOpenChange={setOpen}>
                                <PopoverTrigger asChild>
                                    <Button
                                        variant="outline"
                                        role="combobox"
                                        aria-expanded={open}
                                        className="w-full justify-between h-auto min-h-11 rounded-xl border-gray-200 bg-gray-50 focus:bg-white focus:border-[#92C7CF] hover:bg-gray-50"
                                    >
                                        <div className="flex flex-wrap gap-1 items-center py-1">
                                            {formData.specialization.length > 0 ? (
                                                formData.specialization.map((spec) => (
                                                    <Badge
                                                        key={spec}
                                                        variant="secondary"
                                                        className="bg-[#92C7CF] text-white hover:bg-[#7FB0B8] rounded-md px-1 py-0 text-[10px]"
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            setFormData(prev => ({
                                                                ...prev,
                                                                specialization: prev.specialization.filter(s => s !== spec)
                                                            }));
                                                        }}
                                                    >
                                                        {t(`therapist.specializations.${spec}`, THERAPIST_SPECIALIZATION_DEFAULT_EN_LABEL[spec])}
                                                        <X className="ml-1 h-3 w-3" />
                                                    </Badge>
                                                ))
                                            ) : (
                                                <span className="text-gray-400 font-normal">
                                                    {t('therapist.complete_profile.form.specialization_select_placeholder', 'Select Specializations')}
                                                </span>
                                            )}
                                        </div>
                                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                                    </Button>
                                </PopoverTrigger>
                                <PopoverContent className="w-[400px] p-0" align="start">
                                    <Command>
                                        <CommandInput placeholder={t('therapist.complete_profile.form.specialization_search_placeholder', 'Search specialization...')} />
                                        <CommandEmpty>{t('therapist.complete_profile.form.no_specialization', 'No specialization found.')}</CommandEmpty>
                                        <CommandGroup className="max-h-64 overflow-y-auto">
                                            {specializations.map((spec) => {
                                                const label = t(`therapist.specializations.${spec}`, THERAPIST_SPECIALIZATION_DEFAULT_EN_LABEL[spec]) as string;
                                                return (
                                                    <CommandItem
                                                        key={spec}
                                                        value={`${label} ${spec}`}
                                                        onSelect={() => {
                                                            setFormData(prev => {
                                                                const isSelected = prev.specialization.includes(spec);
                                                                const newSelection = isSelected
                                                                    ? prev.specialization.filter(s => s !== spec)
                                                                    : [...prev.specialization, spec];
                                                                return { ...prev, specialization: newSelection };
                                                            });
                                                        }}
                                                    >
                                                        <Check
                                                            className={cn(
                                                                "mr-2 h-4 w-4",
                                                                formData.specialization.includes(spec) ? "opacity-100" : "opacity-0"
                                                            )}
                                                        />
                                                        {label}
                                                    </CommandItem>
                                                );
                                            })}
                                        </CommandGroup>
                                    </Command>
                                </PopoverContent>
                            </Popover>
                        </div>

                        {/* Country */}
                        <div>
                            <Label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                                {t('therapist.complete_profile.form.country', 'Country *')}
                            </Label>
                            <Select
                                value={formData.country}
                                onValueChange={(value) => setFormData({ ...formData, country: value })}
                            >
                                <SelectTrigger className="h-11 rounded-xl border-gray-200 bg-gray-50 focus:bg-white focus:border-[#92C7CF]">
                                    <SelectValue placeholder={t('therapist.complete_profile.form.country_placeholder', 'Select Country')} />
                                </SelectTrigger>
                                <SelectContent className="max-h-60">
                                    {countries.map((country) => (
                                        <SelectItem key={country} value={country}>{country}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* CV / Portfolio Banner */}
                        <div>
                            <Label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                                {t('therapist.complete_profile.form.cv_label', 'CV / Portfolio')}
                            </Label>
                            <div className="border border-gray-200 rounded-xl p-3 bg-gray-50 mb-2">
                                <div className="flex items-center gap-2 text-sm text-gray-600">
                                    <FileText className="w-4 h-4" />
                                    <span>{t('therapist.complete_profile.form.cv_banner', 'Paste link below or email at info@thepsy.de')}</span>
                                </div>
                            </div>
                            <Input
                                type="text"
                                value={formData.cvLink}
                                onChange={(e) => setFormData({ ...formData, cvLink: e.target.value })}
                                placeholder={t('therapist.complete_profile.form.cv_placeholder', 'www.your-cv.com')}
                                className="h-11 rounded-xl border-gray-200 bg-gray-50 focus:bg-white focus:border-[#92C7CF]"
                            />
                        </div>

                        {/* License No */}
                        <div>
                            <Label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                                {t('therapist.complete_profile.form.license_label', 'License No.')}
                            </Label>
                            <Input
                                value={formData.licenseNo}
                                onChange={(e) => setFormData({ ...formData, licenseNo: e.target.value })}
                                placeholder={t('therapist.complete_profile.form.license_placeholder', 'e.g. MD-1234-01')}
                                className="h-11 rounded-xl border-gray-200 bg-gray-50 focus:bg-white focus:border-[#92C7CF]"
                            />
                        </div>

                        {/* Profile Summary */}
                        <div>
                            <Label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                                {t('therapist.complete_profile.form.summary_label', 'Your Profile Summary')}
                            </Label>
                            <Textarea
                                value={formData.message}
                                onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                                placeholder={t('therapist.complete_profile.form.summary_placeholder', 'Share your thoughts...')}
                                rows={4}
                                className="rounded-xl border-gray-200 bg-gray-50 focus:bg-white focus:border-[#92C7CF] resize-none"
                            />
                        </div>

                        {/* Terms Agreement */}
                        <div className="flex items-start space-x-2 pt-2">
                            <Checkbox
                                id="terms"
                                checked={formData.agreedToTerms}
                                onCheckedChange={(checked) => setFormData({ ...formData, agreedToTerms: checked as boolean })}
                                className="mt-0.5 w-4 h-4 data-[state=checked]:bg-[#92C7CF] border-gray-300"
                            />
                            <label htmlFor="terms" className="text-xs text-gray-500 leading-tight">
                                {t('therapist.complete_profile.form.terms', 'I agree to the')}{" "}
                                <span
                                    className="font-semibold text-[#508C96] cursor-pointer hover:underline"
                                    onClick={() => window.open("/terms", "_blank")}
                                >
                                    {t('therapist.complete_profile.form.terms_link', 'terms & conditions')}
                                </span>
                            </label>
                        </div>

                        {/* Submit Button */}
                        <div className="pt-4">
                            <Button
                                type="submit"
                                disabled={loading || !formData.agreedToTerms || formData.specialization.length === 0 || !formData.country}
                                className={`w-full h-11 rounded-full text-sm font-semibold tracking-wide shadow-md transition-all ${loading || !formData.agreedToTerms || formData.specialization.length === 0 || !formData.country
                                    ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                                    : 'bg-[#92C7CF] hover:bg-[#7FB0B8] text-white'
                                    }`}
                            >
                                {loading
                                    ? t('therapist.complete_profile.form.submitting', "Submitting Application...")
                                    : t('therapist.complete_profile.form.submit', "Submit Application")
                                }
                            </Button>
                        </div>
                    </form>

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
                            {t('therapist.complete_profile.subtitle', 'Complete Your Journey')}
                        </h2>
                        <p className="text-sm text-gray-600 font-shippori leading-relaxed">
                            {t('therapist.complete_profile.quote', '"Your expertise can make a difference in someone\'s healing journey."')}
                        </p>
                    </div>
                </div>

            </div>
        </div>
    );
};

export default CompleteTherapistProfile;
