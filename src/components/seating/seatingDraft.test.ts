import { describe, it, expect } from 'vitest';
import type { FloorMapData, Guest } from '../../types';
import { applySeatOutcome, createSeatingDraft, editMap, markSaved } from './seatingDraft';

// The draft module exists so a seat edit cannot land the map without the guest
// mirror, and so nothing can change without marking the draft dirty.

const map = (over: Partial<FloorMapData> = {}): FloorMapData => ({
  id: 'map',
  canvasWidth: 900,
  canvasHeight: 650,
  tables: [
    { id: 't1', name: 'Table 1', shape: 'circle', x: 200, y: 200, width: 120, height: 120, capacity: 4, assignedGuestIds: [], seats: [null, null, null, null] },
  ],
  landmarks: [],
  updatedAt: '',
  ...over,
});

const guest = (over: Partial<Guest> = {}): Guest => ({
  id: 'g1',
  name: 'Alice',
  email: 'alice@x.com',
  code: '1111',
  max_party_size: 4,
  rsvp_status: 'Attending',
  attending_party_size: 2,
  attendee_names: ['Alice', 'Bob'],
  dietary_restrictions: '',
  language_pref: 'EN',
  magic_token: 'tok',
  token_used: true,
  created_at: '',
  ...over,
});

describe('createSeatingDraft', () => {
  it('starts clean and clones its inputs, so an edit cannot reach the caller', () => {
    const sourceMap = map();
    const sourceGuests = [guest()];
    const draft = createSeatingDraft(sourceMap, sourceGuests);

    expect(draft.dirty).toBe(false);
    expect(draft.map).not.toBe(sourceMap);
    expect(draft.guests).not.toBe(sourceGuests);

    draft.map.tables[0].name = 'Renamed';
    draft.guests[0].name = 'Renamed';
    expect(sourceMap.tables[0].name).toBe('Table 1');
    expect(sourceGuests[0].name).toBe('Alice');
  });
});

describe('editMap', () => {
  it('keeps the guests and marks the draft dirty', () => {
    const draft = createSeatingDraft(map(), [guest()]);
    const next = editMap(draft, map({ canvasWidth: 1200 }));

    expect(next.map.canvasWidth).toBe(1200);
    expect(next.guests).toBe(draft.guests);
    expect(next.dirty).toBe(true);
  });
});

describe('applySeatOutcome', () => {
  it('lands the seats and the guest mirror in one value', () => {
    const draft = createSeatingDraft(map(), [guest()]);
    const seatedMap = map({
      tables: [
        {
          ...map().tables[0],
          seats: [{ guestId: 'g1', attendeeIndex: 0 }, { guestId: 'g1', attendeeIndex: 1 }, null, null],
          assignedGuestIds: ['g1'],
        },
      ],
    });
    const seatedGuests = [guest({ table_id: 't1' })];

    const next = applySeatOutcome(draft, { map: seatedMap, guests: seatedGuests });

    expect(next.map.tables[0].assignedGuestIds).toEqual(['g1']);
    expect(next.guests[0].table_id).toBe('t1');
    expect(next.dirty).toBe(true);
  });
});

describe('markSaved', () => {
  it('clears the dirty flag without touching the data', () => {
    const draft = editMap(createSeatingDraft(map(), [guest()]), map({ canvasWidth: 1200 }));
    const saved = markSaved(draft);

    expect(saved.dirty).toBe(false);
    expect(saved.map).toBe(draft.map);
    expect(saved.guests).toBe(draft.guests);
  });
});
