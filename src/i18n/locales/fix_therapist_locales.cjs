const fs = require('fs');
const path = require('path');

const localesPath = 'c:/Users/XD/Studio projects/ThePsy fullstack/psy_web/src/i18n/locales';

function fixDe() {
    const filePath = path.join(localesPath, 'de.ts');
    let content = fs.readFileSync(filePath, 'utf8');

    // Check if statistics is already in therapist
    if (!content.includes('"statistics": {') || content.indexOf('"statistics": {') > content.indexOf('"therapist_patient_profile"')) {
        const stats = `
            "statistics": {
                "title": "Statistiken",
                "weekly": "Wöchentlich",
                "monthly": "Monatlich",
                "session_stats": "{{type}} Sitzungsstatistiken",
                "description": "Übersicht Ihrer abgeschlossenen Therapiesitzungen.",
                "total_sessions": "Gesamte Sitzungen",
                "average_per": "Durchschnitt / {{period}}",
                "day": "Tag",
                "week_label": "Woche",
                "peak_sessions": "Spitzen-Sitzungen",
                "completion_rate": "Abschlussrate",
                "week": "Woche {{number}}",
                "days": {
                    "mon": "Mo",
                    "tue": "Di",
                    "wed": "Mi",
                    "thu": "Do",
                    "fri": "Fr",
                    "sat": "Sa",
                    "sun": "So"
                }
            },
            "earnings": {
                "title": "Verdienst",
                "no_data": "Noch keine Verdienstdaten verfügbar.",
                "monthly_overview": "Monatliche Übersicht",
                "monthly_revenue": "Monatlicher Umsatz",
                "revenue_growth": "{{percent}}% im Vergleich zum Vormonat",
                "total_sessions": "Sitzungen insgesamt",
                "sessions_growth": "{{count}} mehr als im Vormonat",
                "monthly_comparison": "Monatlicher Vergleich",
                "monthly_statistic": "Wöchentliche Umsatzaufschlüsselung",
                "detailed_history": "Detaillierter Verlauf",
                "month": "Monat",
                "revenue": "Umsatz",
                "sessions": "Sitzungen",
                "avg_per_day_label": "Durchschn./Tag"
            }`;

        // Find the end of availability which is the last thing in therapist
        content = content.replace(/"availability": \{[\s\S]+?\}\n\s+\}\n\s+"therapist_patient_profile":/, (match) => {
            return match.replace(/\}\n\s+\}\n\s+"therapist_patient_profile":/, `},${stats}\n        },\n        "therapist_patient_profile":`);
        });
    }

    fs.writeFileSync(filePath, content);
    console.log('Fixed de.ts');
}

function fixHr() {
    const filePath = path.join(localesPath, 'hr.ts');
    let content = fs.readFileSync(filePath, 'utf8');

    // Extract flat keys
    const availabilityMatch = content.match(/"availability": \{[\s\S]+?\}(?=\s*,\s*"statistics"|\s*,\s*"settings"|\s*\n\s+\})/);
    const statisticsMatch = content.match(/"statistics": \{[\s\S]+?\}(?=\s*,\s*"earnings"|\s*,\s*"settings"|\s*\n\s+\})/);
    const earningsMatch = content.match(/"earnings": \{[\s\S]+?\}(?=\s*,\s*"settings"|\s*\n\s+\})/);

    let availability = availabilityMatch ? availabilityMatch[0] : null;
    let statistics = statisticsMatch ? statisticsMatch[0] : null;
    let earnings = earningsMatch ? earningsMatch[0] : null;

    if (availability || statistics || earnings) {
        // Remove them from flat positions
        if (availability) content = content.replace(availability + ',', '').replace(availability, '');
        if (statistics) content = content.replace(statistics + ',', '').replace(statistics, '');
        if (earnings) content = content.replace(earnings + ',', '').replace(earnings, '');

        // Move into therapist section
        const therapistEnd = content.indexOf('},\n        "therapist_patient_profile"');
        if (therapistEnd !== -1) {
            let therapistContent = '';
            if (availability) therapistContent += ',\n            ' + availability;
            if (statistics) therapistContent += ',\n            ' + statistics;
            if (earnings) therapistContent += ',\n            ' + earnings;
            
            content = content.slice(0, therapistEnd) + therapistContent + content.slice(therapistEnd);
        }
    }

    // Clean up double commas or empty lines if any
    content = content.replace(/,\s*,/g, ',');
    
    fs.writeFileSync(filePath, content);
    console.log('Fixed hr.ts');
}

fixDe();
fixHr();
