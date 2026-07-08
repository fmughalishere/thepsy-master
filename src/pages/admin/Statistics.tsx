import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { ChevronDown } from 'lucide-react';
import { collection, query, where, getCountFromServer, getDocs, limit, orderBy, startAfter } from "firebase/firestore";
import { db } from "../../lib/firebase";

interface Therapist {
    uid: string;
    displayName: string;
    clientCount?: number;
    availableHours?: number;
    // ... other fields
}

interface Client {
    uid: string;
    displayName: string;
    patientDetails?: {
        quotas?: {
            subscriptionStatus?: string;
        }
    }
}

export default function Statistics() {
    const { t } = useTranslation();
    const [activeTab, setActiveTab] = useState<'therapist' | 'client'>('therapist');
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [selectedPeriod, setSelectedPeriod] = useState('this_week');

    // Stats State
    const [therapistStats, setTherapistStats] = useState({
        total: 0,
        weeklyAvailability: "0", // Placeholder/Mock for hardcoded value requested
        avgUtilization: "78%",    // Placeholder
        totalSlotsOpen: "342"     // Placeholder
    });
    const [clientStats, setClientStats] = useState({
        total: 0,
        unsubscribed: 0,
        returned: 0,
        active: 0
    });

    // Table Data State
    const [therapists, setTherapists] = useState<Therapist[]>([]);
    const [clients, setClients] = useState<Client[]>([]);
    const [lastTherapistDoc, setLastTherapistDoc] = useState<any>(null);
    const [lastClientDoc, setLastClientDoc] = useState<any>(null);
    const [loading, setLoading] = useState(false);

    const periods = [
        'this_week',
        'this_month',
        'six_months',
        'this_year',
        'prev_month',
        'prev_week',
        'prev_year'
    ];

    useEffect(() => {
        loadStats();
        loadTherapists(true);
        loadClients(true);
    }, [selectedPeriod]);

    const getPeriodLabel = (period: string) => {
        return t(`admin.stats.periods.${period}`, period);
    };

    const getStatusLabel = (status?: string) => {
        switch (status) {
            case 'ACTIVE': return t('admin.stats.status.active');
            case 'UNSUBSCRIBED': return t('admin.stats.status.unsubscribed');
            case 'RETURNED': return t('admin.stats.status.returned');
            default: return t('admin.stats.status.unknown');
        }
    };

    const loadStats = async () => {
        try {
            // Calculate Date Range
            const now = new Date();
            let startDate: Date | null = null;
            let endDate: Date | null = null;

            const getStartOfWeek = (d: Date) => {
                const date = new Date(d);
                const day = date.getDay();
                const diff = date.getDate() - day + (day === 0 ? -6 : 1); // adjust when day is sunday
                return new Date(date.setDate(diff));
            };

            switch (selectedPeriod) {
                case 'this_week':
                    startDate = getStartOfWeek(now);
                    startDate.setHours(0, 0, 0, 0);
                    endDate = new Date(startDate);
                    endDate.setDate(endDate.getDate() + 6);
                    endDate.setHours(23, 59, 59, 999);
                    break;
                case 'this_month':
                    startDate = new Date(now.getFullYear(), now.getMonth(), 1);
                    endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
                    break;
                case 'prev_week':
                    startDate = getStartOfWeek(now);
                    startDate.setDate(startDate.getDate() - 7);
                    startDate.setHours(0, 0, 0, 0);
                    endDate = new Date(startDate);
                    endDate.setDate(endDate.getDate() + 6);
                    endDate.setHours(23, 59, 59, 999);
                    break;
                case 'prev_month':
                    startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
                    endDate = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
                    break;
                case 'this_year':
                    startDate = new Date(now.getFullYear(), 0, 1);
                    endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
                    break;
                case 'prev_year':
                    startDate = new Date(now.getFullYear() - 1, 0, 1);
                    endDate = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59);
                    break;
                case 'six_months':
                    endDate = new Date();
                    startDate = new Date();
                    startDate.setMonth(startDate.getMonth() - 6);
                    break;
                default:
                    startDate = getStartOfWeek(now);
                    endDate = now;
            }

            // Therapist Count
            const tQuery = query(
                collection(db, "users"),
                where("role", "==", "THERAPIST"),
                where("therapistDetails.profileStatus", "==", "APPROVED")
            );
            const tSnap = await getCountFromServer(tQuery);

            // Appointment Stats (Global) based on appointments status
            let availableCount = 0;
            let bookedCount = 0;

            try {
                let availableSlotsQuery = query(collection(db, "appointments"), where("status", "==", "AVAILABLE"));
                if (startDate && endDate) {
                    availableSlotsQuery = query(
                        collection(db, "appointments"),
                        where("status", "==", "AVAILABLE"),
                        where("startTimestamp", ">=", startDate),
                        where("startTimestamp", "<=", endDate)
                    );
                }
                const availableSnap = await getCountFromServer(availableSlotsQuery);
                availableCount = availableSnap.data().count;

                let bookedSlotsQuery = query(collection(db, "appointments"), where("status", "==", "BOOKED"));
                if (startDate && endDate) {
                    bookedSlotsQuery = query(
                        collection(db, "appointments"),
                        where("status", "==", "BOOKED"),
                        where("startTimestamp", ">=", startDate),
                        where("startTimestamp", "<=", endDate)
                    );
                }
                const bookedSnap = await getCountFromServer(bookedSlotsQuery);
                bookedCount = bookedSnap.data().count;
            } catch (err) {
                console.warn("Could not fetch filtered appointment counts (likely missing dynamic index):", err);
                // Fallback to total counts if date filtering fails
                const totalAvailQuery = query(collection(db, "appointments"), where("status", "==", "AVAILABLE"));
                const totalBookedQuery = query(collection(db, "appointments"), where("status", "==", "BOOKED"));
                const [availSnap, bookedSnap] = await Promise.all([
                    getCountFromServer(totalAvailQuery),
                    getCountFromServer(totalBookedQuery)
                ]);
                availableCount = availSnap.data().count;
                bookedCount = bookedSnap.data().count;
            }

            const totalSlots = availableCount + bookedCount;
            const util = totalSlots > 0 ? Math.round((bookedCount / totalSlots) * 100) : 0;
            const weeklyAvailHours = availableCount; // Assuming 1h per slot

            // Client Stats
            let totalC = 0, activeC = 0, returnedC = 0, unsubC = 0;
            try {
                const totalCQuery = query(collection(db, "users"), where("role", "==", "PATIENT"));
                const totalCSnap = await getCountFromServer(totalCQuery);
                totalC = totalCSnap.data().count;

                const activeCQuery = query(collection(db, "users"), where("role", "==", "PATIENT"), where("patientDetails.quotas.subscriptionStatus", "==", "ACTIVE"));
                const activeCSnap = await getCountFromServer(activeCQuery);
                activeC = activeCSnap.data().count;

                const returnedCQuery = query(collection(db, "users"), where("role", "==", "PATIENT"), where("patientDetails.quotas.subscriptionStatus", "==", "RETURNED"));
                const returnedCSnap = await getCountFromServer(returnedCQuery);
                returnedC = returnedCSnap.data().count;

                const unsubCQuery = query(collection(db, "users"), where("role", "==", "PATIENT"), where("patientDetails.quotas.subscriptionStatus", "==", "UNSUBSCRIBED"));
                const unsubCSnap = await getCountFromServer(unsubCQuery);
                unsubC = unsubCSnap.data().count;
            } catch (err) {
                console.warn("Could not fetch detailed client stats (likely missing dynamic index):", err);
                const totalCQuery = query(collection(db, "users"), where("role", "==", "PATIENT"));
                const totalCSnap = await getCountFromServer(totalCQuery);
                totalC = totalCSnap.data().count;
            }

            setTherapistStats({
                total: tSnap.data().count,
                weeklyAvailability: `${weeklyAvailHours}${t('admin.stats.units.hours_short', 'h')}`,
                avgUtilization: `${util}%`,
                totalSlotsOpen: `${availableCount}`
            });

            setClientStats({
                total: totalC,
                active: activeC,
                returned: returnedC,
                unsubscribed: unsubC
            });

        } catch (error) {
            console.error("Error loading stats:", error);
        }
    };

    const loadTherapists = async (reset = false) => {
        if (loading) return;
        setLoading(true);
        try {
            let q = query(
                collection(db, "users"),
                where("role", "==", "THERAPIST"),
                where("therapistDetails.profileStatus", "==", "APPROVED"),
                orderBy("createdAt", "desc"),
                limit(10)
            );

            if (!reset && lastTherapistDoc) {
                q = query(
                    collection(db, "users"),
                    where("role", "==", "THERAPIST"),
                    where("therapistDetails.profileStatus", "==", "APPROVED"),
                    orderBy("createdAt", "desc"),
                    startAfter(lastTherapistDoc),
                    limit(10)
                );
            }

            const snapshot = await getDocs(q);

            // Enrich therapists with stats
            const newTherapists = await Promise.all(snapshot.docs.map(async (doc) => {
                const data = doc.data();
                const uid = doc.id;

                let clientCount = 0;
                let availableHours = 0;

                try {
                    // Fetch Client Count
                    const clientsQuery = query(collection(db, "users"), where("role", "==", "PATIENT"), where("patientDetails.assignedTherapist", "==", uid));
                    const clientsSnap = await getCountFromServer(clientsQuery);
                    clientCount = clientsSnap.data().count;

                    // Fetch Available Slots Count
                    const slotsQuery = query(collection(db, "appointments"), where("therapistId", "==", uid), where("status", "==", "AVAILABLE"));
                    const slotsSnap = await getCountFromServer(slotsQuery);
                    availableHours = slotsSnap.data().count;
                } catch (err) {
                    console.error("Error fetching details for therapist", uid, err);
                }

                return {
                    uid,
                    ...data,
                    clientCount,
                    availableHours
                } as Therapist;
            }));

            if (snapshot.docs.length > 0) {
                setLastTherapistDoc(snapshot.docs[snapshot.docs.length - 1]);
            }

            if (reset) {
                setTherapists(newTherapists);
            } else {
                setTherapists(prev => [...prev, ...newTherapists]);
            }
        } catch (e) {
            console.error("Error loading therapists:", e);
        } finally {
            setLoading(false);
        }
    };

    const loadClients = async (reset = false) => {
        if (loading) return;
        setLoading(true);
        try {
            let q = query(
                collection(db, "users"),
                where("role", "==", "PATIENT"),
                orderBy("createdAt", "desc"),
                limit(10)
            );

            if (!reset && lastClientDoc) {
                q = query(
                    collection(db, "users"),
                    where("role", "==", "PATIENT"),
                    orderBy("createdAt", "desc"),
                    startAfter(lastClientDoc),
                    limit(10)
                );
            }

            const snapshot = await getDocs(q);
            const newClients = snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as Client));

            if (snapshot.docs.length > 0) {
                setLastClientDoc(snapshot.docs[snapshot.docs.length - 1]);
            }

            if (reset) {
                setClients(newClients);
            } else {
                setClients(prev => [...prev, ...newClients]);
            }
        } catch (e) {
            console.error("Error loading clients:", e);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50">
            {/* Tabs */}
            <div className="bg-gray-50 p-4">
                <div className="flex gap-3 max-w-xl mx-auto">
                    <button
                        onClick={() => setActiveTab('therapist')}
                        className={`flex-1 px-6 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'therapist'
                            ? 'bg-white text-[#508C96] shadow-md'
                            : 'bg-transparent text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        {t('admin.stats.tabs.therapist')}
                    </button>
                    <button
                        onClick={() => setActiveTab('client')}
                        className={`flex-1 px-6 py-3 rounded-xl text-sm font-medium transition-all ${activeTab === 'client'
                            ? 'bg-white text-[#508C96] shadow-md'
                            : 'bg-transparent text-gray-500 hover:text-gray-700'
                            }`}
                    >
                        {t('admin.stats.tabs.client')}
                    </button>
                </div>
            </div>

            <div className="p-4 md:p-6">
                {/* Header */}
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-3xl text-[#92C7CF] font-kalnia mb-2">
                            {activeTab === 'therapist' ? t('admin.stats.overview.therapist') : t('admin.stats.overview.client')}
                        </h1>
                        <p className="text-sm text-gray-500 font-shippori">
                            {t('admin.stats.subtitle', 'Overview of platform statistics and usage trends')}
                        </p>
                    </div>

                    {/* Dropdown */}
                    <div className="relative">
                        <button
                            onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                            className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg bg-white hover:bg-gray-50"
                        >
                            <span className="text-sm text-gray-700">{getPeriodLabel(selectedPeriod)}</span>
                            <ChevronDown className="w-4 h-4 text-gray-500" />
                        </button>

                        {isDropdownOpen && (
                            <div className="absolute right-0 mt-2 w-48 bg-white border border-gray-200 rounded-lg shadow-lg z-10">
                                {periods.map((period) => (
                                    <button
                                        key={period}
                                        onClick={() => {
                                            setSelectedPeriod(period);
                                            setIsDropdownOpen(false);
                                        }}
                                        className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 first:rounded-t-lg last:rounded-b-lg"
                                    >
                                        {getPeriodLabel(period)}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                {activeTab === 'therapist' ? (
                    <>
                        {/* Stats Cards */}
                        <div className="grid grid-cols-4 gap-4 mb-6">
                            <div className="bg-white rounded-2xl shadow-sm p-6 text-center">
                                <div className="text-3xl font-bold text-gray-800 mb-1">{therapistStats.total}</div>
                                <div className="text-xs text-gray-600">{t('admin.stats.cards.total_therapists')}</div>
                            </div>
                            <div className="bg-white rounded-2xl shadow-sm p-6 text-center">
                                <div className="text-3xl font-bold text-gray-800 mb-1">{therapistStats.weeklyAvailability}</div>
                                <div className="text-xs text-gray-600">{t('admin.stats.cards.weekly_avail')}</div>
                            </div>
                            <div className="bg-white rounded-2xl shadow-sm p-6 text-center">
                                <div className="text-3xl font-bold text-gray-800 mb-1">{therapistStats.avgUtilization}</div>
                                <div className="text-xs text-gray-600">{t('admin.stats.cards.avg_utilization')}</div>
                            </div>
                            <div className="bg-white rounded-2xl shadow-sm p-6 text-center">
                                <div className="text-3xl font-bold text-gray-800 mb-1">{therapistStats.totalSlotsOpen}</div>
                                <div className="text-xs text-gray-600">{t('admin.stats.cards.slots_open')}</div>
                            </div>
                        </div>

                        {/* Utilization Trend Chart */}
                        <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
                            <h3 className="text-base font-medium text-gray-700 mb-6">{t('admin.stats.charts.utilization_trend')}</h3>

                            <div className="relative h-48">
                                {/* Y-axis labels */}
                                <div className="absolute left-0 top-0 bottom-6 flex flex-col justify-between text-xs text-gray-500">
                                    <span>100%</span>
                                    <span>75%</span>
                                    <span>50%</span>
                                    <span>25%</span>
                                    <span>0%</span>
                                </div>

                                {/* Chart area */}
                                <div className="ml-12 h-full relative">
                                    <svg className="w-full h-full" viewBox="0 0 400 160" preserveAspectRatio="none">
                                        {/* Grid lines */}
                                        <line x1="0" y1="0" x2="400" y2="0" stroke="#e5e7eb" strokeWidth="1" />
                                        <line x1="0" y1="40" x2="400" y2="40" stroke="#e5e7eb" strokeWidth="1" />
                                        <line x1="0" y1="80" x2="400" y2="80" stroke="#e5e7eb" strokeWidth="1" strokeDasharray="4 4" />
                                        <line x1="0" y1="120" x2="400" y2="120" stroke="#e5e7eb" strokeWidth="1" />
                                        <line x1="0" y1="160" x2="400" y2="160" stroke="#e5e7eb" strokeWidth="1" />

                                        {therapistStats.total > 0 && (
                                            <>
                                                {/* Area fill with gentle curve */}
                                                <path
                                                    d="M 0,40 C 30,48 40,55 50,60 C 70,70 90,85 100,90 C 120,88 140,75 150,70 C 170,63 190,55 200,50 C 220,47 240,45 250,45 C 270,44 290,41 300,40 C 320,50 340,70 350,80 C 370,83 390,84 400,85 L 400,160 L 0,160 Z"
                                                    fill="#92C7CF"
                                                    opacity="0.4"
                                                />

                                                {/* Gentle curved line */}
                                                <path
                                                    d="M 0,40 C 30,48 40,55 50,60 C 70,70 90,85 100,90 C 120,88 140,75 150,70 C 170,63 190,55 200,50 C 220,47 240,45 250,45 C 270,44 290,41 300,40 C 320,50 340,70 350,80 C 370,83 390,84 400,85"
                                                    fill="none"
                                                    stroke="#508C96"
                                                    strokeWidth="2.5"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                />

                                                {/* End point */}
                                                <circle cx="400" cy="85" r="4" fill="#508C96" />
                                            </>
                                        )}
                                        {therapistStats.total === 0 && (
                                            <line x1="0" y1="160" x2="400" y2="160" stroke="#508C96" strokeWidth="2.5" strokeLinecap="round" />
                                        )}
                                    </svg>

                                    {/* X-axis labels */}
                                    <div className="flex justify-between text-xs text-gray-500 mt-2">
                                        <span>{t('admin.stats.days.sun')}</span>
                                        <span>{t('admin.stats.days.mon')}</span>
                                        <span>{t('admin.stats.days.tue')}</span>
                                        <span>{t('admin.stats.days.wed')}</span>
                                        <span>{t('admin.stats.days.thu')}</span>
                                        <span>{t('admin.stats.days.fri')}</span>
                                        <span>{t('admin.stats.days.sat')}</span>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Therapist Table */}
                        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                            {/* Table Header */}
                            <div className="grid grid-cols-4 gap-4 px-6 py-4 bg-gray-50 border-b border-gray-200">
                                <div className="text-sm font-medium text-gray-700">{t('admin.stats.table.name')}</div>
                                <div className="text-sm font-medium text-gray-700">{t('admin.stats.table.clients')}</div>
                                <div className="text-sm font-medium text-gray-700">{t('admin.stats.table.capacity')}</div>
                                <div className="text-sm font-medium text-gray-700">{t('admin.stats.table.time_left')}</div>
                            </div>

                            {/* Table Rows */}
                            {therapists.length === 0 && !loading ? (
                                <div className="px-6 py-8 text-center text-gray-500 text-sm">
                                    {t('admin.stats.table.empty_therapists')}
                                </div>
                            ) : (
                                therapists.map((therapist, index) => (
                                    <div
                                        key={therapist.uid || index}
                                        className="grid grid-cols-4 gap-4 px-6 py-4 hover:bg-gray-50 transition-colors"
                                    >
                                        <div className="text-sm text-gray-800 truncate" title={therapist.displayName || t('admin.stats.table.unknown')}>
                                            {therapist.displayName || t('admin.stats.table.unknown')}
                                        </div>
                                        <div className="text-sm text-gray-800">{therapist.clientCount || 0}</div>
                                        <div className="text-sm text-gray-800">4-45</div>
                                        <div className="text-sm text-gray-800">{therapist.availableHours || 0} {t('admin.stats.units.hours_short', 'h')}</div>
                                    </div>
                                )))}
                            {therapists.length > 0 && therapists.length < therapistStats.total && (
                                <div className="p-4 text-center">
                                    <button onClick={() => loadTherapists(false)} disabled={loading} className="text-[#508C96] font-medium">
                                        {loading ? t('admin.stats.loading') : t('admin.stats.table.load_more')}
                                    </button>
                                </div>
                            )}
                        </div>
                    </>
                ) : (
                    <>
                        {/* Client Stats Cards */}
                        <div className="grid grid-cols-4 gap-4 mb-6">
                            <div className="bg-white rounded-2xl shadow-sm p-6 text-center">
                                <div className="text-3xl font-bold text-gray-800 mb-1">{clientStats.total}</div>
                                <div className="text-xs text-gray-600">{t('admin.stats.cards.total_clients')}</div>
                            </div>
                            <div className="bg-white rounded-2xl shadow-sm p-6 text-center">
                                <div className="text-3xl font-bold text-gray-800 mb-1">{clientStats.unsubscribed}</div>
                                <div className="text-xs text-gray-600">{t('admin.stats.cards.unsubscribed')}</div>
                            </div>
                            <div className="bg-white rounded-2xl shadow-sm p-6 text-center">
                                <div className="text-3xl font-bold text-gray-800 mb-1">{clientStats.returned}</div>
                                <div className="text-xs text-gray-600">{t('admin.stats.cards.returned')}</div>
                            </div>
                            <div className="bg-white rounded-2xl shadow-sm p-6 text-center">
                                <div className="text-3xl font-bold text-gray-800 mb-1">{clientStats.active}</div>
                                <div className="text-xs text-gray-600">{t('admin.stats.cards.active')}</div>
                            </div>
                        </div>

                        {/* Active vs Unsubscribed Users Chart */}
                        <div className="bg-white rounded-2xl shadow-sm p-6 mb-6">
                            <h3 className="text-base font-medium text-gray-700 mb-6">{t('admin.stats.charts.active_vs_unsub')}</h3>

                            <div className="relative h-56">
                                {/* Y-axis labels */}
                                <div className="absolute left-0 top-0 bottom-6 flex flex-col justify-between text-xs text-gray-500">
                                    <span>40</span>
                                    <span>30</span>
                                    <span>20</span>
                                    <span>10</span>
                                    <span>0</span>
                                </div>

                                {/* Chart area */}
                                <div className="ml-12 h-full relative">
                                    <svg className="w-full h-full" viewBox="0 0 400 200" preserveAspectRatio="none">
                                        {/* Grid lines */}
                                        <line x1="0" y1="0" x2="400" y2="0" stroke="#e5e7eb" strokeWidth="1" />
                                        <line x1="0" y1="50" x2="400" y2="50" stroke="#e5e7eb" strokeWidth="1" />
                                        <line x1="0" y1="100" x2="400" y2="100" stroke="#e5e7eb" strokeWidth="1" />
                                        <line x1="0" y1="150" x2="400" y2="150" stroke="#e5e7eb" strokeWidth="1" />
                                        <line x1="0" y1="200" x2="400" y2="200" stroke="#e5e7eb" strokeWidth="1" />

                                        {clientStats.total > 0 && (
                                            <>
                                                {/* Active Users Area (teal) */}
                                                <path
                                                    d="M 0,50 C 30,60 50,80 70,100 C 100,115 120,110 150,100 C 180,85 210,70 240,50 C 270,20 300,15 330,10 C 360,15 380,25 400,30 L 400,200 L 0,200 Z"
                                                    fill="#92C7CF"
                                                    opacity="0.5"
                                                />

                                                {/* Active Users Line */}
                                                <path
                                                    d="M 0,50 C 30,60 50,80 70,100 C 100,115 120,110 150,100 C 180,85 210,70 240,50 C 270,20 300,15 330,10 C 360,15 380,25 400,30"
                                                    fill="none"
                                                    stroke="#508C96"
                                                    strokeWidth="2.5"
                                                />

                                                {/* Unsubscribed Users Line (dotted red) */}
                                                <path
                                                    d="M 0,140 C 30,130 50,115 70,110 C 100,100 120,95 150,100 C 180,110 210,120 240,110 C 270,95 300,90 330,100 C 360,105 380,110 400,115"
                                                    fill="none"
                                                    stroke="#ef4444"
                                                    strokeWidth="2"
                                                    strokeDasharray="5,5"
                                                />

                                                {/* End points */}
                                                <circle cx="400" cy="30" r="4" fill="#508C96" />
                                                <circle cx="400" cy="115" r="4" fill="#ef4444" />
                                            </>
                                        )}
                                        {clientStats.total === 0 && (
                                            <>
                                                <line x1="0" y1="200" x2="400" y2="200" stroke="#508C96" strokeWidth="2.5" strokeLinecap="round" />
                                                <line x1="0" y1="200" x2="400" y2="200" stroke="#ef4444" strokeWidth="2" strokeDasharray="5,5" strokeLinecap="round" />
                                            </>
                                        )}
                                    </svg>

                                    {/* X-axis labels */}
                                    <div className="flex justify-between text-xs text-gray-500 mt-2">
                                        <span>{t('admin.stats.months.jan')}</span>
                                        <span>{t('admin.stats.months.feb')}</span>
                                        <span>{t('admin.stats.months.mar')}</span>
                                        <span>{t('admin.stats.months.apr')}</span>
                                        <span>{t('admin.stats.months.may')}</span>
                                        <span>{t('admin.stats.months.jun')}</span>
                                        <span>{t('admin.stats.months.jul')}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Legend */}
                            <div className="flex items-center justify-center gap-6 mt-4">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full bg-[#508C96]"></div>
                                    <span className="text-xs text-gray-600">{t('admin.stats.cards.active')}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full bg-red-500"></div>
                                    <span className="text-xs text-gray-600">{t('admin.stats.cards.unsubscribed')}</span>
                                </div>
                            </div>
                        </div>

                        {/* Client Table */}
                        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                            {/* Table Header */}
                            <div className="grid grid-cols-2 gap-4 px-6 py-4 bg-gray-50 border-b border-gray-200">
                                <div className="text-sm font-medium text-gray-700">{t('admin.stats.table.name')}</div>
                                <div className="text-sm font-medium text-gray-700">{t('admin.stats.table.status')}</div>
                            </div>

                            {/* Table Rows */}
                            {clients.length === 0 && !loading ? (
                                <div className="px-6 py-8 text-center text-gray-500 text-sm">
                                    {t('admin.stats.table.empty_clients')}
                                </div>
                            ) : (
                                clients.map((client, index) => (
                                    <div
                                        key={client.uid || index}
                                        className="grid grid-cols-2 gap-4 px-6 py-4 hover:bg-gray-50 transition-colors"
                                    >
                                        <div className="text-sm text-gray-800 truncate" title={client.displayName || t('admin.stats.table.unknown')}>
                                            {client.displayName || t('admin.stats.table.unknown')}
                                        </div>
                                        <div className="text-sm text-gray-800 truncate" title={getStatusLabel(client.patientDetails?.quotas?.subscriptionStatus)}>
                                            {getStatusLabel(client.patientDetails?.quotas?.subscriptionStatus)}
                                        </div>
                                    </div>
                                )))}

                            {/* Load More Button */}
                            {clients.length > 0 && clients.length < clientStats.total && (
                                <div className="flex justify-center py-6">
                                    <button onClick={() => loadClients(false)} disabled={loading} className="px-8 py-2 border-2 border-[#508C96] text-[#508C96] rounded-lg hover:bg-[#92C7CF]/10 transition-colors text-sm font-medium">
                                        {loading ? t('admin.stats.loading') : t('admin.stats.table.load_more')}
                                    </button>
                                </div>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
