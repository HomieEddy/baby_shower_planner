// The one guard for the seat ⇄ assignedGuestIds ⇄ Guest.table_id invariant:
// materialize explicit seats, validate, then refresh the legacy table_id mirror.
// Every writer of floor_maps.tables routes through here so client and server
// can never drift. Depends only on the PB client + the pure Table Assignment
// module, so it sits below the feature modules (no import cycles).

import type { Guest, TableElement } from '../types';
import { pb } from './client';
import { materializeTableSeats, syncGuestTableIds, validateTables } from '../lib/tableAssignment';

// Returns the materialized tables for the caller to persist, after validating
// the seat layout and syncing each guest's scalar `table_id`.
export async function applyTablesAndSync(
  tables: TableElement[],
  guests: Guest[]
): Promise<TableElement[]> {
  const materialized = tables.map((t) => materializeTableSeats(t, guests));
  validateTables(materialized, guests);
  const tableIdByGuest = new Map(syncGuestTableIds(materialized, guests).map((g) => [g.id, g.table_id]));
  for (const guest of guests) {
    await pb.collection('guests').update(guest.id, { table_id: tableIdByGuest.get(guest.id) || null });
  }
  return materialized;
}
