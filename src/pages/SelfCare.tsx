import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useLocation } from "react-router-dom";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, setDoc, Timestamp, updateDoc } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Star, Info, HelpCircle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";

interface Response {
    rating: number; // 1, 2, or 3
    wantsToImprove: boolean;
}


interface SelfCareProps {
    userId?: string;
    readOnly?: boolean;
}

const SelfCare = ({ userId, readOnly = false }: SelfCareProps) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();

    const state = location.state as { userId?: string, readOnly?: boolean } | null;
    const targetUserId = userId || state?.userId;
    const isReadOnly = readOnly || state?.readOnly || false;

    const [activeTab, setActiveTab] = useState("physical");
    const [responses, setResponses] = useState<Record<string, Response>>({});
    const [isSaving, setIsSaving] = useState(false);

    const questions = {
        physical: Array.from({ length: 10 }, (_, i) => ({
            id: `phys_${i + 1}`,
            text: t(`self_care.physical.q${i + 1}`)
        })),
        emotional: Array.from({ length: 11 }, (_, i) => ({
            id: `emo_${i + 1}`,
            text: t(`self_care.emotional.q${i + 1}`)
        })),
        social: Array.from({ length: 10 }, (_, i) => ({
            id: `soc_${i + 1}`,
            text: t(`self_care.social.q${i + 1}`)
        }))
    };

    useEffect(() => {
        const loadPrevious = async () => {
            const targetUid = targetUserId || auth.currentUser?.uid;
            if (!targetUid) return;

            try {
                const docRef = doc(db, "users", targetUid);
                const snapshot = await getDoc(docRef);
                if (snapshot.exists()) {
                    const data = snapshot.data();
                    const assessment = data.patientDetails?.selfCareAssessment;
                    if (assessment && assessment.responses) {
                        // Transform List back to Record
                        const loadedResponses: Record<string, Response> = {};
                        assessment.responses.forEach((r: any) => {
                            let prefix = "phys";
                            if (r.category === "emotional") prefix = "emo";
                            if (r.category === "social") prefix = "soc";

                            loadedResponses[`${prefix}_${r.questionIndex}`] = {
                                rating: r.rating,
                                wantsToImprove: r.wantsToImprove
                            };
                        });
                        setResponses(loadedResponses);
                    }
                }
            } catch (error) {
                console.error("Error loading assessment:", error);
                if (isReadOnly) {
                    toast({ title: t("self_care.load_failed_patient", "Could not load patient assessment"), variant: "destructive" });
                }
            }
        };
        loadPrevious();
    }, [targetUserId]);

    const handleRatingChange = (id: string, rating: number) => {
        if (isReadOnly) return;
        setResponses(prev => ({
            ...prev,
            [id]: { ...prev[id], rating }
        }));
    };

    const toggleImprove = (id: string) => {
        if (isReadOnly) return;
        setResponses(prev => ({
            ...prev,
            [id]: { ...prev[id], wantsToImprove: !prev[id]?.wantsToImprove }
        }));
    };

    const handleSubmit = async () => {
        if (isReadOnly) return;
        if (!auth.currentUser) return;

        // Simple validation: Ensure at least some questions are answered
        // Validation: All questions must be answered
        const totalQuestions = questions.physical.length + questions.emotional.length + questions.social.length;
        const answeredCount = Object.keys(responses).length;

        if (answeredCount < totalQuestions) {
            toast({
                title: t("self_care.incomplete_title", "Incomplete Assessment"),
                description: t("self_care.incomplete_desc", {
                    answered: answeredCount,
                    total: totalQuestions,
                    defaultValue: "Please answer all questions ({{answered}}/{{total}}) before submitting."
                }),
                variant: "destructive"
            });
            return;
        }

        setIsSaving(true);
        try {
            // Transform responses to List for PsyCMp structure
            const responseList = Object.entries(responses).map(([id, val]) => {
                const [prefix, idxStr] = id.split('_');
                const idx = parseInt(idxStr);
                let category = "physical"; // default
                if (prefix === 'emo') category = "emotional";
                if (prefix === 'soc') category = "social";

                return {
                    category,
                    questionIndex: idx,
                    rating: val.rating,
                    wantsToImprove: val.wantsToImprove || false
                };
            });

            await updateDoc(doc(db, "users", auth.currentUser.uid), {
                "patientDetails.selfCareAssessment": {
                    timestamp: Timestamp.now(),
                    responses: responseList
                }
            });

            toast({ title: t('self_care.saved', "Assessment saved!") });
            navigate("/dashboard");
        } catch (error) {
            console.error("Error saving assessment:", error);
            toast({ title: t("self_care.error_save_title", "Error saving assessment"), variant: "destructive" });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="min-h-screen bg-white p-6 pb-12">
            {/* ReadOnly Header Back Button */}
            {isReadOnly && (
                <div className="flex items-center justify-between mb-6">
                    <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="-ml-3">
                        <ArrowLeft className="w-6 h-6 text-gray-400" />
                    </Button>
                    <h1 className="text-xl font-semibold text-gray-700 ml-2">
                        {t('self_care.title', 'Self-Care Assessment')}
                    </h1>
                </div>
            )}

            {/* Header */}
            {!isReadOnly && (
                <div className="flex items-center justify-between mb-6">
                    <div className="flex items-center">
                        <Button variant="ghost" size="icon" onClick={() => navigate("/dashboard")} className="-ml-3">
                            <ArrowLeft className="w-6 h-6 text-gray-400" />
                        </Button>
                        <h1 className="text-xl font-semibold text-gray-700 ml-2">
                            {t('self_care.title', 'Self-Care Assessment')}
                        </h1>
                    </div>
                </div>
            )}

            {/* Legend */}
            <div className="bg-[#F0F9FA] rounded-xl p-4 mb-6 border border-[#AAD7D9] animate-in slide-in-from-top-2">
                <h3 className="font-semibold text-[#92C7CF] mb-2">{t('self_care.how_to', 'How to rate:')}</h3>
                <ul className="text-sm text-gray-600 space-y-2">
                    <li className="flex items-center"><span className="w-6 font-bold">1</span> {t('self_care.legend_1', 'I do this poorly')}</li>
                    <li className="flex items-center"><span className="w-6 font-bold">2</span> {t('self_care.legend_2', 'I do this rarely')}</li>
                    <li className="flex items-center"><span className="w-6 font-bold">3</span> {t('self_care.legend_3', 'I do this well')}</li>
                    <li className="flex items-center"><Star className="w-4 h-4 text-yellow-500 mr-2" /> {t('self_care.legend_star', 'I want to improve this')}</li>
                </ul>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-3 mb-6 bg-gray-100 rounded-full p-1 h-12">
                    <TabsTrigger value="physical" className="rounded-full data-[state=active]:bg-white data-[state=active]:text-[#92C7CF]">{t('self_care.physical.title', 'Physical')}</TabsTrigger>
                    <TabsTrigger value="emotional" className="rounded-full data-[state=active]:bg-white data-[state=active]:text-[#92C7CF]">{t('self_care.emotional.title', 'Emotional')}</TabsTrigger>
                    <TabsTrigger value="social" className="rounded-full data-[state=active]:bg-white data-[state=active]:text-[#92C7CF]">{t('self_care.social.title', 'Social')}</TabsTrigger>
                </TabsList>

                <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                    <div className="grid grid-cols-[1fr,40px,40px,40px,40px] gap-2 p-4 bg-gray-50 border-b border-gray-100 text-sm font-medium text-gray-600 text-center">
                        <div className="text-left pl-2">{t('self_care.activity', 'Activity')}</div>
                        <div>1</div>
                        <div>2</div>
                        <div>3</div>
                        <div><Star className="w-4 h-4 mx-auto text-yellow-500" /></div>
                    </div>

                    {['physical', 'emotional', 'social'].map(tab => (
                        <TabsContent key={tab} value={tab} className="m-0">
                            {questions[tab as keyof typeof questions].map((q, idx) => (
                                <div key={q.id} className={`grid grid-cols-[1fr,40px,40px,40px,40px] gap-2 p-4 items-center ${idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}`}>
                                    <div className="text-sm text-gray-700 pr-2">{q.text}</div>

                                    {[1, 2, 3].map(rating => (
                                        <div key={rating} className="flex justify-center">
                                            <Checkbox
                                                checked={responses[q.id]?.rating === rating}
                                                onCheckedChange={() => handleRatingChange(q.id, rating)}
                                                disabled={isReadOnly}
                                                className={`border-gray-300 data-[state=checked]:bg-[#92C7CF] data-[state=checked]:border-[#92C7CF] ${isReadOnly ? 'opacity-70' : ''}`}
                                            />
                                        </div>
                                    ))}

                                    <div className="flex justify-center">
                                        <button onClick={() => toggleImprove(q.id)} disabled={isReadOnly} className={isReadOnly ? 'cursor-default' : ''}>
                                            <Star
                                                className={`w-5 h-5 transition-colors ${responses[q.id]?.wantsToImprove ? 'text-yellow-500 fill-current' : 'text-gray-300'}`}
                                            />
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </TabsContent>
                    ))}
                </div>
            </Tabs>

            {!isReadOnly && (
                <div className="mt-8 flex justify-center">
                    <Button
                        onClick={handleSubmit}
                        disabled={isSaving}
                        className="w-full max-w-sm h-12 rounded-full bg-[#92C7CF] hover:bg-[#7FB0B8] text-white font-semibold shadow-lg"
                    >
                        {isSaving ? t('self_care.saving', "Saving...") : t('self_care.submit_button', 'Submit Assessment')}
                    </Button>
                </div>
            )}
        </div>
    );
};

export default SelfCare;
