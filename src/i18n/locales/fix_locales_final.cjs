const fs = require('fs');
const path = require('path');

const localesPath = 'c:/Users/XD/Studio projects/ThePsy fullstack/psy_web/src/i18n/locales';

function processFile(filename, fallbackStats, fallbackEarnings) {
    const filePath = path.join(localesPath, filename);
    let content = fs.readFileSync(filePath, 'utf8');

    // 1. Identify and extract flat keys if they exist
    const availabilityMatch = content.match(/"availability":\s*\{[\s\S]+?\}\s*,?\s*/);
    const statisticsMatch = content.match(/"statistics":\s*\{[\s\S]+?\}\s*,?\s*/);
    const earningsMatch = content.match(/"earnings":\s*\{[\s\S]+?\}\s*,?\s*/);

    let availabilityContent = availabilityMatch ? availabilityMatch[0].trim() : null;
    let statisticsContent = statisticsMatch ? statisticsMatch[0].trim() : null;
    let earningsContent = earningsMatch ? earningsMatch[0].trim() : null;

    // 2. Identify the therapist section
    const therapistStartIdx = content.indexOf('"therapist": {');
    if (therapistStartIdx === -1) {
        console.log(`Therapist section not found in ${filename}`);
        return;
    }

    // Find the end of therapist section by matching braces
    let braceCount = 0;
    let therapistEndIdx = -1;
    for (let i = therapistStartIdx; i < content.length; i++) {
        if (content[i] === '{') braceCount++;
        else if (content[i] === '}') braceCount--;
        
        if (braceCount === 0 && therapistEndIdx === -1 && i > therapistStartIdx) {
            therapistEndIdx = i;
            break;
        }
    }

    if (therapistEndIdx === -1) {
        console.log(`Could not find end of therapist section in ${filename}`);
        return;
    }

    let therapistSubContent = content.slice(therapistStartIdx, therapistEndIdx + 1);

    // 3. Check if they are already inside
    const hasAvailability = therapistSubContent.includes('"availability": {');
    const hasStatistics = therapistSubContent.includes('"statistics": {');
    const hasEarnings = therapistSubContent.includes('"earnings": {');

    // 4. Remove flat keys from original content (outside therapist)
    // We only remove them if they are NOT inside therapist
    if (availabilityContent) {
        const start = content.indexOf(availabilityContent);
        if (start < therapistStartIdx || start > therapistEndIdx) {
            content = content.replace(availabilityContent, '');
        }
    }
    if (statisticsContent) {
        const start = content.indexOf(statisticsContent);
        if (start < therapistStartIdx || start > therapistEndIdx) {
            content = content.replace(statisticsContent, '');
        }
    }
    if (earningsContent) {
        const start = content.indexOf(earningsContent);
        if (start < therapistStartIdx || start > therapistEndIdx) {
            content = content.replace(earningsContent, '');
        }
    }

    // 5. Update therapist section
    let newTherapistSubContent = therapistSubContent;
    const insertionPoint = newTherapistSubContent.lastIndexOf('}'); // last brace
    
    let additions = '';
    if (!hasAvailability && availabilityContent) {
        additions += ',\n            ' + availabilityContent.replace(/,$/, '');
    }
    if (!hasStatistics) {
        if (statisticsContent) {
            additions += ',\n            ' + statisticsContent.replace(/,$/, '');
        } else if (fallbackStats) {
            additions += ',\n            ' + fallbackStats;
        }
    }
    if (!hasEarnings) {
        if (earningsContent) {
            additions += ',\n            ' + earningsContent.replace(/,$/, '');
        } else if (fallbackEarnings) {
            additions += ',\n            ' + fallbackEarnings;
        }
    }

    if (additions) {
        newTherapistSubContent = newTherapistSubContent.slice(0, insertionPoint) + additions + '\n        }';
        content = content.slice(0, therapistStartIdx) + newTherapistSubContent + content.slice(therapistEndIdx + 1);
    }

    // Final cleanups
    content = content.replace(/,\s*,/g, ',');
    content = content.replace(/\{\s*,/g, '{');
    content = content.replace(/,\s*\}/g, '}');
    
    fs.writeFileSync(filePath, content);
    console.log(`Processed ${filename}`);
}

const deStats = `"statistics": {
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
            }`;

const deEarnings = `"earnings": {
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

processFile('de.ts', deStats, deEarnings);
processFile('hr.ts', null, null);
processFile('el.ts', null, null);
