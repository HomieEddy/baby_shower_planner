// Floor-plan geometry: chair positions, wall clamping, and nearest-chair
// hit-testing. Seat/occupancy logic and mutations live in lib/tableAssignment.

import { Guest, FloorMapData, TableElement } from '../../types';
import { getGuestPartySize, getTableSeats } from '../../lib/tableAssignment';
import { getPartyMembers } from '../../lib/guestAttendees';

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

// Every chair center around a table, in seat order. The single geometry the
// editor, host page and guest modal all draw from.
export const seatRingPositions = (table: TableElement): { x: number; y: number }[] => {
  const capacity = Math.max(1, table.capacity || 8);
  return Array.from({ length: capacity }, (_, i) => getSeatLocalPosition(table, i));
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
