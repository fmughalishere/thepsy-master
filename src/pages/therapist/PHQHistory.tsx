import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { db } from "@/lib/firebase";
import {
    collection,
    query,
    where,
    getDocs,
    orderBy,
    Timestamp,
} from "firebase/firestore";
import {
    ArrowLeft,
    Calendar,
    ChevronRight,
    Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";

interface PHQResult {
    id: string;
    score: number;
    timestamp: Timestamp;
}

const PHQHistory = () => {
    const { userId } = useParams<{ userId: string }>();
    const navigate = useNavigate();
    const { t } = useTranslation();

    const [loading, setLoading] = useState(true);
    const [history, setHistory] = useState<PHQResult[]>([]);
    const [searchTerm, setSearchTerm] = useState("");

    useEffect(() => {
        if (userId) {
            fetchHistory();
        }
    }, [userId]);

    const fetchHistory = async () => {
        try {
            if (!userId) return;
            const q = query(
                collection(db, "phq"),
                where("userId", "==", userId),
                orderBy("timestamp", "desc")
            );
            const snapshot = await getDocs(q);
            const data = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as PHQResult));
            setHistory(data);
        } catch (error) {
            console.error("Error fetching history", error);
        } finally {
            setLoading(false);
        }
    };

    const getSeverity = (score: number) => {
        if (score <= 4) return { label: t('phq.sev_none', "Minimal"), color: "bg-green-100 text-green-700" };
        if (score <= 9) return { label: t('phq.sev_mild', "Mild"), color: "bg-yellow-100 text-yellow-700" };
        if (score <= 14) return { label: t('phq.sev_mod', "Moderate"), color: "bg-orange-100 text-orange-700" };
        if (score <= 19) return { label: t('phq.sev_mod_sev', "Moderately Severe"), color: "bg-pink-100 text-pink-700" };
        return { label: t('phq.sev_sev', "Severe"), color: "bg-red-100 text-red-700" };
    };

    const filteredHistory = history.filter(item =>
        item.timestamp.toDate().toLocaleDateString().includes(searchTerm) ||
        getSeverity(item.score).label.toLowerCase().includes(searchTerm.toLowerCase())
    );

    if (loading) return <div className="p-8 flex justify-center">{t("common.loading", "Loading...")}</div>;

    return (
        <div className="min-h-screen bg-[#FBF9F1] pb-10">
            {/* Header */}
            <div className="bg-white border-b px-4 py-4 sticky top-0 z-10">
                <div className="max-w-2xl mx-auto flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                            <ArrowLeft className="w-6 h-6 text-gray-600" />
                        </Button>
                        <h1 className="text-xl font-bold text-gray-800">{t("phq_history.title", "PHQ-9 History")}</h1>
                    </div>
                </div>
            </div>

            <div className="px-4 mt-6 max-w-2xl mx-auto space-y-6">
                {/* Search/Filter */}
                <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                    <Input
                        placeholder={t("phq_history.search_placeholder", "Search by date or severity...")}
                        className="pl-10 bg-white border-gray-200 rounded-xl"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>

                {/* List */}
                <div className="space-y-3">
                    {filteredHistory.length === 0 ? (
                        <div className="text-center py-10 text-gray-500">
                            {t("phq_history.no_records", "No records found.")}
                        </div>
                    ) : (
                        filteredHistory.map((item) => {
                            const severity = getSeverity(item.score);
                            return (
                                <Card
                                    key={item.id}
                                    className="border-none shadow-sm hover:shadow-md transition-shadow cursor-pointer rounded-xl bg-white"
                                    onClick={() => navigate(`/therapist/patient/${userId}/phq-report/${item.id}`)}
                                >
                                    <div className="p-4 flex items-center justify-between">
                                        <div className="flex items-center gap-4">
                                            <div className="w-12 h-12 rounded-full bg-[#EAF4F6] flex items-center justify-center text-[#508C96]">
                                                <Calendar className="w-5 h-5" />
                                            </div>
                                            <div>
                                                <p className="font-bold text-gray-800">
                                                    {item.timestamp.toDate().toLocaleDateString(undefined, {
                                                        weekday: 'short',
                                                        year: 'numeric',
                                                        month: 'short',
                                                        day: 'numeric'
                                                    })}
                                                </p>
                                                <p className="text-xs text-gray-500 mt-1">
                                                    {t("phq_history.score_label", "Score")}: {item.score}
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-3">
                                            <span className={`px-3 py-1 rounded-full text-xs font-semibold ${severity.color}`}>
                                                {severity.label}
                                            </span>
                                            <ChevronRight className="w-5 h-5 text-gray-300" />
                                        </div>
                                    </div>
                                </Card>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
};

export default PHQHistory;
