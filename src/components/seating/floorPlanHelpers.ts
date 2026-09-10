import { Guest, TableElement, FloorMapData, SeatOccupant } from '../../types';
import { getPartyMembers } from '../../lib/guestAttendees';

export const getGuestPartySize = (guest: Guest): number => {
  if (!guest) return 1;
  const namesCount = guest.attendee_names ? guest.attendee_names.length : 0;
  const detailsCount = guest.attendee_details ? guest.attendee_details.length : 0;
  const attendingCount = guest.attending_party_size || 0;
  const maxCount = guest.max_party_size || 1;

  if (guest.rsvp_status === 'Attending') {
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
    const guest = guestsList.find((g) => g.id === gId && g.rsvp_status === 'Attending');
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
      if (seats[i]?.guestId === guestId) {
        out.push({ tableId: table.id, tableName: table.name, seatIndex: i });
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

// Nearest empty-or-any chair to a canvas point, for drag-and-drop hit-testing.
export const findNearestSeat = (
  floorMap: FloorMapData,
  x: number,
  y: number,
  maxDistance = 26
): { tableId: string; seatIndex: number } | null => {
  let best: { tableId: string; seatIndex: number } | null = null;
  let bestDist = maxDistance;
  for (const table of floorMap.tables) {
    const capacity = table.capacity || 8;
    for (let i = 0; i < capacity; i++) {
      const p = getSeatLocalPosition(table, i);
      const d = Math.hypot(x - (table.x + p.x), y - (table.y + p.y));
      if (d < bestDist) {
        bestDist = d;
        best = { tableId: table.id, seatIndex: i };
      }
    }
  }
  return best;
};

// Server-side guard (shared with the client so both agree on what is legal):
// a seat must name a real, attending guest, an in-range attendee, appear at
// most once, and never exceed a table's capacity. Throws a typed Error.
export const validateTables = (tables: TableElement[], guestsList: Guest[]): void => {
  const seen = new Set<string>();
  for (const table of tables) {
    const capacity = Math.max(1, table.capacity || 8);
    if (table.seats && table.seats.filter(Boolean).length > capacity) {
      throw new Error('TABLE_OVER_CAPACITY');
    }
    for (const seat of getTableSeats(table, guestsList)) {
      if (!seat) continue;
      const guest = guestsList.find((g) => g.id === seat.guestId);
      if (!guest) throw new Error('SEAT_UNKNOWN_GUEST');
      if (guest.rsvp_status !== 'Attending') throw new Error('SEAT_GUEST_NOT_ATTENDING');
      const size = getGuestPartySize(guest);
      if (!Number.isInteger(seat.attendeeIndex) || seat.attendeeIndex < 0 || seat.attendeeIndex >= size) {
        throw new Error('SEAT_INDEX_OUT_OF_RANGE');
      }
      const key = `${seat.guestId}:${seat.attendeeIndex}`;
      if (seen.has(key)) throw new Error('SEAT_DUPLICATE_ATTENDEE');
      seen.add(key);
    }
  }
};

export interface SeatOccupantInfo {
  attendeeName: string | null;
  partyName: string | null;
  mainGuestName: string | null;
  guestCode: string | null;
  partySize: number;
  isOccupied: boolean;
}

// Seat layout (local coords within the table) — mirrors the host editor's
// FloorPlanPage rendering: ellipse around the table bounding box, 18px out,
// radius-8 dots starting at 3 o'clock, clockwise. Returns the seat CENTER.
export const getSeatLocalPosition = (
  table: TableElement,
  seatIndex: number
): { x: number; y: number } => {
  const capacity = table.capacity || 8;
  const angle = (seatIndex / capacity) * 2 * Math.PI;
  const radiusX = table.width / 2 + 18;
  const radiusY = table.height / 2 + 18;
  return {
    x: table.width / 2 + radiusX * Math.cos(angle),
    y: table.height / 2 + radiusY * Math.sin(angle),
  };
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

export const getSeatOccupantInfo = (
  table: TableElement,
  seatIndex: number,
  guestsList: Guest[]
): SeatOccupantInfo => {
  const seat = getTableSeats(table, guestsList)[seatIndex];
  const guest = seat ? guestsList.find((g) => g.id === seat.guestId) : undefined;

  if (seat && guest) {
    const pSize = getGuestPartySize(guest);
    const names = getPartyMembers(guest);
    let attendeeName = names[seat.attendeeIndex];
    if (!attendeeName || !attendeeName.trim()) {
      attendeeName = seat.attendeeIndex === 0 ? guest.name : `${guest.name} (Guest #${seat.attendeeIndex + 1})`;
    }

    return {
      attendeeName,
      partyName: guest.name ? `${guest.name}'s Party` : 'Guest Party',
      mainGuestName: guest.name,
      guestCode: guest.code,
      partySize: pSize,
      isOccupied: true,
    };
  }

  return {
    attendeeName: null,
    partyName: null,
    mainGuestName: null,
    guestCode: null,
    partySize: 0,
    isOccupied: false,
  };
};

export const getTableStatus = (table: TableElement, guestsList: Guest[]): 'full' | 'partial' | 'empty' => {
  const occupied = getTableOccupiedSeats(table, guestsList);
  if (occupied >= table.capacity) return 'full';
  if (occupied > 0) return 'partial';
  return 'empty';
};

// Wall-clamp for round rooms: keeps the whole element inside the circular/elliptical
// boundary. An ellipse degenerates to a circle when both semi-axes match, so one
// formula covers both — project the element center onto the inner ellipse along the
// ray from the room centre. `+18` accounts for the seat ring / drop shadow.
export const clampToRoundRoom = (
  x: number,
  y: number,
  w: number,
  h: number,
  map: FloorMapData,
  isLandmark = false
): { x: number; y: number } => {
  if ((map.roomShape ?? 'rectangle') !== 'circle' && map.roomShape !== 'ellipse') return { x, y };
  const cx = map.canvasWidth / 2;
  const cy = map.canvasHeight / 2;
  // Tables keep a seat-ring margin (+18); landmarks sit flush against the wall,
  // so they use only their thinnest half-extent instead of the full half-diagonal.
  const elemR = isLandmark ? Math.min(w, h) / 2 : Math.hypot(w, h) / 2 + 18;
  let ax: number;
  let ay: number;
  if (map.roomShape === 'circle') {
    const roomR = Math.min(map.canvasWidth, map.canvasHeight) / 2 - 10;
    ax = Math.max(0, roomR - elemR);
    ay = ax;
  } else {
    ax = Math.max(0, map.canvasWidth / 2 - 10 - elemR);
    ay = Math.max(0, map.canvasHeight / 2 - 10 - elemR);
  }
  const dx = x + w / 2 - cx;
  const dy = y + h / 2 - cy;
  const norm = Math.hypot(dx / ax, dy / ay);
  if (norm <= 1 || norm === 0) return { x, y };
  const ratio = 1 / norm;
  return { x: cx + dx * ratio - w / 2, y: cy + dy * ratio - h / 2 };
};
