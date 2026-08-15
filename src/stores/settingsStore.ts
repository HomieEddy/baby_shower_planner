import { create } from 'zustand';
import { EventSettings } from '../types';
import { adminFetch } from '../lib/api';

interface SettingsStore {
  settings: EventSettings | null;
  fetchSettings: () => Promise<void>;
  setSettings: (settings: EventSettings) => void;
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  settings: null,
  fetchSettings: async () => {
    try {
      // adminFetch so the host (when logged in) receives full settings
      // incl. reminder contacts; guests get the scrubbed public shape.
      const res = await adminFetch('/api/settings');
      const data = await res.json();
      if (data.settings) {
        set({ settings: data.settings });
      }
    } catch (err) {
      console.error('Error fetching settings:', err);
    }
  },
  // Push already-fetched/updated settings into the store without another network call.
  // (The settings POST lives in the admin save flow with the admin token.)
  setSettings: (settings) => set({ settings }),
}));
