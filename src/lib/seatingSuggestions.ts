// Smart seating suggestions: a pure greedy pass that proposes complete
// placements for the largest parties first. Shared by the host page; testable
// without React. Reasons are the existing display strings (not yet localized).

import type { FloorMapData, Guest, TableElement } from '../types';
import { getAvailableSeats, getGuestPartySize, getGuestSeatedCount } from './tableAssignment';

export interface SmartSuggestion {
  id: string;
  guest: Guest;
  table: TableElement;
  partySize: number;
  freeSeats: number;
  matchBadge: 'Exact Fit' | 'Optimal Capacity' | 'Party Grouping';
  reason: string;
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
    const matchBadge: SmartSuggestion['matchBadge'] =
      fitDelta === 0 ? 'Exact Fit' : fitDelta <= 2 ? 'Optimal Capacity' : 'Party Grouping';
    const reason =
      fitDelta === 0
        ? `Perfect match! Fills all ${partySize} open seats with zero wasted space`
        : fitDelta <= 2
          ? `Great fit for party of ${partySize} leaving only ${fitDelta} free seat(s)`
          : `Keeps entire party of ${partySize} together comfortably`;

    generated.push({
      id: `sug-${g.id}-${chosenTable.id}`,
      guest: g,
      table: chosenTable,
      partySize,
      freeSeats,
      matchBadge,
      reason,
    });
    tableCapacities[chosenTable.id] -= partySize;
  }
  return generated;
}
