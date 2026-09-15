import { describe, it, expect, beforeEach, vi } from 'vitest';

// In-memory PocketBase from the shared test adapter (src/db/pbFake).
const h = vi.hoisted(() => ({
  fake: undefined as unknown as ReturnType<typeof import('./pbFake').createPbFake>,
}));

vi.mock('./client', async () => {
  const { createPbFake } = await import('./pbFake');
  h.fake = createPbFake();
  return {
    pb: h.fake.pb,
    fromRecord: (r: unknown) => ({ ...(r as object) }),
    newMagicToken: () => `tok-${Math.random().toString(36).slice(2)}`,
    newReservationCode: () => '1234',
  };
});

vi.mock('../server/uploadFiles', () => ({ removeUploadFiles: vi.fn() }));

import { getRehearsalStatus, isRehearsalActive, startRehearsal, stopRehearsal } from './rehearsal';

function seedRealGuest() {
  h.fake.ensure('guests').push({
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
  h.fake.ensure('floor_maps').push({
    id: 'real-map',
    canvasWidth: 400,
    canvasHeight: 300,
    roomShape: 'rectangle',
    tables: [{ id: 'real-table', name: 'Real Table' }],
    landmarks: [],
    updatedAt: '2000-01-01T00:00:00.000Z',
  });
}

beforeEach(() => h.fake.reset());

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
    expect(h.fake.ensure('guests').length).toBe(9);
    // Floor map replaced by the demo layout (3 tables).
    expect((h.fake.ensure('floor_maps')[0].tables as unknown[]).length).toBe(3);
  });

  it('deletes only rehearsal-window rows and restores the floor map', async () => {
    seedRealGuest();
    seedRealMap();
    await startRehearsal();

    // Simulate host activity during the rehearsal (e.g. a self-registration).
    h.fake.ensure('guests').push({
      id: 'during-1',
      name: 'During Guest',
      created_at: new Date().toISOString(),
      code: '9999',
      rsvp_status: 'Pending',
      magic_token: 'during-tok',
    });
    h.fake.ensure('guestbook').push({
      id: 'gb-1',
      guest_name: 'During Guest',
      message: 'hi',
      created_at: new Date().toISOString(),
    });

    await stopRehearsal();

    expect(isRehearsalActive()).toBe(false);
    // The original guest survives; demo + during-rehearsal rows are gone.
    expect(h.fake.ensure('guests').map((g) => g.id)).toEqual(['real-1']);
    expect(h.fake.ensure('guestbook').length).toBe(0);
    // The real floor map is restored.
    expect(h.fake.ensure('floor_maps')[0].id).toBe('real-map');
    expect(h.fake.ensure('floor_maps')[0].tables).toEqual([{ id: 'real-table', name: 'Real Table' }]);
  });
});
