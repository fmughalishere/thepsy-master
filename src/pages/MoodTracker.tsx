import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { auth, db } from "@/lib/firebase";
import { collection, addDoc, query, where, getDocs, orderBy, limit, Timestamp } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, Smile, Frown, Angry, Meh, CloudRain, ChevronRight } from "lucide-react";
import { toast } from "@/hooks/use-toast";

// Custom PsyCMp Style Colors
const COLORS = {
    primary: "#92C7CF",
    secondary: "#508C96",
    textPrimary: "#374151",
    textSecondary: "#6B7280",
    gold: "#FFD700"
};

const moodOptions = [
    { id: "happy", label: "Happy", icon: Smile, color: "text-[#ABE7B2]", bg: "bg-[#ABE7B2]/10", shadow: "shadow-[0_0_20px_5px_rgba(171,231,178,0.3)]" },
    { id: "sad", label: "Sad", icon: Frown, color: "text-[#758A93]", bg: "bg-[#758A93]/10", shadow: "shadow-[0_0_20px_5px_rgba(117,138,147,0.3)]" },
    { id: "angry", label: "Angry", icon: Angry, color: "text-[#EA7B7B]", bg: "bg-[#EA7B7B]/10", shadow: "shadow-[0_0_20px_5px_rgba(234,123,123,0.3)]" },
    { id: "downcast", label: "Downcast", icon: CloudRain, color: "text-[#4A70A9]", bg: "bg-[#4A70A9]/10", shadow: "shadow-[0_0_20px_5px_rgba(74,112,169,0.3)]" },
    { id: "sleepy", label: "Sleepy", icon: Meh, color: "text-[#92C7CF]", bg: "bg-[#92C7CF]/10", shadow: "shadow-[0_0_20px_5px_rgba(146,199,207,0.3)]" }
];


