// The seating editor's draft is ONE value: the floor map, the guests it seats,
// and whether anything changed. An edit that moves seats has to move both
// halves together — as separate state the two were paired by convention at
// every call site, and a missed half silently desynced seats from
// Guest.table_id. Pure module: no React, no Konva.

import type { FloorMapData, Guest } from '../../types';

export interface SeatingDraft {
  map: FloorMapData;
  guests: Guest[];
  dirty: boolean;
}

// The editor is mounted fresh from the stored data; clone so an edit can never
// reach back into the caller's objects.
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export const createSeatingDraft = (map: FloorMapData, guests: Guest[]): SeatingDraft => ({
  map: clone(map),
  guests: clone(guests),
  dirty: false,
});

// A map-only edit: room size, a table or landmark moving, a rename. The guests
// are untouched, so they stay as they are.
export const editMap = (draft: SeatingDraft, map: FloorMapData): SeatingDraft => ({
  ...draft,
  map,
  dirty: true,
});

// A seat mutation: the map and the guest mirror land together, in one value.
export const applySeatOutcome = (
  draft: SeatingDraft,
  outcome: { map: FloorMapData; guests: Guest[] }
): SeatingDraft => ({
  map: outcome.map,
  guests: outcome.guests,
  dirty: true,
});

// The save boundary: the draft is what the server now holds.
export const markSaved = (draft: SeatingDraft): SeatingDraft => ({ ...draft, dirty: false });
