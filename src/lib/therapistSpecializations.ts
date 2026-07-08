export const THERAPIST_SPECIALIZATION_KEYS = [
  "ANXIETY",
  "DEPRESSION",
  "STRESS",
  "TRAUMA_PTSD",
  "ADHD",
  "AUTISM",
  "BIPOLAR_DISORDER",
  "ANGER_MANAGEMENT",
  "SELF_ESTEEM",
  "GRIEF_AND_LOSS",
  "RELATIONSHIP_ISSUES",
  "MARRIAGE_AND_COUPLES_COUNSELLING",
  "FAMILY_CONFLICT",
  "PARENTING_ISSUES",
  "DIVORCE",
  "INFIDELITY",
  "INTIMACY_ISSUES",
  "ATTACHMENT_ISSUES",
  "ADDICTION_SUBSTANCE_USE",
  "EATING_DISORDER",
  "SLEEP_DISORDER_INSOMNIA",
  "OCD",
  "MOOD_DISORDER",
  "PERSONALITY_DISORDER",
  "LIFE_TRANSITIONS",
  "CAREER",
  "WORK_STRESS",
  "BURNOUT",
  "CHRONIC_PSYCHOSOMATIC_ILLNESSES",
  "SEXUALITY",
  "LGBTQ",
  "GENDER_IDENTITY",
  "WORK_LIFE_BALANCE",
  "DOMESTIC_VIOLENCE",
  "SPIRITUALITY_RELIGIOUS_CONCERNS",
] as const;

export type TherapistSpecializationKey = (typeof THERAPIST_SPECIALIZATION_KEYS)[number];

export const THERAPIST_SPECIALIZATION_DEFAULT_EN_LABEL: Record<TherapistSpecializationKey, string> = {
  ANXIETY: "Anxiety",
  DEPRESSION: "Depression",
  STRESS: "Stress",
  TRAUMA_PTSD: "Trauma/PTSD",
  ADHD: "ADHD",
  AUTISM: "Autism",
  BIPOLAR_DISORDER: "Bipolar Disorder",
  ANGER_MANAGEMENT: "Anger Management",
  SELF_ESTEEM: "Self-Esteem",
  GRIEF_AND_LOSS: "Grief and Loss",
  RELATIONSHIP_ISSUES: "Relationship issues",
  MARRIAGE_AND_COUPLES_COUNSELLING: "Marriage and Couples Counselling",
  FAMILY_CONFLICT: "Family Conflict",
  PARENTING_ISSUES: "Parenting Issues",
  DIVORCE: "Divorce",
  INFIDELITY: "Infidelity",
  INTIMACY_ISSUES: "Intimacy Issues",
  ATTACHMENT_ISSUES: "Attachment Issues",
  ADDICTION_SUBSTANCE_USE: "Addiction/Substance Use",
  EATING_DISORDER: "Eating Disorder",
  SLEEP_DISORDER_INSOMNIA: "Sleep Disorder/Insomnia",
  OCD: "Obsessive-Compulsive Disorder (OCD)",
  MOOD_DISORDER: "Mood Disorder",
  PERSONALITY_DISORDER: "Personality Disorder",
  LIFE_TRANSITIONS: "Life Transitions",
  CAREER: "Career",
  WORK_STRESS: "Work Stress",
  BURNOUT: "Burnout",
  CHRONIC_PSYCHOSOMATIC_ILLNESSES: "Chronic Psychosomatic Illnesses",
  SEXUALITY: "Sexuality",
  LGBTQ: "LGBTQ+",
  GENDER_IDENTITY: "Gender Identity",
  WORK_LIFE_BALANCE: "Work-Life Balance",
  DOMESTIC_VIOLENCE: "Domestic Violence",
  SPIRITUALITY_RELIGIOUS_CONCERNS: "Spirituality/Religious Concerns",
};

