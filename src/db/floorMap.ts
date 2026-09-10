// Floor map read/edit, table assignment and floor-plan email sharing.

import type { FloorMapData, Guest, EventSettings, TableElement } from '../types';
import { fromRecord, pb } from './client';
import { getAllGuests } from './guests';
import { getSettings } from './settings';
import {
  getGuestPartySize,
  materializeTableSeats,
  rebuildAssignedGuestIds,
  validateTables,
} from '../components/seating/floorPlanHelpers';

function normalizeFloorMap(record: any): FloorMapData {
  const data = fromRecord<FloorMapData>(record);
  if (!data.roomShape) data.roomShape = 'rectangle';
  return data;
}

export async function getFloorMap(): Promise<FloorMapData> {
  const records = await pb.collection('floor_maps').getFullList();
  if (records.length === 0) {
    // First access: create an empty default map so the host lands on a blank canvas
    const r = await pb.collection('floor_maps').create({
      canvasWidth: 850,
      canvasHeight: 520,
      roomShape: 'rectangle',
      tables: [],
      landmarks: [],
      updatedAt: new Date().toISOString(),
    });
    return normalizeFloorMap(r);
  }
  return normalizeFloorMap(records[0]);
}

export async function updateFloorMap(data: Partial<FloorMapData>): Promise<FloorMapData> {
  const records = await pb.collection('floor_maps').getFullList();
  const id = records[0]?.id;
  const payload: Record<string, unknown> = { ...data, updatedAt: new Date().toISOString() };
  // PocketBase may strip unknown top-level fields if collection is strict;
  // roomShape column may not exist on old DBs — strip on save if needed is handled by schema migration,
  // but keep payload tolerant. Normalize empty.
  if (!payload.roomShape) payload.roomShape = (data.roomShape as string) || 'rectangle';
  if (data.tables) {
    const allGuests = await getAllGuests();
    const tables: TableElement[] = data.tables.map((t) => materializeTableSeats(t, allGuests));
    validateTables(tables, allGuests);
    payload.tables = tables;
    for (const guest of allGuests) {
      // Legacy scalar mirror: the table holding the party's primary attendee, else its first table.
      const primary = tables.find((t) => t.seats?.some((s) => s?.guestId === guest.id && s.attendeeIndex === 0));
      const anySeat = tables.find((t) => t.seats?.some((s) => s?.guestId === guest.id));
      const assigned = primary || anySeat;
      await pb.collection('guests').update(guest.id, { table_id: assigned?.id || null });
    }
  }
  if (id) {
    const r = await pb.collection('floor_maps').update(id, payload);
    return normalizeFloorMap(r);
  }
  const r = await pb.collection('floor_maps').create(payload);
  return normalizeFloorMap(r);
}

// Legacy whole-party helper: clears the party from every table, then fills the
// target table's free chairs in party order. Seat-level edits go through
// updateFloorMap (bulk) instead.
export async function assignGuestToTable(guestId: string, tableId: string | null): Promise<FloorMapData> {
  const allGuests = await getAllGuests();
  const guest = allGuests.find((g) => g.id === guestId);
  if (!guest) throw new Error('GUEST_NOT_FOUND');
  if (tableId && guest.rsvp_status !== 'Attending') throw new Error('Only confirmed attending guests can be assigned to a table.');
  const records = await pb.collection('floor_maps').getFullList();
  if (records.length === 0) throw new Error('No floor map');
  const map = records[0];
  const tables: TableElement[] = ((map.tables as TableElement[]) || []).map((t) => materializeTableSeats(t, allGuests));

  // Remove the party from every table
  for (const t of tables) {
    t.seats = (t.seats || []).map((s) => (s?.guestId === guestId ? null : s));
  }
  // Fill free chairs at the target, party order
  if (tableId) {
    const target = tables.find((t) => t.id === tableId);
    if (!target) throw new Error('TABLE_NOT_FOUND');
    const size = getGuestPartySize(guest);
    for (let i = 0; i < size; i++) {
      const free = (target.seats || []).findIndex((s) => s === null);
      if (free === -1) break;
      target.seats![free] = { guestId, attendeeIndex: i };
    }
  }

  for (const t of tables) t.assignedGuestIds = rebuildAssignedGuestIds(t.seats || []);
  validateTables(tables, allGuests);
  await pb.collection('guests').update(guestId, { table_id: tableId || null } as any);
  const r = await pb.collection('floor_maps').update(map.id, { tables, updatedAt: new Date().toISOString() });
  return normalizeFloorMap(r);
}

export async function shareFloorPlanEmail(guestIds?: string[], customMessage?: string): Promise<{ count: number }> {
  const guests: any[] = guestIds?.length
    ? await Promise.all(guestIds.map(id => pb.collection('guests').getOne(id)))
    : await getAllGuests();
  const map = await getFloorMap();
  let settings: EventSettings | null = null;
  try { settings = await getSettings(); } catch { /* settings missing — skip send */ }
  let count = 0;
  for (const g of guests) {
    if (!g.email || !settings) continue;
    const table = map.tables.find(t => t.assignedGuestIds.includes(g.id));
    const { sendFloorPlanEmail } = await import('../lib/email');
    if (await sendFloorPlanEmail(fromRecord<Guest>(g), settings, table?.name || '', customMessage || '')) {
      count++;
    }
  }
  return { count };
}