// Import the published CJS entry: the SDK's main entry is ESM-only, and
// esbuild's `--packages=external` CJS bundle double-wraps require(esm)
// namespaces (`default` ends up as the namespace object, not the class).
// `pocketbase/cjs` is the constructor itself and types via dist/pocketbase.cjs.d.ts.
import PocketBase from 'pocketbase/cjs';
import {
  Guest, GuestbookEntry, EventSettings, EventAlert, AlertType,
  FloorMapData, EventPhoto, BabyPrediction, GiftLog, AgendaTask, AgendaStatus,
  AddGuestPayload, SubmitRsvpPayload, AddGuestbookPayload,
} from '../types';
import { getPartyMembers, isMemberCheckedIn, isPartyLead } from '../lib/guestAttendees';
import { buildInviteMessage } from '../lib/inviteMessage';
import { isInReminderWindow, taskDueAt, REMINDER_ADVANCE_MS } from '../lib/dateUtils';

const PB_URL = process.env.POCKETBASE_URL || process.env.VITE_POCKETBASE_URL || 'http://127.0.0.1:8090';
export const pb = new PocketBase(PB_URL);
// The SDK auto-cancels concurrent requests with the same key (React StrictMode
// double-fires effects), which surfaced as random 500s and 403s. Disable it.
pb.autoCancellation(false);

function fromRecord<T>(r: Record<string, unknown>): T {
  return { ...r, created_at: (r.created_at as string) || (r.created as string) } as T;
}

// ─── Init / Auth / Seed ───────────────────────────────────────────

