import { describe, it, expect, beforeEach, vi } from 'vitest';
import { LANGUAGE_STORAGE_KEY } from './appStore';

// The store seeds its language from the guest's saved choice at module load, so
// each test imports a fresh module against a clean localStorage.
const freshStore = async () => {
  vi.resetModules();
  return import('./appStore');
};

beforeEach(() => localStorage.clear());

describe('event default language', () => {
  it('adopts the event default when the guest has made no choice', async () => {
    const { useAppStore } = await freshStore();
    useAppStore.getState().setEventDefaultLanguage('EN');
    expect(useAppStore.getState().language).toBe('EN');
  });

  it('falls back to one defined language when the event has no default', async () => {
    const { useAppStore } = await freshStore();
    useAppStore.getState().setEventDefaultLanguage(undefined);
    expect(useAppStore.getState().language).toBe('FR');
  });

  it("lets the guest's saved choice win over the event default", async () => {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, 'EN');
    const { useAppStore } = await freshStore();
    expect(useAppStore.getState().language).toBe('EN');
    useAppStore.getState().setEventDefaultLanguage('FR');
    expect(useAppStore.getState().language).toBe('EN');
  });

  it("remembers the guest's toggle for the next visit", async () => {
    const { useAppStore } = await freshStore();
    useAppStore.getState().toggleLanguage();
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe('EN');

    const next = (await freshStore()).useAppStore;
    expect(next.getState().language).toBe('EN');
  });
});