const MoodTracker = () => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const [selectedMood, setSelectedMood] = useState(0);
    const [isSaving, setIsSaving] = useState(false);
    const [weeklyMoods, setWeeklyMoods] = useState<any[]>([]);
    const [activeTab, setActiveTab] = useState("today");

    // Localized options
    const options = moodOptions.map(m => ({
        ...m,
        label: t(`mood.${m.id}`, m.label)
    }));

    useEffect(() => {
        fetchWeeklyMoods();
    }, []);

    const fetchWeeklyMoods = async () => {
        if (!auth.currentUser) return;
        try {
            const q = query(
                collection(db, "mood_tracker"),
                where("userId", "==", auth.currentUser.uid),
                orderBy("timestamp", "desc"),
                limit(7)
            );
            const querySnapshot = await getDocs(q);
            const moods = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setWeeklyMoods(moods);
        } catch (error) {
            console.error("Error fetching moods:", error);
        }
    };

    const handleSaveMood = async () => {
        if (!auth.currentUser) return;
        setIsSaving(true);
        try {
            const mood = moodOptions[selectedMood];
            await addDoc(collection(db, "mood_tracker"), {
                userId: auth.currentUser.uid,
                moodType: mood.id,
                timestamp: Timestamp.now()
            });
            toast({ title: t('mood.saved', 'Mood updated!') });
            await fetchWeeklyMoods();
            setActiveTab("weekly"); // Switch to weekly tab
        } catch (error) {
            console.error("Error saving mood:", error);
            toast({ title: t('mood.error', "Error saving mood"), variant: "destructive" });
        } finally {
            setIsSaving(false);
        }
    };

    const CurrentIcon = options[selectedMood].icon;

    return (
        <div className="min-h-screen bg-white p-6 font-['Inter']">

            {/* Header */}
            <div className="flex items-center mb-6">
                <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")} className="-ml-3">
                    <ArrowLeft className="w-6 h-6 text-gray-400" />
                </Button>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-8 bg-gray-100 rounded-full p-1 h-12">
                    <TabsTrigger
                        value="today"
                        className="rounded-full data-[state=active]:bg-white data-[state=active]:shadow-sm text-gray-500 data-[state=active]:text-[#92C7CF]"
                    >
                        {t('mood.today', 'Today')}
                    </TabsTrigger>
                    <TabsTrigger
                        value="weekly"
                        className="rounded-full data-[state=active]:bg-white data-[state=active]:shadow-sm text-gray-500 data-[state=active]:text-[#92C7CF]"
                    >
                        {t('mood.weekly', 'Weekly')}
                    </TabsTrigger>
                </TabsList>

                {/* --- TODAY TAB --- */}
                <TabsContent value="today" className="flex flex-col items-center">

                    <h3 className="text-xl font-medium mb-2" style={{ color: COLORS.textPrimary }}>
                        {t('mood.question', "How are you feeling today?")}
                    </h3>

                    <p className="text-base font-normal mb-10" style={{ color: COLORS.textSecondary }}>
                        {new Date().toLocaleDateString(i18n.language, { weekday: 'long', month: 'long', day: 'numeric' })}
                    </p>

                    {/* Large Selected Icon with Shadow */}
                    <div className={`w-[230px] h-[230px] rounded-full flex items-center justify-center mb-10 ${moodOptions[selectedMood].shadow} transition-shadow duration-300 ${moodOptions[selectedMood].bg}`}>
                        <CurrentIcon className={`w-[170px] h-[170px] ${moodOptions[selectedMood].color} transition-all duration-300`} strokeWidth={1} />
                    </div>

                    {/* Mood Selector Row */}
                    <div className="flex flex-wrap justify-center gap-4 mb-10">
                        {options.map((option, index) => (
                            <button
                                key={option.id}
                                onClick={() => setSelectedMood(index)}
                                className={`w-[60px] h-[60px] rounded-full flex items-center justify-center transition-all duration-200 ${selectedMood === index ? `${option.bg} scale-110` : 'hover:bg-gray-50'}`}
                            >
                                <option.icon className={`w-8 h-8 ${selectedMood === index ? option.color : 'text-gray-300'}`} />
                            </button>
                        ))}
                    </div>

                    <Button
                        onClick={handleSaveMood}
                        disabled={isSaving}
                        className="rounded-full px-12 h-12 text-md font-semibold text-white shadow-md transition-all hover:scale-105 w-[145px]"
                        style={{ backgroundColor: COLORS.primary }}
                    >
                        {isSaving ? t('common.saving', "Saving...") : t('mood.update', 'Update')}
                    </Button>
                </TabsContent>

                {/* --- WEEKLY TAB --- */}
                <TabsContent value="weekly">

                    {/* Today's Mood Card */}
                    <Card
                        className="w-full h-[200px] flex flex-col items-center justify-center p-4 mb-6 border-none shadow-sm rounded-lg"
                        style={{ backgroundColor: "#FBF9F1" }}
                    >
                        <h3 className="text-base font-medium mb-4" style={{ color: COLORS.textPrimary }}>
                            {t('mood.today_mood', "Today's Mood")}
                        </h3>
                        <CurrentIcon className={`w-[120px] h-[120px] ${moodOptions[selectedMood].color}`} strokeWidth={1} />
                    </Card>

                    <h3 className="text-lg font-medium mb-4" style={{ color: COLORS.secondary }}>
                        {t('mood.last_week', 'Last Week')}
                    </h3>

                    {/* Scrollable Weekly List */}
                    <div className="flex space-x-3 overflow-x-auto pb-4 scrollbar-hide">
                        {weeklyMoods.length > 0 ? weeklyMoods.map((log: any) => {
                            const mood = moodOptions.find(m => m.id === log.moodType) || moodOptions[0];
                            const date = log.timestamp.toDate();
                            return (
                                <div key={log.id}
                                    className="flex-shrink-0 w-[60px] flex flex-col items-center p-3 rounded-[50px] border border-black"
                                    style={{ backgroundColor: "rgba(170, 215, 217, 0.4)" }} // #AAD7D9 with 0.4 opacity
                                >
                                    <mood.icon className={`w-8 h-8 mb-2 ${mood.color}`} />
                                    <span className="text-xs font-medium" style={{ color: COLORS.textPrimary }}>
                                        {date.getDate()}
                                    </span>
                                    <span className="text-[10px]" style={{ color: COLORS.textSecondary }}>
                                        {date.toLocaleDateString(i18n.language, { weekday: 'short' })}
                                    </span>
                                </div>
                            );
                        }) : (
                            <p className="text-gray-400 text-sm italic w-full text-center py-4">
                                {t('mood.no_entries', 'No entries yet.')}
                            </p>
                        )}
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
};

export default MoodTracker;
