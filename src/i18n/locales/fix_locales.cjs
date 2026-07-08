const fs = require('fs');
const path = require('path');

const localesPath = 'c:/Users/XD/Studio projects/ThePsy fullstack/psy_web/src/i18n/locales';

function fixDe() {
    const filePath = path.join(localesPath, 'de.ts');
    let content = fs.readFileSync(filePath, 'utf8');
    
    // 1. Fix welcome section
    content = content.replace(/"welcome": \{[\s\S]+?"settings": \{/, (match) => {
        return `"welcome": {
            "get_started": "Loslegen",
            "intro_subtitle": "Ihre psychische Gesundheit ist wichtig. Entdecken Sie unsere Angebote, die Sie unterstützen.",
            "intro_title": "Professionelle, lizenzierte und spezialisierte Betreuung"
        },
        "settings": {`;
    });

    // 2. Add therapist sections if missing
    if (!content.includes('"availability": {') && content.includes('"chats": {')) {
        content = content.replace(/"chats": \{([\s\S]+?)\}\n\s+\}/, (match) => {
            return `"chats": {${match.match(/"chats": \{([\s\S]+?)\}/)[1]}},
            "availability": {
                "title": "Verfügbarkeit",
                "week": "Woche {{number}}",
                "add_slot_title": "Verfügbarkeits-Slot hinzufügen",
                "session_duration": "Standard-Sitzung: 45 Minuten",
                "recurrence": "Wiederholung",
                "single": "Einmalig (Nur dieser Tag)",
                "weekly": "Wöchentlich (Bis Ende der Woche)",
                "monthly": "Monatlich (Bis Ende des Monats)",
                "cancel": "Abbrechen",
                "add_slot": "Slot hinzufügen",
                "creating": "Wird erstellt...",
                "success": "Erfolg",
                "slots_created": "{{count}} Slots erfolgreich erstellt",
                "error": "Fehler",
                "failed_load": "Verfügbarkeit konnte nicht geladen werden",
                "failed_create": "Slots konnten nicht erstellt werden",
                "unknown_patient": "Unbekannter Patient",
                "view_full_profile": "Vollständiges Profil anzeigen",
                "delete_slot_title": "Slot löschen",
                "delete_confirmation": "Sind Sie sicher, dass Sie diesen Verfügbarkeits-Slot löschen möchten?",
                "delete_slot": "Slot löschen",
                "slot_deleted": "Slot erfolgreich gelöscht",
                "failed_delete": "Slot konnte nicht gelöscht werden",
                "time": "Zeit"
            },
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
            }
        }`;
        });
    }
    
    fs.writeFileSync(filePath, content);
}

function fixHr() {
    const filePath = path.join(localesPath, 'hr.ts');
    let content = fs.readFileSync(filePath, 'utf8');
    
    if (!content.includes('"availability": {')) {
        content = content.replace(/"chats": \{([\s\S]+?)\}\n\s+\}/, (match) => {
            return `"chats": {${match.match(/"chats": \{([\s\S]+?)\}/)[1]}},
            "availability": {
                "title": "Dostupnost",
                "week": "Tjedan {{number}}",
                "add_slot_title": "Dodaj termin dostupnosti",
                "session_duration": "Standardna seansa: 45 minuta",
                "recurrence": "Ponavljanje",
                "single": "Jednokratno (Samo ovaj dan)",
                "weekly": "Tjedno (Do kraja tjedna)",
                "monthly": "Mjesečno (Do kraja mjeseca)",
                "cancel": "Odustani",
                "add_slot": "Dodaj termin",
                "creating": "Kreiranje...",
                "success": "Uspjeh",
                "slots_created": "Uspješno kreirano {{count}} termina",
                "error": "Greška",
                "failed_load": "Neuspjelo učitavanje dostupnosti",
                "failed_create": "Neuspjelo kreiranje termina",
                "unknown_patient": "Nepoznati pacijent",
                "view_full_profile": "Pogledaj cijeli profil",
                "delete_slot_title": "Obriši termin",
                "delete_confirmation": "Jeste li sigurni da želite obrisati ovaj termin dostupnosti?",
                "delete_slot": "Obriši termin",
                "slot_deleted": "Termin uspješno obrisan",
                "failed_delete": "Neuspjelo brisanje termina",
                "time": "Vrijeme"
            },
            "statistics": {
                "title": "Statistika",
                "weekly": "Tjedno",
                "monthly": "Mjesečno",
                "session_stats": "{{type}} Statistika seansi",
                "description": "Pregled vaših završenih terapijskih seansi.",
                "total_sessions": "Ukupno seansi",
                "average_per": "Prosjek / {{period}}",
                "day": "Dan",
                "week_label": "Tjedan",
                "peak_sessions": "Vrhunac seansi",
                "completion_rate": "Stopa završetka",
                "week": "Tjedan {{number}}",
                "days": {
                    "mon": "Pon",
                    "tue": "Uto",
                    "wed": "Sri",
                    "thu": "Čet",
                    "fri": "Pet",
                    "sat": "Sub",
                    "sun": "Ned"
                }
            },
            "earnings": {
                "title": "Zarada",
                "no_data": "Još nema dostupnih podataka o zaradi.",
                "monthly_overview": "Mjesečni pregled",
                "monthly_revenue": "Mjesečni prihod",
                "revenue_growth": "{{percent}}% u usporedbi s prošlim mjesecom",
                "total_sessions": "Ukupno seansi",
                "sessions_growth": "{{count}} više nego prošli mjesec",
                "monthly_comparison": "Mjesečna usporedba",
                "monthly_statistic": "Tjedna raščlamba prihoda",
                "detailed_history": "Detaljna povijest",
                "month": "Mjesec",
                "revenue": "Prihod",
                "sessions": "Seanse",
                "avg_per_day_label": "Prosj./dan"
            }
        }`;
        });
    }
    fs.writeFileSync(filePath, content);
}

