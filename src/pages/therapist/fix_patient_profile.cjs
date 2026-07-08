const fs = require('fs');

const filePath = 'c:/Users/XD/Studio projects/ThePsy fullstack/psy_web/src/pages/therapist/TherapistPatientProfile.tsx';
let content = fs.readFileSync(filePath, 'utf8');

// 1. Fix color
content = content.replace(/bg-\[#92C7CF\]/g, 'bg-primary');

// 2. Fix translation keys (standardize on therapist_patient_profile)
content = content.replace(/t\("therapist\.patient_profile\./g, 't("therapist_patient_profile.');

// 3. Ensure useTranslation has i18n
if (!content.includes('const { t, i18n } = useTranslation();')) {
    content = content.replace(/const\s+\{\s*t\s*\}\s*=\s*useTranslation\(\);/, 'const { t, i18n } = useTranslation();');
}

fs.writeFileSync(filePath, content);
console.log('Fixed TherapistPatientProfile.tsx');
