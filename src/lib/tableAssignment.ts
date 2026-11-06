// Table Assignment: the pure seat model and seat mutations. One implementation
// shared by the host editor, the host page and the server, so the invariant
//   seats  ⇄  assignedGuestIds  ⇄  Guest.table_id
// lives in exactly one place. Pure module: no React, no PocketBase. Geometry
// (chair positions, wall clamping) stays in components/seating/floorPlanHelpers.

import { FloorMapData, Guest, SeatOccupant, TableElement } from '../types';
import { getPartyMembers, isAttending } from './guestAttendees';
import { DomainError } from './errors';

export const getGuestPartySize = (guest: Guest): number => {
  if (!guest) return 1;
  const namesCount = guest.attendee_names ? guest.attendee_names.length : 0;
  const detailsCount = guest.attendee_details ? guest.attendee_details.length : 0;
  const attendingCount = guest.attending_party_size || 0;
  const maxCount = guest.max_party_size || 1;

  if (isAttending(guest)) {
    return Math.max(namesCount, detailsCount, attendingCount, 1);
  }
  return Math.max(namesCount, detailsCount, attendingCount, maxCount, 1);
};

// Normalized chair layout for a table, always `capacity` long. New tables carry
// explicit `seats`; legacy tables (assignedGuestIds only) are expanded in party
// order, primary first. All seat/occupancy reads go through this.
export const getTableSeats = (
  table: TableElement,
  guestsList: Guest[]
): (SeatOccupant | null)[] => {
  const capacity = Math.max(1, table.capacity || 8);
  if (table.seats) {
    const out = table.seats.slice(0, capacity);
    while (out.length < capacity) out.push(null);
    return out;
  }
  const out: (SeatOccupant | null)[] = new Array(capacity).fill(null);
  let cursor = 0;
  for (const gId of table.assignedGuestIds || []) {
    const guest = guestsList.find((g) => g.id === gId && isAttending(g));
    if (!guest) continue;
    const size = getGuestPartySize(guest);
    for (let i = 0; i < size && cursor < capacity; i++) {
      out[cursor++] = { guestId: gId, attendeeIndex: i };
    }
  }
  return out;
};

// Unique guest ids present in a chair layout, in seat order (legacy mirror).
export const rebuildAssignedGuestIds = (seats: (SeatOccupant | null)[]): string[] => {
  const ids: string[] = [];
  for (const s of seats) {
    if (s && !ids.includes(s.guestId)) ids.push(s.guestId);
  }
  return ids;
};

// Materialize explicit seats + the derived assignedGuestIds in one step.
export const materializeTableSeats = (table: TableElement, guestsList: Guest[]): TableElement => {
  const seats = getTableSeats(table, guestsList);
  return { ...table, seats, assignedGuestIds: rebuildAssignedGuestIds(seats) };
};

export const getTableOccupiedSeats = (table: TableElement, guestsList: Guest[]): number => {
  return getTableSeats(table, guestsList).filter((s) => s !== null).length;
};

// Free chairs at a table. The one number every seating surface highlights on.
export const getAvailableSeats = (table: TableElement, guestsList: Guest[]): number =>
  Math.max(0, Math.max(1, table.capacity || 8) - getTableOccupiedSeats(table, guestsList));

export const getTableSeatedPersonNames = (table: TableElement, guestsList: Guest[]): string[] => {
  const names: string[] = [];
  for (const seat of getTableSeats(table, guestsList)) {
    if (!seat) continue;
    const guest = guestsList.find((g) => g.id === seat.guestId);
    if (!guest) continue;
    const party = getPartyMembers(guest);
    names.push(party[seat.attendeeIndex] ?? guest.name);
  }
  return names;
};

// Every chair a guest's party occupies (an attendee index may only exist once).
export interface AttendeeLocation {
  tableId: string;
  tableName: string;
  seatIndex: number;
  attendeeIndex: number;
}

