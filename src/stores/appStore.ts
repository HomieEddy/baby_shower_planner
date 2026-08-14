import { create } from 'zustand';
import { Language } from '../types';

interface AppStore {
  language: Language;
  toggleLanguage: () => void;
}

export const useAppStore = create<AppStore>((set) => ({
  language: 'EN',
  toggleLanguage: () => set((s) => ({ language: s.language === 'EN' ? 'FR' : 'EN' })),
}));
