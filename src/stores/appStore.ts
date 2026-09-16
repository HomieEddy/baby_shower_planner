import { create } from 'zustand';
import { Language } from '../types';

// The guest's own language choice for this browser, remembered across visits.
export const LANGUAGE_STORAGE_KEY = 'eventLanguage';
// One defined fallback when neither a guest choice nor an event default exists.
export const DEFAULT_LANGUAGE: Language = 'FR';

const isLanguage = (value: unknown): value is Language => value === 'EN' || value === 'FR';

function readStoredLanguage(): Language | null {
  try {
    const value = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    return isLanguage(value) ? value : null;
  } catch {
    // No localStorage (SSR / private mode): no remembered choice.
    return null;
  }
}

interface AppStore {
  language: Language;
  // True once the guest has chosen a language — saved, or toggled this session.
  // Their choice outranks the event default.
  guestChoice: boolean;
  toggleLanguage: () => void;
  // Seed the language from the event, unless the guest already chose one.
  setEventDefaultLanguage: (language?: Language) => void;
}

export const useAppStore = create<AppStore>((set, get) => {
  const stored = readStoredLanguage();
  return {
    language: stored ?? DEFAULT_LANGUAGE,
    guestChoice: stored !== null,
    toggleLanguage: () =>
      set((s) => {
        const next: Language = s.language === 'EN' ? 'FR' : 'EN';
        try {
          localStorage.setItem(LANGUAGE_STORAGE_KEY, next);
        } catch {
          /* private mode: the choice still holds for this session */
        }
        return { language: next, guestChoice: true };
      }),
    setEventDefaultLanguage: (language) => {
      if (get().guestChoice) return;
      const next = language ?? DEFAULT_LANGUAGE;
      if (next !== get().language) set({ language: next });
    },
  };
});