export async function initPocketBase() {
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
  await ensureCollections();
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
      { name: 'likes', type: 'number', options: {} },
      { name: 'created_at', type: 'text', options: {} },
    ],
  },
  {
    name: 'predictions', type: 'base',
    schema: [
      { name: 'guest_name', type: 'text', required: true, options: {} },
      { name: 'guest_id', type: 'text', options: {} },
      { name: 'predicted_date', type: 'text', options: {} },
      { name: 'predicted_weight_lbs', type: 'number', options: {} },
      { name: 'predicted_hair_color', type: 'text', options: {} },
      { name: 'predicted_eye_color', type: 'text', options: {} },
      { name: 'advice_for_parents', type: 'text', options: {} },
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
  await ensureCollectionFields('guests');
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

// ─── Guests ───────────────────────────────────────────────────────

export async function getAllGuests(): Promise<Guest[]> {
  const records = await pb.collection('guests').getFullList({ sort: '-created_at' });
  return records.map(r => fromRecord<Guest>(r));
}

export async function getGuestByToken(token: string): Promise<Guest | undefined> {
  try {
    const r = await pb.collection('guests').getFirstListItem(`magic_token="${token}"`);
    return fromRecord<Guest>(r);
  } catch { return undefined; }
}

export async function getGuestById(id: string): Promise<Guest> {
  const r = await pb.collection('guests').getOne(id);
  return fromRecord<Guest>(r);
}

export async function addGuest(payload: AddGuestPayload): Promise<{ guest: Guest; magic_token: string; invite_message: string }> {
  const existing = payload.email || payload.phone
    ? await pb.collection('guests').getList(1, 1, {
        filter: payload.email ? `email="${payload.email}"` : `phone="${payload.phone}"`,
      })
    : { items: [] };
  if (existing.items.length > 0) {
    const g = fromRecord<Guest>(existing.items[0]);
    return { guest: g, magic_token: g.magic_token, invite_message: await inviteMessageFor(g) };
  }
  const magic_token = 'token-' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
  const partySize = payload.max_party_size && payload.max_party_size > 0 ? payload.max_party_size : 1;
  const code = Math.floor(1000 + Math.random() * 9000).toString();
  const guest = await pb.collection('guests').create({
    name: payload.name,
    email: payload.email || '',
    phone: payload.phone || '',
    delivery_channel: payload.delivery_channel || 'none',
    code, max_party_size: partySize, rsvp_status: 'Pending',
    attending_party_size: partySize,
    attendee_names: [payload.name],
    attendee_details: [{ name: payload.name, contact: payload.email || payload.phone || '' }],
    dietary_restrictions: '', language_pref: payload.language_pref || 'FR',
    magic_token, token_used: false, created_at: new Date().toISOString(),
    is_read_only: false,
  });
  const g = fromRecord<Guest>(guest);
  return { guest: g, magic_token, invite_message: await inviteMessageFor(g) };
}

// Pre-built copy/paste invitation message (bilingual, follows the guest's
// language preference). Fetches settings lazily; empty settings → minimal message.
export async function inviteMessageFor(guest: Guest): Promise<string> {
  let settings: Partial<EventSettings> = {};
  try {
    settings = await getSettings();
  } catch { /* settings not seeded yet — message falls back to essentials */ }
  return buildInviteMessage(guest, settings, guest.language_pref);
}

export async function submitRsvp(token: string, payload: SubmitRsvpPayload): Promise<Guest> {
  const r = await pb.collection('guests').getFirstListItem(`magic_token="${token}"`);
  if (!r) throw new Error('INVALID_TOKEN');
  if (r.is_read_only) return fromRecord<Guest>(r);

  const updates: Record<string, unknown> = {
    rsvp_status: payload.rsvp_status,
    dietary_restrictions: payload.dietary_restrictions || '',
    token_used: true,
  };

  if (payload.rsvp_status === 'Attending') {
    const details = payload.attendee_details?.filter(d => d.name.trim()) || [];
    const names = details.length > 0 ? details.map(d => d.name.trim()) : (payload.attendee_names?.filter(n => n.trim()) || [r.name]);
    updates.attendee_details = details;
    updates.attendee_names = names;
    updates.attending_party_size = names.length;
  } else {
    updates.attendee_names = [];
    updates.attendee_details = [];
    updates.attending_party_size = 0;
    updates.table_id = null;
    // Unassign from floor map tables
  }
  const updated = await pb.collection('guests').update(r.id, updates);
  return fromRecord<Guest>(updated);
}

export async function resetTokenUsage(token: string): Promise<Guest> {
  const r = await pb.collection('guests').getFirstListItem(`magic_token="${token}"`);
  const updated = await pb.collection('guests').update(r.id, { token_used: false });
  return fromRecord<Guest>(updated);
}

// ─── Self-service contact & guest-to-guest invites ────────────────

export type GuestContactPayload = {
  email?: string;
  phone?: string;
  delivery_channel: 'none' | 'email' | 'text' | 'both';
};

// Guests add/correct their own contact info (e.g. after receiving a manually
// shared link) so future reminders reach them. Stored as-is: there's no
// email/SMS verification infra, and it's their own reminder channel.
export async function updateGuestContact(token: string, payload: GuestContactPayload): Promise<Guest> {
  const r = await pb.collection('guests').getFirstListItem(`magic_token="${token}"`);
  const channel = payload.delivery_channel || 'none';
  const email = (payload.email || '').trim();
  const phone = (payload.phone || '').trim();
  if ((channel === 'email' || channel === 'both') && !email) throw new Error('EMAIL_REQUIRED');
  if ((channel === 'text' || channel === 'both') && !phone) throw new Error('PHONE_REQUIRED');
  const updated = await pb.collection('guests').update(r.id, { email, phone, delivery_channel: channel });
  return fromRecord<Guest>(updated);
}

export type GuestInviteResult =
  | { ok: true; guest: Guest; magic_token: string; invite_url: string; invite_message: string; already_invited: boolean; sent: string[]; failed: string[] }
  | { ok: false; error: 'INVALID_TOKEN' | 'NAME_REQUIRED' | 'CONTACT_REQUIRED' };

// A guest invites someone from their own reservation page. The invitee gets a
// real guest record + magic link immediately (host retains control: it's an
// ordinary guest, editable/deletable in the admin). If the contact matches an
// existing guest, we return that guest's link instead of duplicating.
export async function inviteGuest(token: string, payload: { name: string; contact?: string; channel?: 'link-only' | 'email' | 'text' | 'both'; note?: string }): Promise<GuestInviteResult> {
  const inviter = await pb.collection('guests').getFirstListItem(`magic_token="${token}"`).catch(() => null);
  if (!inviter) return { ok: false, error: 'INVALID_TOKEN' };
  const name = (payload.name || '').trim();
  if (!name) return { ok: false, error: 'NAME_REQUIRED' };

  const contact = (payload.contact || '').trim();
  const channel = payload.channel || 'link-only';
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
  const phone = !isEmail ? contact : '';
  const email = isEmail ? contact : '';
  if (channel !== 'link-only' && !contact) return { ok: false, error: 'CONTACT_REQUIRED' };

  // Dedupe on contact (email preferred, falls back to phone) — reuse the link.
  if (contact) {
    const existing = await pb.collection('guests').getList(1, 1, {
      filter: email ? `email="${email}"` : `phone="${phone}"`,
    });
    if (existing.items.length > 0) {
      const g = fromRecord<Guest>(existing.items[0]);
      return {
        ok: true, guest: g, magic_token: g.magic_token,
        invite_url: `${process.env.APP_URL || 'http://localhost:3025'}/rsvp/${g.magic_token}`,
        invite_message: await inviteMessageFor(g),
        already_invited: true, sent: [], failed: [],
      };
    }
  }

  const magic_token = 'token-' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
  const code = Math.floor(1000 + Math.random() * 9000).toString();
  const inviterGuest = fromRecord<Guest>(inviter);
  const delivery_channel: 'email' | 'text' | 'both' | 'none' =
    channel === 'email' ? 'email' : channel === 'text' ? 'text' : channel === 'both' ? 'both' : 'none';
  const guest = await pb.collection('guests').create({
    name, email, phone,
    delivery_channel,
    code, max_party_size: 1, rsvp_status: 'Pending',
    attending_party_size: 1,
    attendee_names: [name],
    attendee_details: [{ name, contact: contact || '' }],
    dietary_restrictions: '', language_pref: inviterGuest.language_pref || 'FR',
    magic_token, token_used: false, created_at: new Date().toISOString(),
    is_read_only: false,
    invited_by_guest_id: inviter.id,
    invited_by_guest_name: inviterGuest.name,
    guest_note: (payload.note || '').trim(),
  });
  const g = fromRecord<Guest>(guest);
  const invite_url = `${process.env.APP_URL || 'http://localhost:3025'}/rsvp/${magic_token}`;

  // Deliver via the app when a channel + contact was given; otherwise the
  // inviter shares the link themselves.
  const sent: string[] = [];
  const failed: string[] = [];
  if (channel !== 'link-only') {
    let settings: EventSettings | null = null;
    try { settings = await getSettings(); } catch { /* settings missing — skip send */ }
    if (settings) {
      if ((channel === 'email' || channel === 'both') && email) {
        const { sendInvitationEmail } = await import('../lib/email');
        if (await sendInvitationEmail(g, settings)) sent.push('email'); else failed.push('email');
      }
      if ((channel === 'text' || channel === 'both') && phone) {
        const { sendInvitationSms } = await import('../lib/sms');
        if (await sendInvitationSms(g, settings)) sent.push('text'); else failed.push('text');
      }
    }
  }

  return {
    ok: true, guest: g, magic_token, invite_url,
    invite_message: await inviteMessageFor(g),
    already_invited: false, sent, failed,
  };
}

// Invitations this guest created (name, status, link + message for re-sharing).
export async function getInvitesByGuest(token: string): Promise<Guest[]> {
  const inviter = await pb.collection('guests').getFirstListItem(`magic_token="${token}"`).catch(() => null);
  if (!inviter) return [];
  const records = await pb.collection('guests').getFullList({
    filter: `invited_by_guest_id="${inviter.id}"`,
    sort: '-created_at',
  });
  return records.map(r => fromRecord<Guest>(r));
}

// Guests may remove their own invites (host can always re-add/revert in admin).
export async function removeInvite(token: string, inviteId: string): Promise<boolean> {
  const inviter = await pb.collection('guests').getFirstListItem(`magic_token="${token}"`).catch(() => null);
  if (!inviter) return false;
  const invite = await pb.collection('guests').getOne(inviteId).catch(() => null);
  if (!invite || String(invite.invited_by_guest_id || '') !== inviter.id) return false;
  await deleteGuest(inviteId);
  return true;
}

export async function updateGuest(id: string, updates: Partial<Guest>): Promise<Guest> {
  const updated = await pb.collection('guests').update(id, updates);
  return fromRecord<Guest>(updated);
}

export async function deleteGuest(id: string): Promise<void> {
  await pb.collection('guests').delete(id);
  try {
    const maps = await pb.collection('floor_maps').getFullList();
    if (maps.length > 0) {
      const map = maps[0];
      const tables: any[] = JSON.parse(JSON.stringify(map.tables || []));
      for (const t of tables) {
        t.assignedGuestIds = (t.assignedGuestIds || []).filter((gid: string) => gid !== id);
      }
      await pb.collection('floor_maps').update(map.id, { tables });
    }
  } catch (err) {
    console.error('Failed to update floor map after guest deletion:', err);
  }
}

export async function batchImportGuests(guestList: AddGuestPayload[]): Promise<{ imported: Guest[]; count: number }> {
  const imported: Guest[] = [];
  for (const item of guestList) {
    if (!item.name?.trim()) continue;
    const magic_token = 'token-' + Math.random().toString(36).substring(2, 10) + Date.now().toString(36);
    const code = Math.floor(1000 + Math.random() * 9000).toString();
    const g = await pb.collection('guests').create({
      name: item.name.trim(), email: item.email?.trim() || '', phone: item.phone?.trim() || '',
      delivery_channel: item.delivery_channel || 'email', code,
      max_party_size: Number(item.max_party_size) || 1,
      rsvp_status: 'Pending', attending_party_size: 0,
      dietary_restrictions: '', language_pref: item.language_pref === 'EN' ? 'EN' : 'FR',
      magic_token, token_used: false,
      created_at: new Date().toISOString(),
    });
    imported.push(fromRecord<Guest>(g));
  }
  return { imported, count: imported.length };
}

// ─── Guestbook ────────────────────────────────────────────────────

export async function getAllGuestbookEntries(): Promise<GuestbookEntry[]> {
  const records = await pb.collection('guestbook').getFullList({ sort: '-created_at' });
  return records.map(r => fromRecord<GuestbookEntry>(r));
}

export async function addGuestbookEntry(payload: AddGuestbookPayload): Promise<GuestbookEntry> {
  const r = await pb.collection('guestbook').create({
    guest_name: payload.guest_name, message: payload.message,
    photo_url: payload.photo_url || '', created_at: new Date().toISOString(),
  });
  return fromRecord<GuestbookEntry>(r);
}

// ─── Settings ─────────────────────────────────────────────────────

export async function getSettings(): Promise<EventSettings> {
  const records = await pb.collection('settings').getFullList();
  if (records.length === 0) throw new Error('No settings found');
  return fromRecord<EventSettings>(records[0]);
}

// ─── Guest Content Window (guestbook + photos) ────────────────────

export interface GuestContentLock {
  locked: boolean;
  opensAt?: string;
  closesAt?: string;
}

// Guestbook and photo uploads are locked until the event starts
// (contentOpenAt) and lock again after contentCloseAt.
export async function getGuestContentLock(now: Date = new Date()): Promise<GuestContentLock> {
  let settings: EventSettings | null = null;
  try {
    settings = await getSettings();
  } catch {
    return { locked: true };
  }
  const ts = now.getTime();
  const openAt = settings.contentOpenAt ? new Date(settings.contentOpenAt).getTime() : NaN;
  const closeAt = settings.contentCloseAt ? new Date(settings.contentCloseAt).getTime() : NaN;
  const locked = Number.isNaN(openAt) || ts < openAt || (!Number.isNaN(closeAt) && ts >= closeAt);
  return {
    locked,
    opensAt: settings.contentOpenAt || undefined,
    closesAt: settings.contentCloseAt || undefined,
  };
}

export async function updateSettings(payload: Partial<EventSettings>): Promise<EventSettings> {
  const records = await pb.collection('settings').getFullList();
  const id = records[0]?.id;
  if (id) {
    const r = await pb.collection('settings').update(id, payload);
    return fromRecord<EventSettings>(r);
  }
  const r = await pb.collection('settings').create(payload);
  return fromRecord<EventSettings>(r);
}

// ─── Alerts ───────────────────────────────────────────────────────

export async function getAlerts(): Promise<EventAlert[]> {
  const records = await pb.collection('alerts').getFullList({ sort: '-created_at' });
  return records.map(r => fromRecord<EventAlert>(r));
}

export async function createAlert(payload: { type: AlertType; title: string; message: string; target_audience?: 'ALL' | 'PENDING' | 'ATTENDING' }): Promise<{ alert: EventAlert; notified_count: number }> {
  const r = await pb.collection('alerts').create({
    type: payload.type, title: payload.title, message: payload.message,
    active: true, target_audience: payload.target_audience || 'ALL',
    notified_guests_count: 0, created_at: new Date().toISOString(),
  });
  const guests = await getAllGuests();
  const target = payload.target_audience || 'ALL';
  const recipientGuests = guests.filter(g => {
    if (g.rsvp_status === 'Declined') return false;
    if (target === 'PENDING') return g.rsvp_status === 'Pending';
    if (target === 'ATTENDING') return g.rsvp_status === 'Attending';
    return true;
  });
  const emailGuests = recipientGuests.filter(g => !!g.email);
  let settings: EventSettings | null = null;
  try { settings = await getSettings(); } catch { /* settings missing — skip send */ }
  for (const g of emailGuests) {
    if (settings) {
      const { sendAlertEmail } = await import('../lib/email');
      await sendAlertEmail(g, settings, payload.title, payload.message);
    }
  }
  const notified = emailGuests.length;
  await pb.collection('alerts').update(r.id, { notified_guests_count: notified });
  return { alert: fromRecord<EventAlert>({ ...r, notified_guests_count: notified }), notified_count: notified };
}

export async function deleteAlert(id: string): Promise<EventAlert[]> {
  await pb.collection('alerts').delete(id);
  return getAlerts();
}

// ─── Floor Plan ───────────────────────────────────────────────────

export async function getFloorMap(): Promise<FloorMapData> {
  const records = await pb.collection('floor_maps').getFullList();
  if (records.length === 0) {
    // First access: create an empty default map so the host lands on a blank canvas
    const r = await pb.collection('floor_maps').create({
      canvasWidth: 850,
      canvasHeight: 520,
      tables: [],
      landmarks: [],
      updatedAt: new Date().toISOString(),
    });
    return fromRecord<FloorMapData>(r);
  }
  return fromRecord<FloorMapData>(records[0]);
}

export async function updateFloorMap(data: Partial<FloorMapData>): Promise<FloorMapData> {
  const records = await pb.collection('floor_maps').getFullList();
  const id = records[0]?.id;
  const payload = { ...data, updatedAt: new Date().toISOString() };
  if (data.tables) {
    for (const guest of await getAllGuests()) {
      const assigned = data.tables.find(t => t.assignedGuestIds.includes(guest.id));
      await pb.collection('guests').update(guest.id, { table_id: assigned?.id || null });
    }
  }
  if (id) {
    const r = await pb.collection('floor_maps').update(id, payload);
    return fromRecord<FloorMapData>(r);
  }
  const r = await pb.collection('floor_maps').create(payload);
  return fromRecord<FloorMapData>(r);
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
  return fromRecord<FloorMapData>(r);
}

export async function shareFloorPlanEmail(guestIds?: string[], customMessage?: string): Promise<{ count: number }> {
  const guests = guestIds?.length ? await Promise.all(guestIds.map(id => pb.collection('guests').getOne(id))) : await getAllGuests();
  const map = await getFloorMap();
  for (const g of guests) {
    const table = map.tables.find(t => t.assignedGuestIds.includes(g.id));
    console.log(`[FLOOR PLAN EMAIL] To: ${g.name} <${g.email}> | Table: ${table?.name || 'Unassigned'} | Msg: ${customMessage || ''}`);
  }
  return { count: guests.length };
}

// ─── Photos ───────────────────────────────────────────────────────

export async function getAllPhotos(): Promise<EventPhoto[]> {
  const records = await pb.collection('photos').getFullList({ sort: '-created_at' });
  return records.map(r => fromRecord<EventPhoto>(r));
}

export async function addPhotosBatch(newPhotos: Array<{ url: string; filename: string; caption?: string; uploader_name?: string; table_name?: string; table_id?: string }>): Promise<EventPhoto[]> {
  const created: EventPhoto[] = [];
  for (const p of newPhotos) {
    const r = await pb.collection('photos').create({
      url: p.url, filename: p.filename, caption: p.caption || '',
      uploader_name: p.uploader_name || 'Guest', table_name: p.table_name || 'Open Seating',
      table_id: p.table_id || '', likes: 0, created_at: new Date().toISOString(),
    });
    created.push(fromRecord<EventPhoto>(r));
  }
  return created;
}

export async function deletePhoto(id: string): Promise<void> {
  await pb.collection('photos').delete(id);
}

export async function likePhoto(id: string): Promise<EventPhoto | undefined> {
  const r = await pb.collection('photos').getOne(id);
  const updated = await pb.collection('photos').update(id, { likes: (r.likes || 0) + 1 });
  return fromRecord<EventPhoto>(updated);
}

// ─── Predictions ──────────────────────────────────────────────────

export async function getPredictions(): Promise<BabyPrediction[]> {
  const records = await pb.collection('predictions').getFullList({ sort: '-created_at' });
  return records.map(r => fromRecord<BabyPrediction>(r));
}

export async function addPrediction(payload: Omit<BabyPrediction, 'id' | 'created_at'>): Promise<BabyPrediction> {
  const r = await pb.collection('predictions').create({
    guest_name: payload.guest_name, guest_id: payload.guest_id || '',
    predicted_date: payload.predicted_date,
    predicted_weight_lbs: Number(payload.predicted_weight_lbs) || 7.0,
    predicted_hair_color: payload.predicted_hair_color || 'Brown',
    predicted_eye_color: payload.predicted_eye_color || 'Brown',
    advice_for_parents: payload.advice_for_parents || '',
    created_at: new Date().toISOString(),
  });
  return fromRecord<BabyPrediction>(r);
}

// ─── Gifts ────────────────────────────────────────────────────────

export async function getGifts(): Promise<GiftLog[]> {
  const records = await pb.collection('gifts').getFullList({ sort: '-created_at' });
  return records.map(r => fromRecord<GiftLog>(r));
}

export async function addGift(payload: Omit<GiftLog, 'id' | 'created_at' | 'thank_you_sent'>): Promise<GiftLog> {
  const r = await pb.collection('gifts').create({
    guest_name: payload.guest_name, guest_id: payload.guest_id || '',
    gift_description: payload.gift_description, category: payload.category || 'Other',
    thank_you_sent: false, created_at: new Date().toISOString(),
  });
  return fromRecord<GiftLog>(r);
}

export async function toggleGiftThankYou(id: string): Promise<GiftLog | undefined> {
  try {
    const r = await pb.collection('gifts').getOne(id);
    const now = new Date().toISOString().split('T')[0];
    const updated = await pb.collection('gifts').update(id, {
      thank_you_sent: !r.thank_you_sent,
      thank_you_date: !r.thank_you_sent ? now : null,
    });
    return fromRecord<GiftLog>(updated);
  } catch { return undefined; }
}

export async function deleteGift(id: string): Promise<void> {
  await pb.collection('gifts').delete(id);
}

export async function getGiftById(id: string): Promise<GiftLog> {
  const r = await pb.collection('gifts').getOne(id);
  return fromRecord<GiftLog>(r);
}

// ─── Agenda (host task planner) ──────────────────────────────────

export async function getAgendaTasks(): Promise<AgendaTask[]> {
  const records = await pb.collection('agenda_tasks').getFullList({ sort: 'status,position,created_at' });
  return records.map(r => fromRecord<AgendaTask>(r));
}

export async function addAgendaTask(payload: Omit<AgendaTask, 'id' | 'created_at' | 'reminder_sent' | 'position'>): Promise<AgendaTask> {
  const column = await pb.collection('agenda_tasks').getFullList({ filter: `status="${payload.status}"` });
  const r = await pb.collection('agenda_tasks').create({
    title: payload.title, description: payload.description || '',
    due_date: payload.due_date || '', due_time: payload.due_time || '',
    status: payload.status, position: column.length,
    reminder_sent: false, created_at: new Date().toISOString(),
  });
  return fromRecord<AgendaTask>(r);
}

export async function updateAgendaTask(id: string, updates: Partial<AgendaTask>): Promise<AgendaTask> {
  const patch: Record<string, unknown> = {
    title: updates.title,
    description: updates.description ?? '',
    due_date: updates.due_date || '',
    due_time: updates.due_time || '',
    status: updates.status,
  };
  // A rescheduled task may be due again — allow its reminder to fire once more.
  if ('due_date' in updates || 'due_time' in updates) {
    patch.reminder_sent = false;
  }
  const r = await pb.collection('agenda_tasks').update(id, patch);
  return fromRecord<AgendaTask>(r);
}

export async function deleteAgendaTask(id: string): Promise<void> {
  await pb.collection('agenda_tasks').delete(id);
}

// Kanban drag outcome: the moved task plus every task whose position shifted
// in the target column. One request, applied per-item (list is small).
export async function reorderAgendaTasks(items: Array<{ id: string; status: AgendaStatus; position: number }>): Promise<void> {
  for (const item of items) {
    await pb.collection('agenda_tasks').update(item.id, { status: item.status, position: item.position });
  }
}

// Dated, unfinished tasks whose reminder window is open right now.
export async function getTasksDueForReminder(now: number, advanceMs: number): Promise<AgendaTask[]> {
  const records = await pb.collection('agenda_tasks').getFullList({
    filter: 'status!="done" && reminder_sent=false && due_date!=""',
  });
  return records
    .map(r => fromRecord<AgendaTask>(r))
    .filter(t => t.due_date && isInReminderWindow(taskDueAt(t.due_date, t.due_time), advanceMs, now));
}

export async function markAgendaTaskReminded(id: string): Promise<void> {
  await pb.collection('agenda_tasks').update(id, { reminder_sent: true });
}

// One sweep: every dated, unfinished, unsent task inside the reminder window
// gets delivered on the host's enabled channels. Skipped entirely when no
// channel is configured or no contact exists.
export async function runAgendaReminderSweep(now: Date = new Date()): Promise<{ reminded: number; failed: number }> {
  let settings: EventSettings;
  try {
    settings = await getSettings();
  } catch {
    return { reminded: 0, failed: 0 }; // no settings — nothing to send to
  }
  const channels = settings.reminderChannels ?? { email: false, sms: false };
  if ((!channels.email && !channels.sms) || (channels.email && !settings.hostEmail) || (channels.sms && !settings.hostPhone)) {
    return { reminded: 0, failed: 0 };
  }
  const advanceMs = REMINDER_ADVANCE_MS[settings.reminderAdvance || '1d'];
  const due = await getTasksDueForReminder(now.getTime(), advanceMs);
  let reminded = 0, failed = 0;
  for (const task of due) {
    let ok = true;
    if (channels.email && settings.hostEmail) {
      const { sendAgendaReminderEmail } = await import('../lib/email');
      ok = await sendAgendaReminderEmail(settings.hostEmail, task, settings) && ok;
    }
    if (channels.sms && settings.hostPhone) {
      const { sendAgendaReminderSms } = await import('../lib/sms');
      ok = await sendAgendaReminderSms(settings.hostPhone, task, settings) && ok;
    }
    if (ok) {
      await markAgendaTaskReminded(task.id);
      reminded++;
    } else {
      failed++;
    }
  }
  return { reminded, failed };
}

// ─── Thank-you AI Draft & Delivery ────────────────────────────────

function buildFallbackDraft(gift: GiftLog, settings: Partial<EventSettings>): string {
  const parents = settings.parentsNames?.trim() || 'the expecting parents';
  const baby = settings.babyName?.trim();
  const babyLine = baby
    ? `as we prepare to welcome ${baby}`
    : 'as we prepare to welcome our little one';
  return `Dear ${gift.guest_name},\n\nThank you so much for the wonderful ${gift.gift_description}! Your thoughtfulness and generosity mean the world to us ${babyLine}. We are so lucky to have you in our lives!\n\nWith love and appreciation,\n${parents}`;
}

export async function generateThankYouDraft(gift: GiftLog, settings: Partial<EventSettings>): Promise<string> {
  const fallback = buildFallbackDraft(gift, settings);
  const apiKey = process.env.THANKYOU_AI_API_KEY;
  if (!apiKey) return fallback;
  try {
    const baseUrl = process.env.THANKYOU_AI_BASE_URL || 'https://opencode.ai/zen/go/v1';
    const model = process.env.THANKYOU_MODEL || 'deepseek-v4-flash';
    const prompt = [
      'Write a warm, short thank-you note (under 120 words) for a baby shower gift.',
      `From: ${settings.parentsNames?.trim() || 'the expecting parents'}`,
      settings.babyName?.trim() ? `Celebrating the upcoming arrival of baby ${settings.babyName.trim()}.` : '',
      `To: ${gift.guest_name}`,
      `Gift received: ${gift.gift_description}${gift.category ? ` (category: ${gift.category})` : ''}`,
      'Plain text only, no markdown, no subject line. Start with "Dear <name>," and end with a warm sign-off.',
    ].filter(Boolean).join('\n');
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 300,
      }),
    });
    if (!response.ok) {
      console.error(`[THANKYOU-AI] API ${response.status}: ${await response.text()}`);
      return fallback;
    }
    const data = await response.json();
    const text = data.choices?.[0]?.message?.content?.trim();
    return text || fallback;
  } catch (err) {
    console.error('[THANKYOU-AI] Draft generation failed:', err);
    return fallback;
  }
}

