// Floor map read/edit, table assignment and floor-plan email sharing.

import type { FloorMapData, Guest } from '../types';
import { fromRecord, pb } from './client';
import { getAllGuests } from './guests';
import { getSettingsOrDefaults } from './settings';
import { composeFloorPlan } from '../lib/compose';
import { notifyChannels } from './notify';
import { requireProvider } from './providers';
import { applyTablesAndSync } from './floorSync';
import { getAttendeeLocations } from '../lib/tableAssignment';

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
    // Materialize + validate + refresh the table_id mirror in one guard.
    payload.tables = await applyTablesAndSync(data.tables, allGuests);
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
export async function shareFloorPlanEmail(guestIds?: string[], customMessage?: string): Promise<{ count: number }> {
  requireProvider(['email']);
  const guests: Guest[] = guestIds?.length
    ? await Promise.all(guestIds.map((id) => pb.collection('guests').getOne(id).then((r) => fromRecord<Guest>(r))))
    : await getAllGuests();
  const map = await getFloorMap();
  const settings = await getSettingsOrDefaults();
  let count = 0;
  for (const g of guests) {
    if (!g.email) continue;
    // The party lead's table (split parties are announced at the primary's chair).
    const locations = getAttendeeLocations(g.id, map, guests);
    const table = locations.find((l) => l.attendeeIndex === 0) ?? locations[0];
    const content = composeFloorPlan(g, settings, table?.tableName || '', customMessage || '', g.language_pref);
    const { sent } = await notifyChannels(g, content, ['email']);
    if (sent.length > 0) count++;
  }
  return { count };
}