function fixEl() {
    const filePath = path.join(localesPath, 'el.ts');
    let content = fs.readFileSync(filePath, 'utf8');
    
    if (!content.includes('"availability": {')) {
        content = content.replace(/"chats": \{([\s\S]+?)\}\n\s+\}/, (match) => {
            return `"chats": {${match.match(/"chats": \{([\s\S]+?)\}/)[1]}},
            "availability": {
                "title": "Διαθεσιμότητα",
                "week": "Εβδομάδα {{number}}",
                "add_slot_title": "Προσθήκη Διαθέσιμης Ώρας",
                "session_duration": "Τυπική συνεδρία: 45 λεπτά",
                "recurrence": "Επανάληψη",
                "single": "Μία φορά (Μόνο αυτή την ημέρα)",
                "weekly": "Εβδομαδιαία (Μέχρι το τέλος της εβδομάδας)",
                "monthly": "Μηνιαία (Μέχρι το τέλος του μήνα)",
                "cancel": "Ακύρωση",
                "add_slot": "Προσθήκη Ώρας",
                "creating": "Δημιουργία...",
                "success": "Επιτυχία",
                "slots_created": "Δημιουργήθηκαν {{count}} ώρες επιτυχώς",
                "error": "Σφάλμα",
                "failed_load": "Αποτυχία φόρτωσης διαθεσιμότητας",
                "failed_create": "Αποτυχία δημιουργίας ωρών",
                "unknown_patient": "Άγνωστος Ασθενής",
                "view_full_profile": "Προβολή Πλήρους Προφίλ",
                "delete_slot_title": "Διαγραφή Ώρας",
                "delete_confirmation": "Είστε σίγουροι ότι θέλετε να διαγράψετε αυτή τη διαθέσιμη ώρα;",
                "delete_slot": "Διαγραφή Ώρας",
                "slot_deleted": "Η διαγραφή της ώρας ολοκληρώθηκε",
                "failed_delete": "Αποτυχία διαγραφής ώρας",
                "time": "Ώρα"
            },
            "statistics": {
                "title": "Στατιστικά",
                "weekly": "Εβδομαδιαία",
                "monthly": "Μηνιαία",
                "session_stats": "{{type}} Στατιστικά Συνεδριών",
                "description": "Επισκόπηση των ολοκληρωμένων συνεδριών σας.",
                "total_sessions": "Συνολικές Συνεδρίες",
                "average_per": "Μέσος όρος / {{period}}",
                "day": "Ημέρα",
                "week_label": "Εβδομάδα",
                "peak_sessions": "Συνεδρίες Αιχμής",
                "completion_rate": "Ποσοστό Ολοκλήρωσης",
                "week": "Εβδομάδα {{number}}",
                "days": {
                    "mon": "Δευ",
                    "tue": "Τρι",
                    "wed": "Τετ",
                    "thu": "Πεμ",
                    "fri": "Παρ",
                    "sat": "Σαβ",
                    "sun": "Κυρ"
                }
            },
            "earnings": {
                "title": "Κέρδη",
                "no_data": "Δεν υπάρχουν ακόμα διαθέσιμα δεδομένα κερδών.",
                "monthly_overview": "Μηνιαία Επισκόπηση",
                "monthly_revenue": "Μηνιαία Έσοδα",
                "revenue_growth": "{{percent}}% σε σύγκριση με τον προηγούμενο μήνα",
                "total_sessions": "Συνολικές Συνεδρίες",
                "sessions_growth": "{{count}} περισσότερες από τον προηγούμενο μήνα",
                "monthly_comparison": "Μηνιαία Σύγκριση",
                "monthly_statistic": "Εβδομαδιαία Ανάλυση Εσόδων",
                "detailed_history": "Λεπτομερές Ιστορικό",
                "month": "Μήνας",
                "revenue": "Έσοδα",
                "sessions": "Συνεδρίες",
                "avg_per_day_label": "Μ.Ο./Ημέρα"
            }
        }`;
        });
    }
    fs.writeFileSync(filePath, content);
}

fixDe();
fixHr();
fixEl();
console.log('Fixed locales');
