// Smart seating suggestions: a pure greedy pass that proposes complete
// placements for the largest parties first. Shared by the host page; testable
// without React. Returns codes, not display strings — the caller localizes them.

import type { FloorMapData, Guest, TableElement } from '../types';
import { getAvailableSeats, getGuestPartySize, getGuestSeatedCount } from './tableAssignment';

export type SuggestionFit = 'exact' | 'optimal' | 'grouping';

export interface SmartSuggestion {
  id: string;
  guest: Guest;
  table: TableElement;
  partySize: number;
  freeSeats: number;
  matchBadge: SuggestionFit;
  reason: { kind: SuggestionFit; partySize: number; free: number };
}

// Attending guests with at least one member still unseated (split-aware).
export const unseatedParties = (floorMap: FloorMapData, guests: Guest[]): Guest[] =>
  guests.filter(
    (g) =>
      g.rsvp_status === 'Attending' &&
      getGuestSeatedCount(g.id, floorMap, guests) < getGuestPartySize(g)
  );

export function suggestSeating(floorMap: FloorMapData, guests: Guest[]): SmartSuggestion[] {
  // Largest groups first so they get optimal placement.
  const sorted = [...unseatedParties(floorMap, guests)].sort(
    (a, b) => getGuestPartySize(b) - getGuestPartySize(a)
  );

  const tableCapacities: Record<string, number> = {};
  floorMap.tables.forEach((t) => {
    tableCapacities[t.id] = getAvailableSeats(t, guests);
  });

  const generated: SmartSuggestion[] = [];
  for (const g of sorted) {
    const partySize = getGuestPartySize(g);
    const candidates = floorMap.tables.filter((t) => (tableCapacities[t.id] || 0) >= partySize);
    if (candidates.length === 0) continue;

    // Closest fit: smallest remaining-seat delta.
    candidates.sort(
      (a, b) => (tableCapacities[a.id] - partySize) - (tableCapacities[b.id] - partySize)
    );
    const chosenTable = candidates[0];
    const freeSeats = tableCapacities[chosenTable.id];
    const fitDelta = freeSeats - partySize;
    const kind: SuggestionFit =
      fitDelta === 0 ? 'exact' : fitDelta <= 2 ? 'optimal' : 'grouping';

    generated.push({
      id: `sug-${g.id}-${chosenTable.id}`,
      guest: g,
      table: chosenTable,
      partySize,
      freeSeats,
      matchBadge: kind,
      reason: { kind, partySize, free: fitDelta },
    });
    tableCapacities[chosenTable.id] -= partySize;
  }
  return generated;
}
