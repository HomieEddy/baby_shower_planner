import { describe, it, expect } from 'vitest';
import { FloorMapData, Guest, TableElement } from '../types';
import { DomainError } from './errors';
import {
  getTableSeats,
  getTableOccupiedSeats,
  getAttendeeSeatIndex,
  getAttendeeSeatLocation,
  getAvailableSeats,
  getUnseatedPartySize,
  canSeatParty,
  validateTables,
  seatAttendee,
  seatParty,
  unseatAttendee,
  unassignParty,
  trimPartySeats,
  removePartyAttendee,
  getSeatingStats,
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
  it('moves a party whole to another table, freeing its old chairs', () => {
    // One member on t1 today: the whole party lands on t2 and leaves t1 empty.
    const g = guest();
    const t1 = table({ seats: [{ guestId: 'g1', attendeeIndex: 0 }, null, null, null] });
    const t2 = table({ id: 't2', capacity: 4 });
    const out = seatParty(map({ tables: [t1, t2] }), [g], 'g1', 't2');
    expect(out.placed).toBe(3);
    expect(getTableOccupiedSeats(out.map.tables[0], out.guests)).toBe(0);
    expect(getTableOccupiedSeats(out.map.tables[1], out.guests)).toBe(3);
    expect(() => validateTables(out.map.tables, out.guests)).not.toThrow();
  });

  it('seats the whole party at one table in party order', () => {
    const g = guest();
    const out = seatParty(map({ tables: [table({ capacity: 4 })] }), [g], 'g1', 't1');
    expect(out.placed).toBe(3);
    expect(out.unplaced).toBe(0);
    expect(getTableSeats(out.map.tables[0], out.guests).slice(0, 3)).toEqual([
      { guestId: 'g1', attendeeIndex: 0 },
      { guestId: 'g1', attendeeIndex: 1 },
      { guestId: 'g1', attendeeIndex: 2 },
    ]);
  });

  it('refuses a party larger than the free chairs and seats nobody', () => {
    const g = guest();
    const t1 = table({ capacity: 2 });
    const out = seatParty(map({ tables: [t1] }), [g], 'g1', 't1');
    expect(out.placed).toBe(0);
    expect(out.unplaced).toBe(3);
    expect(getTableOccupiedSeats(out.map.tables[0], out.guests)).toBe(0);
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
  it('seats the whole party when one member is picked', () => {
    const out = seatAttendee(map({ tables: [table({ capacity: 4 })] }), [guest()], 'g1', 1, 't1', 3);
    expect(out.placed).toBe(3);
    expect(getTableOccupiedSeats(out.map.tables[0], out.guests)).toBe(3);
    expect(() => validateTables(out.map.tables, out.guests)).not.toThrow();
  });

  it('refuses the party when it does not fit, and seats nobody alone', () => {
    const out = seatAttendee(map({ tables: [table({ capacity: 2 })] }), [guest()], 'g1', 0, 't1', 0);
    expect(out.placed).toBe(0);
    expect(out.unplaced).toBe(3);
    expect(getTableOccupiedSeats(out.map.tables[0], out.guests)).toBe(0);
  });
});

describe('unseatAttendee / unassignParty', () => {
  it('unseats the whole party when any one chair is removed', () => {
    const t1 = table({ seats: [{ guestId: 'g1', attendeeIndex: 0 }, { guestId: 'g1', attendeeIndex: 1 }, null, null] });
    const out = unseatAttendee(map({ tables: [t1] }), [guest()], 't1', 1);
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

describe('removePartyAttendee', () => {
  it('removes a middle attendee and shifts higher indices down', () => {
    const t1 = table({
      seats: [
        { guestId: 'g1', attendeeIndex: 0 },
        { guestId: 'g1', attendeeIndex: 1 },
        { guestId: 'g1', attendeeIndex: 2 },
        null,
      ],
    });
    const out = removePartyAttendee([t1], 'g1', 1);
    expect(out[0].seats?.[0]).toEqual({ guestId: 'g1', attendeeIndex: 0 });
    expect(out[0].seats?.[1]).toBeNull();
    expect(out[0].seats?.[2]).toEqual({ guestId: 'g1', attendeeIndex: 1 });
    expect(out[0].assignedGuestIds).toEqual(['g1']);
  });

  it('leaves other parties untouched and drops a legacy entry', () => {
    const t1 = table({
      seats: [
        { guestId: 'g1', attendeeIndex: 0 },
        { guestId: 'g2', attendeeIndex: 0 },
        null,
        null,
      ],
    });
    expect(removePartyAttendee([t1], 'g1', 0)[0].seats?.[1]).toEqual({ guestId: 'g2', attendeeIndex: 0 });
    expect(removePartyAttendee([table({ assignedGuestIds: ['g1', 'g2'] })], 'g1', 0)[0].assignedGuestIds).toEqual(['g2']);
  });
});

describe('seat availability predicate', () => {
  it('getAvailableSeats is capacity minus occupancy and never negative', () => {
    expect(getAvailableSeats(table({ capacity: 4, assignedGuestIds: ['g1'] }), [guest()])).toBe(1);
    const full = table({
      capacity: 1,
      seats: [{ guestId: 'g1', attendeeIndex: 0 }],
    });
    expect(getAvailableSeats(full, [guest()])).toBe(0);
  });

  it('getUnseatedPartySize subtracts members already split onto other tables', () => {
    const g = guest(); // party of 3
    const t1 = table({ seats: [{ guestId: 'g1', attendeeIndex: 0 }, null, null, null] });
    const fm = map({ tables: [t1] });
    expect(getUnseatedPartySize('g1', fm, [g])).toBe(2);
    expect(getUnseatedPartySize('ghost', fm, [g])).toBe(0);
  });

  it('canSeatParty is true only with a free chair and a member still to seat', () => {
    const g = guest(); // party of 3
    const fm = map({ tables: [] });
    // empty table big enough for the whole party
    expect(canSeatParty(table({ capacity: 3 }), fm, [g], 'g1')).toBe(true);
    // a party of 3 never fits one free chair
    expect(canSeatParty(table({ capacity: 1 }), fm, [g], 'g1')).toBe(false);
    // table full
    const full = table({ capacity: 1, seats: [{ guestId: 'g2', attendeeIndex: 0 }] });
    expect(canSeatParty(full, map({ tables: [full] }), [g, guest({ id: 'g2', name: 'Eve' })], 'g1')).toBe(false);
    // a party seated elsewhere can still move whole to a table with room
    const seated = [
      table({ id: 'a', seats: [{ guestId: 'g1', attendeeIndex: 0 }, null, null, null] }),
      table({ id: 'b', seats: [{ guestId: 'g1', attendeeIndex: 1 }, null, null, null] }),
      table({ id: 'c', seats: [{ guestId: 'g1', attendeeIndex: 2 }, null, null, null] }),
    ];
    expect(canSeatParty(table({ id: 'd', capacity: 3 }), map({ tables: seated }), [g], 'g1')).toBe(true);
  });

  it("canSeatParty counts a party's own chairs when it moves within the room", () => {
    const g = guest();
    const t1 = table({ seats: [{ guestId: 'g1', attendeeIndex: 0 }, null, null, null] });
    const target = table({ id: 't2', capacity: 3 });
    const fm = map({ tables: [t1, target] });
    expect(getUnseatedPartySize('g1', fm, [g])).toBe(2);
    expect(canSeatParty(target, fm, [g], 'g1')).toBe(true);
    expect(canSeatParty(table({ id: 't3', capacity: 2 }), fm, [g], 'g1')).toBe(false);
  });

  it('seatAttendee moves a split party whole onto the dropped table', () => {
    const g = guest();
    const t1 = table({ seats: [{ guestId: 'g1', attendeeIndex: 0 }, null, null, null] });
    const t2 = table({ id: 't2', capacity: 4 });
    const out = seatAttendee(map({ tables: [t1, t2] }), [g], 'g1', 1, 't2', null);
    expect(out.placed).toBe(3);
    expect(getTableOccupiedSeats(out.map.tables[0], out.guests)).toBe(0);
    expect(getTableOccupiedSeats(out.map.tables[1], out.guests)).toBe(3);
  });
});

describe('getSeatingStats', () => {
  const fm = (tables: TableElement[]) => map({ tables });

  it('sums the confirmed party, the seated chairs and the table mix', () => {
    const guests = [
      guest({ id: 'g1', attending_party_size: 3, attendee_names: ['Alice', 'Bob', 'Cara'] }),
      guest({ id: 'g2', name: 'Dana', attending_party_size: 1, attendee_names: ['Dana'] }),
      guest({ id: 'g3', name: 'Eve', rsvp_status: 'Declined', attending_party_size: 0, attendee_names: [] }),
    ];
    const seating = fm([
      table({
        id: 'full', capacity: 2,
        seats: [{ guestId: 'g1', attendeeIndex: 0 }, { guestId: 'g1', attendeeIndex: 1 }],
      }),
      table({ id: 'empty', capacity: 4 }),
    ]);

    const stats = getSeatingStats(guests, seating);
    expect(stats.totalConfirmedGuests).toBe(4);
    expect(stats.totalSeatedGuests).toBe(2);
    expect(stats.seatingProgressPercent).toBe(50);
    expect(stats.fullTablesCount).toBe(1);
    expect(stats.emptyTablesCount).toBe(1);
    expect(stats.partialTablesCount).toBe(0);
    expect(stats.unassignedGuestsList.map((g) => g.id)).toEqual(['g1', 'g2']);
  });

  it('treats a missing floor map as nothing seated, at 0%', () => {
    const stats = getSeatingStats([guest()], null);
    expect(stats.totalSeatedGuests).toBe(0);
    expect(stats.seatingProgressPercent).toBe(0);
    expect(stats.fullTablesCount).toBe(0);
    expect(stats.unassignedGuestsList.map((g) => g.id)).toEqual(['g1']);
  });

  it('filters the unassigned list by name, email, code or a party member', () => {
    const guests = [
      guest({ id: 'g1', name: 'Alice', email: 'alice@x.com', code: '1234' }),
      guest({ id: 'g2', name: 'Dana', email: 'dana@x.com', code: '5678', attendee_names: ['Dana', 'Zoe'] }),
    ];
    expect(getSeatingStats(guests, null, 'dana').unassignedGuestsList.map((g) => g.id)).toEqual(['g2']);
    expect(getSeatingStats(guests, null, '5678').unassignedGuestsList.map((g) => g.id)).toEqual(['g2']);
    expect(getSeatingStats(guests, null, 'zoe').unassignedGuestsList.map((g) => g.id)).toEqual(['g2']);
    expect(getSeatingStats(guests, null, 'nobody').unassignedGuestsList).toEqual([]);
  });

  it('drops fully seated parties from the unassigned list', () => {
    const guests = [guest({ id: 'g1', attending_party_size: 1, attendee_names: ['Alice'] })];
    const seated = fm([table({ capacity: 2, seats: [{ guestId: 'g1', attendeeIndex: 0 }, null] })]);
    expect(getSeatingStats(guests, seated).unassignedGuestsList).toEqual([]);
  });
});
