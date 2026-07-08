import { useEffect, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { updateProfile } from "firebase/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import { THERAPIST_SPECIALIZATION_DEFAULT_EN_LABEL, THERAPIST_SPECIALIZATION_KEYS, normalizeTherapistSpecializationKeys } from "@/lib/therapistSpecializations";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import { ArrowLeft, Camera, Edit, Save, X, Upload, User, Mail, Phone, MapPin, Briefcase, FileText } from "lucide-react";

const Profile = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [showImageDialog, setShowImageDialog] = useState(false);
    const [showSuccessDialog, setShowSuccessDialog] = useState(false);
    const [user, setUser] = useState<any>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const [formData, setFormData] = useState({
        displayName: "",
        email: "",
        phoneNumber: "",
        addressLine: "",
        city: "",
        country: "",
        specialization: "",
        specializations: [] as string[],
        profileSummary: "",
        licenseNo: "",
        profilePicture: ""
    });

    const [originalData, setOriginalData] = useState(formData);

    const countries = [
        { id: "United States", name: t("profile.countries.us") },
        { id: "Canada", name: t("profile.countries.ca") },
        { id: "United Kingdom", name: t("profile.countries.gb") },
        { id: "Germany", name: t("profile.countries.de") },
        { id: "France", name: t("profile.countries.fr") },
        { id: "Australia", name: t("profile.countries.au") },
        { id: "Japan", name: t("profile.countries.jp") },
        { id: "South Korea", name: t("profile.countries.kr") },
        { id: "India", name: t("profile.countries.in") },
        { id: "Brazil", name: t("profile.countries.br") },
        { id: "Mexico", name: t("profile.countries.mx") }
    ];

    const specializationsList = THERAPIST_SPECIALIZATION_KEYS;

    useEffect(() => {
        fetchUserData();
    }, []);

    const fetchUserData = async () => {
        try {
            if (auth.currentUser) {
                const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
                if (userDoc.exists()) {
                    const userData = userDoc.data();
                    setUser(userData);

                    const rawSpecs =
                        userData.therapistDetails?.specializations ||
                        userData.therapistDetails?.specialization ||
                        [];
                    const normalizedSpecs = normalizeTherapistSpecializationKeys(rawSpecs);

                    const profileData = {
                        displayName: userData.displayName || auth.currentUser.displayName || "",
                        email: userData.email || auth.currentUser.email || "",
                        phoneNumber: userData.phoneNumber || "",
                        addressLine: userData.addressLine || "",
                        city: userData.city || "",
                        country: userData.country || "",
                        specialization: normalizedSpecs[0] ?? "",
                        specializations: normalizedSpecs,
                        profileSummary: userData.therapistDetails?.profileSummary || userData.profileSummary || "",
                        licenseNo: userData.therapistDetails?.licenseNo || userData.licenseNo || "",
                        profilePicture: userData.profilePicture || auth.currentUser.photoURL || ""
                    };

                    setFormData(profileData);
                    setOriginalData(profileData);
                }
            }
        } catch (error) {
            console.error("Error fetching user data:", error);
            toast({
                title: t("common.error"),
                description: t("profile.errors.load_failed"),
                variant: "destructive",
            });
        } finally {
            setLoading(false);
        }
    };

    const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (file) {
            // Check file size (500KB = 500 * 1024 bytes)
            if (file.size > 500 * 1024) {
                toast({
                    title: t('common.error'),
                    description: t('profile.errors.image_too_large'),
                    variant: "destructive",
                });
                return;
            }

            const reader = new FileReader();
            reader.onload = (e) => {
                const result = e.target?.result as string;
                setFormData(prev => ({ ...prev, profilePicture: result }));
            };
            reader.readAsDataURL(file);
        }
        setShowImageDialog(false);
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            if (auth.currentUser) {
                // Update Firebase Auth profile only if changed or to clear legacy large photoURL
                const authUpdates: any = {};
                if (formData.displayName !== auth.currentUser.displayName) {
                    authUpdates.displayName = formData.displayName;
                }

                // If old photoURL was a large base64, clearing it helps avoid network errors
                if (auth.currentUser.photoURL?.startsWith('data:')) {
                    authUpdates.photoURL = "";
                }

                if (Object.keys(authUpdates).length > 0) {
                    await updateProfile(auth.currentUser, authUpdates);
                }

                // Update Firestore document (including profilePicture)
                const updateData: any = {
                    displayName: formData.displayName,
                    email: formData.email,
                    phoneNumber: formData.phoneNumber,
                    addressLine: formData.addressLine,
                    city: formData.city,
                    country: formData.country,
                    profilePicture: formData.profilePicture,
                    updatedAt: new Date()
                };

                // If therapist, update therapistDetails
                if (user?.therapistDetails) {
                    updateData.therapistDetails = {
                        ...user.therapistDetails,
                        ...user.therapistDetails,
                        specialization: formData.specializations[0] ?? "",
                        specializations: formData.specializations,
                        profileSummary: formData.profileSummary,
                        licenseNo: formData.licenseNo
                    };
                }

                await updateDoc(doc(db, "users", auth.currentUser!.uid), updateData);

                // If therapist, check if approval notification is needed
                if (user?.therapistDetails && user.therapistDetails.profileStatus === 'APPROVAL_PENDING') {
                    try {
                        const { createAndSendNotification } = await import("@/lib/firebase-functions");
                        await createAndSendNotification({
                            title: "Profile Update for Approval",
                            message: `Therapist ${formData.displayName} updated their profile and is pending approval.`,
                            titleKey: "notifications.therapist_approval_title",
                            messageKey: "notifications.therapist_approval_body",
                            params: {
                                name: formData.displayName || 'Therapist'
                            },
                            type: "GENERIC",
                            targetRoles: ["ADMIN", "SUPER_ADMIN"],
                            clickAction: {
                                type: "PROFILE",
                                id: auth.currentUser!.uid
                            }
                        });
                    } catch (e) {
                        console.error("Failed to notify admin:", e);
                    }
                }

                setOriginalData(formData);
                setIsEditing(false);
                setShowSuccessDialog(true);
            }
        } catch (error: any) {
            console.error("Error updating profile:", error);
            toast({
                title: t("common.error"),
                description: error.message || t("profile.errors.update_failed"),
                variant: "destructive",
            });
        } finally {
            setSaving(false);
        }
    };

    const handleCancel = () => {
        setFormData(originalData);
        setIsEditing(false);
    };

    const toggleEditMode = () => {
        setIsEditing(!isEditing);
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB]">
                <div className="animate-spin h-8 w-8 border-4 border-[#92C7CF] rounded-full border-t-transparent"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#F9FAFB] p-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => navigate(-1)}
                        className="p-2"
                    >
                        <ArrowLeft className="w-5 h-5" />
                    </Button>
                    <h1 className="text-2xl font-semibold text-gray-900">{t("profile.title")}</h1>
                </div>

                <Button
                    onClick={isEditing ? handleSave : toggleEditMode}
                    disabled={saving}
                    className={isEditing ? "bg-[#92C7CF] hover:bg-[#7FB0B8]" : ""}
                    variant={isEditing ? "default" : "outline"}
                >
                    {saving ? (
                        <>
                            <div className="animate-spin h-4 w-4 border-2 border-white rounded-full border-t-transparent mr-2" />
                            {t("profile.saving")}
                        </>
                    ) : isEditing ? (
                        <>
                            <Save className="w-4 h-4 mr-2" />
                            {t("profile.save")}
                        </>
                    ) : (
                        <>
                            <Edit className="w-4 h-4 mr-2" />
                            {t("profile.edit")}
                        </>
                    )}
                </Button>
            </div>

            <div className="max-w-2xl mx-auto space-y-6">
                {/* Profile Image Section */}
                <Card className="p-6">
                    <div className="flex flex-col items-center space-y-4">
                        <div className="relative">
                            <Avatar className="w-24 h-24">
                                <AvatarImage src={formData.profilePicture} />
                                <AvatarFallback className="bg-[#92C7CF] text-white text-2xl">
                                    {formData.displayName?.charAt(0) || "U"}
                                </AvatarFallback>
                            </Avatar>
                            {isEditing && (
                                <Button
                                    size="sm"
                                    className="absolute -bottom-2 -right-2 rounded-full w-8 h-8 p-0 bg-[#92C7CF] hover:bg-[#7FB0B8]"
                                    onClick={() => setShowImageDialog(true)}
                                >
                                    <Camera className="w-4 h-4" />
                                </Button>
                            )}
                        </div>
                        <div className="text-center">
                            <h3 className="text-lg font-semibold text-gray-900">{formData.displayName || t("profile.user_placeholder")}</h3>
                            <p className="text-sm text-gray-500">{user?.therapistDetails ? t("profile.therapist") : t("profile.patient")}</p>
                        </div>
                    </div>
                </Card>

                {/* Personal Information */}
                <Card className="p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                        <User className="w-5 h-5" />
                        {t("profile.personal_info")}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <Label htmlFor="displayName">{t("profile.full_name")}</Label>
                            <Input
                                id="displayName"
                                value={formData.displayName}
                                onChange={(e) => setFormData(prev => ({ ...prev, displayName: e.target.value }))}
                                disabled={!isEditing}
                                className={!isEditing ? "bg-gray-50" : ""}
                            />
                        </div>

                        <div>
                            <Label htmlFor="email">{t("profile.email")}</Label>
                            <Input
                                id="email"
                                type="email"
                                value={formData.email}
                                onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                                disabled={true}
                                className="bg-gray-50"
                            />
                        </div>

                        <div>
                            <Label htmlFor="phoneNumber">{t("profile.phone_number")}</Label>
                            <Input
                                id="phoneNumber"
                                value={formData.phoneNumber}
                                onChange={(e) => setFormData(prev => ({ ...prev, phoneNumber: e.target.value }))}
                                disabled={!isEditing}
                                className={!isEditing ? "bg-gray-50" : ""}
                            />
                        </div>

                        <div>
                            <Label htmlFor="country">{t("profile.country")}</Label>
                            {isEditing ? (
                                <Select
                                    value={formData.country}
                                    onValueChange={(value) => setFormData(prev => ({ ...prev, country: value }))}
                                >
                                    <SelectTrigger>
                                        <SelectValue placeholder={t("profile.select_country")} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {countries.map((country) => (
                                            <SelectItem key={country.id} value={country.id}>{country.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            ) : (
                                <Input
                                    value={countries.find(c => c.id === formData.country)?.name || formData.country}
                                    disabled
                                    className="bg-gray-50"
                                />
                            )}
                        </div>

                        <div className="md:col-span-2">
                            <Label htmlFor="addressLine">{t("profile.address")}</Label>
                            <Input
                                id="addressLine"
                                value={formData.addressLine}
                                onChange={(e) => setFormData(prev => ({ ...prev, addressLine: e.target.value }))}
                                disabled={!isEditing}
                                className={!isEditing ? "bg-gray-50" : ""}
                            />
                        </div>

                        <div>
                            <Label htmlFor="city">{t("profile.city")}</Label>
                            <Input
                                id="city"
                                value={formData.city}
                                onChange={(e) => setFormData(prev => ({ ...prev, city: e.target.value }))}
                                disabled={!isEditing}
                                className={!isEditing ? "bg-gray-50" : ""}
                            />
                        </div>
                    </div>
                </Card>

                {/* Professional Information - Only for Therapists */}
                {user?.therapistDetails && (
                    <Card className="p-6">
                        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
                            <Briefcase className="w-5 h-5" />
                            {t("profile.professional_info")}
                        </h3>
                        <div className="space-y-4">
                            <div>
                                <Label htmlFor="specialization">{t("profile.specialization")}</Label>
                                {isEditing ? (
                                    <div className="grid grid-cols-2 gap-4 mt-2 p-4 border rounded-md bg-white">
                                        {specializationsList.map((spec) => (
                                            <div key={spec} className="flex items-center space-x-2">
                                                <Checkbox
                                                    id={`spec-${spec}`}
                                                    checked={formData.specializations.includes(spec)}
                                                    onCheckedChange={(checked) => {
                                                        const current = formData.specializations;
                                                        if (checked) {
                                                            setFormData(prev => ({ ...prev, specializations: [...current, spec] }));
                                                        } else {
                                                            setFormData(prev => ({ ...prev, specializations: current.filter(s => s !== spec) }));
                                                        }
                                                    }}
                                                />
                                                <div className="grid gap-1.5 leading-none">
                                                    <label
                                                        htmlFor={`spec-${spec}`}
                                                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                                                    >
                                                        {t(`therapist.specializations.${spec}`, THERAPIST_SPECIALIZATION_DEFAULT_EN_LABEL[spec])}
                                                    </label>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="p-3 border rounded-md bg-gray-50 min-h-[42px] flex flex-wrap gap-2">
                                        {formData.specializations.length > 0 ? (
                                            formData.specializations.map(spec => (
                                                <span key={spec} className="bg-white border rounded px-2 py-1 text-xs">
                                                    {t(`therapist.specializations.${spec}`, THERAPIST_SPECIALIZATION_DEFAULT_EN_LABEL[spec])}
                                                </span>
                                            ))
                                        ) : (
                                            <span className="text-gray-500 text-sm">{t("profile.no_specializations")}</span>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div>
                                <Label htmlFor="licenseNo">{t("profile.license_number")}</Label>
                                <Input
                                    id="licenseNo"
                                    value={formData.licenseNo}
                                    onChange={(e) => setFormData(prev => ({ ...prev, licenseNo: e.target.value }))}
                                    disabled={!isEditing}
                                    className={!isEditing ? "bg-gray-50" : ""}
                                />
                            </div>

                            <div>
                                <Label htmlFor="profileSummary">{t("profile.profile_summary")}</Label>
                                <Textarea
                                    id="profileSummary"
                                    value={formData.profileSummary}
                                    onChange={(e) => setFormData(prev => ({ ...prev, profileSummary: e.target.value }))}
                                    disabled={!isEditing}
                                    className={!isEditing ? "bg-gray-50" : ""}
                                    rows={4}
                                    placeholder={t("profile.summary_placeholder")}
                                />
                            </div>
                        </div>
                    </Card>
                )}

                {/* Cancel Button - Only show when editing */}
                {isEditing && (
                    <div className="flex justify-center">
                        <Button
                            variant="outline"
                            onClick={handleCancel}
                            disabled={saving}
                        >
                            <X className="w-4 h-4 mr-2" />
                            {t("profile.cancel")}
                        </Button>
                    </div>
                )}
            </div>

            {/* Image Upload Dialog */}
            <Dialog open={showImageDialog} onOpenChange={setShowImageDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t("profile.update_picture_title")}</DialogTitle>
                        <DialogDescription>
                            {t("profile.update_picture_desc")}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex flex-col gap-4">
                        <Button
                            onClick={() => fileInputRef.current?.click()}
                            className="w-full"
                        >
                            <Upload className="w-4 h-4 mr-2" />
                            {t("profile.choose_from_device")}
                        </Button>
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleImageUpload}
                            className="hidden"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setShowImageDialog(false)}>
                            {t("profile.cancel")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Success Dialog */}
            <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t("profile.profile_updated_title")}</DialogTitle>
                        <DialogDescription>
                            {t("profile.profile_updated_desc")}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button onClick={() => setShowSuccessDialog(false)}>
                            {t("profile.ok")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default Profile;