export async function sendGiftThankYou(
  giftId: string,
  channel: 'email' | 'text' | 'both',
  text: string
): Promise<{ sent: string[]; failed: string[] }> {
  const gift = await getGiftById(giftId);
  const records = await pb.collection('guests').getFullList();
  const guestRecord = gift.guest_id
    ? records.find((r) => r.id === gift.guest_id)
    : records.find((r) => r.name === gift.guest_name);
  if (!guestRecord) throw new Error('GUEST_NOT_FOUND');
  const guest = fromRecord<Guest>(guestRecord);

  const sent: string[] = [];
  const failed: string[] = [];
  if ((channel === 'email' || channel === 'both') && guest.email) {
    const { sendThankYouEmail } = await import('../lib/email');
    if (await sendThankYouEmail(guest, text)) sent.push('email');
    else failed.push('email');
  }
  if ((channel === 'text' || channel === 'both') && guest.phone) {
    const { sendThankYouSms } = await import('../lib/sms');
    if (await sendThankYouSms(guest, text)) sent.push('text');
    else failed.push('text');
  }
  if (sent.length === 0 && failed.length === 0) {
    throw new Error(channel === 'email' || channel === 'both' ? 'NO_EMAIL' : 'NO_PHONE');
  }
  const now = new Date().toISOString().split('T')[0];
  await pb.collection('gifts').update(giftId, { thank_you_sent: true, thank_you_date: now });
  return { sent, failed };
}

