const fs = require('fs');
const path = require('path');

const locales = ['hr.ts', 'de.ts', 'el.ts'];
const localesDir = 'c:/Users/XD/Studio projects/ThePsy fullstack/psy_web/src/i18n/locales';

const translations = {
    'hr.ts': {
        therapist_statistics: {
            title: "Statistika",
            weekly: "Tjedno",
            monthly: "Mjesečno",
            session_stats: "{{type}} Statistika seansi",
            description: "Pregled vaših završenih terapijskih seansi.",
            total_sessions: "Ukupno seansi",
            average_per: "Prosjek / {{period}}",
            peak_sessions: "Vršne seanse",
            completion_rate: "Stopa završetka",
            week: "Tjedan {{number}}",
            days: {
                mon: "Pon",
                tue: "Uto",
                wed: "Sri",
                thu: "Čet",
                fri: "Pet",
                sat: "Sub",
                sun: "Ned"
            }
        },
        therapist_earnings: {
            title: "Zarada",
            monthly_overview: "Mjesečni pregled",
            total_earnings: "Ukupna zarada",
            available_balance: "Raspoloživi saldo",
            pending_payouts: "Isplate na čekanju",
            last_payout: "Zadnja isplata",
            earnings_chart: "Grafikon zarade",
            payout_history: "Povijest isplata",
            no_data: "Još nema dostupnih podataka o zaradi.",
            status: {
                paid: "Plaćeno",
                pending: "Na čekanju",
                failed: "Neuspjelo"
            }
        },
        admin_earnings: {
            title: "Zarada i Naplata",
            monthly_overview: "Mjesečni Pregled",
            monthly_revenue: "Mjesečni Prihodi",
            total_sessions: "Ukupno Sesija",
            monthly_comparison: "Mjesečna usporedba zarade",
            monthly_statistic: "Mjesečna statistika sesija",
            sessions: "Sesije",
            avg_per_day: "Prosj. {{amount}}/dan",
            revenue_growth: "{{percent}}% više od prošlog mjeseca",
            sessions_growth: "{{count}} više od prošlog mjeseca",
            week: "Tjedan {{number}}",
            no_data: "Podaci o zaradi nisu dostupni",
            detailed_history: "Detaljna povijest zarade",
            month: "Mjesec",
            revenue: "Prihod",
            avg_per_day_label: "Prosj./dan"
        }
    },
    'de.ts': {
        therapist_statistics: {
            title: "Statistiken",
            weekly: "Wöchentlich",
            monthly: "Monatlich",
            session_stats: "{{type}} Sitzungsstatistiken",
            description: "Übersicht Ihrer abgeschlossenen Therapiesitzungen.",
            total_sessions: "Sitzungen insgesamt",
            average_per: "Durchschnitt / {{period}}",
            peak_sessions: "Spitzensitzungen",
            completion_rate: "Abschlussrate",
            week: "Woche {{number}}",
            days: {
                mon: "Mo",
                tue: "Di",
                wed: "Mi",
                thu: "Do",
                fri: "Fr",
                sat: "Sa",
                sun: "So"
            }
        },
        therapist_earnings: {
            title: "Verdienst",
            monthly_overview: "Monatsübersicht",
            total_earnings: "Gesamtverdienst",
            available_balance: "Verfügbares Guthaben",
            pending_payouts: "Ausstehende Auszahlungen",
            last_payout: "Letzte Auszahlung",
            earnings_chart: "Verdienstdiagramm",
            payout_history: "Auszahlungshistorie",
            no_data: "Noch keine Verdienstdaten verfügbar.",
            status: {
                paid: "Bezahlt",
                pending: "Ausstehend",
                failed: "Fehlgeschlagen"
            }
        },
        admin_earnings: {
            title: "Verdienst & Abrechnung",
            monthly_overview: "Monatsübersicht",
            monthly_revenue: "Monatlicher Umsatz",
            total_sessions: "Sitzungen insgesamt",
            monthly_comparison: "Monatlicher Verdienstvergleich",
            monthly_statistic: "Monatliche Sitzungsstatistik",
            sessions: "Sitzungen",
            avg_per_day: "Durchschn. {{amount}}/Tag",
            revenue_growth: "{{percent}}% zum Vormonat",
            sessions_growth: "{{count}} zum Vormonat",
            week: "Woche {{number}}",
            no_data: "Keine Verdienstdaten verfügbar",
            detailed_history: "Detaillierte Verdiensthistorie",
            month: "Monat",
            revenue: "Umsatz",
            avg_per_day_label: "Durchschn./Tag"
        }
    },
    'el.ts': {
        therapist_statistics: {
            title: "Στατιστικά",
            weekly: "Εβδομαδιαία",
            monthly: "Μηνιαία",
            session_stats: "Στατιστικά συνεδριών {{type}}",
            description: "Επισκόπηση των ολοκληρωμένων θεραπευτικών συνεδριών σας.",
            total_sessions: "Σύνολο συνεδριών",
            average_per: "Μέσος όρος / {{period}}",
            peak_sessions: "Περίοδοι αιχμής",
            completion_rate: "Ποσοστό ολοκλήρωσης",
            week: "Εβδομάδα {{number}}",
            days: {
                mon: "Δευ",
                tue: "Τρι",
                wed: "Τετ",
                thu: "Πέμ",
                fri: "Παρ",
                sat: "Σάβ",
                sun: "Κυρ"
            }
        },
        therapist_earnings: {
            title: "Κέρδη",
            monthly_overview: "Μηνιαία Επισκόπηση",
            total_earnings: "Συνολικά Κέρδη",
            available_balance: "Διαθέσιμο Υπόλοιπο",
            pending_payouts: "Εκκρεμείς Πληρωμές",
            last_payout: "Τελευταία Πληρωμή",
            earnings_chart: "Διάγραμμα Κερδών",
            payout_history: "Ιστορικό Πληρωμών",
            no_data: "Δεν υπάρχουν ακόμα διαθέσιμα δεδομένα κερδών.",
            status: {
                paid: "Πληρώθηκε",
                pending: "Εκκρεμεί",
                failed: "Απέτυχε"
            }
        },
        admin_earnings: {
            title: "Κέρδη & Χρέωση",
            monthly_overview: "Μηνιαία Επισκόπηση",
            monthly_revenue: "Μηνιαία Έσοδα",
            total_sessions: "Σύνολο Συνεδριών",
            monthly_comparison: "Μηνιαία Σύγκριση Κερδών",
            monthly_statistic: "Μηνιαία Στατιστικά Συνεδριών",
            sessions: "Συνεδρίες",
            avg_per_day: "Μέσος όρος {{amount}}/ημέρα",
            revenue_growth: "{{percent}}% από τον προηγούμενο μήνα",
            sessions_growth: "{{count}} από τον προηγούμενο μήνα",
            week: "Εβδομάδα {{number}}",
            no_data: "Δεν υπάρχουν διαθέσιμα δεδομένα κερδών",
            detailed_history: "Αναλυτικό Ιστορικό Κερδών",
            month: "Μήνας",
            revenue: "Έσοδα",
            avg_per_day_label: "Μέσος/Ημέρα"
        }
    }
};

