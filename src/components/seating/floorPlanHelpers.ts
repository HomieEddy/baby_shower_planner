// Floor-plan geometry: chair positions, wall clamping, and nearest-chair
// hit-testing. Seat/occupancy logic and mutations live in lib/tableAssignment.

import { Guest, FloorMapData, TableElement } from '../../types';
import { getGuestPartySize, getTableSeats } from '../../lib/tableAssignment';
import { getPartyMembers } from '../../lib/guestAttendees';

// Nearest empty-or-any chair to a canvas point, for drag-and-drop hit-testing.
// Accounts for table rotation (which pivots on the table center), so drops land
// on the chair the user sees.
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
    const cx = table.x + table.width / 2;
    const cy = table.y + table.height / 2;
    const rad = ((table.rotation || 0) * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    for (let i = 0; i < capacity; i++) {
      const p = getSeatLocalPosition(table, i);
      const lx = p.x - table.width / 2;
      const ly = p.y - table.height / 2;
      const wx = cx + lx * cos - ly * sin;
      const wy = cy + lx * sin + ly * cos;
      const d = Math.hypot(x - wx, y - wy);
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

// The room wall is drawn inset by 10px (see venueShapes.renderRoomBoundary), so
// "inside the room" means inside that inset boundary.
const WALL_INSET = 10;

// Clamp a point inside the room wall. Rectangles clamp to the inset box;
// circles/ellipses project the point back onto the inset ellipse along the ray
// from the room centre (a circle is just an ellipse with equal semi-axes).
export const clampPointToRoom = (
  px: number,
  py: number,
  map: FloorMapData
): { x: number; y: number } => {
  const shape = map.roomShape ?? 'rectangle';
  const w = map.canvasWidth;
  const h = map.canvasHeight;

  if (shape === 'circle' || shape === 'ellipse') {
    const rx = Math.max(1, (shape === 'circle' ? Math.min(w, h) / 2 : w / 2) - WALL_INSET);
    const ry = Math.max(1, (shape === 'circle' ? Math.min(w, h) / 2 : h / 2) - WALL_INSET);
    const dx = px - w / 2;
    const dy = py - h / 2;
    const norm = Math.hypot(dx / rx, dy / ry);
    if (norm <= 1 || norm === 0) return { x: px, y: py };
    const k = 1 / norm;
    return { x: w / 2 + dx * k, y: h / 2 + dy * k };
  }

  return {
    x: Math.min(Math.max(px, WALL_INSET), w - WALL_INSET),
    y: Math.min(Math.max(py, WALL_INSET), h - WALL_INSET),
  };
};

// Clamp an element so its CENTER stays inside the room wall. Free-form placement
// may overhang the wall, but the center never leaves the room. Rotation pivots on
// the center, so the element size/rotation don't affect the constraint.
export const clampElementToRoom = (
  x: number,
  y: number,
  w: number,
  h: number,
  map: FloorMapData
): { x: number; y: number } => {
  const c = clampPointToRoom(x + w / 2, y + h / 2, map);
  return { x: c.x - w / 2, y: c.y - h / 2 };
};