// ─── Check-in ────────────────────────────────────────────────────

// Check in one party member (by name) or the whole party (name omitted).
// The primary guest is tracked by `checked_in`, other members by
// `checked_in_names` (the primary is never duplicated into the array).
export async function checkInGuest(id: string, name?: string): Promise<Guest> {
  const now = new Date().toISOString();
  const guest = fromRecord<Guest>(await pb.collection('guests').getOne(id));
  const members = getPartyMembers(guest);

  if (name !== undefined) {
    const target = name.trim();
    if (!members.some((m) => m.toLowerCase() === target.toLowerCase())) {
      throw new Error('NOT_IN_PARTY');
    }
    if (isPartyLead(guest, target)) {
      const updated = await pb.collection('guests').update(id, { checked_in: true, checked_in_at: now });
      return fromRecord<Guest>(updated);
    }
    const checked_in_names = Array.from(new Set([...(guest.checked_in_names || []), target]));
    const updated = await pb.collection('guests').update(id, { checked_in_names, checked_in_at: now });
    return fromRecord<Guest>(updated);
  }

  // Whole party: primary via the flag, everyone else by name.
  const checked_in_names = members.filter((m) => !isPartyLead(guest, m));
  const updated = await pb.collection('guests').update(id, { checked_in: true, checked_in_names, checked_in_at: now });
  return fromRecord<Guest>(updated);
}

