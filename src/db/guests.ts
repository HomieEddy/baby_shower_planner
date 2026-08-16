// Guest admin CRUD + batch import. RSVP/submission logic lives in `rsvp.ts`.

import type { Guest, AddGuestPayload, EventSettings } from '../types';
import { buildInviteMessage } from '../lib/inviteMessage';
import { escFilter, fromRecord, newMagicToken, newReservationCode, pb, removeGuestFromFloorMaps } from './client';
import { getSettings } from './settings';

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
  const existing = payload.email || payload.phone
    ? await pb.collection('guests').getList(1, 1, {
        filter: payload.email ? `email="${escFilter(payload.email)}"` : `phone="${escFilter(payload.phone || '')}"`,
      })
    : { items: [] };
  if (existing.items.length > 0) {
    const g = fromRecord<Guest>(existing.items[0]);
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