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
export function seatVisual(opts: {
  occupied: boolean;
  isDropTarget: boolean;
  isPicked: boolean;
  pickMode: boolean;
}): SeatVisual {
  const { occupied, isDropTarget, isPicked, pickMode } = opts;

  if (isDropTarget) return { fill: '#A7F3D0', stroke: '#059669', radius: 10 };
  if (isPicked) return { fill: '#FDE68A', stroke: '#D97706', radius: 8 };
  if (pickMode && !occupied) return { fill: '#D1FAE5', stroke: '#059669', radius: 8 };
  return {
    fill: occupied ? '#8B735B' : '#FFFDF9',
    stroke: '#CBAE94',
    radius: 8,
  };
}
