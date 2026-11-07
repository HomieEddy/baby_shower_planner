// Table Access: who may use a table's QR portal (guestbook wish + photo upload).
// Pure rule shared by the server (the guard) and its tests. A guest gets in
// only when their party is checked in and seated at the scanned table, so a
// wish or photo is always attributed to the table the guest actually sits at.

import type { FloorMapData, Guest, TableElement } from '../types';
import { isAttending } from './guestAttendees';
import { getPartyTableIds } from './tableAssignment';

export type TableAccessDenial =
  | 'NOT_ATTENDING'       // declined or never confirmed: no seat to go to
  | 'NOT_CHECKED_IN'      // must check in at the entrance first
  | 'TABLE_NOT_ASSIGNED'  // confirmed but the host hasn't seated the party yet
  | 'WRONG_TABLE'         // seated, but at another table
  | 'TABLE_NOT_FOUND';    // the QR code points at a table that no longer exists

export type TableAccessResult =
  | { ok: true; table: TableElement | null }
  | { ok: false; reason: TableAccessDenial; assignedTable?: { id: string; name: string } };

// Anyone in the party has checked in (the lead flag or any member by name).
export const isPartyCheckedIn = (guest: Pick<Guest, 'checked_in' | 'checked_in_names'>): boolean =>
  !!guest.checked_in || (guest.checked_in_names?.length ?? 0) > 0;

// `tableId` empty = the generic portal (no table in the QR link): only the
// check-in rule applies and nothing is attributed to a table.
export function checkTableAccess(
  guest: Guest,
  tableId: string,
  floorMap: FloorMapData | null,
  guestsList: Guest[]
): TableAccessResult {
  // A sign-up the host hasn't approved (or rejected) is not a confirmed guest.
  const approved = !guest.approval_status || guest.approval_status === 'approved';
  if (!isAttending(guest) || !approved) return { ok: false, reason: 'NOT_ATTENDING' };
  if (!isPartyCheckedIn(guest)) return { ok: false, reason: 'NOT_CHECKED_IN' };
  if (!tableId) return { ok: true, table: null };

  const tables = floorMap?.tables ?? [];
  const table = tables.find((t) => t.id === tableId);
  if (!table) return { ok: false, reason: 'TABLE_NOT_FOUND' };

  const partyTables = getPartyTableIds(guest.id, tables, guestsList);
  if (partyTables.includes(tableId)) return { ok: true, table };
  if (partyTables.length === 0) return { ok: false, reason: 'TABLE_NOT_ASSIGNED' };
  const assigned = tables.find((t) => t.id === partyTables[0])!;
  return { ok: false, reason: 'WRONG_TABLE', assignedTable: { id: assigned.id, name: assigned.name } };
}
