import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, updateDoc, deleteDoc } from "firebase/firestore";
import {
    deleteUser,
    signOut,
    updateEmail,
    updatePassword,
    reauthenticateWithCredential,
    EmailAuthProvider
} from "firebase/auth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog";
import {
    ArrowLeft, Mail, Lock, Eye, EyeOff,
    AlertTriangle, Trash2, Save
} from "lucide-react";

const AccountSettings = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [updating, setUpdating] = useState(false);
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [showCurrentPassword, setShowCurrentPassword] = useState(false);
    const [showNewPassword, setShowNewPassword] = useState(false);
    const [confirmDeleteChecked, setConfirmDeleteChecked] = useState(false);

    const [formData, setFormData] = useState({
        email: "",
        currentPassword: "",
        newPassword: ""
    });

    const [user, setUser] = useState<any>(null);

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
                    setFormData(prev => ({
                        ...prev,
                        email: auth.currentUser?.email || ""
                    }));
                }
            }
        } catch (error) {
            console.error("Error fetching user data:", error);
        } finally {
            setLoading(false);
        }
    };

    const handleUpdateAccount = async () => {
        if (!formData.currentPassword) {
            toast({
                title: t('common.error', "Error"),
                description: t('settings.error_current_password', "Current password is required to update account information"),
                variant: "destructive",
            });
            return;
        }

        setUpdating(true);
        try {
            if (auth.currentUser) {
                // Re-authenticate user first
                const credential = EmailAuthProvider.credential(
                    auth.currentUser.email!,
                    formData.currentPassword
                );
                await reauthenticateWithCredential(auth.currentUser, credential);

                // Update email if changed
                if (formData.email !== auth.currentUser.email) {
                    await updateEmail(auth.currentUser, formData.email);

                    // Update email in Firestore
                    await updateDoc(doc(db, "users", auth.currentUser.uid), {
                        email: formData.email,
                        updatedAt: new Date()
                    });
                }

                // Update password if provided
                if (formData.newPassword) {
                    await updatePassword(auth.currentUser, formData.newPassword);
                }

                toast({
                    title: t('settings.success_update_title', "Account Updated"),
                    description: t('settings.success_update_desc', "Your account information has been successfully updated"),
                });

                // Clear password fields
                setFormData(prev => ({
                    ...prev,
                    currentPassword: "",
                    newPassword: ""
                }));
            }
        } catch (error: any) {
            console.error("Error updating account:", error);
            let errorMessage = t('settings.error_update_failed', "Failed to update account information");

            if (error.code === "auth/wrong-password") {
                errorMessage = t('settings.error_wrong_password', "Current password is incorrect");
            } else if (error.code === "auth/email-already-in-use") {
                errorMessage = t('settings.error_email_in_use', "This email is already in use by another account");
            } else if (error.code === "auth/weak-password") {
                errorMessage = t('settings.error_weak_password', "New password is too weak. Please choose a stronger password");
            } else if (error.code === "auth/requires-recent-login") {
                errorMessage = t('settings.error_recent_login', "Please log out and log back in before updating your account");
            }

            toast({
                title: t('common.error', "Error"),
                description: errorMessage,
                variant: "destructive",
            });
        } finally {
            setUpdating(false);
        }
    };

    const handleDeleteAccount = async () => {
        if (!confirmDeleteChecked) {
            toast({
                title: t('common.error', "Error"),
                description: t('settings.error_delete_confirm', "Please confirm that you want to delete your account"),
                variant: "destructive",
            });
            return;
        }

        setDeleting(true);
        try {
            if (auth.currentUser) {
                // Delete user document from Firestore
                await deleteDoc(doc(db, "users", auth.currentUser.uid));

                // Delete Firebase Auth user
                await deleteUser(auth.currentUser);

                toast({
                    title: t('settings.success_delete_title', "Account Deleted"),
                    description: t('settings.success_delete_desc', "Your account has been permanently deleted"),
                });

                navigate("/login");
            }
        } catch (error: any) {
            console.error("Error deleting account:", error);
            let errorMessage = t('settings.error_delete_failed', "Failed to delete account");

            if (error.code === "auth/requires-recent-login") {
                errorMessage = t('settings.error_recent_login', "Please log out and log back in before deleting your account");
            }

            toast({
                title: t('common.error', "Error"),
                description: errorMessage,
                variant: "destructive",
            });
        } finally {
            setDeleting(false);
            setShowDeleteDialog(false);
        }
    };

    const handleLogout = async () => {
        try {
            await signOut(auth);
            navigate("/login");
        } catch (error) {
            console.error("Error signing out:", error);
        }
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
            <div className="flex items-center gap-4 mb-6">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => navigate(-1)}
                    className="p-2"
                >
                    <ArrowLeft className="w-5 h-5" />
                </Button>
                <h1 className="text-2xl font-semibold text-gray-900">{t('settings.title', 'Account Settings')}</h1>
            </div>

            <div className="max-w-2xl mx-auto space-y-6">
                {/* Update Account Information */}
                <Card className="p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-6">{t('settings.update_title', 'Update Account Information')}</h3>

                    <div className="space-y-4">
                        {/* Email Field */}
                        <div>
                            <Label htmlFor="email">{t('settings.email_label', 'Email Address')}</Label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                                <Input
                                    id="email"
                                    type="email"
                                    value={formData.email}
                                    onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
                                    className="pl-10"
                                    placeholder={t('settings.email_placeholder', 'Enter your email')}
                                    disabled={updating}
                                />
                            </div>
                        </div>

                        {/* Current Password Field */}
                        <div>
                            <Label htmlFor="currentPassword">{t('settings.current_password_label', 'Current Password')}</Label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                                <Input
                                    id="currentPassword"
                                    type={showCurrentPassword ? "text" : "password"}
                                    value={formData.currentPassword}
                                    onChange={(e) => setFormData(prev => ({ ...prev, currentPassword: e.target.value }))}
                                    className="pl-10 pr-10"
                                    placeholder={t('settings.current_password_placeholder', 'Enter current password')}
                                    disabled={updating}
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                                    disabled={updating}
                                >
                                    {showCurrentPassword ? (
                                        <EyeOff className="h-4 w-4 text-gray-400" />
                                    ) : (
                                        <Eye className="h-4 w-4 text-gray-400" />
                                    )}
                                </Button>
                            </div>
                        </div>

                        {/* New Password Field */}
                        <div>
                            <Label htmlFor="newPassword">{t('settings.new_password_label', 'New Password (Optional)')}</Label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                                <Input
                                    id="newPassword"
                                    type={showNewPassword ? "text" : "password"}
                                    value={formData.newPassword}
                                    onChange={(e) => setFormData(prev => ({ ...prev, newPassword: e.target.value }))}
                                    className="pl-10 pr-10"
                                    placeholder={t('settings.new_password_placeholder', 'Enter new password (leave blank to keep current)')}
                                    disabled={updating}
                                />
                                <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                    onClick={() => setShowNewPassword(!showNewPassword)}
                                    disabled={updating}
                                >
                                    {showNewPassword ? (
                                        <EyeOff className="h-4 w-4 text-gray-400" />
                                    ) : (
                                        <Eye className="h-4 w-4 text-gray-400" />
                                    )}
                                </Button>
                            </div>
                            <p className="text-sm text-gray-500 mt-1">
                                {t('settings.password_hint', "Leave blank if you don't want to change your password")}
                            </p>
                        </div>

                        {/* Update Button */}
                        <Button
                            onClick={handleUpdateAccount}
                            disabled={updating || !formData.currentPassword}
                            className="w-full bg-[#92C7CF] hover:bg-[#7FB0B8]"
                        >
                            {updating ? (
                                <>
                                    <div className="animate-spin h-4 w-4 border-2 border-white rounded-full border-t-transparent mr-2" />
                                    {t('settings.updating', "Updating...")}
                                </>
                            ) : (
                                <>
                                    <Save className="w-4 h-4 mr-2" />
                                    {t('settings.update_button', "Update Account")}
                                </>
                            )}
                        </Button>
                    </div>
                </Card>

                {/* Quick Actions */}
                <Card className="p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">{t('settings.quick_actions', 'Quick Actions')}</h3>
                    <div className="space-y-3">
                        <Button
                            variant="outline"
                            className="w-full justify-start"
                            onClick={() => window.open("/privacy", "_blank")}
                        >
                            {t('settings.privacy_policy', 'Privacy Policy')}
                        </Button>

                        <Button
                            variant="outline"
                            className="w-full justify-start"
                            onClick={() => window.open("/terms", "_blank")}
                        >
                            {t('settings.terms_conditions', 'Terms & Conditions')}
                        </Button>

                        <Button
                            variant="outline"
                            className="w-full justify-start"
                            onClick={handleLogout}
                        >
                            {t('settings.sign_out', 'Sign Out')}
                        </Button>
                    </div>
                </Card>

                {/* Danger Zone */}
                <Card className="p-6 border-red-200">
                    <h3 className="text-lg font-semibold text-red-600 mb-4 flex items-center gap-2">
                        <AlertTriangle className="w-5 h-5" />
                        {t('settings.danger_zone', 'Danger Zone')}
                    </h3>
                    <div className="space-y-3">
                        <p className="text-sm text-gray-600">
                            {t('settings.danger_desc', 'Once you delete your account, there is no going back. Please be certain.')}
                        </p>
                        <Button
                            variant="destructive"
                            onClick={() => setShowDeleteDialog(true)}
                            className="w-full"
                        >
                            <Trash2 className="w-4 h-4 mr-2" />
                            {t('settings.delete_account', 'Delete Account')}
                        </Button>
                    </div>
                </Card>
            </div>

            {/* Delete Account Confirmation Dialog */}
            <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle className="text-red-600">{t('settings.delete_confirm_title', 'Delete Account')}</DialogTitle>
                        <DialogDescription>
                            {t('settings.delete_confirm_desc', 'Are you absolutely sure you want to delete your account? This action cannot be undone. All your data, including messages, appointments, and profile information will be permanently deleted.')}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="flex items-center space-x-2">
                        <input
                            type="checkbox"
                            id="confirmDelete"
                            checked={confirmDeleteChecked}
                            onChange={(e) => setConfirmDeleteChecked(e.target.checked)}
                            className="rounded border-gray-300"
                        />
                        <label htmlFor="confirmDelete" className="text-sm text-gray-600">
                            {t('settings.delete_checkbox', 'I understand that this action cannot be undone')}
                        </label>
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setShowDeleteDialog(false);
                                setConfirmDeleteChecked(false);
                            }}
                            disabled={deleting}
                        >
                            {t('common.cancel', 'Cancel')}
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDeleteAccount}
                            disabled={deleting || !confirmDeleteChecked}
                        >
                            {deleting ? (
                                <>
                                    <div className="animate-spin h-4 w-4 border-2 border-white rounded-full border-t-transparent mr-2" />
                                    {t('settings.deleting', "Deleting...")}
                                </>
                            ) : (
                                t('settings.delete_account', "Delete Account")
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
};

export default AccountSettings;
