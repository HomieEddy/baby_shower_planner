// Collection schema definitions, auto-creation/migration on first run, and the
// full data wipe.

import { pb } from './client';

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

const COLLECTION_DEFS: CollectionDef[] = [
  {
    name: 'guests', type: 'base',
    schema: [
      { name: 'name', type: 'text', required: true, options: {} },
      { name: 'email', type: 'text', options: {} },
      { name: 'phone', type: 'text', options: {} },
      { name: 'delivery_channel', type: 'select', options: { values: ['email', 'text', 'both', 'none'] }, required: true },
      { name: 'code', type: 'text', required: true, options: {} },
      { name: 'max_party_size', type: 'number', options: { min: 1 } },
      { name: 'rsvp_status', type: 'select', options: { values: ['Pending', 'Attending', 'Declined'] }, required: true },
      { name: 'attending_party_size', type: 'number', options: { min: 0 } },
      { name: 'attendee_names', type: 'json', options: {} },
      { name: 'attendee_details', type: 'json', options: {} },
      { name: 'dietary_restrictions', type: 'text', options: {} },
      { name: 'language_pref', type: 'select', options: { values: ['EN', 'FR'] }, required: true },
      { name: 'magic_token', type: 'text', required: true, options: {} },
      { name: 'token_used', type: 'bool', options: {} },
      { name: 'table_id', type: 'text', options: {} },
      { name: 'is_read_only', type: 'bool', options: {} },
      { name: 'confirmed_by_guest_name', type: 'text', options: {} },
      { name: 'main_guest_id', type: 'text', options: {} },
      { name: 'checked_in', type: 'bool', options: {} },
      { name: 'checked_in_at', type: 'text', options: {} },
      { name: 'checked_in_names', type: 'json', options: {} },
      { name: 'invited_by_guest_id', type: 'text', options: {} },
      { name: 'invited_by_guest_name', type: 'text', options: {} },
      { name: 'guest_note', type: 'text', options: {} },
      { name: 'created_at', type: 'text', options: {} },
    ],
  },
  {
    name: 'guestbook', type: 'base',
    schema: [
      { name: 'guest_name', type: 'text', required: true, options: {} },
      { name: 'message', type: 'text', required: true, options: {} },
      { name: 'photo_url', type: 'text', options: {} },
      { name: 'visible', type: 'bool', options: {} },
      { name: 'created_at', type: 'text', options: {} },
    ],
  },
  {
    name: 'settings', type: 'base',
    schema: [
      { name: 'babyName', type: 'text', options: {} },
      { name: 'parentsNames', type: 'text', options: {} },
      { name: 'date', type: 'text', options: {} },
      { name: 'time', type: 'text', options: {} },
      { name: 'venueName', type: 'text', options: {} },
      { name: 'venueAddress', type: 'text', options: {} },
      { name: 'registryUrl', type: 'url', options: {} },
      { name: 'showScheduleTime', type: 'bool', options: {} },
      { name: 'schedule', type: 'json', options: {} },
      { name: 'themeId', type: 'text', options: {} },
      { name: 'customTheme', type: 'json', options: {} },
      { name: 'contentOpenAt', type: 'text', options: {} },
      { name: 'contentCloseAt', type: 'text', options: {} },
    ],
  },
  {
    name: 'alerts', type: 'base',
    schema: [
      { name: 'type', type: 'select', options: { values: ['DATE_CHANGE', 'VENUE_CHANGE', 'CANCELLATION', 'CUSTOM', 'REMINDER'] }, required: true },
      { name: 'title', type: 'text', required: true, options: {} },
      { name: 'message', type: 'text', required: true, options: {} },
      { name: 'active', type: 'bool', options: {} },
      { name: 'notified_guests_count', type: 'number', options: {} },
      { name: 'target_audience', type: 'select', options: { values: ['ALL', 'PENDING', 'ATTENDING'] } },
      { name: 'created_at', type: 'text', options: {} },
    ],
  },
  {
    name: 'floor_maps', type: 'base',
    schema: [
      { name: 'canvasWidth', type: 'number', options: {} },
      { name: 'canvasHeight', type: 'number', options: {} },
      { name: 'roomShape', type: 'select', options: { values: ['rectangle', 'circle'] } },
      { name: 'tables', type: 'json', options: {} },
      { name: 'landmarks', type: 'json', options: {} },
      { name: 'updatedAt', type: 'text', options: {} },
    ],
  },
  {
    name: 'photos', type: 'base',
    schema: [
      { name: 'url', type: 'text', required: true, options: {} },
      { name: 'filename', type: 'text', options: {} },
      { name: 'caption', type: 'text', options: {} },
      { name: 'uploader_name', type: 'text', options: {} },
      { name: 'table_name', type: 'text', options: {} },
      { name: 'table_id', type: 'text', options: {} },
      { name: 'reservation_code', type: 'text', options: {} },
      { name: 'file_size', type: 'number', options: {} },
      { name: 'visible', type: 'bool', options: {} },
      { name: 'created_at', type: 'text', options: {} },
    ],
  },
  {
    name: 'gifts', type: 'base',
    schema: [
      { name: 'guest_name', type: 'text', required: true, options: {} },
      { name: 'guest_id', type: 'text', options: {} },
      { name: 'gift_description', type: 'text', required: true, options: {} },
      { name: 'category', type: 'select', options: { values: ['Clothing', 'Nursery', 'Toys', 'Feeding', 'Diapering', 'Other'] } },
      { name: 'thank_you_sent', type: 'bool', options: {} },
      { name: 'thank_you_date', type: 'text', options: {} },
      { name: 'created_at', type: 'text', options: {} },
    ],
  },
  {
    name: 'agenda_tasks', type: 'base',
    schema: [
      { name: 'title', type: 'text', required: true, options: {} },
      { name: 'description', type: 'text', options: {} },
      { name: 'due_date', type: 'text', options: {} },
      { name: 'due_time', type: 'text', options: {} },
      { name: 'status', type: 'select', options: { values: ['todo', 'in_progress', 'done'] }, required: true },
      { name: 'position', type: 'number', options: {} },
      { name: 'reminder_sent', type: 'bool', options: {} },
      { name: 'created_at', type: 'text', options: {} },
    ],
  },
];

