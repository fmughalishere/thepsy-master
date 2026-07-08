import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { auth } from "@/lib/firebase";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ArrowLeft, TrendingUp, TrendingDown, Users, Wallet } from "lucide-react";
import { getTherapistEarningsStats } from "@/services/payrollService";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    AreaChart,
    Area
} from 'recharts';

const Earnings = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [loading, setLoading] = useState(true);
    const [stats, setStats] = useState<any>(null);

    useEffect(() => {
        fetchEarnings();
    }, []);

    const fetchEarnings = async () => {
        setLoading(true);
        try {
            if (auth.currentUser) {
                const data = await getTherapistEarningsStats(auth.currentUser.uid);
                setStats(data);
            }
        } catch (error) {
            console.error("Error fetching earnings stats:", error);
        } finally {
            setLoading(false);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB]">
                <div className="animate-spin h-8 w-8 border-4 border-[#92C7CF] rounded-full border-t-transparent"></div>
            </div>
        );
    }

    if (!stats) {
        return (
            <div className="min-h-screen flex flex-col items-center justify-center bg-[#F9FAFB] p-4 text-center">
                <Wallet className="w-16 h-16 text-gray-300 mb-4" />
                <h3 className="text-xl font-semibold text-gray-900 mb-2">{t("therapist.earnings.no_data")}</h3>
                <Button onClick={() => navigate(-1)} variant="outline">
                    <ArrowLeft className="w-4 h-4 mr-2" />
                    {t("common.back")}
                </Button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#F9FAFB] pb-12">
            {/* Header */}
            <div className="bg-white shadow-sm p-4 sticky top-0 z-10">
                <div className="max-w-7xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(-1)}
                            className="p-2"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </Button>
                        <h1 className="text-xl font-semibold text-gray-900">{t("therapist.earnings.title")}</h1>
                    </div>
                    <Button onClick={fetchEarnings} variant="outline" size="sm">
                        {t("common.refresh", "Refresh")}
                    </Button>
                </div>
            </div>

            <div className="max-w-7xl mx-auto p-4 md:p-6 lg:p-8 space-y-6">
                {/* Monthly Overview Section */}
                <div>
                    <h2 className="text-lg font-medium text-gray-700 mb-4">{t("therapist.earnings.monthly_overview")}</h2>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <Card className="p-6 border-none shadow-sm bg-white overflow-hidden relative group">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                <Wallet className="w-24 h-24 text-[#92C7CF]" />
                            </div>
                            <div className="relative z-10">
                                <p className="text-sm font-medium text-gray-500 mb-1">{t("therapist.earnings.monthly_revenue")}</p>
                                <div className="flex items-baseline gap-2">
                                    <h3 className="text-3xl font-bold text-gray-900">€{stats.monthlyRevenue.toFixed(2)}</h3>
                                    <span className={`text-sm font-medium flex items-center ${parseFloat(stats.revenueChangeRate) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {parseFloat(stats.revenueChangeRate) >= 0 ? <TrendingUp className="w-4 h-4 mr-1" /> : <TrendingDown className="w-4 h-4 mr-1" />}
                                        {Math.abs(stats.revenueChangeRate)}%
                                    </span>
                                </div>
                                <p className="text-xs text-gray-400 mt-1">{t("therapist.earnings.revenue_growth", { percent: stats.revenueChangeRate })}</p>
                            </div>
                        </Card>

                        <Card className="p-6 border-none shadow-sm bg-white overflow-hidden relative group">
                            <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
                                <Users className="w-24 h-24 text-teal-500" />
                            </div>
                            <div className="relative z-10">
                                <p className="text-sm font-medium text-gray-500 mb-1">{t("therapist.earnings.total_sessions")}</p>
                                <div className="flex items-baseline gap-2">
                                    <h3 className="text-3xl font-bold text-gray-900">{stats.totalSessions}</h3>
                                    <span className={`text-sm font-medium flex items-center ${stats.sessionsChange >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {stats.sessionsChange >= 0 ? "+" : ""}{stats.sessionsChange}
                                    </span>
                                </div>
                                <p className="text-xs text-gray-400 mt-1">{t("therapist.earnings.sessions_growth", { count: stats.sessionsChange })}</p>
                            </div>
                        </Card>
                    </div>
                </div>

                {/* Charts Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Monthly Comparison */}
                    <Card className="p-6 border-none shadow-sm bg-white">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="font-semibold text-gray-900">{t("therapist.earnings.monthly_comparison")}</h3>
                        </div>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={stats.comparison}>
                                    <defs>
                                        <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#92C7CF" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#92C7CF" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#888' }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#888' }} />
                                    <Tooltip
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                    />
                                    <Area type="monotone" dataKey="revenue" stroke="#92C7CF" strokeWidth={3} fillOpacity={1} fill="url(#colorRev)" />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>

                    {/* Weekly breakdown for current month */}
                    <Card className="p-6 border-none shadow-sm bg-white">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="font-semibold text-gray-900">{t("therapist.earnings.monthly_statistic")}</h3>
                        </div>
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={stats.weeklyData.map((item: any) => ({
                                    ...item,
                                    name: t("therapist.statistics.week", { number: item.name.split(' ')[1] })
                                }))}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#888' }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 12, fill: '#888' }} />
                                    <Tooltip
                                        cursor={{ fill: '#f9fafb' }}
                                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
                                    />
                                    <Bar dataKey="value" fill="#92C7CF" radius={[6, 6, 0, 0]} barSize={40} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </Card>
                </div>

                {/* History Table-like list for comparison */}
                <Card className="border-none shadow-sm bg-white overflow-hidden">
                    <div className="p-6 border-b border-gray-50">
                        <h3 className="font-semibold text-gray-900">{t("therapist.earnings.detailed_history")}</h3>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="bg-gray-50">
                                <tr>
                                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">{t("therapist.earnings.month")}</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase">{t("therapist.earnings.revenue")}</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase text-center">{t("therapist.earnings.sessions")}</th>
                                    <th className="px-6 py-4 text-xs font-semibold text-gray-500 uppercase text-right">{t("therapist.earnings.avg_per_day_label")}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-50">
                                {stats.comparison.map((row: any, idx: number) => (
                                    <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                        <td className="px-6 py-4 text-sm font-medium text-gray-900">{row.name}</td>
                                        <td className="px-6 py-4 text-sm text-gray-600">€{row.revenue.toFixed(2)}</td>
                                        <td className="px-6 py-4 text-sm text-gray-600 text-center">{row.sessions}</td>
                                        <td className="px-6 py-4 text-sm text-gray-500 text-right">€{row.avgPerDay}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Card>
            </div>
        </div>
    );
};

export default Earnings;
