import i18n from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';
import { translations, Translations } from '../../translations';
import { useAppStore } from '../../stores/appStore';

// i18next engine behind the app's existing translations API.
// `useT()` keeps returning the current language's `Translations` object shape,
// so no component call sites change — but the engine now powers interpolation,
// plurals, and language switching.

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: translations.EN },
    fr: { translation: translations.FR },
  },
  lng: useAppStore.getState().language === 'FR' ? 'fr' : 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

// Keep i18next in sync when the language changes through the app store
// (Header toggle, footer toggle). The store remains the single source of truth.
useAppStore.subscribe((state) => {
  const lng = state.language === 'FR' ? 'fr' : 'en';
  if (i18n.language !== lng) void i18n.changeLanguage(lng);
});

export { i18n };

// Convenience hook: current-language translation object.
// Replaces the repeated `const language = useAppStore(...); const t = translations[language];`
// boilerplate in components. Components that also need the language value itself
// keep `const language = useAppStore((s) => s.language);` alongside `const t = useT();`.
export const useT = (): Translations => {
  const { t } = useTranslation();
  // Proxy the i18next `t(key)` lookup behind the Translations object shape.
  // Unchecked cast: i18next keys are flat (no dots), matching the Translations interface.
  return new Proxy({} as Translations, {
    get: (_target, prop: string) => t(prop) as string,
  });
};
