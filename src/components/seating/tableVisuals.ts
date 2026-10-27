// The canvas' visual decisions, as data. The editor used to derive these inline
// while rendering Konva nodes, so the rules (which highlight wins, what a full
// table looks like) could only be checked by looking at a canvas. Pure module:
// no React, no Konva — the canvas maps the result onto its nodes.

export interface TableOutline {
  stroke: string;
  strokeWidth: number;
  dash?: number[];
  shadowColor: string;
  shadowBlur: number;
}

// Precedence: a party picked for seating owns the outline (green when it fits,
// dashed red when it does not), then the selection, then a full table, then the
// resting outline.
export function tableOutline(opts: {
  isSelected: boolean;
  isFull: boolean;
  partyFocused: boolean;
  partyFits: boolean;
}): TableOutline {
  const { isSelected, isFull, partyFocused, partyFits } = opts;

  let stroke: string;
  let strokeWidth: number;
  let dash: number[] | undefined;

  if (partyFocused) {
    // Green when the picked party fits here, dashed red when it does not.
    stroke = partyFits ? '#10B981' : '#EF4444';
    strokeWidth = partyFits ? 5 : 2;
    dash = partyFits ? undefined : [4, 4];
  } else {
    stroke = isSelected ? '#4A3F35' : isFull ? '#10B981' : '#CBAE94';
    strokeWidth = isSelected ? 4 : 2;
  }

  return {
    stroke,
    strokeWidth,
    dash,
    shadowColor: partyFocused && partyFits ? '#10B981' : '#8B735B',
    shadowBlur: isSelected || (partyFocused && partyFits) ? 12 : 4,
  };
}

export interface SeatVisual {
  fill: string;
  stroke: string;
  radius: number;
}

// Precedence: a live drop target, then the picked chair, then every free chair
// while a member is picked, then occupied/empty at rest.
// Empty-chair colors come from the active theme; the defaults match the stock palette.
export interface SeatPalette {
  surface: string;
  accent: string;
}

const DEFAULT_SEAT_PALETTE: SeatPalette = { surface: '#FFFDF9', accent: '#CBAE94' };

export function seatVisual(opts: {
  occupied: boolean;
  isDropTarget: boolean;
  isPicked: boolean;
  pickMode: boolean;
  palette?: SeatPalette;
}): SeatVisual {
  const { occupied, isDropTarget, isPicked, pickMode, palette = DEFAULT_SEAT_PALETTE } = opts;

  if (isDropTarget) return { fill: '#A7F3D0', stroke: '#059669', radius: 10 };
  if (isPicked) return { fill: '#FDE68A', stroke: '#D97706', radius: 8 };
  if (pickMode && !occupied) return { fill: '#D1FAE5', stroke: '#059669', radius: 8 };
  return {
    fill: occupied ? '#8B735B' : palette.surface,
    stroke: palette.accent,
    radius: 8,
  };
}

// Up to two letters for a chair label: "Marie-Claire Tremblay" -> "MT", "Alice" -> "AL".
export function guestInitials(name: string): string {
  const parts = name.trim().split(/[\s-]+/).filter(Boolean);
  if (parts.length === 0) return '';
  const first = Array.from(parts[0])[0] ?? '';
  const last = parts.length > 1 ? Array.from(parts[parts.length - 1])[0] : Array.from(parts[0])[1] ?? '';
  return (first + last).toUpperCase();
}
