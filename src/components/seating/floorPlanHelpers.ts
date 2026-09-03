import { Guest, TableElement, FloorMapData } from '../../types';

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

export const getTableOccupiedSeats = (table: TableElement, guestsList: Guest[]): number => {
  return table.assignedGuestIds.reduce((sum, gId) => {
    const guest = guestsList.find((g) => g.id === gId);
    if (!guest) return sum;
    return sum + getGuestPartySize(guest);
  }, 0);
};

export const getTableSeatedPersonNames = (table: TableElement, guestsList: Guest[]): string[] => {
  const names: string[] = [];
  table.assignedGuestIds.forEach((gId) => {
    const guest = guestsList.find((g) => g.id === gId && g.rsvp_status === 'Attending');
    if (guest) {
      if (guest.attendee_names && guest.attendee_names.length > 0) {
        names.push(...guest.attendee_names);
      } else {
        names.push(guest.name);
      }
    }
  });
  return names;
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

// Seat index of a specific attendee (primary guest = first seat of the party).
// Matches getSeatOccupantInfo ordering: only Attending guests occupy seats.
export const getAttendeeSeatIndex = (
  table: TableElement,
  guestId: string,
  attendeeName: string | null,
  guestsList: Guest[]
): number | null => {
  let seatPointer = 0;
  for (const gId of table.assignedGuestIds) {
    const guest = guestsList.find((g) => g.id === gId && g.rsvp_status === 'Attending');
    if (!guest) continue;
    const pSize = getGuestPartySize(guest);
    if (gId === guestId) {
      if (attendeeName === null) return seatPointer;
      const names =
        guest.attendee_names && guest.attendee_names.length > 0
          ? guest.attendee_names
          : [guest.name];
      const idx = names.indexOf(attendeeName);
      return idx >= 0 ? seatPointer + idx : null;
    }
    seatPointer += pSize;
  }
  return null;
};

export const getSeatOccupantInfo = (
  table: TableElement,
  seatIndex: number,
  guestsList: Guest[]
): SeatOccupantInfo => {
  let seatPointer = 0;

  for (const gId of table.assignedGuestIds) {
    const guest = guestsList.find((g) => g.id === gId && g.rsvp_status === 'Attending');
    if (!guest) continue;

    const pSize = getGuestPartySize(guest);
    if (seatIndex >= seatPointer && seatIndex < seatPointer + pSize) {
      const idxInParty = seatIndex - seatPointer;
      const names = (guest.attendee_names && guest.attendee_names.length > 0)
        ? guest.attendee_names
        : [guest.name];

      let attendeeName = names[idxInParty];
      if (!attendeeName || !attendeeName.trim()) {
        attendeeName = idxInParty === 0 ? guest.name : `${guest.name} (Guest #${idxInParty + 1})`;
      }

      const partyName = guest.name ? `${guest.name}'s Party` : 'Guest Party';

      return {
        attendeeName,
        partyName,
        mainGuestName: guest.name,
        guestCode: guest.code,
        partySize: pSize,
        isOccupied: true,
      };
    }

    seatPointer += pSize;
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
  map: FloorMapData
): { x: number; y: number } => {
  if ((map.roomShape ?? 'rectangle') !== 'circle' && map.roomShape !== 'ellipse') return { x, y };
  const cx = map.canvasWidth / 2;
  const cy = map.canvasHeight / 2;
  const elemR = Math.hypot(w, h) / 2 + 18;
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
