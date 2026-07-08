import { useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate, useLocation } from "react-router-dom";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, setDoc, Timestamp, collection, query, where, orderBy, limit, getDocs, updateDoc } from "firebase/firestore";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { ArrowLeft, CheckCircle2, ChevronRight, ChevronLeft } from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface PHQProps {
    userId?: string;
    readOnly?: boolean;
}

const PHQTest = ({ userId, readOnly = false }: PHQProps) => {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const location = useLocation();

    const state = location.state as { userId?: string, readOnly?: boolean } | null;
    const targetUserId = userId || state?.userId;
    const isReadOnly = readOnly || state?.readOnly || false;

    const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
    const [answers, setAnswers] = useState<Record<number, number>>({});
    const [isSaving, setIsSaving] = useState(false);
    const [score, setScore] = useState<number | null>(null);

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

    const options = [
        { value: 0, label: t('phq.opt0', "Not at all") },
        { value: 1, label: t('phq.opt1', "Several days") },
        { value: 2, label: t('phq.opt2', "More than half the days") },
        { value: 3, label: t('phq.opt3', "Nearly every day") },
    ];

    useEffect(() => {
        const loadPrevious = async () => {
            const targetUid = targetUserId || auth.currentUser?.uid;
            if (!targetUid) return;

            try {
                const q = query(
                    collection(db, "phq"),
                    where("userId", "==", targetUid),
                    orderBy("timestamp", "desc"),
                    limit(1)
                );
                const snapshot = await getDocs(q);

                if (!snapshot.empty) {
                    const data = snapshot.docs[0].data();
                    if (data.answers) {
                        // Convert array back to record object if needed, or if it was stored as array
                        // Assuming stored as array [0,1,2...]
                        if (Array.isArray(data.answers)) {
                            const ansRecord: Record<number, number> = {};
                            data.answers.forEach((val: number, idx: number) => {
                                ansRecord[idx] = val;
                            });
                            setAnswers(ansRecord);
                        } else {
                            setAnswers(data.answers);
                        }
                    }
                    if (data.score !== undefined) setScore(data.score);
                }
            } catch (error) {
                console.error("Error loading PHQ:", error);
            }
        };
        loadPrevious();
    }, [targetUserId]);

    const handleAnswer = (val: string) => {
        if (isReadOnly) return;
        setAnswers(prev => ({
            ...prev,
            [currentQuestionIndex]: parseInt(val)
        }));
    };

    const nextQuestion = () => {
        if (currentQuestionIndex < questions.length - 1) {
            setCurrentQuestionIndex(prev => prev + 1);
        }
    };

    const prevQuestion = () => {
        if (currentQuestionIndex > 0) {
            setCurrentQuestionIndex(prev => prev - 1);
        }
    };

    const calculateScore = () => {
        let total = 0;
        Object.values(answers).forEach(v => total += v);
        return total;
    };

    const getSeverity = (score: number) => {
        if (score <= 4) return t('phq.sev_none', "Minimal");
        if (score <= 9) return t('phq.sev_mild', "Mild");
        if (score <= 14) return t('phq.sev_mod', "Moderate");
        if (score <= 19) return t('phq.sev_mod_sev', "Moderately severe");
        return t('phq.sev_sev', "Severe");
    };

    const handleSubmit = async () => {
        if (!auth.currentUser || isReadOnly) return;

        // Validation
        if (Object.keys(answers).length < questions.length) {
            toast({ title: t('phq.incomplete', "Please answer all questions"), variant: "destructive" });
            return;
        }

        setIsSaving(true);
        const totalScore = calculateScore();
        setScore(totalScore);

        try {
            // Save as array to match Kotlin model likely expecting simple list
            const answersArray = questions.map((_, idx) => answers[idx] ?? 0);

            const phqRef = doc(collection(db, "phq"));
            await setDoc(phqRef, {
                id: phqRef.id,
                userId: auth.currentUser.uid,
                answers: answersArray,
                score: totalScore,
                timestamp: Timestamp.now()
            });

            // Update User Profile
            await updateDoc(doc(db, "users", auth.currentUser.uid), {
                "patientDetails.lastPhqTaken": Timestamp.now()
            });

            toast({ title: t('phq.saved', "Assessment saved!") });
            if (!isReadOnly) {
                // Show score briefly then redirect or just show score?
                // Let's stay on page to show score result
            }
        } catch (error) {
            console.error("Error saving PHQ:", error);
            toast({ title: t('phq.failed_to_save', "Failed to save"), variant: "destructive" });
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="min-h-screen bg-white p-6 flex flex-col items-center">
            {/* Header */}
            <div className="w-full max-w-xl flex items-center justify-between mb-8">
                <Button variant="ghost" size="icon" onClick={() => navigate(-1)} className="-ml-3">
                    <ArrowLeft className="w-6 h-6 text-gray-400" />
                </Button>
                <h1 className="text-xl font-bold text-gray-700">{t('phq.title', 'PHQ-9 Assessment')}</h1>
                <div className="w-6"></div> {/* Spacer */}
            </div>

            {score !== null ? (
                <Card className="w-full max-w-xl p-8 text-center animate-in zoom-in-95">
                    <CheckCircle2 className="w-16 h-16 text-[#92C7CF] mx-auto mb-4" />
                    <h2 className="text-2xl font-bold text-[#92C7CF] mb-2">{t('phq.result', 'Result')}</h2>
                    <div className="text-5xl font-bold text-[#508C96] mb-4">{score} / 27</div>
                    <p className="text-xl font-medium text-gray-600 mb-6">{getSeverity(score)}</p>

                    {!isReadOnly && (
                        <Button onClick={() => navigate("/dashboard")} className="bg-[#92C7CF] text-white rounded-full px-8">
                            {t('phq.return_dashboard', 'Return to Dashboard')}
                        </Button>
                    )}
                </Card>
            ) : (
                <div className="w-full max-w-xl">
                    {/* Progress Bar */}
                    <div className="w-full bg-gray-100 h-2 rounded-full mb-8 overflow-hidden">
                        <div
                            className="bg-[#92C7CF] h-full transition-all duration-300"
                            style={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }}
                        ></div>
                    </div>

                    <Card className="p-8 min-h-[400px] flex flex-col justify-between shadow-lg border-gray-100">
                        <div>
                            <span className="text-sm font-bold text-[#92C7CF] tracking-widest uppercase mb-4 block">
                                {t("phq.progress", {
                                    current: currentQuestionIndex + 1,
                                    total: questions.length,
                                    defaultValue: "Question {{current}} of {{total}}"
                                })}
                            </span>
                            <h3 className="text-xl font-medium text-gray-800 leading-relaxed mb-8">
                                {questions[currentQuestionIndex]}
                            </h3>

                            <RadioGroup
                                value={answers[currentQuestionIndex]?.toString() ?? ""}
                                onValueChange={handleAnswer}
                                className="space-y-3"
                                disabled={isReadOnly}
                            >
                                {options.map((opt) => (
                                    <div
                                        key={opt.value}
                                        role="button"
                                        tabIndex={isReadOnly ? -1 : 0}
                                        onClick={() => handleAnswer(opt.value.toString())}
                                        onKeyDown={(e) => {
                                            if (isReadOnly) return;
                                            if (e.key === "Enter" || e.key === " ") {
                                                e.preventDefault();
                                                handleAnswer(opt.value.toString());
                                            }
                                        }}
                                        className={`flex items-center space-x-3 border rounded-xl p-4 transition-all select-none ${isReadOnly ? "opacity-70 cursor-default" : "cursor-pointer"} ${answers[currentQuestionIndex] === opt.value ? 'border-[#92C7CF] bg-[#F0F9FA]' : 'border-gray-200 hover:border-[#AAD7D9]'}`}
                                    >
                                        <RadioGroupItem value={opt.value.toString()} id={`opt-${opt.value}`} className="text-[#92C7CF]" disabled={isReadOnly} />
                                        <Label htmlFor={`opt-${opt.value}`} className={`flex-1 font-medium text-gray-600 ${isReadOnly ? "cursor-default" : "cursor-pointer"}`}>
                                            {opt.label}
                                        </Label>
                                    </div>
                                ))}
                            </RadioGroup>
                        </div>

                        <div className="flex justify-between mt-8">
                            <Button
                                variant="ghost"
                                onClick={prevQuestion}
                                disabled={currentQuestionIndex === 0}
                                className="text-gray-400 hover:text-gray-600"
                            >
                                <ChevronLeft className="w-5 h-5 mr-1" /> {t('phq.previous', 'Previous')}
                            </Button>

                            {currentQuestionIndex === questions.length - 1 ? (
                                <Button
                                    onClick={handleSubmit}
                                    disabled={!answers[currentQuestionIndex] && answers[currentQuestionIndex] !== 0 || isSaving || isReadOnly}
                                    className="bg-[#92C7CF] hover:bg-[#7FB0B8] text-white rounded-full px-6"
                                >
                                    {isSaving ? t('phq.submitting', "Submitting...") : t('phq.submit', "Submit")}
                                </Button>
                            ) : (
                                <Button
                                    onClick={nextQuestion}
                                    disabled={answers[currentQuestionIndex] === undefined}
                                    className="bg-[#92C7CF] hover:bg-[#7FB0B8] text-white rounded-full px-6"
                                >
                                    {t('phq.next', 'Next')} <ChevronRight className="w-5 h-5 ml-1" />
                                </Button>
                            )}
                        </div>
                    </Card>
                </div>
            )}
        </div>
    );
};

export default PHQTest;