export async function undoCheckIn(id: string, name?: string): Promise<Guest> {
  const guest = fromRecord<Guest>(await pb.collection('guests').getOne(id));

  if (name !== undefined) {
    const target = name.trim();
    if (isPartyLead(guest, target)) {
      const updated = await pb.collection('guests').update(id, { checked_in: false });
      return fromRecord<Guest>(updated);
    }
    const checked_in_names = (guest.checked_in_names || []).filter(
      (n) => n.toLowerCase() !== target.toLowerCase()
    );
    const updated = await pb.collection('guests').update(id, { checked_in_names });
    return fromRecord<Guest>(updated);
  }

  const updated = await pb.collection('guests').update(id, {
    checked_in: false,
    checked_in_names: [],
    checked_in_at: null,
  });
  return fromRecord<Guest>(updated);
}

// Counts individuals: party members when names are stored, otherwise the guest
// as a single unit. `expected` = attending individuals, `checkedIn` = how many
// of them have checked in.
export async function getCheckInStats(): Promise<{ total: number; checkedIn: number; expected: number }> {
  const all = await getAllGuests();
  const total = all.length;
  let checkedIn = 0;
  let expected = 0;
  for (const g of all) {
    if (g.rsvp_status !== 'Attending') continue;
    const members = getPartyMembers(g);
    if (members.length > 0) {
      expected += members.length;
      checkedIn += members.filter((m) => isMemberCheckedIn(g, m)).length;
    } else {
      expected += g.attending_party_size || 1;
      checkedIn += g.checked_in ? 1 : 0;
    }
  }
  return { total, checkedIn, expected };
}

