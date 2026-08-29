// Floor map read/edit, table assignment and floor-plan email sharing.

import type { FloorMapData, Guest, EventSettings } from '../types';
import { fromRecord, pb } from './client';
import { getAllGuests } from './guests';
import { getSettings } from './settings';

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
    for (const guest of await getAllGuests()) {
      const assigned = data.tables.find(t => t.assignedGuestIds.includes(guest.id));
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

export async function assignGuestToTable(guestId: string, tableId: string | null): Promise<FloorMapData> {
  const guest = await pb.collection('guests').getOne(guestId);
  if (tableId && guest.rsvp_status !== 'Attending') throw new Error('Only confirmed attending guests can be assigned to a table.');
  const records = await pb.collection('floor_maps').getFullList();
  if (records.length === 0) throw new Error('No floor map');
  const map = records[0];
  const tables: any[] = (map.tables as any[]) || [];

  // Remove from all tables
  for (const t of tables) {
    t.assignedGuestIds = (t.assignedGuestIds || []).filter((id: string) => id !== guestId);
  }
  // Assign to target
  if (tableId) {
    const target = tables.find(t => t.id === tableId);
    if (target) target.assignedGuestIds.push(guestId);
  }
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