const LEGACY_LABEL_TO_KEY: Record<string, TherapistSpecializationKey> = {
  "anxiety": "ANXIETY",
  "depression": "DEPRESSION",
  "stress": "STRESS",
  "trauma/ptsd": "TRAUMA_PTSD",
  "trauma": "TRAUMA_PTSD",
  "ptsd": "TRAUMA_PTSD",
  "adhd": "ADHD",
  "autism": "AUTISM",
  "bipolar disorder": "BIPOLAR_DISORDER",
  "anger management": "ANGER_MANAGEMENT",
  "self-esteem": "SELF_ESTEEM",
  "self esteem": "SELF_ESTEEM",
  "grief and loss": "GRIEF_AND_LOSS",
  "relationships issues": "RELATIONSHIP_ISSUES",
  "relationship issues": "RELATIONSHIP_ISSUES",
  "relationships": "RELATIONSHIP_ISSUES",
  "relationship": "RELATIONSHIP_ISSUES",
  "marriage and couples counselling": "MARRIAGE_AND_COUPLES_COUNSELLING",
  "family conflict": "FAMILY_CONFLICT",
  "parenting issues": "PARENTING_ISSUES",
  "divorce": "DIVORCE",
  "infidelity": "INFIDELITY",
  "intimacy issues": "INTIMACY_ISSUES",
  "attachment issues": "ATTACHMENT_ISSUES",
  "addiction/substance use": "ADDICTION_SUBSTANCE_USE",
  "addiction / substance use": "ADDICTION_SUBSTANCE_USE",
  "addiction": "ADDICTION_SUBSTANCE_USE",
  "eating disorder": "EATING_DISORDER",
  "eating disorders": "EATING_DISORDER",
  "sleep disorder/insomnia": "SLEEP_DISORDER_INSOMNIA",
  "sleep disorders": "SLEEP_DISORDER_INSOMNIA",
  "obsessive-compulsive disorder (ocd)": "OCD",
  "ocd": "OCD",
  "mood disorder": "MOOD_DISORDER",
  "mood disorders": "MOOD_DISORDER",
  "personality disorder": "PERSONALITY_DISORDER",
  "personality disorders": "PERSONALITY_DISORDER",
  "life transitions": "LIFE_TRANSITIONS",
  "career": "CAREER",
  "work stress": "WORK_STRESS",
  "burnout": "BURNOUT",
  "chronic psychosomatic illnesses": "CHRONIC_PSYCHOSOMATIC_ILLNESSES",
  "sexuality": "SEXUALITY",
  "lgbtq+": "LGBTQ",
  "lgbtq": "LGBTQ",
  "gender identity": "GENDER_IDENTITY",
  "work-life balance": "WORK_LIFE_BALANCE",
  "work life balance": "WORK_LIFE_BALANCE",
  "domestic violence": "DOMESTIC_VIOLENCE",
  "spirituality/religious concerns": "SPIRITUALITY_RELIGIOUS_CONCERNS",
  "spirituality / religious concerns": "SPIRITUALITY_RELIGIOUS_CONCERNS",
};

const toNormalizedKey = (s: string) => s.trim().toLowerCase();

export const coerceTherapistSpecializationKey = (value: string): TherapistSpecializationKey | null => {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if ((THERAPIST_SPECIALIZATION_KEYS as readonly string[]).includes(trimmed)) {
    return trimmed as TherapistSpecializationKey;
  }
  return LEGACY_LABEL_TO_KEY[toNormalizedKey(trimmed)] ?? null;
};

export const normalizeTherapistSpecializationKeys = (value: unknown): TherapistSpecializationKey[] => {
  const raw = Array.isArray(value) ? value : value == null ? [] : [value];
  const keys: TherapistSpecializationKey[] = [];

  for (const item of raw) {
    if (typeof item !== "string") continue;
    const parts = item.split(",").map((p) => p.trim()).filter(Boolean);
    for (const part of parts) {
      const key = coerceTherapistSpecializationKey(part);
      if (key && !keys.includes(key)) keys.push(key);
    }
  }

  return keys;
};

