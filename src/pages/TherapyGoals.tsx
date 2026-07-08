import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, updateDoc } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { ArrowLeft, CheckCircle, Save } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface TherapyGoalsData {
    problemsLedToCounselling: string;
    imagineSolvedDescription: string;
    threeBroadGoals: string;
    lifeAfterCounselling: string;
}

const TherapyGoals = () => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const [formData, setFormData] = useState<TherapyGoalsData>({
        problemsLedToCounselling: "",
        imagineSolvedDescription: "",
        threeBroadGoals: "",
        lifeAfterCounselling: ""
    });
    const [isLoading, setIsLoading] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const fetchGoals = async () => {
            if (!auth.currentUser) return;
            try {
                const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
                if (userDoc.exists()) {
                    const data = userDoc.data();
                    if (data.patientDetails?.therapyGoals) {
                        setFormData(data.patientDetails.therapyGoals);
                    }
                }
            } catch (err) {
                console.error("Error fetching goals", err);
            }
            setIsLoading(false);
        };
        fetchGoals();
    }, []);

    const handleChange = (field: keyof TherapyGoalsData, value: string) => {
        setFormData(prev => ({ ...prev, [field]: value }));
    };

    const handleSave = async () => {
        if (!auth.currentUser) return;
        setIsSaving(true);
        try {
            await updateDoc(doc(db, "users", auth.currentUser.uid), {
                "patientDetails.therapyGoals": formData
            });
            toast({
                title: t('therapy_goals.saved_success'),
                description: t('therapy_goals.saved_desc')
            });
        } catch (err) {
            console.error("Error saving goals", err);
            toast({ title: t('common.error'), description: t('therapy_goals.error_save'), variant: "destructive" });
        }
        setIsSaving(false);
    };

    if (isLoading) return <div className="flex justify-center py-20"><div className="animate-spin h-8 w-8 border-4 border-[#92C7CF] rounded-full border-t-transparent" /></div>;

    return (
        <div className="min-h-screen bg-white md:bg-[#F9FAFB] p-6 font-sans">
            <div className="max-w-3xl mx-auto">
                {/* Header */}
                <div className="flex items-center mb-8">
                    <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="mr-2">
                        <ArrowLeft className="w-6 h-6 text-gray-600" />
                    </Button>
                    <h1 className="text-2xl font-bold text-[#92C7CF]">
                        {t('therapy_goals.title')}
                    </h1>
                </div>

                <div className="space-y-8 bg-white md:p-8 md:rounded-2xl md:shadow-sm">
                    {/* Q1 */}
                    <div className="space-y-3">
                        <label className="text-lg font-semibold text-[#92C7CF] block">
                            {t('therapy_goals.q1')}
                        </label>
                        <Textarea
                            value={formData.problemsLedToCounselling}
                            onChange={(e) => handleChange('problemsLedToCounselling', e.target.value)}
                            placeholder={t('therapy_goals.placeholder1')}
                            className="bg-[#F3F4F6] border-none focus:ring-[#92C7CF] min-h-[120px] rounded-xl resize-none"
                        />
                    </div>

                    {/* Q2 */}
                    <div className="space-y-3">
                        <label className="text-lg font-semibold text-[#92C7CF] block">
                            {t('therapy_goals.q2')}
                        </label>
                        <Textarea
                            value={formData.imagineSolvedDescription}
                            onChange={(e) => handleChange('imagineSolvedDescription', e.target.value)}
                            placeholder={t('therapy_goals.placeholder2')}
                            className="bg-[#F3F4F6] border-none focus:ring-[#92C7CF] min-h-[140px] rounded-xl resize-none"
                        />
                    </div>

                    {/* Q3 */}
                    <div className="space-y-3">
                        <label className="text-lg font-semibold text-[#92C7CF] block">
                            {t('therapy_goals.q3')}
                        </label>
                        <Textarea
                            value={formData.threeBroadGoals}
                            onChange={(e) => handleChange('threeBroadGoals', e.target.value)}
                            placeholder={t('therapy_goals.placeholder3')}
                            className="bg-[#F3F4F6] border-none focus:ring-[#92C7CF] min-h-[120px] rounded-xl resize-none"
                        />
                    </div>

                    {/* Q4 */}
                    <div className="space-y-3">
                        <label className="text-lg font-semibold text-[#92C7CF] block">
                            {t('therapy_goals.q4')}
                        </label>
                        <Textarea
                            value={formData.lifeAfterCounselling}
                            onChange={(e) => handleChange('lifeAfterCounselling', e.target.value)}
                            placeholder={t('therapy_goals.placeholder4')}
                            className="bg-[#F3F4F6] border-none focus:ring-[#92C7CF] min-h-[140px] rounded-xl resize-none"
                        />
                    </div>

                    <div className="pt-6 flex justify-center">
                        <Button
                            onClick={handleSave}
                            disabled={isSaving}
                            className="bg-[#92C7CF] hover:bg-[#7FB0B8] text-white px-10 py-6 text-lg rounded-full shadow-lg transition-all transform hover:scale-105"
                        >
                            {isSaving ? (
                                <span className="flex items-center gap-2">Saving...</span>
                            ) : (
                                <span className="flex items-center gap-2"><Save className="w-5 h-5" /> {t('common.save')}</span>
                            )}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
};
export default TherapyGoals;
