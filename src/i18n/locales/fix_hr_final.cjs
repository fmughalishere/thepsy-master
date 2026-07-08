const fs = require('fs');
const path = require('path');

const localesDir = 'c:/Users/XD/Studio projects/ThePsy fullstack/psy_web/src/i18n/locales';

function cleanFile(fileName) {
    const filePath = path.join(localesDir, fileName);
    let content = fs.readFileSync(filePath, 'utf8');

    // Remove the duplicate "admin": { block that starts in the middle.
    // It usually follows therapist block.
    // We look for "admin": { that is NOT at the beginning.
    
    // First, let's fix the first admin block's earnings.
    // It's usually after payroll_settings.
    
    // We'll use a safer approach: 
    // 1. Extract the whole "translation" content.
    // 2. Remove known trash blocks.
    
    // Remove the trash block starting with }}/dan",
    content = content.replace(/\}\}\/dan",[^]*?"avg_per_day_label": "Prosj\.\/dan"\s+\},/g, '');
    content = content.replace(/\}\}\/Tag",[^]*?"avg_per_day_label": "Durchschn\.\/Tag"\s+\},/g, '');
    content = content.replace(/\}\}\/ημέρα",[^]*?"avg_per_day_label": "Μέσος\/Ημέρα"\s+\},/g, '');

    // Remove the huge trash segment in signup (if any)
    content = content.replace(/"signup":\s*\{[^]*?\}\s*\}tum rođenja"/g, '"signup": { "title": "...", "dob": "..." }'); // Placeholder to be fixed below

    // Actually, let's just use string interpolation to define the segments we want.
    // I will read the first 100 lines and the last 800 lines separately if needed.
    
    // BETTER: I will define the WHOLE therapist content for Each and just find where to swap it.
}

// I'll just do a very surgical replacement for each file.

// HR.TS
let hr = fs.readFileSync(path.join(localesDir, 'hr.ts'), 'utf8');
// Fix the admin.earnings trash (line 104 area)
hr = hr.replace(/"labels": \{ "hour": "sat", "minutes": "minuta" \}\s*\}\}\/dan",[^]*?"avg_per_day_label": "Prosj\.\/dan"\s+\},/g, 
    `"labels": { "hour": "sat", "minutes": "minuta" },
                "subtitle": "Konfigurirajte parametre plaća u cijelom sustavu"
            },
            "earnings": {
                "title": "Zarada i Naplata",
                "monthly_overview": "Mjesečni Pregled",
                "monthly_revenue": "Mjesečni Prihodi",
                "total_sessions": "Ukupno Sesija",
                "monthly_comparison": "Mjesečna usporedba zarade",
                "monthly_statistic": "Mjesečna statistika sesija",
                "sessions": "Sesije",
                "avg_per_day": "Prosj. {{amount}}/dan",
                "revenue_growth": "{{percent}}% više od prošlog mjeseca",
                "sessions_growth": "{{count}} više od prošlog mjeseca",
                "week": "Tjedan {{number}}",
                "no_data": "Podaci o zaradi nisu dostupni",
                "detailed_history": "Detaljna povijest zarade",
                "month": "Mjesec",
                "revenue": "Prihod",
                "avg_per_day_label": "Prosj./dan"
            },`);

// Remove the second "admin" block at 611 and surrounding junk
// We'll look for where "earnings" (therapist one) ends and "admin" starts.
hr = hr.replace(/"earnings": \{[^]*?\}\s+?\}\s*?,\s+?"admin": \{[^]*?\}\s+?\},\s+?"therapist_patient_profile": \{/g, 
    (match) => {
        // We only want the first part (therapist.earnings) and then jump to therapist_patient_profile.
        // But we need to make sure we close the therapist object!
        return match.split(',\n        "admin": {')[0] + '\n        },\n        "therapist_patient_profile": {';
    });

fs.writeFileSync(path.join(localesDir, 'hr.ts'), hr);
console.log('Fixed hr.ts');
