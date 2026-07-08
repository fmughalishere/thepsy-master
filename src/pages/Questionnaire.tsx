import { useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { doc, updateDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "@/hooks/use-toast";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { questionnaireData, Question, QuestionType } from "@/data/questionnaire";

interface Answer {
    selectedOptionIds: string[];
    specifyText?: string;
    dropdownValue?: string;
}

const Questionnaire = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();
    const [answers, setAnswers] = useState<Record<string, Answer>>({});
    const [currentIndex, setCurrentIndex] = useState(0);
    const [isSaving, setIsSaving] = useState(false);

    // Calculate visible questions based on conditional logic
    const visibleQuestions = useMemo(() => {
        return questionnaireData.filter(q => {
            if (!q.conditionalLogic) return true;
            const { dependsOnQuestionId, dependsOnAnswerIds, showWhen } = q.conditionalLogic;
            const dependentAnswer = answers[dependsOnQuestionId];

            // If answer is missing, assume condition not met
            if (!dependentAnswer || !dependentAnswer.selectedOptionIds.length) return false;

            const hasRequiredAnswer = dependentAnswer.selectedOptionIds.some(id => dependsOnAnswerIds.includes(id));
            return showWhen !== false ? hasRequiredAnswer : !hasRequiredAnswer;
        });
    }, [answers]);

    const currentQuestion = visibleQuestions[currentIndex];
    const progress = ((currentIndex + 1) / visibleQuestions.length) * 100;

    const handleAnswerChange = (questionId: string, type: QuestionType, value: any, specifyText?: string) => {
        setAnswers(prev => {
            const currentAnswer = prev[questionId] || { selectedOptionIds: [] };
            let newAnswer: Answer = { ...currentAnswer };

            if (type === "SINGLE_CHOICE" || type === "YES_NO" || type === "YES_NO_SPECIFY") {
                newAnswer.selectedOptionIds = [value];
                if (specifyText !== undefined) newAnswer.specifyText = specifyText;
            } else if (type === "MULTI_CHOICE" || type === "MULTI_CHOICE_SPECIFY") {
                const ids = newAnswer.selectedOptionIds || [];
                if (ids.includes(value)) {
                    newAnswer.selectedOptionIds = ids.filter(id => id !== value);
                } else {
                    newAnswer.selectedOptionIds = [...ids, value];
                }
                if (specifyText !== undefined) newAnswer.specifyText = specifyText;
            } else if (type === "DROPDOWN") {
                newAnswer.dropdownValue = value;
                newAnswer.selectedOptionIds = [value]; // Store as ID too for consistency
            }

            return { ...prev, [questionId]: newAnswer };
        });
    };

    const handleSpecifyChange = (questionId: string, text: string) => {
        setAnswers(prev => ({
            ...prev,
            [questionId]: { ...prev[questionId], specifyText: text }
        }));
    };

    const canProceed = () => {
        if (!currentQuestion) return false;
        const answer = answers[currentQuestion.id];
        if (!answer) return false;

        const hasSelection = answer.selectedOptionIds.length > 0 || !!answer.dropdownValue;

        // Check specify requirements
        const selectedOptions = currentQuestion.options.filter(opt => answer.selectedOptionIds.includes(opt.id));
        const needsSpecify = selectedOptions.some(opt => opt.hasSpecifyField);

        if (needsSpecify && (!answer.specifyText || answer.specifyText.trim() === "")) {
            return false;
        }

        return hasSelection;
    };

    const handleNext = () => {
        if (currentIndex < visibleQuestions.length - 1) {
            setCurrentIndex(prev => prev + 1);
        } else {
            handleSubmit();
        }
    };

    const handleBack = () => {
        if (currentIndex > 0) {
            setCurrentIndex(prev => prev - 1);
        } else {
            navigate("/get-to-know"); // Back to start
        }
    };

    const handleSubmit = async () => {
        if (!auth.currentUser) return;
        setIsSaving(true);
        try {
            // Transform answers to PsyCMp structure: List of { optionId, customValue }
            // Wrapper object: { answers: [...] }
            const transformedList = Object.entries(answers).flatMap(([questionId, answer]) => {
                // Handle Dropdown
                if (answer.dropdownValue) {
                    // For age or similar dropdowns, the value is the optionId (e.g. "19", "20")
                    return [{ optionId: answer.dropdownValue, customValue: null }];
                }

                // Handle Selection (Single/Multi)
                return answer.selectedOptionIds.map(optId => ({
                    optionId: optId,
                    // We attach specifyText if it exists. 
                    // Ideally we'd only attach it to the option that allows specify, 
                    // but simple attachment here covers the "Other" case which is the main use case.
                    customValue: answer.specifyText || null
                }));
            });

            // Extract specific fields for easier access
            const age = answers['age']?.dropdownValue;
            const maritalStatus = answers['relationship_status']?.selectedOptionIds[0];
            const chronicPain = answers['chronic_pain']?.selectedOptionIds.includes('yes');

            const medsAnswer = answers['medications'];
            const medications = medsAnswer?.selectedOptionIds.includes('yes')
                ? (medsAnswer.specifyText || 'Yes')
                : 'None';

            await updateDoc(doc(db, "users", auth.currentUser.uid), {
                "patientDetails.questionnaireAnswers": { answers: transformedList },
                "patientDetails.therapyType": "individual",
                "patientDetails.age": age,
                "patientDetails.maritalStatus": maritalStatus,
                "patientDetails.chronicPain": chronicPain,
                "patientDetails.medications": medications,
                onboardingCompleted: true
            });

            // Proceed to Payment
            navigate("/payment");
        } catch (error) {
            console.error(error);
            toast({ title: t('common.error'), description: t('questionnaire.messages.error_saving'), variant: "destructive" });
        } finally {
            setIsSaving(false);
        }
    };

    if (!currentQuestion) return null;

    return (
        <div className="min-h-screen bg-white flex flex-col p-6 max-w-2xl mx-auto">

            {/* Header */}
            <div className="flex items-center mb-6">
                <Button variant="ghost" size="icon" onClick={handleBack} className="-ml-3">
                    <ArrowLeft className="w-6 h-6 text-[#508C96]" />
                </Button>
            </div>

            <h2 className="text-2xl text-[#508C96] text-center font-kalnia mb-8">
                {t('questionnaire.title')}
            </h2>

            {/* Progress Bar */}
            <div className="w-full bg-[#E5E7EB] h-[3px] rounded-full mb-2">
                <div
                    className="bg-[#92C7CF] h-[3px] rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                />
            </div>
            <p className="text-xs text-gray-400 mb-8 font-medium">
                {t('questionnaire.step', { current: currentIndex + 1, total: visibleQuestions.length })}
            </p>

            {/* Question Content */}
            <div className="flex-1 overflow-y-auto pb-24">
                <h3 className="text-xl text-[#6B7280] font-medium mb-6 font-sans">
                    {t(currentQuestion.textResourceKey || currentQuestion.id, currentQuestion.text)}
                </h3>

                <div className="space-y-4">
                    {/* Render Options based on Type */}
                    {(currentQuestion.type === "SINGLE_CHOICE" || currentQuestion.type === "YES_NO" || currentQuestion.type === "YES_NO_SPECIFY") && (
                        <RadioGroup
                            key={currentQuestion.id}
                            value={answers[currentQuestion.id]?.selectedOptionIds[0] ?? ""}
                            onValueChange={(val) => handleAnswerChange(currentQuestion.id, currentQuestion.type, val)}
                        >
                            {currentQuestion.options.map(option => (
                                <div key={option.id} className="space-y-2">
                                    <div 
                                        className={`flex items-center space-x-3 p-4 rounded-xl border transition-all cursor-pointer ${answers[currentQuestion.id]?.selectedOptionIds.includes(option.id)
                                            ? 'border-[#92C7CF] bg-[#F0F9FA]'
                                            : 'border-gray-200 hover:border-[#92C7CF]/50'
                                        }`}
                                        onClick={() => handleAnswerChange(currentQuestion.id, currentQuestion.type, option.id)}
                                    >
                                        <RadioGroupItem 
                                            value={option.id} 
                                            id={option.id} 
                                            className="text-[#92C7CF] border-gray-400" 
                                            onClick={(e) => e.stopPropagation()} // Let the div handle it
                                        />
                                        <Label 
                                            htmlFor={option.id} 
                                            className="flex-1 cursor-pointer text-gray-600 font-medium font-sans"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            {t(option.textResourceKey || option.id, option.text)}
                                        </Label>
                                    </div>

                                    {/* Specify Input if needed */}
                                    {option.hasSpecifyField && answers[currentQuestion.id]?.selectedOptionIds.includes(option.id) && (
                                        <Input
                                            placeholder={t('questionnaire.please_specify')}
                                            value={answers[currentQuestion.id]?.specifyText || ""}
                                            onChange={(e) => handleSpecifyChange(currentQuestion.id, e.target.value)}
                                            className="ml-4 w-[calc(100%-1rem)] mt-2 border-gray-200 focus:border-[#92C7CF]"
                                        />
                                    )}
                                </div>
                            ))}
                        </RadioGroup>
                    )}

                    {(currentQuestion.type === "MULTI_CHOICE" || currentQuestion.type === "MULTI_CHOICE_SPECIFY") && (
                        <div key={currentQuestion.id} className="space-y-3">
                            {currentQuestion.options.map(option => (
                                <div key={option.id} className="space-y-2">
                                    <div className={`flex items-center space-x-3 p-4 rounded-xl border transition-all cursor-pointer ${answers[currentQuestion.id]?.selectedOptionIds.includes(option.id)
                                        ? 'border-[#92C7CF] bg-[#F0F9FA]'
                                        : 'border-gray-200 hover:border-[#92C7CF]/50'
                                        }`}
                                        onClick={() => handleAnswerChange(currentQuestion.id, currentQuestion.type, option.id)}
                                    >
                                        <Checkbox
                                            checked={answers[currentQuestion.id]?.selectedOptionIds.includes(option.id)}
                                            onCheckedChange={() => handleAnswerChange(currentQuestion.id, currentQuestion.type, option.id)}
                                            className="data-[state=checked]:bg-[#92C7CF] border-gray-400"
                                            onClick={(e) => e.stopPropagation()}
                                        />
                                        <Label 
                                            className="flex-1 cursor-pointer text-gray-600 font-medium font-sans"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            {t(option.textResourceKey || option.id, option.text)}
                                        </Label>
                                    </div>

                                    {/* Specify Input if needed */}
                                    {option.hasSpecifyField && answers[currentQuestion.id]?.selectedOptionIds.includes(option.id) && (
                                        <Input
                                            placeholder={t('questionnaire.please_specify')}
                                            value={answers[currentQuestion.id]?.specifyText || ""}
                                            onChange={(e) => handleSpecifyChange(currentQuestion.id, e.target.value)}
                                            onClick={(e) => e.stopPropagation()}
                                            className="ml-4 w-[calc(100%-1rem)] mt-2 border-gray-200 focus:border-[#92C7CF]"
                                        />
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    {currentQuestion.type === "DROPDOWN" && (
                        <Select
                            value={answers[currentQuestion.id]?.dropdownValue}
                            onValueChange={(val) => handleAnswerChange(currentQuestion.id, currentQuestion.type, val)}
                        >
                            <SelectTrigger className="w-full text-gray-600 border-gray-200 focus:ring-[#92C7CF]">
                                <SelectValue placeholder={t('questionnaire.select_option')} />
                            </SelectTrigger>
                            <SelectContent>
                                {currentQuestion.options.map(option => (
                                    <SelectItem key={option.id} value={option.id}>
                                        {t(option.textResourceKey || option.id, option.text)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                </div>
            </div>

            {/* Bottom Actions */}
            <div className="fixed bottom-0 left-0 right-0 p-6 bg-white border-t border-gray-100 flex justify-center">
                <Button
                    onClick={handleNext}
                    disabled={!canProceed() || isSaving}
                    className={`w-full max-w-sm min-h-[48px] h-auto rounded-full font-semibold shadow-lg transition-all whitespace-normal px-2 py-2 ${canProceed()
                        ? 'bg-[#92C7CF] hover:bg-[#7FB0B8] text-white hover:scale-[1.02]'
                        : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        }`}
                >
                    {isSaving ? t('questionnaire.saving') : (currentIndex === visibleQuestions.length - 1 ? t('questionnaire.finish') : t('questionnaire.next'))}
                </Button>
            </div>
        </div>
    );
};

export default Questionnaire;
