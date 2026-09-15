// Shared PocketBase client + record helpers. Only touches `pb` plumbing, no
// feature logic.

import PocketBase from 'pocketbase/cjs';
import crypto from 'node:crypto';
import type { TableElement } from '../types';
import { trimPartySeats, removePartyAttendee } from '../lib/tableAssignment';

const PB_URL = process.env.POCKETBASE_URL || process.env.VITE_POCKETBASE_URL || 'http://127.0.0.1:8090';
export const pb = new PocketBase(PB_URL);
// The SDK auto-cancels concurrent requests with the same key (React StrictMode
// double-fires effects), which surfaced as random 500s and 403s. Disable it.
pb.autoCancellation(false);

export function fromRecord<T>(r: Record<string, unknown>): T {
  return { ...r, created_at: (r.created_at as string) || (r.created as string) } as T;
}

// Escape a value for safe use inside a PocketBase filter string.
export function escFilter(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

// PocketBase reports "no match" as a 404 ClientResponseError. Everything else
// (connection refused, auth, 5xx) is an outage, not an empty result.
export function isNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { status?: unknown }).status === 404;
}

// The first record matching `filter`, or undefined when there is none — so a
// caller can tell "absent" from "broken" without swallowing the latter.
export async function findFirstOrUndefined<T>(collection: string, filter: string): Promise<T | undefined> {
  try {
    return fromRecord<T>(await pb.collection(collection).getFirstListItem(filter));
  } catch (err) {
    if (isNotFound(err)) return undefined;
    throw err;
  }
}

// Cryptographically random invitation token + 4-digit reservation code
// (Math.random would be predictable enough to guess a guest's RSVP link).
export function newMagicToken(): string {
  return 'token-' + crypto.randomBytes(6).toString('hex') + Date.now().toString(36);
}
export function newReservationCode(): string {
  return crypto.randomInt(1000, 10000).toString();
}

// Remove a guest's seats from every table (decline, deletion). `keepAttendees`
// keeps the first N attendees seated (RSVP party shrink) and drops the rest.
// The pure trim lives in lib/tableAssignment; this is only the PB adapter.
// ponytail: trims rebuild assignedGuestIds but skip validate/mirror — callers
// already write the affected guest's table_id and no other seat moves. Route
// through floorSync.applyTablesAndSync if a future trim can shift other guests.
export async function removeGuestFromFloorMaps(guestId: string, keepAttendees = 0): Promise<void> {
  try {
    const maps = await pb.collection('floor_maps').getFullList();
    if (maps.length === 0) return;
    const map = maps[0];
    const tables = trimPartySeats((map.tables as TableElement[]) || [], guestId, keepAttendees);
    await pb.collection('floor_maps').update(map.id, { tables });
  } catch (err) {
    console.error('Failed to update floor map:', err);
  }
}

// Remove one attendee (by index) from a party's seats: the chair is dropped and
// higher attendee indices shift down to keep the remaining people seated.
export async function removeAttendeeFromFloorMaps(guestId: string, removedIndex: number): Promise<void> {
  try {
    const maps = await pb.collection('floor_maps').getFullList();
    if (maps.length === 0) return;
    const map = maps[0];
    const tables = removePartyAttendee((map.tables as TableElement[]) || [], guestId, removedIndex);
    await pb.collection('floor_maps').update(map.id, { tables });
  } catch (err) {
    console.error('Failed to update floor map:', err);
  }
}