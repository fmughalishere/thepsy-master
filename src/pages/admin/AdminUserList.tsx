import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { collection, query, getDocs, orderBy, deleteDoc, doc, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronRight, Users, CheckCircle, Search, ShieldAlert, UserCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { THERAPIST_SPECIALIZATION_DEFAULT_EN_LABEL, normalizeTherapistSpecializationKeys } from "@/lib/therapistSpecializations";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useTranslation } from "react-i18next";

const AdminUserList = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [users, setUsers] = useState<any[]>([]);
    const [therapists, setTherapists] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState("ALL");
    const [searchTerm, setSearchTerm] = useState("");
    const [showDeleteDialog, setShowDeleteDialog] = useState(false);
    const [userToDelete, setUserToDelete] = useState<any | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);

    useEffect(() => {
        fetchUsers();
    }, []);

    const fetchUsers = async () => {
        try {
            setLoading(true);
            const q = query(
                collection(db, "users"),
                orderBy("createdAt", "desc")
            );

            const querySnapshot = await getDocs(q);
            const userList = querySnapshot.docs.map(doc => ({
                id: doc.id,
                ...(doc.data() as any)
            })) as any[];

            // Create a lookup map for therapists
            const therapistMap = userList.reduce((acc, user) => {
                if (user.role === 'THERAPIST' || user.role === 'therapist') {
                    acc[user.id] = user.displayName || user.email || user.id;
                }
                return acc;
            }, {} as Record<string, string>);

            setTherapists(therapistMap);
            setUsers(userList);
        } catch (error) {
            console.error("Error fetching users:", error);
        } finally {
            setLoading(false);
        }
    };

    // Filter users based on active tab and search term
    const getFilteredUsers = () => {
        let filtered = users;

        // Filter by role/blocked status
        if (activeTab === "BLOCKED") {
            filtered = users.filter(user => user.isBlocked === true);
        } else if (activeTab === "ALL") {
            filtered = users;
        } else {
            filtered = users.filter(user => user.role === activeTab && !user.isBlocked);
        }

        // Filter by search term
        if (searchTerm.trim()) {
            const term = searchTerm.toLowerCase();
            filtered = filtered.filter(user =>
                user.displayName?.toLowerCase().includes(term) ||
                user.email?.toLowerCase().includes(term) ||
                (user.role === 'THERAPIST' && (
                    (Array.isArray(user.therapistDetails?.specialization)
                        ? user.therapistDetails.specialization.some((s: string) => s.toLowerCase().includes(term))
                        : user.therapistDetails?.specialization?.toLowerCase().includes(term)) ||
                    user.therapistDetails?.specializations?.some((s: string) => s.toLowerCase().includes(term))
                ))
            );
        }

        return filtered;
    };

    const getCounts = () => {
        const therapistsCount = users.filter(user => user.role === 'THERAPIST' && !user.isBlocked).length;
        const patients = users.filter(user => user.role === 'PATIENT' && !user.isBlocked).length;
        const blocked = users.filter(user => user.isBlocked === true).length;
        const all = users.length;

        return { therapists: therapistsCount, patients, blocked, all };
    };

    const counts = getCounts();

    const confirmDelete = (e: React.MouseEvent, user: any) => {
        e.stopPropagation();
        setUserToDelete(user);
        setShowDeleteDialog(true);
    };

    const handleDeleteUser = async () => {
        if (!userToDelete) return;
        setIsDeleting(true);
        try {
            // 1. Delete User Document
            await deleteDoc(doc(db, "users", userToDelete.id));

            // 2. UI Update
            setUsers(prev => prev.filter(u => u.id !== userToDelete.id));
            toast({ title: t('admin.users.messages.deleted_success') });
            setShowDeleteDialog(false);
            setUserToDelete(null);

        } catch (error) {
            console.error("Error deleting user:", error);
            toast({ title: t('admin.users.messages.delete_failed'), variant: "destructive" });
        } finally {
            setIsDeleting(false);
        }
    };

    const UserCard = ({ user }: { user: any }) => (
        <div
            key={user.id}
            className="p-4 flex items-center hover:bg-gray-50 transition-colors cursor-pointer group justify-between"
            onClick={() => navigate(`/admin/users/${user.id}`)}
        >
            <div className="flex items-center flex-1">
                <Avatar className="h-12 w-12 border border-gray-100 mr-4">
                    <AvatarImage src={user.profilePicture || user.photoUrl} />
                    <AvatarFallback className="bg-[#92C7CF] text-white">
                        {user.displayName?.charAt(0) || user.role?.charAt(0) || t('admin.users.fallback.initial')}
                    </AvatarFallback>
                </Avatar>

                <div className="flex-1">
                    <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-gray-900">{user.displayName || t('admin.users.badges.unknown_name')}</h3>
                        {user.isBlocked && (
                            <Badge variant="destructive" className="text-[10px] h-4 px-1">{t('admin.users.badges.blocked')}</Badge>
                        )}
                    </div>
                    <p className="text-sm text-gray-500">{user.email}</p>
                    {user.role === 'THERAPIST' && (
                        <p className="text-xs text-gray-400">
                            {(() => {
                                const specs = normalizeTherapistSpecializationKeys(
                                    user.therapistDetails?.specializations ?? user.therapistDetails?.specialization ?? []
                                );
                                if (specs.length === 0) return t("admin.user_details.fallback.clinical_psychologist") as string;

                                const first = specs[0];
                                const firstLabel = t(`therapist.specializations.${first}`, THERAPIST_SPECIALIZATION_DEFAULT_EN_LABEL[first]) as string;
                                const more = specs.length > 1 ? ` +${specs.length - 1} ${t('admin.users.badges.more')}` : "";
                                return `${firstLabel}${more}`;
                            })()}
                        </p>
                    )}
                    {user.role === 'PATIENT' && user.patientDetails?.assignedTherapist && (
                        <p className="text-xs text-blue-500 mt-1 font-shippori">
                            {t('admin.user_details.assigned_therapist')}: <span className="font-semibold text-blue-600">{therapists[user.patientDetails.assignedTherapist] || user.patientDetails.assignedTherapist.substring(0, 8)}</span>
                        </p>
                    )}
                </div>
            </div>

            <div className="flex items-center gap-4">
                {user.role === 'THERAPIST' && (
                    <Badge variant={(user.therapistDetails?.profileStatus === 'APPROVED' || user.therapistDetails?.profileStatus === 'VERIFIED') ? 'outline' : 'secondary'}
                        className={`
                                ${(user.therapistDetails?.profileStatus === 'APPROVED' || user.therapistDetails?.profileStatus === 'VERIFIED') ? 'bg-green-50 text-green-700 border-green-200' :
                                (user.therapistDetails?.profileStatus === 'REJECTED') ? 'bg-red-50 text-red-700 border-red-200' :
                                    (user.therapistDetails?.profileStatus === 'COOLDOWN') ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                        'bg-orange-50 text-orange-700 border-orange-200'}
                            `}
                    >
                        {user.therapistDetails?.profileStatus === 'APPROVAL_PENDING' ? t('admin.users.badges.pending') :
                            user.therapistDetails?.profileStatus === 'APPROVED' ? t('admin.users.badges.approved') :
                                user.therapistDetails?.profileStatus === 'REJECTED' ? t('admin.users.badges.rejected') :
                                    user.therapistDetails?.profileStatus === 'COOLDOWN' ? t('admin.users.badges.cooldown') :
                                        user.therapistDetails?.profileStatus === 'VERIFIED' ? t('admin.users.badges.verified') : t('admin.users.badges.pending')}
                    </Badge>
                )}
                {user.role === 'PATIENT' && (
                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                        {t('admin.users.badges.patient')}
                    </Badge>
                )}

                <Button
                    variant="ghost"
                    size="icon"
                    className="text-gray-400 hover:text-red-500 hover:bg-red-50"
                    onClick={(e) => confirmDelete(e, user)}
                >
                    <Trash2 className="w-5 h-5" />
                </Button>

                <ChevronRight className="w-5 h-5 text-gray-300 group-hover:text-gray-500" />
            </div>
        </div>
    );

    const filteredUsers = getFilteredUsers();

    if (loading && users.length === 0) return <div className="p-8 text-center text-gray-500">{t('admin.users.loading')}</div>;

    return (
        <div className="animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
                <div>
                    <h1 className="text-3xl text-[#92C7CF] font-kalnia mb-2">{t('admin.users.title')}</h1>
                    <p className="text-sm text-gray-500 font-shippori">{t('admin.users.subtitle')}</p>
                </div>
                <div className="relative w-full md:w-80">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <Input
                        placeholder={t('admin.users.search_placeholder')}
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 rounded-xl border-gray-200 focus:border-[#92C7CF] transition-all"
                    />
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-4 mb-8 bg-gray-100 p-1 rounded-xl">
                    <TabsTrigger value="ALL" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-[#508C96] data-[state=active]:shadow-sm">
                        <Users className="w-4 h-4 mr-2" />
                        {t('admin.users.tabs.all')} ({counts.all})
                    </TabsTrigger>
                    <TabsTrigger value="THERAPIST" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-[#508C96] data-[state=active]:shadow-sm">
                        <Users className="w-4 h-4 mr-2" />
                        {t('admin.users.tabs.therapists')} ({counts.therapists})
                    </TabsTrigger>
                    <TabsTrigger value="PATIENT" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-[#508C96] data-[state=active]:shadow-sm">
                        <UserCheck className="w-4 h-4 mr-2" />
                        {t('admin.users.tabs.patients')} ({counts.patients})
                    </TabsTrigger>
                    <TabsTrigger value="BLOCKED" className="rounded-lg data-[state=active]:bg-white data-[state=active]:text-red-600 data-[state=active]:shadow-sm">
                        <ShieldAlert className="w-4 h-4 mr-2" />
                        {t('admin.users.tabs.blocked')} ({counts.blocked})
                    </TabsTrigger>
                </TabsList>

                {["ALL", "THERAPIST", "PATIENT", "BLOCKED"].map((type) => (
                    <TabsContent key={type} value={type}>
                        <Card className="overflow-hidden border-none shadow-md rounded-2xl">
                            <div className="grid grid-cols-1 divide-y divide-gray-50">
                                {filteredUsers.length === 0 ? (
                                    <div className="p-12 text-center text-gray-500 bg-white">
                                        {type === "BLOCKED" ? <CheckCircle className="w-12 h-12 text-green-200 mx-auto mb-4" /> : <Search className="w-12 h-12 text-gray-200 mx-auto mb-4" />}
                                        <p className="font-medium">
                                            {t(`admin.users.empty.${type === 'ALL' ? 'all' : type.toLowerCase()}`)}
                                        </p>
                                    </div>
                                ) : (
                                    filteredUsers.map((user) => <UserCard key={user.id} user={user} />)
                                )}
                            </div>
                        </Card>
                    </TabsContent>
                ))}
            </Tabs>

            <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>{t('admin.users.delete_dialog.title')}</AlertDialogTitle>
                        <AlertDialogDescription>
                            {t('admin.users.delete_dialog.description')}
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>{t('admin.users.delete_dialog.cancel')}</AlertDialogCancel>
                        <AlertDialogAction onClick={handleDeleteUser} className="bg-red-600 hover:bg-red-700">
                            {isDeleting ? t('admin.users.delete_dialog.deleting') : t('admin.users.delete_dialog.confirm')}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
};

export default AdminUserList;
