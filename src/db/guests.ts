// Guest admin CRUD + batch import. RSVP/submission logic lives in `rsvp.ts`.

import type { Guest, AddGuestPayload, RegisterGuestPayload, EventSettings, Language } from '../types';
import { buildInviteMessage, buildUniversalInviteMessage, composeInvitation } from '../lib/compose';
import { escFilter, fromRecord, newMagicToken, newReservationCode, pb, removeGuestFromFloorMaps } from './client';
import { getSettings } from './settings';
import { notifyGuest } from './notify';

// Missing/empty approval_status = approved: legacy host-added guests and
// pre-feature records must keep working.
export function isApproved(guest: Pick<Guest, 'approval_status'>): boolean {
  return !guest.approval_status || guest.approval_status === 'approved';
}

export async function getAllGuests(): Promise<Guest[]> {
  const records = await pb.collection('guests').getFullList({ sort: '-created_at' });
  return records.map(r => fromRecord<Guest>(r));
}

export async function getGuestByToken(token: string): Promise<Guest | undefined> {
  try {
    const r = await pb.collection('guests').getFirstListItem(`magic_token="${escFilter(token)}"`);
    return fromRecord<Guest>(r);
  } catch { return undefined; }
}

export async function getGuestByCode(code: string): Promise<Guest | undefined> {
  try {
    const r = await pb.collection('guests').getFirstListItem(`code="${escFilter(code)}"`);
    return fromRecord<Guest>(r);
  } catch { return undefined; }
}