export const getAttendeeLocations = (
  guestId: string,
  floorMap: FloorMapData | null,
  guestsList: Guest[]
): AttendeeLocation[] => {
  if (!floorMap) return [];
  const out: AttendeeLocation[] = [];
  for (const table of floorMap.tables) {
    const seats = getTableSeats(table, guestsList);
    for (let i = 0; i < seats.length; i++) {
      const seat = seats[i];
      if (seat?.guestId === guestId) {
        out.push({ tableId: table.id, tableName: table.name, seatIndex: i, attendeeIndex: seat.attendeeIndex });
      }
    }
  }
  return out;
};

export const getGuestSeatedCount = (
  guestId: string,
  floorMap: FloorMapData | null,
  guestsList: Guest[]
): number => getAttendeeLocations(guestId, floorMap, guestsList).length;

// Members of a party still without a chair (split-aware): the count a highlight
// is actually gated on, not the full party size.
export const getUnseatedPartySize = (
  guestId: string,
  floorMap: FloorMapData | null,
  guestsList: Guest[]
): number => {
  const guest = guestsList.find((g) => g.id === guestId);
  if (!guest) return 0;
  return Math.max(0, getGuestPartySize(guest) - getGuestSeatedCount(guestId, floorMap, guestsList));
};

// Ids of the tables holding any chair of this party, in table order. A party is
// legal on at most one table, so a length above 1 means a legacy split.
export const getPartyTableIds = (
  guestId: string,
  tables: TableElement[],
  guestsList: Guest[]
): string[] =>
  tables
    .filter((t) => getTableSeats(t, guestsList).some((s) => s?.guestId === guestId))
    .map((t) => t.id);

// Whole-party eligibility: the party can sit at `table` as one group. Its own
// chairs there count as free (they are re-seated together), so a party can also
// move whole from another table. There must be room for every member. This is
// the single fit rule every seating surface and seatParty share.
export const canSeatParty = (
  table: TableElement,
  floorMap: FloorMapData | null,
  guestsList: Guest[],
  guestId: string
): boolean => {
  const guest = guestsList.find((g) => g.id === guestId);
  if (!guest || !floorMap) return false;
  const ownChairsHere = getTableSeats(table, guestsList).filter((s) => s?.guestId === guestId).length;
  return getAvailableSeats(table, guestsList) + ownChairsHere >= getGuestPartySize(guest);
};

// Exact chair for one attendee (attendeeIndex into getPartyMembers), across tables.
export const getAttendeeSeatLocation = (
  guestId: string,
  attendeeIndex: number,
  floorMap: FloorMapData | null,
  guestsList: Guest[]
): { table: TableElement; seatIndex: number } | null => {
  if (!floorMap) return null;
  for (const table of floorMap.tables) {
    const idx = getTableSeats(table, guestsList).findIndex(
      (s) => s?.guestId === guestId && s.attendeeIndex === attendeeIndex
    );
    if (idx !== -1) return { table, seatIndex: idx };
  }
  return null;
};

// Refresh the legacy scalar `table_id` mirror after a seat edit: the table
// holding the party lead (attendee 0), else the first table the party touches.
export const syncGuestTableIds = (tables: TableElement[], guestsList: Guest[]): Guest[] =>
  guestsList.map((g) => {
    let primary: string | undefined;
    let any: string | undefined;
    for (const table of tables) {
      for (const seat of getTableSeats(table, guestsList)) {
        if (seat?.guestId !== g.id) continue;
        if (!any) any = table.id;
        if (seat.attendeeIndex === 0) {
          primary = table.id;
          break;
        }
      }
      if (primary) break;
    }
    return { ...g, table_id: primary || any };
  });

