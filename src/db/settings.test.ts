import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({ getFullList: vi.fn() }));

// Only the PocketBase plumbing is stubbed, so the real record mapping runs.
vi.mock('./client', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  pb: { collection: () => ({ getFullList: h.getFullList }) },
}));
vi.mock('./rehearsal', () => ({ isRehearsalActive: () => false }));

import { getSettingsOrUndefined } from './settings';

beforeEach(() => h.getFullList.mockReset());

describe('getSettingsOrUndefined', () => {
  it('reports absence, rather than throwing, when the event has no settings row', async () => {
    h.getFullList.mockResolvedValue([]);
    await expect(getSettingsOrUndefined()).resolves.toBeUndefined();
  });

  it('returns the stored row when one exists', async () => {
    h.getFullList.mockResolvedValue([{ babyName: 'Lou' }]);
    await expect(getSettingsOrUndefined()).resolves.toMatchObject({ babyName: 'Lou' });
  });
});
