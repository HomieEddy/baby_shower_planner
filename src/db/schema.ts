// Collection auto-creation/migration on first run, and the full data wipe.
// The field definitions themselves are derived from the domain schemas in
// src/db/collectionDefs.ts.

import { pb } from './client';
import { COLLECTION_DEFS, toFields } from './collectionDefs';
import { removeUploadFiles } from '../server/uploadFiles';

// ─── Init / Auth ───────────────────────────────────────────────────

async function authSuperuser() {
  const email = process.env.PB_ADMIN_EMAIL || 'admin@babyshower.com';
  const password = process.env.PB_ADMIN_PASSWORD || 'changeme123';
  if (!process.env.PB_ADMIN_EMAIL || !process.env.PB_ADMIN_PASSWORD) {
    console.warn('PB_ADMIN_EMAIL/PB_ADMIN_PASSWORD not set — using insecure fallback credentials');
  }
  try {
    await pb.admins.authWithPassword(email, password);
  } catch {
    await pb.admins.create({ email, password, passwordConfirm: password });
    await pb.admins.authWithPassword(email, password);
  }
}

export async function initPocketBase() {
  await authSuperuser();
  // Superuser tokens expire (and any PocketBase restart invalidates them); the
  // SDK never auto-refreshes admins, so a stale token makes every admin call
  // fail with "Only superusers can perform this action." Re-auth on a short
  // interval to keep the token fresh. ponytail: one login per 15min is cheap.
  setInterval(() => {
    authSuperuser().catch((err) => console.error('[PB] Superuser re-auth failed:', err));
  }, 15 * 60 * 1000).unref();
  await ensureCollections();
  // Drop collections from features that were removed (e.g. baby predictions)
  // so their data doesn't linger in existing databases.
  for (const name of ['predictions']) {
    try { await pb.collections.delete(name); } catch { /* absent or already gone */ }
  }
}

async function ensureCollections() {
  const existing = await pb.collections.getFullList();
  const names = existing.map(c => c.name);
  for (const def of COLLECTION_DEFS) {
    if (!names.includes(def.name)) {
      await pb.collections.create({ name: def.name, type: def.type, fields: toFields(def.schema) });
    }
  }
  // Every collection gets migrated, so a new field in the domain schema always
  // reaches existing databases on the next boot.
  for (const def of COLLECTION_DEFS) {
    await ensureCollectionFields(def.name);
  }
}

// Add fields added after a collection already exists (e.g. contentOpenAt/contentCloseAt,
// checked_in_names). Existing PB collections are never recreated — they only get
// missing fields appended. Select fields also get new option values merged in
// (e.g. delivery_channel gained 'none'), since PB rejects values not in the list.
async function ensureCollectionFields(colName: string) {
  try {
    const col = await pb.collections.getOne(colName);
    const names = new Set(col.fields.map((f: { name: string }) => f.name));
    const defFields = toFields(COLLECTION_DEFS.find(d => d.name === colName)!.schema);
    const missing = defFields
      .map(f => String(f.name))
      .filter(n => !names.has(n));
    const fields = [...(col.fields as unknown as Array<Record<string, unknown>>)];
    for (const f of fields) {
      const def = defFields.find(d => String(d.name) === String(f.name));
      if (def && def.type === 'select' && f.type === 'select') {
        const defVals = (def.values || []) as string[];
        const fVals = (f.values || []) as string[];
        const merged = Array.from(new Set([...defVals, ...fVals]));
        if (merged.length !== fVals.length) {
          f.values = merged;
        }
      }
    }
    if (missing.length > 0) {
      fields.push(...defFields.filter(f => missing.includes(String(f.name))));
    }
    if (missing.length === 0 && fields.every((f, i) => JSON.stringify(f) === JSON.stringify(col.fields[i]))) return;
    await pb.collections.update(col.id, { fields });
  } catch (err) {
    console.warn(`Could not migrate ${colName} collection fields:`, err);
  }
}

// ─── Wipe ─────────────────────────────────────────────────────────

// Uploaded files referenced by a photo/guestbook record, so deleting the record
// also cleans the file off disk (otherwise wipe leaves orphans).
function uploadUrlsFrom(name: string, record: Record<string, unknown>): string[] {
  const candidates: unknown[] = [];
  if (name === 'photos') candidates.push(record.url);
  if (name === 'guestbook') candidates.push(record.photo_url);
  return candidates.filter(
    (u): u is string => typeof u === 'string' && u.startsWith('/uploads/')
  );
}

export async function wipeDatabaseData() {
  const urls: string[] = [];
  for (const name of COLLECTION_DEFS.map(c => c.name)) {
    if (name === 'settings') continue; // event settings survive a wipe
    const records = await pb.collection(name).getFullList({ requestKey: null });
    for (const r of records) {
      urls.push(...uploadUrlsFrom(name, r));
      await pb.collection(name).delete(r.id);
    }
  }
  removeUploadFiles(urls);
  return { success: true };
}

// Delete only records created at/after `since` (rehearsal data), leaving
// pre-existing real data intact. Settings and floor_maps are skipped — callers
// snapshot/restore the map themselves.
// ponytail: creation-time cutoff, not a per-row flag; every synced collection
// stamps created_at app-side, so no schema change is needed.
export async function deleteRecordsSince(since: string): Promise<number> {
  let deleted = 0;
  const urls: string[] = [];
  for (const name of COLLECTION_DEFS.map(c => c.name)) {
    if (name === 'settings' || name === 'floor_maps') continue;
    const records = await pb.collection(name).getFullList({ requestKey: null });
    for (const r of records) {
      const created = String(r.created_at || r.created || '');
      if (created && created >= since) {
        urls.push(...uploadUrlsFrom(name, r));
        await pb.collection(name).delete(r.id);
        deleted++;
      }
    }
  }
  removeUploadFiles(urls);
  return deleted;
}
