// Guest admin CRUD + batch import. RSVP/submission logic lives in `rsvp.ts`.

import type { Guest, AddGuestPayload, RegisterGuestPayload, Language } from '../types';
import { buildInviteMessage, buildUniversalInviteMessage, composeInvitation } from '../lib/compose';
import { getPartyMembers, dedupePartyNames, isAttending, mergeParty, partyNames, MAX_REGISTERED_PARTY } from '../lib/guestAttendees';
import { DomainError } from '../lib/errors';
import { escFilter, fromRecord, newMagicToken, newReservationCode, pb, removeAttendeeFromFloorMaps, removeGuestFromFloorMaps } from './client';
import { getSettingsOrDefaults } from './settings';
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
  return buildInviteMessage(guest, await getSettingsOrDefaults(), guest.language_pref);
}

export async function addGuest(payload: AddGuestPayload): Promise<{ guest: Guest; magic_token: string; invite_message: string }> {
  // Host-registered "going" guest: no invitation is sent; the record is created
  // already Attending (the code/magic token stay available for day-of use).
  const going = payload.rsvp_status === 'Attending';
  const partySize = payload.max_party_size && payload.max_party_size > 0 ? payload.max_party_size : 1;
  // Party members: the primary guest first, then the host-entered names, capped
  // at the allowed party size and deduped by the Party Roster module.
  const primary = payload.name;
  const attendee_details = mergeParty(primary, payload.attendee_names, [payload.attendee_details], partySize);
  if (attendee_details[0]) attendee_details[0].contact = payload.email || payload.phone || '';
  const names = attendee_details.map((d) => d.name);
  const primaryDietary = attendee_details[0]?.dietary || '';

  const existing = payload.email || payload.phone
    ? await pb.collection('guests').getList(1, 1, {
        filter: payload.email ? `email="${escFilter(payload.email)}"` : `phone="${escFilter(payload.phone || '')}"`,
      })
    : { items: [] };
  if (existing.items.length > 0) {
    const g = fromRecord<Guest>(existing.items[0]);
    // Re-registering an existing contact as "going" promotes the record.
    if (going && !isAttending(g)) {
      const promoted = fromRecord<Guest>(await pb.collection('guests').update(g.id, {
        rsvp_status: 'Attending', attending_party_size: names.length,
        attendee_names: names, attendee_details, dietary_restrictions: primaryDietary, token_used: true,
      }));
      return { guest: promoted, magic_token: promoted.magic_token, invite_message: await inviteMessageFor(promoted) };
    }
    return { guest: g, magic_token: g.magic_token, invite_message: await inviteMessageFor(g) };
  }

  const magic_token = newMagicToken();
  const code = newReservationCode();
  const guest = await pb.collection('guests').create({
    name: payload.name,
    email: payload.email || '',
    phone: payload.phone || '',
    delivery_channel: payload.delivery_channel || 'none',
    code, max_party_size: partySize, rsvp_status: going ? 'Attending' : 'Pending',
    attending_party_size: going ? names.length : partySize,
    attendee_names: names,
    attendee_details,
    dietary_restrictions: primaryDietary, language_pref: payload.language_pref || 'FR',
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

  const details = Array.isArray(payload.attendee_details) ? payload.attendee_details : [];
  const declared = Array.isArray(payload.attendee_names)
    ? payload.attendee_names.filter(n => typeof n === 'string' && n.trim())
    : [];
  const attendee_details = mergeParty(
    name,
    declared.length > 0 ? declared : partyNames(details),
    [details],
    MAX_REGISTERED_PARTY
  );
  const names = attendee_details.map(d => d.name);
  const partySize = names.length;
  const primaryDietary = (attendee_details[0]?.dietary || payload.dietary_restrictions || '').trim();

  // Provenance from the inviter's share link, when present.
  const invite = refId ? await pb.collection('invites').getOne(refId).catch(() => null) : null;

  const delivery_channel = email && phone ? 'both' : email ? 'email' : phone ? 'text' : 'none';
  const magic_token = newMagicToken();
  const code = newReservationCode();
  const created = await pb.collection('guests').create({
    name, email, phone, delivery_channel, code,
    max_party_size: partySize, attending_party_size: partySize,
    rsvp_status: 'Attending', token_used: true,
    attendee_names: names, attendee_details,
    dietary_restrictions: primaryDietary,
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
    // Best effort: the approval is already persisted, so a delivery failure must
    // not surface as a 500 (which made the UI show an error after it succeeded).
    try {
      const settings = await getSettingsOrDefaults();
      await notifyGuest(guest, composeInvitation(guest, settings, guest.language_pref));
    } catch (err) {
      console.error('[approval] notification failed:', err);
    }
  }
  return guest;
}

// Host-facing universal share message (no ref — plain /register link).
export async function getUniversalInviteMessage(language: Language = 'FR'): Promise<string> {
  return buildUniversalInviteMessage(await getSettingsOrDefaults(), language);
}

export async function updateGuest(id: string, updates: Partial<Guest>): Promise<Guest> {
  // Party edits arrive as the ordered list of extra member names. Keep the
  // stored arrays, attendance count, check-in and floor seats consistent with
  // the (possibly changed) group size.
  if (!Array.isArray(updates.attendee_names)) {
    const updated = await pb.collection('guests').update(id, updates);
    return fromRecord<Guest>(updated);
  }

  const guest = await getGuestById(id);
  const status = updates.rsvp_status || guest.rsvp_status;
  const declined = status === 'Declined';
  const max = Math.max(1, Number(updates.max_party_size ?? guest.max_party_size) || 1);
  const primary = ((updates.name ?? guest.name) || '').trim() || guest.name;

  const names = dedupePartyNames(primary, updates.attendee_names, max);

  // Declining clears the party entirely; otherwise the attended count is the
  // number of named members (not the allowed size).
  const finalNames = declined ? [] : names;
  // Incoming details win per member; the stored list fills the gaps.
  const attendee_details = finalNames.length === 0
    ? []
    : mergeParty(primary, finalNames, [updates.attendee_details, guest.attendee_details], finalNames.length);
  const checked_in_names = declined
    ? []
    : (guest.checked_in_names || []).filter((n) =>
        finalNames.some((m) => m.toLowerCase() === n.trim().toLowerCase())
      );

  const patch: Partial<Guest> = {
    ...updates,
    attendee_names: finalNames,
    attendee_details,
    attending_party_size: declined ? 0 : finalNames.length,
    checked_in_names,
  };
  if (declined) {
    patch.checked_in = false;
    patch.table_id = '';
  }

  const updated = await pb.collection('guests').update(id, patch);
  // Re-pack the seats: keep the chairs of the attendees that remain, drop the rest.
  await removeGuestFromFloorMaps(id, declined ? 0 : finalNames.length);
  return fromRecord<Guest>(updated);
}

export async function deleteGuest(id: string): Promise<void> {
  await pb.collection('guests').delete(id);
  await removeGuestFromFloorMaps(id);
}

// Remove one member from a party ("group"). Removing the lead promotes the
// chosen (or first) remaining member; removing the last member deletes the
// record. Seats are reindexed and check-in state follows the removed name.
export async function removeGuestAttendee(
  id: string,
  attendeeIndex: number,
  promoteName?: string
): Promise<{ deleted: boolean; guest?: Guest }> {
  const guest = await getGuestById(id);
  const members = getPartyMembers(guest);
  if (!Number.isInteger(attendeeIndex) || attendeeIndex < 0 || attendeeIndex >= members.length) {
    throw new DomainError('ATTENDEE_NOT_FOUND');
  }
  if (members.length <= 1) {
    await deleteGuest(id);
    return { deleted: true };
  }

  const removedName = members[attendeeIndex];
  let ordered = members.filter((_, i) => i !== attendeeIndex);
  // Promote a specific remaining member (or the first) when the lead is removed.
  if (attendeeIndex === 0) {
    const chosen = promoteName && ordered.includes(promoteName) ? promoteName : ordered[0];
    ordered = [chosen, ...ordered.filter((n) => n !== chosen)];
  }

  const attendee_details = mergeParty(ordered[0], ordered.slice(1), [guest.attendee_details], ordered.length);

  let checked_in = guest.checked_in;
  let checked_in_names = (guest.checked_in_names || []).filter(
    (n) => n.trim().toLowerCase() !== removedName.trim().toLowerCase()
  );
  if (attendeeIndex === 0) {
    const newLead = ordered[0];
    checked_in = checked_in_names.some((n) => n.trim().toLowerCase() === newLead.trim().toLowerCase());
    checked_in_names = checked_in_names.filter((n) => n.trim().toLowerCase() !== newLead.trim().toLowerCase());
  }

  const updated = await pb.collection('guests').update(id, {
    name: ordered[0],
    attendee_names: ordered,
    attendee_details,
    dietary_restrictions: attendee_details[0]?.dietary || '',
    attending_party_size: ordered.length,
    checked_in,
    checked_in_names,
  });
  await removeAttendeeFromFloorMaps(id, attendeeIndex);
  return { deleted: false, guest: fromRecord<Guest>(updated) };
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