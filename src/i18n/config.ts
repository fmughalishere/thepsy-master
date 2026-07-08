import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { en } from './locales/en';
import { de } from './locales/de';
import { el } from './locales/el';
import { hr } from './locales/hr';

const resources = {
    en: en,
    de: de,
    el: el,
    hr: hr
};

i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources,
        fallbackLng: 'en',
        debug: false,
        interpolation: {
            escapeValue: false,
        },
    });

// Vite HMR: when locale modules change, reload resource bundles so UI updates without hard refresh.
if (import.meta.hot) {
    import.meta.hot.accept(["./locales/en", "./locales/de", "./locales/el", "./locales/hr"], (mods) => {
        const [enMod, deMod, elMod, hrMod] = mods as any[];
        const next: Record<string, any> = {
            en: enMod?.en,
            de: deMod?.de,
            el: elMod?.el,
            hr: hrMod?.hr,
        };

        for (const [lng, bundle] of Object.entries(next)) {
            if (!bundle?.translation) continue;
            i18n.addResourceBundle(lng, "translation", bundle.translation, true, true);
        }

        i18n.reloadResources();
    });
}

export default i18n;
