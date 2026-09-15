// Floor-plan geometry: chair positions, wall clamping, and nearest-chair
// hit-testing. Seat/occupancy logic and mutations live in lib/tableAssignment.

import { Guest, FloorMapData, TableElement } from '../../types';
import { getGuestPartySize, getTableOccupiedSeats, getTableSeatedPersonNames, getTableSeats } from '../../lib/tableAssignment';
import { getPartyMembers } from '../../lib/guestAttendees';
import type { Translations } from '../../translations';

// Whole-map wall clamp: in a round room every table and landmark is pulled
// back inside the wall. Returns the same object when nothing moved, so React
// state updates stay no-ops. The per-element math is clampToRoundRoom below.
export const applyRoomClamp = (map: FloorMapData): FloorMapData => {
  if ((map.roomShape ?? 'rectangle') !== 'circle' && map.roomShape !== 'ellipse') return map;
  return {
    ...map,
    tables: map.tables.map((t) => {
      const p = clampToRoundRoom(t.x, t.y, t.width, t.height, map);
      return p.x === t.x && p.y === t.y ? t : { ...t, x: Math.round(p.x), y: Math.round(p.y) };
    }),
    landmarks: map.landmarks.map((l) => {
      const p = clampToRoundRoom(l.x, l.y, l.width, l.height, map, true);
      return p.x === l.x && p.y === l.y ? l : { ...l, x: Math.round(p.x), y: Math.round(p.y) };
    }),
  };
};

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
  // The stored name for this chair, when the party has one. Composing a
  // fallback label is the presenter's job — this stays data.
  attendeeName: string | null;
  attendeeIndex: number | null;
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
    const stored = getPartyMembers(guest)[seat.attendeeIndex];
    return {
      attendeeName: stored?.trim() ? stored : null,
      attendeeIndex: seat.attendeeIndex,
      partyName: guest.name || null,
      mainGuestName: guest.name || null,
      guestCode: guest.code,
      partySize: getGuestPartySize(guest),
      isOccupied: true,
    };
  }

  return {
    attendeeName: null,
    attendeeIndex: null,
    partyName: null,
    mainGuestName: null,
    guestCode: null,
    partySize: 0,
    isOccupied: false,
  };
};

// ─── Hover tooltips ────────────────────────────────────────────────────────
// Tooltip content is content: built here (so the wording is localized and
// testable) and only positioned by the page. One shape for every hover.

export interface HoverTooltipContent {
  title: string;
  subtitle: string;
  details: string[];
}

type Translate = (key: keyof Translations, vars?: Record<string, string | number>) => string;

export function tableTooltipContent(
  table: TableElement,
  guestsList: Guest[],
  t: Translations,
  tf: Translate
): HoverTooltipContent {
  const occupied = getTableOccupiedSeats(table, guestsList);
  const names = getTableSeatedPersonNames(table, guestsList);
  const shape = table.shape === 'circle' ? t.roundTableBtn : t.rectTableBtn;
  return {
    title: table.name,
    subtitle: `${shape} • ${occupied}/${table.capacity} ${t.seatsLabel}`,
    details: [
      tf('fpTooltipSeated', {
        count: names.length,
        names: names.length > 0 ? names.join(', ') : t.fpTooltipNoGuests,
      }),
      tf('fpTooltipCapacity', { capacity: table.capacity, available: Math.max(0, table.capacity - occupied) }),
    ],
  };
}

export function seatTooltipContent(
  table: TableElement,
  seatIndex: number,
  guestsList: Guest[],
  t: Translations,
  tf: Translate
): HoverTooltipContent {
  const info = getSeatOccupantInfo(table, seatIndex, guestsList);

  if (!info.isOccupied) {
    return {
      title: tf('fpTooltipSeatLabel', { seat: seatIndex + 1, table: table.name }),
      subtitle: t.fpTooltipSeatAvailable,
      details: [
        tf('fpTooltipCapacity', { capacity: table.capacity, available: table.capacity }),
        t.fpTooltipSeatFree,
      ],
    };
  }

  // A stored name wins; the lead falls back to their own name, an unnamed
  // extra member to a numbered label.
  const index = info.attendeeIndex ?? 0;
  const attendee =
    info.attendeeName ??
    (index === 0
      ? info.mainGuestName ?? t.fpTooltipAssignedGuest
      : tf('fpTooltipGuestNumber', { name: info.mainGuestName ?? '', index: index + 1 }));

  const details = [tf('fpTooltipSeatAt', { seat: seatIndex + 1, table: table.name })];
  if (info.mainGuestName && info.attendeeName && info.attendeeName !== info.mainGuestName) {
    details.push(tf('fpTooltipPrimaryHost', { name: info.mainGuestName }));
  }
  if (info.guestCode) details.push(tf('fpTooltipReservationCode', { code: info.guestCode }));
  details.push(tf('partyOfLabel', { count: info.partySize }));

  return {
    title: attendee,
    subtitle: tf('fpTooltipParty', { name: info.partyName ?? t.fpTooltipGuestParty }),
    details,
  };
}

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
