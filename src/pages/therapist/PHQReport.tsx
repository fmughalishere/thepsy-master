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
    ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    Cell
} from "recharts";

interface PHQResult {
    id: string;
    score: number;
    timestamp: Timestamp;
    answers: number[];
}

const PHQReport = () => {
    const { userId, assessmentId } = useParams<{ userId: string, assessmentId: string }>();
    const navigate = useNavigate();
    const { t, i18n } = useTranslation();

    const [loading, setLoading] = useState(true);
    const [history, setHistory] = useState<PHQResult[]>([]);
    const [currentReport, setCurrentReport] = useState<PHQResult | null>(null);

    const questions = [
        t('phq.q1', "Little interest or pleasure in doing things"),
        t('phq.q2', "Feeling down, depressed, or hopeless"),
        t('phq.q3', "Trouble falling or staying asleep, or sleeping too much"),
        t('phq.q4', "Feeling tired or having little energy"),
        t('phq.q5', "Poor appetite or overeating"),
        t('phq.q6', "Feeling bad about yourself - or that you are a failure or have let yourself or your family down"),
        t('phq.q7', "Trouble concentrating on things, such as reading the newspaper or watching television"),
        t('phq.q8', "Moving or speaking so slowly that other people could have noticed? Or the opposite - being so fidgety or restless that you have been moving around a lot more than usual"),
        t('phq.q9', "Thoughts that you would be better off dead or of hurting yourself in some way")
    ];

    const answerOptions = [
        t('phq.opt0', "Not at all"),
        t('phq.opt1', "On several days"),
        t('phq.opt2', "On more than half the days"),
        t('phq.opt3', "Almost every day"),
    ];

    useEffect(() => {
        if (userId) {
            fetchData();
        }
    }, [userId, assessmentId]);

    const fetchData = async () => {
        try {
            if (!userId) return;
            const q = query(
                collection(db, "phq"),
                where("userId", "==", userId),
                orderBy("timestamp", "asc") // Ascending for chart
            );
            const snapshot = await getDocs(q);
            const results = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
            } as PHQResult));

            setHistory(results);

            if (assessmentId) {
                const found = results.find(r => r.id === assessmentId);
                if (found) setCurrentReport(found);
            } else if (results.length > 0) {
                // If no ID, show latest
                setCurrentReport(results[results.length - 1]);
            }
        } catch (error) {
            console.error("Error fetching PHQ data", error);
        } finally {
            setLoading(false);
        }
    };

    const getSeverityInfo = (score: number) => {
        if (score <= 4) return { label: t("phq_report.sev_none", "No Depression"), color: "#4ADE80", range: "0-4" }; // Green
        if (score <= 9) return { label: t("phq_report.sev_mild", "Mild Depression"), color: "#FACC15", range: "5-9" }; // Yellow
        if (score <= 14) return { label: t("phq_report.sev_mod", "Moderate Depression"), color: "#FBBF24", range: "10-14" }; // Orange/Gold
        if (score <= 19) return { label: t("phq_report.sev_mod_sev", "Moderately Severe Depression"), color: "#F43F5E", range: "15-19" }; // Pink/Red
        return { label: t("phq_report.sev_sev", "Severe Depression"), color: "#EF4444", range: "20-27" }; // Red
    };

    const getChartData = () => {
        const locale = i18n.resolvedLanguage || i18n.language || undefined;
        return history.map(phq => ({
            date: phq.timestamp.toDate().toLocaleDateString(locale, { month: 'numeric', day: '2-digit' }), // e.g. 5/02
            score: phq.score,
            color: getSeverityInfo(phq.score).color,
            fullDate: phq.timestamp.toDate().toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" })
        }));
    };

    if (loading) return <div className="p-8 flex justify-center">{t("common.loading", "Loading...")}</div>;
    if (!currentReport) return <div className="p-8">{t("phq_report.not_found", "Report not found")}</div>;

    const severity = getSeverityInfo(currentReport.score);
    const locale = i18n.resolvedLanguage || i18n.language || undefined;
    const takenOnDate = currentReport.timestamp
        .toDate()
        .toLocaleDateString(locale, { month: "long", day: "numeric" });
    const legendItems = [
        { color: "#4ADE80", range: "0-4", label: t("phq_report.sev_none", "No Depression") },
        { color: "#FACC15", range: "5-9", label: t("phq_report.sev_mild", "Mild Depression") },
        { color: "#FBBF24", range: "10-14", label: t("phq_report.sev_mod", "Moderate Depression") },
        { color: "#F43F5E", range: "15-19", label: t("phq_report.sev_mod_sev", "Moderately Severe Depression") },
        { color: "#EF4444", range: "20-27", label: t("phq_report.sev_sev", "Severe Depression") },
    ];
    const chartData = getChartData();

    return (
        <div className="min-h-screen bg-[#FBF9F1] pb-10">
            {/* Header */}
            <div className="bg-white px-4 py-4 sticky top-0 z-10 border-b">
                <div className="max-w-md mx-auto flex items-center gap-4">
                    <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
                        <ArrowLeft className="w-6 h-6 text-gray-600" />
                    </Button>
                    <h1 className="text-xl font-bold text-gray-800">{t("phq_report.title", "PHQ-9 Report")}</h1>
                </div>
            </div>

            <div className="px-4 mt-6 max-w-md mx-auto space-y-6">

                {/* Score Card */}
                <Card className="rounded-3xl shadow-sm border-none bg-white">
                    <CardContent className="p-6">
                        <div className="mb-4">
                            <h2 className="text-lg font-bold text-gray-800">{t("phq_report.score_report_title", "PHQ-9 Score Report")}</h2>
                            <p className="text-sm text-gray-500">
                                {t("phq_report.taken_on", { date: takenOnDate, defaultValue: "Taken on: {{date}}" })}
                            </p>
                        </div>

                        <div className="mb-6">
                            <p className="text-base font-semibold text-gray-700">
                                {t("phq_report.score_summary", {
                                    score: currentReport.score,
                                    severity: severity.label,
                                    defaultValue: "Score: {{score}} - {{severity}}"
                                })}
                            </p>
                        </div>

                        {/* Legend */}
                        <div className="grid grid-cols-2 gap-y-2 gap-x-1 mb-6">
                            {legendItems.map((item) => (
                                <LegendItem key={item.range} color={item.color} label={`${item.range} ${item.label}`} />
                            ))}
                        </div>

                        <div className="h-px bg-gray-100 my-4" />

                        {/* Chart */}
                         <div className="h-[200px] w-full">
                              <ResponsiveContainer width="100%" height="100%">
                                  <BarChart data={chartData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                    <XAxis
                                        dataKey="date"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fontSize: 10, fill: '#6B7280' }}
                                        interval={0}
                                    />
                                     <YAxis
                                        axisLine={false}
                                        tickLine={false}
                                        width={30}
                                        tick={{ fontSize: 10, fill: '#6B7280' }}
                                         domain={[0, 27]}
                                     />
                                    <Tooltip
                                        cursor={{ fill: 'transparent' }}
                                        content={({ active, payload }) => {
                                            if (!active || !payload || payload.length === 0) return null;
                                            return (
                                                <div className="bg-white p-2 shadow-md rounded-lg border border-gray-100 text-xs">
                                                    <p className="font-bold mb-1">{payload[0].payload.fullDate}</p>
                                                    <p>
                                                        {t("phq_report.score_label", "Score")}: {payload[0].value}
                                                    </p>
                                                </div>
                                            );
                                        }}
                                    />
                                     <Bar dataKey="score" radius={[4, 4, 0, 0]} barSize={30}>
                                        {chartData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                     </Bar>
                                 </BarChart>
                             </ResponsiveContainer>
                         </div>
                    </CardContent>
                </Card>

                {/* Answers Section */}
                <div>
                    <h3 className="text-lg font-bold text-gray-800 mb-4 ml-1">{t("phq_report.answers_title", "PHQ-9 Answers")}</h3>

                    <Card className="rounded-3xl shadow-sm border-none bg-white">
                        <CardContent className="p-6 space-y-8">
                            {questions.map((question, index) => {
                                const selectedAnswer = currentReport.answers[index] ?? 0;
                                return (
                                    <div key={index}>
                                        <div className="flex items-start justify-between mb-4">
                                            <h4 className="text-base font-medium text-gray-700 leading-snug pr-4">
                                                {index + 1}. {question}
                                            </h4>
                                            <div className="bg-gray-100 rounded-full p-1">
                                                <ChevronRight className="w-4 h-4 text-gray-400" />
                                            </div>
                                        </div>

                                        <div className="space-y-3 pl-2">
                                            {answerOptions.map((option, optIdx) => (
                                                <div key={optIdx} className="flex items-center gap-3">
                                                    <div className={`w-5 h-5 rounded-full border flex items-center justify-center ${selectedAnswer === optIdx ? 'border-[#508C96]' : 'border-gray-300'}`}>
                                                        {selectedAnswer === optIdx && (
                                                            <div className="w-3 h-3 rounded-full bg-[#508C96]" />
                                                        )}
                                                    </div>
                                                    <span className={`text-sm ${selectedAnswer === optIdx ? 'text-[#508C96] font-medium' : 'text-gray-500'}`}>
                                                        {option}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>

                                        {/* Optional: Score Display for question */}
                                        <p className="text-xs font-medium text-gray-400 mt-2 pl-2">
                                            {t("phq_report.question_score", { score: selectedAnswer, defaultValue: "Score: {{score}}" })}
                                        </p>
                                    </div>
                                );
                            })}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
};

const LegendItem = ({ color, label }: { color: string, label: string }) => (
    <div className="flex items-center gap-2">
        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: color }} />
        <span className="text-[10px] text-gray-500 whitespace-nowrap">{label}</span>
    </div>
);

export default PHQReport;