// ─── Check-in (public, self-service) ─────────────────────────────

export type SelfCheckInResult =
  | { ok: true; guest: Guest }
  | { ok: false; error: 'INVALID_TOKEN' | 'NOT_FOUND' | 'NOT_IN_PARTY' | 'ONLY_LEAD' };

// Check in / undo one party member (targetName) or the whole party (all).
// With a magic token the caller is the party lead and may act for anyone;
// with code+name, members may only check in themselves and only the lead
// may use `all`.
export async function selfCheckIn(opts: {
  token?: string;
  code?: string;
  name?: string;
  targetName?: string;
  all?: boolean;
  undo?: boolean;
}): Promise<SelfCheckInResult> {
  const records = await pb.collection('guests').getFullList();
  const { token, code, name } = opts;

  let record;
  if (token) {
    record = records.find((r) => r.magic_token === token);
    if (!record) return { ok: false, error: 'INVALID_TOKEN' };
  } else if (code && name) {
    record = records.find((r) =>
      r.code === code.trim() &&
      getPartyMembers(fromRecord<Guest>(r)).some((m) => m.toLowerCase() === name.trim().toLowerCase())
    );
    if (!record) return { ok: false, error: 'NOT_FOUND' };
  } else {
    return { ok: false, error: 'NOT_FOUND' };
  }

  const guest = fromRecord<Guest>(record);
  const identified = name?.trim() || guest.name;
  const isLead = isPartyLead(guest, identified);
  const scrub = (g: Guest) => (token ? scrubForGuestLookup(g) : scrubForRoster(g));

  if (opts.all) {
    if (!token && !isLead) return { ok: false, error: 'ONLY_LEAD' };
    const updated = opts.undo ? await undoCheckIn(record.id) : await checkInGuest(record.id);
    return { ok: true, guest: scrub(updated) };
  }

  const target = opts.targetName?.trim() || identified;
  if (!getPartyMembers(guest).some((m) => m.toLowerCase() === target.toLowerCase())) {
    return { ok: false, error: 'NOT_IN_PARTY' };
  }
  if (!token && !isLead && target.toLowerCase() !== identified.toLowerCase()) {
    return { ok: false, error: 'ONLY_LEAD' };
  }
  try {
    const updated = opts.undo
      ? await undoCheckIn(record.id, target)
      : await checkInGuest(record.id, target);
    return { ok: true, guest: scrub(updated) };
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_IN_PARTY') return { ok: false, error: 'NOT_IN_PARTY' };
    throw err;
  }
}

