import { format as dateFnsFormat, type Locale } from "date-fns";
import { enUS, de, el, hr } from "date-fns/locale";

const localeMap: Record<string, Locale> = {
    en: enUS,
    de: de,
    el: el,
    hr: hr
};

/**
 * Formats a date based on the current i18next language.
 * @param date The date to format (Date, number, or Timestamp)
 * @param formatStr The date-fns format string
 * @returns A localized date string
 */
export const formatLocalizedDate = (
    date: Date | number | { toDate: () => Date },
    formatStr: string,
    currentLang: string = 'en'
): string => {
    // Standardize input date
    let dateObj: Date;
    if (typeof date === 'object' && 'toDate' in date) {
        dateObj = date.toDate();
    } else {
        dateObj = new Date(date);
    }

    // Get the base language (e.g., 'en' from 'en-US')
    const baseLang = currentLang.split('-')[0];
    const locale = localeMap[baseLang] || enUS;

    return dateFnsFormat(dateObj, formatStr, { locale });
};

/**
 * Formats a time based on the current i18next language.
 */
export const formatLocalizedTime = (
    date: Date | number | { toDate: () => Date },
    currentLang: string = 'en'
): string => {
    // For English, use 12h format, otherwise 24h
    const baseLang = currentLang.split('-')[0];
    const formatStr = baseLang === 'en' ? 'hh:mm a' : 'HH:mm';
    return formatLocalizedDate(date, formatStr, currentLang);
};
