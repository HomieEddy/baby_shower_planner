import { describe, it, expect } from 'vitest';
import type { FloorMapData, Guest, TableElement } from '../types';
import { suggestSeating, unseatedParties } from './seatingSuggestions';

const guest = (over: Partial<Guest> = {}): Guest => {
  const size = over.attending_party_size ?? over.attendee_names?.length ?? 1;
  return {
    id: 'g1',
    name: 'Alice',
    email: '',
    code: '1111',
    max_party_size: 5,
    rsvp_status: 'Attending',
    attending_party_size: size,
    attendee_names: Array.from({ length: size }, (_, i) => (i === 0 ? 'Alice' : `Plus${i}`)),
    dietary_restrictions: '',
    language_pref: 'EN',
    magic_token: '',
    token_used: false,
    created_at: '',
    ...over,
  };
};

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

const map = (tables: TableElement[]): FloorMapData => ({
  id: 'map',
  canvasWidth: 1000,
  canvasHeight: 600,
  tables,
  landmarks: [],
  updatedAt: '',
});

describe('suggestSeating', () => {
  it('seats the largest party first and picks the closest fit', () => {
    const big = guest({ id: 'big', name: 'Big', attending_party_size: 3, attendee_names: ['Big', 'B', 'C'] });
    const small = guest({ id: 'small', name: 'Small', attending_party_size: 2, attendee_names: ['Small', 'S'] });
    const t1 = table({ id: 't1', capacity: 6 });
    const t2 = table({ id: 't2', capacity: 2 });

    const out = suggestSeating(map([t1, t2]), [small, big]);

    expect(out.map((s) => s.guest.id)).toEqual(['big', 'small']);
    expect(out[0].table.id).toBe('t1');
    // t1 now has 3 free; small's best fit is the exact-fit t2.
    expect(out[1].table.id).toBe('t2');
    expect(out[1].matchBadge).toBe('Exact Fit');
  });

  it('returns nothing when no table can hold a party whole', () => {
    const big = guest({ id: 'big', attending_party_size: 5, attendee_names: ['a', 'b', 'c', 'd', 'e'] });
    expect(suggestSeating(map([table({ capacity: 2 })]), [big])).toEqual([]);
  });

  it('skips fully-seated and non-attending guests', () => {
    const seatedGuest = guest({ id: 'seated', name: 'Seated' });
    const declined = guest({ id: 'declined', name: 'Declined', rsvp_status: 'Declined' });
    const pending = guest({ id: 'pending', name: 'Pending', rsvp_status: 'Pending' });
    const t1 = table({ id: 't1', seats: [{ guestId: 'seated', attendeeIndex: 0 }, null, null, null] });
    const fm = map([t1]);

    expect(unseatedParties(fm, [seatedGuest, declined, pending]).map((g) => g.id)).toEqual([]);
    expect(suggestSeating(fm, [seatedGuest, declined, pending])).toEqual([]);
  });
});
