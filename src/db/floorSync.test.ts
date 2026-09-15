import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { Guest, TableElement } from '../types';
import { DomainError } from '../lib/errors';

// The guard writes the legacy table_id mirror through pb; record the calls.
const h = vi.hoisted(() => {
  const updates: Array<{ id: string; table_id: string | null }> = [];
  return {
    updates,
    pb: {
      collection: (_name: string) => ({
        update: async (id: string, data: { table_id?: string | null }) => {
          updates.push({ id, table_id: data.table_id ?? null });
          return { id, ...data };
        },
      }),
    },
    reset: () => {
      updates.length = 0;
    },
  };
});

vi.mock('./client', () => ({ pb: h.pb }));

import { applyTablesAndSync } from './floorSync';

const guest = (over: Partial<Guest> = {}): Guest => ({
  id: 'g1',
  name: 'Alice',
  email: '',
  code: '1111',
  max_party_size: 5,
  rsvp_status: 'Attending',
  attending_party_size: 2,
  attendee_names: ['Alice', 'Bob'],
  dietary_restrictions: '',
  language_pref: 'EN',
  magic_token: '',
  token_used: false,
  created_at: '',
  ...over,
});

const table = (over: Partial<TableElement> = {}): TableElement => ({
  id: 't1',
  name: 'Table 1',
  shape: 'circle',
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  capacity: 4,
  assignedGuestIds: [],
  ...over,
});

beforeEach(() => h.reset());

describe('applyTablesAndSync', () => {
  it('materializes seats and syncs each guest table_id', async () => {
    const g = guest();
    const t = table({
      seats: [{ guestId: 'g1', attendeeIndex: 0 }, { guestId: 'g1', attendeeIndex: 1 }, null, null],
    });
    const out = await applyTablesAndSync([t], [g]);
    expect(out[0].assignedGuestIds).toEqual(['g1']);
    expect(h.updates).toEqual([{ id: 'g1', table_id: 't1' }]);
  });

  it('clears table_id for an unseated guest', async () => {
    const g = guest();
    await applyTablesAndSync([table()], [g]);
    expect(h.updates).toEqual([{ id: 'g1', table_id: null }]);
  });

  it('validates before writing anything', async () => {
    const g = guest();
    const t = table({
      seats: [{ guestId: 'ghost', attendeeIndex: 0 }, null, null, null],
    });
    await expect(applyTablesAndSync([t], [g])).rejects.toBeInstanceOf(DomainError);
    expect(h.updates).toEqual([]);
  });
});
