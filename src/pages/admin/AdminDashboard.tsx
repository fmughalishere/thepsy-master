import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Users, UserCheck, Activity, CreditCard, ArrowRight, BookOpen, Calendar } from "lucide-react";
import { collection, query, where, getCountFromServer } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useTranslation } from "react-i18next";

const AdminDashboard = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [stats, setStats] = useState({
        pendingTherapists: 0,
        activeUsers: 0,
        totalSessions: 0
    });

    useEffect(() => {
        const fetchStats = async () => {
            try {
                // Pending Therapists (including those in cooldown)
                const therapistsQuery = query(
                    collection(db, "users"),
                    where("role", "==", "THERAPIST"),
                    where("therapistDetails.profileStatus", "in", ["APPROVAL_PENDING", "COOLDOWN"])
                );
                const therapistsSnap = await getCountFromServer(therapistsQuery);

                // Active Patients (Approximation)
                const patientsQuery = query(collection(db, "users"), where("role", "==", "PATIENT"));
                const patientsSnap = await getCountFromServer(patientsQuery);

                setStats({
                    pendingTherapists: therapistsSnap.data().count,
                    activeUsers: patientsSnap.data().count,
                    totalSessions: 0 // Placeholder
                });
            } catch (error) {
                console.error("Error fetching admin stats:", error);
            }
        };

        fetchStats();
    }, []);

    const navItems = [
        { title: t('admin.dashboard.actions.review_approvals.title'), subtitle: t('admin.dashboard.actions.review_approvals.subtitle'), icon: Users, path: "/admin/users" },
        { title: t('admin.dashboard.actions.manage_users.title'), subtitle: t('admin.dashboard.actions.manage_users.subtitle'), icon: UserCheck, path: "/admin/users" },
        { title: t('admin.dashboard.actions.payroll.title'), subtitle: t('admin.dashboard.actions.payroll.subtitle'), icon: CreditCard, path: "/admin/payroll" },
        { title: t('admin.dashboard.actions.affirmations.title'), subtitle: t('admin.dashboard.actions.affirmations.subtitle'), icon: Activity, path: "/admin/affirmations" },
        { title: t('admin.dashboard.actions.statistics.title'), subtitle: t('admin.dashboard.actions.statistics.subtitle'), icon: Activity, path: "/admin/statistics" },
        { title: t('admin.dashboard.actions.transactions.title'), subtitle: t('admin.dashboard.actions.transactions.subtitle'), icon: CreditCard, path: "/admin/transactions" },
        { title: t('admin.dashboard.actions.content.title'), subtitle: t('admin.dashboard.actions.content.subtitle'), icon: BookOpen, path: "/admin/content" },
        { title: t('admin.dashboard.actions.appointments.title'), subtitle: t('admin.dashboard.actions.appointments.subtitle'), icon: Calendar, path: "/admin/appointments" },
    ];

    return (
        <div className="max-w-7xl mx-auto px-4 py-8 font-sans">
            <div className="mb-8">
                <h1 className="text-3xl text-[#92C7CF] font-kalnia mb-2">{t('admin.dashboard.title')}</h1>
                <p className="text-sm text-gray-500 font-shippori">{t('admin.dashboard.subtitle')}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                <Card className="border border-gray-100 shadow-sm hover:shadow-md transition-shadow bg-white">
                    <CardContent className="p-6 flex items-center gap-6">
                        <div className="w-14 h-14 rounded-full bg-[#f0f7f8] flex items-center justify-center text-[#508C96]">
                            <Users className="w-7 h-7" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-gray-500 mb-1">{t('admin.dashboard.pending_approvals')}</p>
                            <h3 className="text-3xl font-bold text-[#508C96]">{stats.pendingTherapists}</h3>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border border-gray-100 shadow-sm hover:shadow-md transition-shadow bg-white">
                    <CardContent className="p-6 flex items-center gap-6">
                        <div className="w-14 h-14 rounded-full bg-[#f0f7f8] flex items-center justify-center text-[#508C96]">
                            <UserCheck className="w-7 h-7" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-gray-500 mb-1">{t('admin.dashboard.total_patients')}</p>
                            <h3 className="text-3xl font-bold text-[#508C96]">{stats.activeUsers}</h3>
                        </div>
                    </CardContent>
                </Card>

                <Card className="border border-gray-100 shadow-sm hover:shadow-md transition-shadow bg-white">
                    <CardContent className="p-6 flex items-center gap-6">
                        <div className="w-14 h-14 rounded-full bg-[#f0f7f8] flex items-center justify-center text-[#508C96]">
                            <Activity className="w-7 h-7" />
                        </div>
                        <div>
                            <p className="text-sm font-medium text-gray-500 mb-1">{t('admin.dashboard.system_status')}</p>
                            <h3 className="text-xl font-bold text-[#508C96]">{t('admin.dashboard.healthy')}</h3>
                        </div>
                    </CardContent>
                </Card>
            </div>

            <h2 className="text-xl text-[#508C96] mb-6 font-kalnia">{t('admin.dashboard.quick_actions')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {navItems.map((item) => (
                    <Card
                        key={item.title}
                        className="group cursor-pointer border border-gray-100 shadow-sm hover:shadow-md hover:border-[#92C7CF] transition-all duration-300 bg-white"
                        onClick={() => navigate(item.path)}
                    >
                        <CardContent className="p-6 flex items-center justify-between">
                            <div className="flex items-center gap-4">
                                <div className="w-12 h-12 rounded-xl bg-[#f0f7f8] group-hover:bg-[#e0eff1] flex items-center justify-center text-[#508C96] transition-colors">
                                    <item.icon className="w-6 h-6" />
                                </div>
                                <div>
                                    <h3 className="font-semibold text-gray-900 group-hover:text-[#508C96] transition-colors">{item.title}</h3>
                                    <p className="text-sm text-gray-500">{item.subtitle}</p>
                                </div>
                            </div>
                            <ArrowRight className="w-5 h-5 text-gray-300 group-hover:text-[#508C96] transition-colors" />
                        </CardContent>
                    </Card>
                ))}
            </div>
        </div>
    );
};

export default AdminDashboard;