// Server-side guard (shared with the client so both agree on what is legal):
// a seat must name a real, attending guest, an in-range attendee, appear at
// most once, and never exceed a table's capacity. Throws a typed Error.
export const validateTables = (tables: TableElement[], guestsList: Guest[]): void => {
  const seen = new Set<string>();
  for (const table of tables) {
    const capacity = Math.max(1, table.capacity || 8);
    if (table.seats && table.seats.filter(Boolean).length > capacity) {
      throw new DomainError('TABLE_OVER_CAPACITY');
    }
    for (const seat of getTableSeats(table, guestsList)) {
      if (!seat) continue;
      const guest = guestsList.find((g) => g.id === seat.guestId);
      if (!guest) throw new DomainError('SEAT_UNKNOWN_GUEST');
      if (!isAttending(guest)) throw new DomainError('SEAT_GUEST_NOT_ATTENDING');
      const size = getGuestPartySize(guest);
      if (!Number.isInteger(seat.attendeeIndex) || seat.attendeeIndex < 0 || seat.attendeeIndex >= size) {
        throw new DomainError('SEAT_INDEX_OUT_OF_RANGE');
      }
      const key = `${seat.guestId}:${seat.attendeeIndex}`;
      if (seen.has(key)) throw new DomainError('SEAT_DUPLICATE_ATTENDEE');
      seen.add(key);
    }
  }
};

// Seat index of a specific attendee (primary guest = their attendeeIndex 0 seat).
export const getAttendeeSeatIndex = (
  table: TableElement,
  guestId: string,
  attendeeName: string | null,
  guestsList: Guest[]
): number | null => {
  const guest = guestsList.find((g) => g.id === guestId);
  if (!guest) return null;
  const names = getPartyMembers(guest);
  const seats = getTableSeats(table, guestsList);
  for (let i = 0; i < seats.length; i++) {
    const seat = seats[i];
    if (!seat || seat.guestId !== guestId) continue;
    if (attendeeName === null) {
      if (seat.attendeeIndex === 0) return i;
      continue;
    }
    const name = names[seat.attendeeIndex] ?? (seat.attendeeIndex === 0 ? guest.name : null);
    if (name && name.trim().toLowerCase() === attendeeName.trim().toLowerCase()) return i;
  }
  return null;
};

export const getTableStatus = (table: TableElement, guestsList: Guest[]): 'full' | 'partial' | 'empty' => {
  const occupied = getTableOccupiedSeats(table, guestsList);
  if (occupied >= table.capacity) return 'full';
  if (occupied > 0) return 'partial';
  return 'empty';
};

// The host view's read model: how much of the confirmed party is seated, the
// table mix, and the parties still missing chairs (optionally filtered by the
// unassigned-list search). Pure, so the header numbers are testable on their
// own instead of only through the page.
export interface SeatingStats {
  totalConfirmedGuests: number;
  totalSeatedGuests: number;
  seatingProgressPercent: number;
  emptyTablesCount: number;
  partialTablesCount: number;
  fullTablesCount: number;
  unassignedGuestsList: Guest[];
}

export function getSeatingStats(
  guestsList: Guest[],
  floorMap: FloorMapData | null,
  unassignedQuery = ''
): SeatingStats {
  const totalConfirmedGuests = guestsList
    .filter(isAttending)
    .reduce((sum, g) => sum + getGuestPartySize(g), 0);

  const totalSeatedGuests = floorMap
    ? floorMap.tables.reduce((sum, tbl) => sum + getTableOccupiedSeats(tbl, guestsList), 0)
    : 0;

  const seatingProgressPercent = totalConfirmedGuests > 0
    ? Math.min(100, Math.round((totalSeatedGuests / totalConfirmedGuests) * 100))
    : 0;

  const tablesWithStatus = (status: 'empty' | 'partial' | 'full') =>
    floorMap ? floorMap.tables.filter((t) => getTableStatus(t, guestsList) === status).length : 0;

  const unassignedGuestsList = guestsList.filter((g) => {
    if (!isAttending(g)) return false;
    const fullySeated = floorMap ? getGuestSeatedCount(g.id, floorMap, guestsList) >= getGuestPartySize(g) : false;
    if (fullySeated) return false;

    const q = unassignedQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      g.name.toLowerCase().includes(q) ||
      g.email.toLowerCase().includes(q) ||
      (g.code ? g.code.toLowerCase().includes(q) : false) ||
      !!g.attendee_names?.some((a) => a.toLowerCase().includes(q))
    );
  });

  return {
    totalConfirmedGuests,
    totalSeatedGuests,
    seatingProgressPercent,
    emptyTablesCount: tablesWithStatus('empty'),
    partialTablesCount: tablesWithStatus('partial'),
    fullTablesCount: tablesWithStatus('full'),
    unassignedGuestsList,
  };
}

