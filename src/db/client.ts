// Shared PocketBase client + record helpers. Only touches `pb` plumbing, no
// feature logic.

import PocketBase from 'pocketbase/cjs';
import crypto from 'node:crypto';

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

// Cryptographically random invitation token + 4-digit reservation code
// (Math.random would be predictable enough to guess a guest's RSVP link).
export function newMagicToken(): string {
  return 'token-' + crypto.randomBytes(6).toString('hex') + Date.now().toString(36);
}
export function newReservationCode(): string {
  return crypto.randomInt(1000, 10000).toString();
}

// Remove a guest from every table on the floor map (decline, deletion).
export async function removeGuestFromFloorMaps(guestId: string): Promise<void> {
  try {
    const maps = await pb.collection('floor_maps').getFullList();
    if (maps.length === 0) return;
    const map = maps[0];
    const tables: any[] = JSON.parse(JSON.stringify(map.tables || []));
    for (const t of tables) {
      t.assignedGuestIds = (t.assignedGuestIds || []).filter((gid: string) => gid !== guestId);
    }
    await pb.collection('floor_maps').update(map.id, { tables });
  } catch (err) {
    console.error('Failed to update floor map:', err);
  }
}