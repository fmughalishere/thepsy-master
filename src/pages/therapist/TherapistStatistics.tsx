import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { auth, db } from "@/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, BarChart3 } from "lucide-react";

interface SessionData {
    day: string;
    value: number;
}

const TherapistStatistics = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [loading, setLoading] = useState(true);
    const [filterType, setFilterType] = useState("Weekly");
    const [sessionData, setSessionData] = useState<SessionData[]>([]);
    const [completionRate, setCompletionRate] = useState(0);

    useEffect(() => {
        fetchStatistics();
    }, [filterType]);

    const fetchStatistics = async () => {
        setLoading(true);
        try {
            if (auth.currentUser) {
                const now = new Date();
                let startDate: Date;
                let data: SessionData[] = [];

                if (filterType === "Weekly") {
                    // Get current week's data (Monday to Sunday)
                    const currentDay = now.getDay();
                    const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay;
                    startDate = new Date(now);
                    startDate.setDate(now.getDate() + mondayOffset);
                    startDate.setHours(0, 0, 0, 0);

                    const days = [
                        t("therapist.statistics.days.mon"),
                        t("therapist.statistics.days.tue"),
                        t("therapist.statistics.days.wed"),
                        t("therapist.statistics.days.thu"),
                        t("therapist.statistics.days.fri"),
                        t("therapist.statistics.days.sat"),
                        t("therapist.statistics.days.sun")
                    ];

                    for (let i = 0; i < 7; i++) {
                        const dayStart = new Date(startDate);
                        dayStart.setDate(startDate.getDate() + i);
                        const dayEnd = new Date(dayStart);
                        dayEnd.setDate(dayStart.getDate() + 1);

                        const appointmentsQuery = query(
                            collection(db, "appointments"),
                            where("therapistId", "==", auth.currentUser.uid),
                            where("status", "==", "COMPLETED"),
                            where("startTimestamp", ">=", dayStart),
                            where("startTimestamp", "<", dayEnd)
                        );

                        const querySnapshot = await getDocs(appointmentsQuery);
                        data.push({
                            day: days[i],
                            value: querySnapshot.size
                        });
                    }
                } else {
                    // Get current month's data by weeks
                    const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                    const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);

                    for (let week = 1; week <= 4; week++) {
                        const weekStart = new Date(firstDayOfMonth);
                        weekStart.setDate(1 + (week - 1) * 7);
                        const weekEnd = new Date(weekStart);
                        weekEnd.setDate(weekStart.getDate() + 7);

                        if (weekEnd > lastDayOfMonth) {
                            weekEnd.setTime(lastDayOfMonth.getTime());
                        }

                        const appointmentsQuery = query(
                            collection(db, "appointments"),
                            where("therapistId", "==", auth.currentUser.uid),
                            where("status", "==", "COMPLETED"),
                            where("startTimestamp", ">=", weekStart),
                            where("startTimestamp", "<", weekEnd)
                        );

                        const querySnapshot = await getDocs(appointmentsQuery);
                        data.push({
                            day: t("therapist.statistics.week", { number: week }),
                            value: querySnapshot.size
                        });
                    }
                }

                setSessionData(data);

                // Calculate completion rate for the current period
                await calculateCompletionRate();
            }
        } catch (error) {
            console.error("Error fetching statistics:", error);
        } finally {
            setLoading(false);
        }
    };

    const calculateCompletionRate = async () => {
        try {
            if (auth.currentUser) {
                const now = new Date();
                let startDate: Date;
                let endDate: Date;

                if (filterType === "Weekly") {
                    // Get current week's data
                    const currentDay = now.getDay();
                    const mondayOffset = currentDay === 0 ? -6 : 1 - currentDay;
                    startDate = new Date(now);
                    startDate.setDate(now.getDate() + mondayOffset);
                    startDate.setHours(0, 0, 0, 0);

                    endDate = new Date(startDate);
                    endDate.setDate(startDate.getDate() + 7);
                } else {
                    // Get current month's data
                    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
                }

                // Get all appointments (booked) in the period
                const allAppointmentsQuery = query(
                    collection(db, "appointments"),
                    where("therapistId", "==", auth.currentUser.uid),
                    where("isBooked", "==", true),
                    where("startTimestamp", ">=", startDate),
                    where("startTimestamp", "<", endDate)
                );

                const allAppointmentsSnapshot = await getDocs(allAppointmentsQuery);
                const totalAppointments = allAppointmentsSnapshot.size;

                // Get completed appointments in the period
                const completedAppointmentsQuery = query(
                    collection(db, "appointments"),
                    where("therapistId", "==", auth.currentUser.uid),
                    where("status", "==", "COMPLETED"),
                    where("startTimestamp", ">=", startDate),
                    where("startTimestamp", "<", endDate)
                );

                const completedAppointmentsSnapshot = await getDocs(completedAppointmentsQuery);
                const completedAppointments = completedAppointmentsSnapshot.size;

                const rate = totalAppointments > 0 ? Math.round((completedAppointments / totalAppointments) * 100) : 0;
                setCompletionRate(rate);
            }
        } catch (error) {
            console.error("Error calculating completion rate:", error);
            setCompletionRate(0);
        }
    };

    const maxValue = Math.max(...sessionData.map(d => d.value), 1);
    const chartMaxValue = Math.max(maxValue + 2, 5); // Add some padding and ensure minimum scale

    const Bar = ({ day, value }: { day: string; value: number }) => {
        const heightPercentage = (value / chartMaxValue) * 100;

        return (
            <div className="flex flex-col items-center">
                <div className="text-xs font-medium text-gray-600 mb-1">
                    {Math.round(value)}
                </div>
                <div className="w-8 bg-gray-100 rounded-t flex flex-col justify-end" style={{ height: '160px' }}>
                    <div
                        className="w-full bg-[#92C7CF] rounded-t transition-all duration-300"
                        style={{ height: `${heightPercentage}%` }}
                    />
                </div>
                <div className="text-xs font-medium text-gray-600 mt-2">
                    {day}
                </div>
            </div>
        );
    };

    const YAxis = () => {
        const stepSize = Math.max(Math.ceil(chartMaxValue / 5), 1);
        const labels = [];
        for (let i = chartMaxValue; i >= 0; i -= stepSize) {
            labels.push(i);
        }
        if (labels[labels.length - 1] !== 0) {
            labels.push(0);
        }

        return (
            <div className="flex flex-col justify-between h-40 pr-2">
                {labels.map((label) => (
                    <div key={label} className="text-xs text-gray-500 text-right">
                        {label}
                    </div>
                ))}
            </div>
        );
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-[#F9FAFB]">
                <div className="animate-spin h-8 w-8 border-4 border-[#92C7CF] rounded-full border-t-transparent"></div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#F9FAFB]">
            {/* Header */}
            <div className="bg-white shadow-sm p-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => navigate(-1)}
                            className="p-2"
                        >
                            <ArrowLeft className="w-5 h-5" />
                        </Button>
                        <h1 className="text-lg font-medium">{t("therapist.statistics.title")}</h1>
                    </div>

                    <Select value={filterType} onValueChange={setFilterType}>
                        <SelectTrigger className="w-32">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="Weekly">{t("therapist.statistics.weekly")}</SelectItem>
                            <SelectItem value="Monthly">{t("therapist.statistics.monthly")}</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>

            {/* Statistics Content */}
            <div className="p-4">
                <Card className="bg-white rounded-2xl shadow-sm p-6">
                    <div className="mb-6">
                        <h2 className="text-lg font-semibold text-gray-900 mb-2">
                            {t("therapist.statistics.session_stats", { type: filterType === "Weekly" ? t("therapist.statistics.weekly") : t("therapist.statistics.monthly") })}
                        </h2>
                        <p className="text-sm text-gray-600">
                            {t("therapist.statistics.description")}
                        </p>
                    </div>

                    {/* Chart */}
                    <div className="flex items-end gap-4">
                        {/* Y-Axis */}
                        <YAxis />

                        {/* Bars */}
                        <div className="flex-1 flex items-end justify-around gap-2">
                            {sessionData.map((data) => (
                                <Bar key={data.day} day={data.day} value={data.value} />
                            ))}
                        </div>
                    </div>

                    {/* Chart Footer */}
                    <div className="mt-6 pt-4 border-t border-gray-100">
                        <div className="grid grid-cols-3 gap-4 text-center">
                            <div>
                                <div className="text-2xl font-bold text-[#92C7CF]">
                                    {sessionData.reduce((sum, data) => sum + data.value, 0)}
                                </div>
                                <div className="text-xs text-gray-600">{t("therapist.statistics.total_sessions")}</div>
                            </div>
                            <div>
                                <div className="text-2xl font-bold text-green-600">
                                    {Math.round(sessionData.reduce((sum, data) => sum + data.value, 0) / sessionData.length)}
                                </div>
                                <div className="text-xs text-gray-600">{t("therapist.statistics.average_per", { period: filterType === "Weekly" ? t("therapist.statistics.day") : t("therapist.statistics.week_label") })}</div>
                            </div>
                            <div>
                                <div className="text-2xl font-bold text-orange-600">
                                    {Math.max(...sessionData.map(d => d.value))}
                                </div>
                                <div className="text-xs text-gray-600">{t("therapist.statistics.peak_sessions")}</div>
                            </div>
                        </div>
                    </div>
                </Card>

                {/* Additional Stats Cards */}
                <div className="grid grid-cols-2 gap-4 mt-6">
                    <Card className="bg-white rounded-2xl shadow-sm p-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                                <BarChart3 className="w-5 h-5 text-blue-600" />
                            </div>
                            <div>
                                <div className="text-lg font-bold text-gray-900">{completionRate}%</div>
                                <div className="text-xs text-gray-600">{t("therapist.statistics.completion_rate")}</div>
                            </div>
                        </div>
                    </Card>

                    <Card className="bg-white rounded-2xl shadow-sm p-4">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                                <BarChart3 className="w-5 h-5 text-green-600" />
                            </div>
                            <div>
                                <div className="text-lg font-bold text-gray-900">{sessionData.reduce((sum, data) => sum + data.value, 0)}</div>
                                <div className="text-xs text-gray-600">{t("therapist.statistics.total_sessions")}</div>
                            </div>
                        </div>
                    </Card>
                </div>
            </div>
        </div>
    );
};

export default TherapistStatistics;
