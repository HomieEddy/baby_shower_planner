import { describe, it, expect, beforeEach, vi } from 'vitest';

// Minimal in-memory PocketBase so the rehearsal seed/cleanup can be exercised
// without a running server.
const h = vi.hoisted(() => {
  const stores: Record<string, any[]> = {};
  let seq = 0;
  const ensure = (name: string) => (stores[name] ??= []);
  const match = (rec: any, filter: string) => {
    const pairs = [...String(filter).matchAll(/(\w+)="([^"]*)"/g)];
    return pairs.length > 0 && pairs.every(([, key, value]) => String(rec[key] ?? '') === value);
  };
  const collection = (name: string) => ({
    getList: async (_p: number, _pp: number, opts: any = {}) => {
      let items = [...ensure(name)];
      if (opts.filter) items = items.filter((r) => match(r, opts.filter));
      return { items, totalItems: items.length };
    },
    getFirstListItem: async (filter: string) => {
      const found = ensure(name).find((r) => match(r, filter));
      if (!found) throw new Error('not found');
      return found;
    },
    getFullList: async () => [...ensure(name)],
    getOne: async (id: string) => {
      const found = ensure(name).find((r) => r.id === id);
      if (!found) throw new Error('not found');
      return found;
    },
    create: async (data: any) => {
      const rec = { id: `${name}-${++seq}`, ...data };
      ensure(name).push(rec);
      return rec;
    },
    update: async (id: string, data: any) => {
      const found = ensure(name).find((r) => r.id === id);
      if (!found) throw new Error('not found');
      Object.assign(found, data);
      return found;
    },
    delete: async (id: string) => {
      stores[name] = ensure(name).filter((r) => r.id !== id);
    },
  });
  return {
    stores,
    ensure,
    pb: { collection },
    reset: () => {
      for (const key of Object.keys(stores)) delete stores[key];
      seq = 0;
    },
  };
});

vi.mock('./client', () => ({
  pb: h.pb,
  fromRecord: (r: any) => ({ ...r }),
  newMagicToken: () => `tok-${Math.random().toString(36).slice(2)}`,
  newReservationCode: () => '1234',
}));

vi.mock('../server/uploadFiles', () => ({ removeUploadFiles: vi.fn() }));

import { getRehearsalStatus, isRehearsalActive, startRehearsal, stopRehearsal } from './rehearsal';

function seedRealGuest() {
  h.ensure('guests').push({
    id: 'real-1',
    name: 'Real Guest',
    email: 'real@example.com',
    code: '0001',
    rsvp_status: 'Attending',
    attending_party_size: 1,
    max_party_size: 1,
    attendee_names: ['Real Guest'],
    language_pref: 'EN',
    magic_token: 'real-tok',
    token_used: true,
    created_at: '2000-01-01T00:00:00.000Z',
  });
}

function seedRealMap() {
  h.ensure('floor_maps').push({
    id: 'real-map',
    canvasWidth: 400,
    canvasHeight: 300,
    roomShape: 'rectangle',
    tables: [{ id: 'real-table', name: 'Real Table' }],
    landmarks: [],
    updatedAt: '2000-01-01T00:00:00.000Z',
  });
}

beforeEach(() => h.reset());

describe('rehearsal', () => {
  it('seeds demo data without touching pre-existing records', async () => {
    seedRealGuest();
    seedRealMap();

    const result = await startRehearsal();

    expect(result.active).toBe(true);
    expect(result.counts.guests).toBe(8);
    expect(isRehearsalActive()).toBe(true);
    expect(getRehearsalStatus().sample?.code).toBeTruthy();

    // 8 demo guests on top of the 1 real guest.
    expect(h.ensure('guests').length).toBe(9);
    // Floor map replaced by the demo layout (3 tables).
    expect(h.ensure('floor_maps')[0].tables.length).toBe(3);
  });

  it('deletes only rehearsal-window rows and restores the floor map', async () => {
    seedRealGuest();
    seedRealMap();
    await startRehearsal();

    // Simulate host activity during the rehearsal (e.g. a self-registration).
    h.ensure('guests').push({
      id: 'during-1',
      name: 'During Guest',
      created_at: new Date().toISOString(),
      code: '9999',
      rsvp_status: 'Pending',
      magic_token: 'during-tok',
    });
    h.ensure('guestbook').push({
      id: 'gb-1',
      guest_name: 'During Guest',
      message: 'hi',
      created_at: new Date().toISOString(),
    });

    await stopRehearsal();

    expect(isRehearsalActive()).toBe(false);
    // The original guest survives; demo + during-rehearsal rows are gone.
    expect(h.ensure('guests').map((g) => g.id)).toEqual(['real-1']);
    expect(h.ensure('guestbook').length).toBe(0);
    // The real floor map is restored.
    expect(h.ensure('floor_maps')[0].id).toBe('real-map');
    expect(h.ensure('floor_maps')[0].tables).toEqual([{ id: 'real-table', name: 'Real Table' }]);
  });
});