// ---------------------------------------------------------------------------
// Seat mutations.
//
// Every edit returns fresh tables + guests (the `table_id` mirror re-synced)
// plus how many party members landed. `unplaced` is data, not an error: a party
// that doesn't fit free chairs is the split. Validation is deliberately NOT run
// per edit — the save boundary (db/floorMap.updateFloorMap) is the single guard.
// ---------------------------------------------------------------------------

export interface SeatingOutcome {
  map: FloorMapData;
  guests: Guest[];
  placed: number;
  unplaced: number;
}

const seatsByTableId = (
  tables: TableElement[],
  guests: Guest[]
): Map<string, (SeatOccupant | null)[]> => {
  const out = new Map<string, (SeatOccupant | null)[]>();
  for (const t of tables) out.set(t.id, getTableSeats(t, guests));
  return out;
};

// Write every table back with explicit `seats` + the derived mirror, and re-sync
// Guest.table_id in the same pass.
const commit = (
  map: FloorMapData,
  guests: Guest[],
  seats: Map<string, (SeatOccupant | null)[]>
): { map: FloorMapData; guests: Guest[] } => {
  const tables = map.tables.map((t) => {
    const tableSeats = seats.get(t.id)!;
    return { ...t, seats: tableSeats, assignedGuestIds: rebuildAssignedGuestIds(tableSeats) };
  });
  return { map: { ...map, tables }, guests: syncGuestTableIds(tables, guests) };
};

// A single member's drag or click acts on the whole party: the party is seated
// (or moved) as one unit at `table`, in party order. The chair index is accepted
// for call-site compatibility but ignored, so no one is ever seated alone.
export function seatAttendee(
  map: FloorMapData,
  guests: Guest[],
  guestId: string,
  _attendeeIndex: number,
  tableId: string,
  _seatIndex: number | null
): SeatingOutcome {
  return seatParty(map, guests, guestId, tableId);
}

// Seat the whole party at one table, in party order, or change nothing. A party
// already seated elsewhere moves as one unit: its old chairs are freed in the
// same step. Refused (placed 0, unplaced = party size) when it does not fit.
// `tableId === null` clears the whole party.
export function seatParty(
  map: FloorMapData,
  guests: Guest[],
  guestId: string,
  tableId: string | null
): SeatingOutcome {
  const guest = guests.find((g) => g.id === guestId);
  if (!guest) return { map, guests, placed: 0, unplaced: 0 };
  if (tableId === null) return unassignParty(map, guests, guestId);

  const size = getGuestPartySize(guest);
  const target = map.tables.find((t) => t.id === tableId);
  if (!target || !canSeatParty(target, map, guests, guestId)) {
    return { map, guests, placed: 0, unplaced: size };
  }

  const seats = seatsByTableId(map.tables, guests);
  const targetSeats = seats.get(tableId)!;
  const alreadyWhole = targetSeats.filter((s) => s?.guestId === guestId).length === size;
  if (alreadyWhole) return { map, guests, placed: 0, unplaced: 0 };

  // Free every chair the party holds, on any table, then seat it whole here.
  for (const tableSeats of seats.values()) {
    for (let i = 0; i < tableSeats.length; i++) {
      if (tableSeats[i]?.guestId === guestId) tableSeats[i] = null;
    }
  }
  let next = 0;
  for (let i = 0; i < targetSeats.length && next < size; i++) {
    if (!targetSeats[i]) {
      targetSeats[i] = { guestId, attendeeIndex: next++ };
    }
  }

  return { ...commit(map, guests, seats), placed: size, unplaced: 0 };
}

