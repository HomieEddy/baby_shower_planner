// Table access by reservation code: loads the party, the floor map and the
// roster the seat math needs, then applies the pure rule in lib/tableAccess.

import type { Guest } from '../types';
import { checkTableAccess, type TableAccessResult } from '../lib/tableAccess';
import { getAllGuests, getGuestByCode } from './guests';
import { getFloorMap } from './floorMap';

export async function getTableAccessByCode(
  code: string,
  tableId: string
): Promise<{ guest: Guest; access: TableAccessResult } | null> {
  const guest = await getGuestByCode(code);
  if (!guest) return null;
  const [floorMap, guests] = await Promise.all([getFloorMap(), getAllGuests()]);
  return { guest, access: checkTableAccess(guest, tableId.trim(), floorMap, guests) };
}