locales.forEach(file => {
    const filePath = path.join(localesDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    const t = translations[file];

    // 1. Remove the trash from admin earnings (around line 104-145)
    // It's after payroll_settings and before dashboard.
    // We'll replace the whole admin.earnings object.
    content = content.replace(/"earnings":\s*\{[^}]*}}[^,}]*(?="dashboard")/, `"earnings": ${JSON.stringify(t.admin_earnings, null, 12)},\n            `);
    
    // Wait, the regex might be tricky if "earnings" appears twice.
    // Let's use a more Robust approach: find the admin block.
    
    // 2. Fix the therapist block.
    // Replace therapist.statistics and therapist.earnings.
    content = content.replace(/"statistics":\s*\{[^}]*},?\s*(?="earnings")/, `"statistics": ${JSON.stringify(t.therapist_statistics, null, 12)},\n            `);
    content = content.replace(/"earnings":\s*\{[^}]*},?\s*(?="chats"|"sessions"|"availability")/, `"earnings": ${JSON.stringify(t.therapist_earnings, null, 12)},\n            `);
    
    // 3. Remove the trash from signup block (if exists)
    // Look for "availability": { ... } inside signup.
    content = content.replace(/"signup":\s*\{[^]*?"availability":\s*\{[^]*?\}\s*\}tum rođenja"/, (match) => {
        // Remove the inner availability and restore signup.
        return match.replace(/"availability":\s*\{[^]*?\}\s*/, '').replace('}tum rođenja"', '"dob": "Datum rođenja"');
    });

    fs.writeFileSync(filePath, content);
    console.log(`Deep cleaned ${file}`);
});