// ─── Invitation Sending ──────────────────────────────────────────

async function deliverToGuest(
  g: Guest,
  settings: EventSettings,
  type: 'invitation' | 'reminder'
): Promise<boolean> {
  const channel = g.delivery_channel || 'none';
  // Link-only guests were shared manually (host or inviter) — nothing to send.
  if (channel === 'none') return true;
  let ok = true;

  if ((channel === 'email' || channel === 'both') && g.email) {
    const fn = type === 'invitation' ? 'sendInvitationEmail' : 'sendReminderEmail';
    const { [fn]: sendEmail } = await import('../lib/email');
    ok = await sendEmail(g, settings) && ok;
  }
  if ((channel === 'text' || channel === 'both') && g.phone) {
    const fn = type === 'invitation' ? 'sendInvitationSms' : 'sendReminderSms';
    const { [fn]: sendSms } = await import('../lib/sms');
    ok = await sendSms(g, settings) && ok;
  }
  return ok;
}

export async function sendInvitations(guestIds?: string[]): Promise<{ sent: number; failed: number }> {
  const all = await getAllGuests();
  const guests = guestIds && guestIds.length > 0 ? all.filter(g => guestIds.includes(g.id)) : all;
  const records = await pb.collection('settings').getFullList();
  const settings = records[0] || {};
  let sent = 0, failed = 0;
  for (const g of guests) {
    if (await deliverToGuest(g, settings as any, 'invitation')) sent++; else failed++;
  }
  return { sent, failed };
}

