// Route-side guard for the table portal: turns a denied table access into the
// matching DomainError (WRONG_TABLE carries the table the party is seated at,
// so the client can point the guest there).

import { DomainError } from '../lib/errors';
import type { TableAccessResult } from '../lib/tableAccess';
import type { Guest, TableElement } from '../types';
import { getGuestByCode, getTableAccessByCode, isApproved } from '../db/service';

export function assertTableAccess(access: TableAccessResult): TableElement | null {
  if (access.ok) return access.table;
  throw new DomainError(access.reason, access.assignedTable ? { assignedTable: access.assignedTable } : undefined);
}

// The guest behind a guestbook wish / photo upload, plus the table it is
// attributed to. With a table id the full portal rule applies (attending,
// checked in, seated at that table) and the table name comes from the floor
// map, never from the client, so the per-table wish cap can't be dodged by
// renaming. Without one, any approved reservation may post (remote wishes),
// unattributed. Returns null when the code matches no reservation.
export async function resolveContentAuthor(
  code: string,
  tableId: unknown
): Promise<{ guest: Guest; table: TableElement | null } | null> {
  const id = typeof tableId === 'string' ? tableId.trim() : '';
  if (id) {
    const found = await getTableAccessByCode(code, id);
    if (!found) return null;
    return { guest: found.guest, table: assertTableAccess(found.access) };
  }
  const guest = await getGuestByCode(code);
  if (!guest) return null;
  if (!isApproved(guest)) {
    throw new DomainError(guest.approval_status === 'rejected' ? 'REGISTRATION_REJECTED' : 'PENDING_APPROVAL');
  }
  return { guest, table: null };
}
