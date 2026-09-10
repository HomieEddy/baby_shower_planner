import { describe, it, expect } from 'vitest';
import { FloorMapData, Guest, TableElement } from '../types';
import { DomainError } from './errors';
import {
  getTableSeats,
  getTableOccupiedSeats,
  getAttendeeSeatIndex,
  getAttendeeSeatLocation,
  validateTables,
  seatAttendee,
  seatParty,
  unseatAttendee,
  unassignParty,
  trimPartySeats,
} from './tableAssignment';

const expectCode = (fn: () => void, code: string) => {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(DomainError);
    expect((err as DomainError).code).toBe(code);
    return;
  }
  throw new Error(`expected DomainError ${code}`);
};

const map = (over: Partial<FloorMapData> = {}): FloorMapData => ({
  id: 'map',
  canvasWidth: 1000,
  canvasHeight: 600,
  tables: [],
  landmarks: [],
  updatedAt: '',
  ...over,
});

const guest = (over: Partial<Guest> = {}): Guest => ({
  id: 'g1',
  name: 'Alice',
  email: '',
  code: '1111',
  max_party_size: 5,
  rsvp_status: 'Attending',
  attending_party_size: 3,
  attendee_names: ['Alice', 'Bob', 'Cara'],
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

describe('seat model', () => {
  it('expands legacy assignedGuestIds into contiguous chairs', () => {
    const seats = getTableSeats(table({ assignedGuestIds: ['g1'] }), [guest()]);
    expect(seats.filter(Boolean)).toEqual([
      { guestId: 'g1', attendeeIndex: 0 },
      { guestId: 'g1', attendeeIndex: 1 },
      { guestId: 'g1', attendeeIndex: 2 },
    ]);
    expect(seats).toHaveLength(4);
    expect(getTableOccupiedSeats(table({ assignedGuestIds: ['g1'] }), [guest()])).toBe(3);
  });

  it('counts only non-null explicit seats', () => {
    const t = table({
      seats: [{ guestId: 'g1', attendeeIndex: 0 }, null, { guestId: 'g1', attendeeIndex: 1 }, null],
    });
    expect(getTableOccupiedSeats(t, [guest()])).toBe(2);
  });

  it('resolves a split attendee to the right table and chair', () => {
    const g = guest();
    const t1 = table({ assignedGuestIds: ['g1'], seats: [{ guestId: 'g1', attendeeIndex: 0 }, null, null, null] });
    const t2 = table({
      id: 't2',
      assignedGuestIds: ['g1'],
      seats: [null, null, { guestId: 'g1', attendeeIndex: 1 }, null],
    });
    expect(getAttendeeSeatIndex(t1, 'g1', 'Alice', [g])).toBe(0);
    expect(getAttendeeSeatIndex(t2, 'g1', 'Bob', [g])).toBe(2);
    expect(getAttendeeSeatIndex(t2, 'g1', 'Alice', [g])).toBeNull();
    // null attendeeName -> the party lead's chair
    expect(getAttendeeSeatIndex(t1, 'g1', null, [g])).toBe(0);
  });

  it('getAttendeeSeatLocation finds each split member on their own table', () => {
    const g = guest();
    const t1 = table({ assignedGuestIds: ['g1'], seats: [{ guestId: 'g1', attendeeIndex: 0 }, null, null, null] });
    const t2 = table({ id: 't2', assignedGuestIds: ['g1'], seats: [{ guestId: 'g1', attendeeIndex: 1 }, null, null, null] });
    const fm = map({ tables: [t1, t2] });
    expect(getAttendeeSeatLocation('g1', 0, fm, [g])).toEqual({ table: t1, seatIndex: 0 });
    expect(getAttendeeSeatLocation('g1', 1, fm, [g])).toEqual({ table: t2, seatIndex: 0 });
    expect(getAttendeeSeatLocation('g1', 2, fm, [g])).toBeNull();
  });
});

describe('validateTables', () => {
  it('rejects an over-capacity table', () => {
    const t = table({
      capacity: 1,
      seats: [{ guestId: 'g1', attendeeIndex: 0 }, { guestId: 'g1', attendeeIndex: 1 }],
    });
    expectCode(() => validateTables([t], [guest()]), 'TABLE_OVER_CAPACITY');
  });

  it('rejects an out-of-range attendee index', () => {
    const t = table({ seats: [null, null, null, { guestId: 'g1', attendeeIndex: 7 }] });
    expectCode(() => validateTables([t], [guest()]), 'SEAT_INDEX_OUT_OF_RANGE');
  });

  it('rejects an attendee seated twice', () => {
    const t1 = table({ seats: [{ guestId: 'g1', attendeeIndex: 0 }, null, null, null] });
    const t2 = table({ id: 't2', seats: [{ guestId: 'g1', attendeeIndex: 0 }, null, null, null] });
    expectCode(() => validateTables([t1, t2], [guest()]), 'SEAT_DUPLICATE_ATTENDEE');
  });

  it('accepts a legally split party', () => {
    const t1 = table({ seats: [{ guestId: 'g1', attendeeIndex: 0 }, { guestId: 'g1', attendeeIndex: 1 }, null, null] });
    const t2 = table({ id: 't2', seats: [{ guestId: 'g1', attendeeIndex: 2 }, null, null, null] });
    expect(() => validateTables([t1, t2], [guest()])).not.toThrow();
  });
});

describe('seatParty', () => {
  it('fills only the party members not already seated elsewhere', () => {
    // One member already split onto t1; the rest must land on t2 without reusing index 0.
    const g = guest();
    const t1 = table({ seats: [{ guestId: 'g1', attendeeIndex: 0 }, null, null, null] });
    const t2 = table({ id: 't2', capacity: 2 });
    const fm = map({ tables: [t1, t2] });

    const out = seatParty(fm, [g], 'g1', 't2');
    const t2Seats = getTableSeats(out.map.tables.find((t) => t.id === 't2')!, out.guests);

    expect(t2Seats.filter(Boolean)).toEqual([
      { guestId: 'g1', attendeeIndex: 1 },
      { guestId: 'g1', attendeeIndex: 2 },
    ]);
    expect(out.placed).toBe(2);
    expect(out.unplaced).toBe(0);
    // The regression the module exists to prevent: no duplicate attendee index.
    expect(() => validateTables(out.map.tables, out.guests)).not.toThrow();
  });

  it('leaves members unplaced when the table is full', () => {
    const g = guest();
    const t1 = table({ capacity: 1 });
    const out = seatParty(map({ tables: [t1] }), [g], 'g1', 't1');
    expect(out.placed).toBe(1);
    expect(out.unplaced).toBe(2);
  });

  it('is idempotent — re-seating an already-seated party adds nothing', () => {
    const g = guest();
    const first = seatParty(map({ tables: [table({ capacity: 4 })] }), [g], 'g1', 't1');
    const second = seatParty(first.map, first.guests, 'g1', 't1');
    expect(second.placed).toBe(0);
    expect(second.unplaced).toBe(0);
    expect(getTableOccupiedSeats(second.map.tables[0], second.guests)).toBe(3);
  });

  it('mirrors Guest.table_id to the table holding attendee 0', () => {
    const out = seatParty(map({ tables: [table({ capacity: 4 })] }), [guest()], 'g1', 't1');
    expect(out.guests[0].table_id).toBe('t1');
  });
});

describe('seatAttendee', () => {
  it('swaps the displaced attendee back into the vacated chair', () => {
    const g1 = guest({ id: 'g1', name: 'Alice', attending_party_size: 3, attendee_names: ['Alice', 'Bob', 'Cara'] });
    const g2 = guest({ id: 'g2', name: 'Dana', attending_party_size: 1, attendee_names: ['Dana'] });
    const t1 = table({
      capacity: 4,
      seats: [{ guestId: 'g1', attendeeIndex: 0 }, { guestId: 'g2', attendeeIndex: 0 }, null, null],
    });
    const out = seatAttendee(map({ tables: [t1] }), [g1, g2], 'g2', 0, 't1', 0);

    const seats = getTableSeats(out.map.tables[0], out.guests);
    expect(seats[0]).toEqual({ guestId: 'g2', attendeeIndex: 0 });
    expect(seats[1]).toEqual({ guestId: 'g1', attendeeIndex: 0 });
    expect(() => validateTables(out.map.tables, out.guests)).not.toThrow();
  });

  it('reports unplaced when the target chair is out of range', () => {
    const out = seatAttendee(map({ tables: [table({ capacity: 2 })] }), [guest()], 'g1', 0, 't1', 9);
    expect(out.placed).toBe(0);
    expect(out.unplaced).toBe(1);
  });
});

describe('unseatAttendee / unassignParty', () => {
  it('clears a single chair', () => {
    const t1 = table({ seats: [{ guestId: 'g1', attendeeIndex: 0 }, null, null, null] });
    const out = unseatAttendee(map({ tables: [t1] }), [guest()], 't1', 0);
    expect(getTableOccupiedSeats(out.map.tables[0], out.guests)).toBe(0);
    expect(out.guests[0].table_id).toBeUndefined();
  });

  it('clears the whole party from every table', () => {
    const g = guest();
    const t1 = table({ seats: [{ guestId: 'g1', attendeeIndex: 0 }, null, null, null] });
    const t2 = table({ id: 't2', seats: [null, { guestId: 'g1', attendeeIndex: 1 }, null, null] });
    const out = unassignParty(map({ tables: [t1, t2] }), [g], 'g1');
    expect(out.map.tables.every((t) => getTableOccupiedSeats(t, out.guests) === 0)).toBe(true);
  });
});

describe('trimPartySeats', () => {
  it('keeps the first N attendees and drops the rest', () => {
    const t1 = table({
      seats: [
        { guestId: 'g1', attendeeIndex: 0 },
        { guestId: 'g1', attendeeIndex: 1 },
        { guestId: 'g1', attendeeIndex: 2 },
        null,
      ],
    });
    const out = trimPartySeats([t1], 'g1', 2);
    expect(getTableOccupiedSeats(out[0], [guest()])).toBe(2);
    expect(out[0].assignedGuestIds).toEqual(['g1']);
  });

  it('drops a legacy assignedGuestIds entry without needing a guest list', () => {
    const t1 = table({ assignedGuestIds: ['g1', 'g2'] });
    const out = trimPartySeats([t1], 'g1');
    expect(out[0].assignedGuestIds).toEqual(['g2']);
  });
});