export async function sendReminders(): Promise<{ sent: number; failed: number }> {
  const guests = (await getAllGuests()).filter(g => g.rsvp_status === 'Pending');
  const records = await pb.collection('settings').getFullList();
  const settings = records[0] || {};
  let sent = 0, failed = 0;
  for (const g of guests) {
    if (await deliverToGuest(g, settings as any, 'reminder')) sent++; else failed++;
  }
  return { sent, failed };
}

// ─── Wipe ─────────────────────────────────────────────────────────

export async function wipeDatabaseData() {
  for (const name of COLLECTION_DEFS.map(c => c.name)) {
    const records = await pb.collection(name).getFullList({ requestKey: null });
    for (const r of records) {
      await pb.collection(name).delete(r.id);
    }
  }
  return { success: true };
}

// ─── Seating Roster (public) ──────────────────────────────────────

// Public endpoint data for the seating page: full Guest shape with
// sensitive fields (email, phone, code, magic_token, dietary info) scrubbed.
function scrubForRoster(g: Guest): Guest {
  return {
    ...g,
    email: '',
    phone: '',
    // code kept: it is the guest's own day-of lookup key (printed on invites)
    magic_token: '',
    token_used: false,
    dietary_restrictions: '',
    attendee_details: undefined,
    delivery_channel: undefined,
  };
}

// Token-matched guest: they hold the invite link, so their own reservation
// code and dietary note are returned (email/phone/token stay scrubbed).
function scrubForGuestLookup(g: Guest): Guest {
  return {
    ...g,
    email: '',
    phone: '',
    magic_token: '',
    token_used: false,
    attendee_details: undefined,
    delivery_channel: undefined,
  };
}

export async function getSeatingRoster(guestToken?: string): Promise<{ roster: Guest[]; guest: Guest | null }> {
  const records = await pb.collection('guests').getFullList();
  const roster = records.map((r) => scrubForRoster(fromRecord<Guest>(r)));
  let guest: Guest | null = null;
  if (guestToken) {
    const found = records.find((r) => r.magic_token === guestToken);
    if (found) guest = scrubForGuestLookup(fromRecord<Guest>(found));
  }
  return { roster, guest };
}