// Removing any one chair removes its whole party, from every table, in one step.
export function unseatAttendee(
  map: FloorMapData,
  guests: Guest[],
  tableId: string,
  seatIndex: number
): SeatingOutcome {
  const tableSeats = seatsByTableId(map.tables, guests).get(tableId);
  const occupant = tableSeats && seatIndex >= 0 && seatIndex < tableSeats.length ? tableSeats[seatIndex] : null;
  if (!occupant) return { map, guests, placed: 0, unplaced: 0 };
  return unassignParty(map, guests, occupant.guestId);
}

// Move one seated attendee to another chair at the SAME table. An empty target
// takes the occupant (their old chair frees up); an occupied target swaps the
// two occupants. Only this table's chairs change, so the party stays together
// and Guest.table_id is untouched. Refused (nothing changes) for an empty or
// out-of-range source, and for a move onto the same chair.
export function moveSeat(
  map: FloorMapData,
  guests: Guest[],
  tableId: string,
  fromSeatIndex: number,
  toSeatIndex: number
): SeatingOutcome {
  const unchanged = { map, guests, placed: 0, unplaced: 0 };
  const seats = seatsByTableId(map.tables, guests);
  const tableSeats = seats.get(tableId);
  if (!tableSeats || fromSeatIndex === toSeatIndex) return unchanged;
  const inRange = (i: number) => Number.isInteger(i) && i >= 0 && i < tableSeats.length;
  if (!inRange(fromSeatIndex) || !inRange(toSeatIndex)) return unchanged;
  if (!tableSeats[fromSeatIndex]) return unchanged;

  [tableSeats[fromSeatIndex], tableSeats[toSeatIndex]] = [tableSeats[toSeatIndex], tableSeats[fromSeatIndex]];
  return { ...commit(map, guests, seats), placed: 0, unplaced: 0 };
}

export function unassignParty(
  map: FloorMapData,
  guests: Guest[],
  guestId: string
): SeatingOutcome {
  const seats = seatsByTableId(map.tables, guests);
  for (const tableSeats of seats.values()) {
    for (let i = 0; i < tableSeats.length; i++) {
      if (tableSeats[i]?.guestId === guestId) tableSeats[i] = null;
    }
  }
  return { ...commit(map, guests, seats), placed: 0, unplaced: 0 };
}

// Server-side trim (guest declines, is deleted, or shrinks their party): drop
// every attendee at index >= keep. Takes no guest list — stored tables already
// carry explicit seats once written by this module; a legacy table
// (assignedGuestIds only) is filtered without expansion.
export function trimPartySeats(
  tables: TableElement[],
  guestId: string,
  keepAttendees = 0
): TableElement[] {
  const keep = Math.max(0, keepAttendees);
  return tables.map((t) => {
    if (Array.isArray(t.seats)) {
      const seats = t.seats.map((s) =>
        s && s.guestId === guestId && s.attendeeIndex >= keep ? null : s
      );
      return { ...t, seats, assignedGuestIds: rebuildAssignedGuestIds(seats) };
    }
    return { ...t, assignedGuestIds: (t.assignedGuestIds || []).filter((id) => id !== guestId) };
  });
}

// Remove one attendee (by index) from a party's seats in every table. Higher
// attendee indices shift down so they keep pointing at the same people. Legacy
// tables (assignedGuestIds only) drop the whole party, like trimPartySeats.
export function removePartyAttendee(
  tables: TableElement[],
  guestId: string,
  removedIndex: number
): TableElement[] {
  return tables.map((t) => {
    if (Array.isArray(t.seats)) {
      const seats = t.seats.map((s) => {
        if (!s || s.guestId !== guestId) return s;
        if (s.attendeeIndex === removedIndex) return null;
        return s.attendeeIndex > removedIndex ? { ...s, attendeeIndex: s.attendeeIndex - 1 } : s;
      });
      return { ...t, seats, assignedGuestIds: rebuildAssignedGuestIds(seats) };
    }
    return { ...t, assignedGuestIds: (t.assignedGuestIds || []).filter((id) => id !== guestId) };
  });
}
