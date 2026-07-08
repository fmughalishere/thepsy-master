export type QuestionType =
    | "SINGLE_CHOICE"
    | "MULTI_CHOICE"
    | "YES_NO"
    | "YES_NO_SPECIFY"
    | "DROPDOWN"
    | "MULTI_CHOICE_SPECIFY";

export interface QuestionOption {
    id: string;
    text: string;
    hasSpecifyField?: boolean;
    textResourceKey?: string;
}

export interface ConditionalLogic {
    dependsOnQuestionId: string;
    dependsOnAnswerIds: string[];
    showWhen?: boolean;
}

export interface Question {
    id: string;
    text: string;
    type: QuestionType;
    options: QuestionOption[];
    isRequired?: boolean;
    conditionalLogic?: ConditionalLogic;
    textResourceKey?: string;
}

export const questionnaireData: Question[] = [
    {
        id: "relationship_status",
        text: "What is your relationship status?",
        type: "SINGLE_CHOICE",
        textResourceKey: "questions.relationship_status",
        options: [
            { id: "single", text: "Single", textResourceKey: "questions.options.single" },
            { id: "relationship", text: "In a relationship", textResourceKey: "questions.options.relationship" },
            { id: "married", text: "Married", textResourceKey: "questions.options.married" },
            { id: "divorced", text: "Divorced", textResourceKey: "questions.options.divorced" },
            { id: "widowed", text: "Widowed", textResourceKey: "questions.options.widowed" },
            { id: "complicated", text: "It's Complicated", textResourceKey: "questions.options.complicated" },
        ]
    },
    {
        id: "medications",
        text: "Do you take any medications?",
        type: "YES_NO_SPECIFY",
        textResourceKey: "questions.question_medications",
        options: [
            { id: "yes", text: "Yes", hasSpecifyField: true, textResourceKey: "questions.options.yes" },
            { id: "no", text: "No", textResourceKey: "questions.options.no" }
        ]
    },
    {
        id: "age",
        text: "How old are you?",
        type: "DROPDOWN",
        textResourceKey: "questions.question_age",
        options: Array.from({ length: 83 }, (_, i) => ({ id: String(i + 18), text: String(i + 18) }))
    },
    {
        id: "therapy_experience",
        text: "Have you ever taken therapy before?",
        type: "YES_NO",
        textResourceKey: "questions.question_therapy_experience",
        options: [
            { id: "yes", text: "Yes", textResourceKey: "questions.options.yes" },
            { id: "no", text: "No", textResourceKey: "questions.options.no" }
        ]
    },
    {
        id: "chronic_pain",
        text: "Do you experience chronic pain?",
        type: "YES_NO",
        textResourceKey: "questions.chronic_pain",
        options: [
            { id: "yes", text: "Yes", textResourceKey: "questions.options.yes" },
            { id: "no", text: "No", textResourceKey: "questions.options.no" }
        ]
    },
    {
        id: "self_harm_thoughts",
        text: "Do you have thoughts of wanting to harm yourself?",
        type: "YES_NO",
        textResourceKey: "questions.question_self_harm_thoughts",
        options: [
            { id: "yes", text: "Yes", textResourceKey: "questions.options.yes" },
            { id: "no", text: "No", textResourceKey: "questions.options.no" }
        ]
    },
    {
        id: "last_therapy_attempt",
        text: "When was the last time you attempted to harm yourself?",
        type: "SINGLE_CHOICE",
        textResourceKey: "questions.question_last_therapy_attempt",
        options: [
            { id: "24_hours", text: "Less than 24 hours", textResourceKey: "questions.options.24_hours" },
            { id: "week", text: "A week ago", textResourceKey: "questions.options.week" },
            { id: "month", text: "One month ago", textResourceKey: "questions.options.month" },
            { id: "never", text: "Never", textResourceKey: "questions.options.never" }
        ],
        conditionalLogic: {
            dependsOnQuestionId: "self_harm_thoughts",
            dependsOnAnswerIds: ["yes"]
        }
    },
    {
        id: "thinking_factors",
        text: "What prompted you to think about therapy?",
        type: "MULTI_CHOICE_SPECIFY",
        textResourceKey: "questions.thinking_factors",
        options: [
            { id: "feeling_depressed", text: "I have been feeling depressed for long", textResourceKey: "questions.options.feeling_depressed" },
            { id: "anxious_worried", text: "I feel very anxious and worried", textResourceKey: "questions.options.anxious_worried" },
            { id: "panic_attacks", text: "I feel facing panic attacks", textResourceKey: "questions.options.panic_attacks" },
            { id: "trouble_focusing", text: "I'm having trouble focusing and making decisions", textResourceKey: "questions.options.trouble_focusing" },
            { id: "conflict_relationships", text: "Conflict with partner/spouse", textResourceKey: "questions.options.conflict_relationships" },
            { id: "self_discovery", text: "Self discovery or self improvement", textResourceKey: "questions.options.self_discovery" },
            { id: "other", text: "Other", hasSpecifyField: true, textResourceKey: "questions.options.other" }
        ]
    }
];