// PB >= 0.23 expects `fields` (not the legacy `schema` key) and since 0.31
// field options are flattened onto the field object (e.g. `values`, `maxSelect`).
type FieldDef = {
  name: string;
  type: string;
  required?: boolean;
  options?: Record<string, unknown>;
};

type CollectionDef = {
  name: string;
  type: 'base';
  schema: FieldDef[];
};

function toFields(schema: FieldDef[]): Record<string, unknown>[] {
  return schema.map((f) => {
    const field: Record<string, unknown> = {
      name: f.name,
      type: f.type,
      required: !!f.required,
    };
    if (f.type === 'select') {
      field.maxSelect = 1;
      field.values = f.options?.values ?? [];
    } else {
      Object.assign(field, f.options ?? {});
    }
    return field;
  });
}

async function ensureCollections() {
  const existing = await pb.collections.getFullList();
  const names = existing.map(c => c.name);
  for (const def of COLLECTION_DEFS) {
    if (!names.includes(def.name)) {
      await pb.collections.create({ name: def.name, type: def.type, fields: toFields(def.schema) });
    }
  }
  await ensureCollectionFields('settings');
  await ensureCollectionFields('floor_maps');
  await ensureCollectionFields('guests');
  await ensureCollectionFields('guestbook');
  await ensureCollectionFields('photos');
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

export async function wipeDatabaseData() {
  for (const name of COLLECTION_DEFS.map(c => c.name)) {
    if (name === 'settings') continue; // event settings survive a wipe
    const records = await pb.collection(name).getFullList({ requestKey: null });
    for (const r of records) {
      await pb.collection(name).delete(r.id);
    }
  }
  return { success: true };
}