export async function getGuestById(id: string): Promise<Guest> {
  const r = await pb.collection('guests').getOne(id);
  return fromRecord<Guest>(r);
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

export async function addGuest(payload: AddGuestPayload): Promise<{ guest: Guest; magic_token: string; invite_message: string }> {
  // Host-registered "going" guest: no invitation is sent; the record is created
  // already Attending (the code/magic token stay available for day-of use).
  const going = payload.rsvp_status === 'Attending';
  const existing = payload.email || payload.phone
    ? await pb.collection('guests').getList(1, 1, {
        filter: payload.email ? `email="${escFilter(payload.email)}"` : `phone="${escFilter(payload.phone || '')}"`,
      })
    : { items: [] };
  if (existing.items.length > 0) {
    const g = fromRecord<Guest>(existing.items[0]);
    // Re-registering an existing contact as "going" promotes the record.
    if (going && g.rsvp_status !== 'Attending') {
      const promoted = fromRecord<Guest>(await pb.collection('guests').update(g.id, {
        rsvp_status: 'Attending', attending_party_size: g.max_party_size || g.attending_party_size || 1,
        token_used: true,
      }));
      return { guest: promoted, magic_token: promoted.magic_token, invite_message: await inviteMessageFor(promoted) };
    }
    return { guest: g, magic_token: g.magic_token, invite_message: await inviteMessageFor(g) };
  }
  const magic_token = newMagicToken();
  const partySize = payload.max_party_size && payload.max_party_size > 0 ? payload.max_party_size : 1;
  const code = newReservationCode();
  const guest = await pb.collection('guests').create({
    name: payload.name,
    email: payload.email || '',
    phone: payload.phone || '',
    delivery_channel: payload.delivery_channel || 'none',
    code, max_party_size: partySize, rsvp_status: going ? 'Attending' : 'Pending',
    attending_party_size: partySize,
    attendee_names: [payload.name],
    attendee_details: [{ name: payload.name, contact: payload.email || payload.phone || '' }],
    dietary_restrictions: '', language_pref: payload.language_pref || 'FR',
    magic_token, token_used: going, created_at: new Date().toISOString(),
    is_read_only: false,
  });
  const g = fromRecord<Guest>(guest);
  return { guest: g, magic_token, invite_message: await inviteMessageFor(g) };
}

// Universal-link self-registration. The registrant confirms their whole party
// up front, so the record is created already "Attending" and token_used — but
// pending host approval, which is what unlocks the magic link.
export type RegisterGuestResult = { guest: Guest; already_registered: boolean };

export async function registerGuest(payload: RegisterGuestPayload, refId?: string): Promise<RegisterGuestResult> {
  const name = (payload.name || '').trim();
  const email = (payload.email || '').trim();
  const phone = (payload.phone || '').trim();

  // One contact = one guest record (and one magic link); re-registration just
  // returns the existing record + its current status.
  const existing = email || phone
    ? await pb.collection('guests').getList(1, 1, { filter: email ? `email="${escFilter(email)}"` : `phone="${escFilter(phone)}"` })
    : { items: [] };
  if (existing.items.length > 0) {
    return { guest: fromRecord<Guest>(existing.items[0]), already_registered: true };
  }

  const details = Array.isArray(payload.attendee_details)
    ? payload.attendee_details.filter(d => d && typeof d.name === 'string' && d.name.trim()).map(d => ({ name: d.name.trim(), contact: (d.contact || '').trim() }))
    : [];
  let names = Array.isArray(payload.attendee_names)
    ? payload.attendee_names.filter(n => typeof n === 'string' && n.trim()).map(n => n.trim())
    : [];
  if (names.length === 0) names = details.map(d => d.name);
  if (names.length === 0) names = [name];
  names = names.slice(0, 20);
  const partySize = names.length;
  const finalDetails = details.length > 0 ? details.slice(0, partySize) : names.map(n => ({ name: n, contact: '' }));

  // Provenance from the inviter's share link, when present.
  const invite = refId ? await pb.collection('invites').getOne(refId).catch(() => null) : null;

  const delivery_channel = email && phone ? 'both' : email ? 'email' : phone ? 'text' : 'none';
  const magic_token = newMagicToken();
  const code = newReservationCode();
  const created = await pb.collection('guests').create({
    name, email, phone, delivery_channel, code,
    max_party_size: partySize, attending_party_size: partySize,
    rsvp_status: 'Attending', token_used: true,
    attendee_names: names, attendee_details: finalDetails,
    dietary_restrictions: (payload.dietary_restrictions || '').trim(),
    language_pref: payload.language_pref === 'EN' ? 'EN' : 'FR',
    magic_token, created_at: new Date().toISOString(),
    is_read_only: false,
    approval_status: 'pending',
    invited_by_guest_id: invite?.inviter_guest_id || '',
    invited_by_guest_name: invite?.inviter_guest_name || '',
    guest_note: invite?.note || '',
  });
  const guest = fromRecord<Guest>(created);
  if (invite) {
    await pb.collection('invites').update(invite.id, { registered_guest_id: guest.id }).catch(() => { /* non-fatal */ });
  }
  return { guest, already_registered: false };
}

// Host decision on a self-registration. Approving delivers the magic link on
// the guest's chosen channel (best effort); rejecting keeps the record.
export async function setApproval(id: string, decision: 'approved' | 'rejected'): Promise<Guest> {
  const updated = await pb.collection('guests').update(id, { approval_status: decision });
  const guest = fromRecord<Guest>(updated);
  if (decision === 'approved' && guest.delivery_channel && guest.delivery_channel !== 'none') {
    let settings: Partial<EventSettings> = {};
    try { settings = await getSettings(); } catch { /* settings missing — skip send */ }
    await notifyGuest(guest, composeInvitation(guest, settings, guest.language_pref));
  }
  return guest;
}

// Host-facing universal share message (no ref — plain /register link).
export async function getUniversalInviteMessage(language: Language = 'FR'): Promise<string> {
  let settings: Partial<EventSettings> = {};
  try { settings = await getSettings(); } catch { /* settings not seeded yet */ }
  return buildUniversalInviteMessage(settings, language);
}

export async function updateGuest(id: string, updates: Partial<Guest>): Promise<Guest> {
  const updated = await pb.collection('guests').update(id, updates);
  return fromRecord<Guest>(updated);
}

export async function deleteGuest(id: string): Promise<void> {
  await pb.collection('guests').delete(id);
  await removeGuestFromFloorMaps(id);
}

export async function batchImportGuests(guestList: AddGuestPayload[]): Promise<{ imported: Guest[]; count: number }> {
  const existing = await pb.collection('guests').getFullList();
  const knownEmails = new Set(existing.map((g: any) => (g.email || '').toLowerCase()));
  const knownPhones = new Set(existing.map((g: any) => (g.phone || '').trim()));
  const validChannels = ['email', 'text', 'both', 'none'];
  const imported: Guest[] = [];
  for (const item of guestList) {
    if (!item.name?.trim()) continue;
    const email = (item.email || '').trim();
    const phone = (item.phone || '').trim();
    // Skip duplicates instead of minting a second magic link for one contact.
    if ((email && knownEmails.has(email.toLowerCase())) || (phone && knownPhones.has(phone))) continue;
    const magic_token = newMagicToken();
    const code = newReservationCode();
    const channel = validChannels.includes(item.delivery_channel || '') ? item.delivery_channel : 'email';
    const g = await pb.collection('guests').create({
      name: item.name.trim(), email, phone,
      delivery_channel: channel, code,
      max_party_size: Number(item.max_party_size) || 1,
      rsvp_status: 'Pending', attending_party_size: 0,
      dietary_restrictions: '', language_pref: item.language_pref === 'EN' ? 'EN' : 'FR',
      magic_token, token_used: false,
      created_at: new Date().toISOString(),
    });
    if (email) knownEmails.add(email.toLowerCase());
    if (phone) knownPhones.add(phone);
    imported.push(fromRecord<Guest>(g));
  }
  return { imported, count: imported.length };
}