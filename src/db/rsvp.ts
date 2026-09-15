// RSVP submission, self-service contact updates and guest-to-guest invites.

import type { Guest, GuestInvite, GuestInviteView, SubmitRsvpPayload, Language } from '../types';
import {
  escFilter, fromRecord, pb, removeGuestFromFloorMaps,
} from './client';
import { getSettings, getSettingsOrDefaults } from './settings';
import { isRehearsalActive } from './rehearsal';
import { getGuestById, getGuestByToken, isApproved } from './guests';
import { DomainError } from '../lib/errors';
import { buildUniversalInviteMessage, universalRegisterUrl } from '../lib/compose';
import { mergeParty, partyNames } from '../lib/guestAttendees';

// RSVPs close the day after the event: on the day itself guests can still
// respond (people check invites on their phones while arriving).
export async function isRsvpClosed(): Promise<boolean> {
  // Rehearsal keeps RSVP open so the submission flow is always testable.
  if (isRehearsalActive()) return false;
  try {
    const settings = await getSettings();
    if (!settings.date) return false;
    const eventDay = new Date(settings.date + 'T00:00:00').getTime();
    const today = new Date();
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    return startOfToday > eventDay;
  } catch {
    return false; // no settings — nothing to close against
  }
}

export async function submitRsvp(token: string, payload: SubmitRsvpPayload): Promise<Guest> {
  const guest = await getGuestByToken(token);
  if (!guest) throw new DomainError('INVALID_TOKEN');
  if (guest.is_read_only) return guest;
  if (!isApproved(guest)) {
    throw new DomainError(guest.approval_status === 'rejected' ? 'REGISTRATION_REJECTED' : 'PENDING_APPROVAL');
  }
  // Second submission (open tabs, shared links) must not silently overwrite:
  // the client resets the token first, which is the only way to edit an RSVP.
  if (guest.token_used) throw new DomainError('RSVP_ALREADY_SUBMITTED');
  if (await isRsvpClosed()) throw new DomainError('RSVP_CLOSED');

  const updates: Record<string, unknown> = {
    rsvp_status: payload.rsvp_status,
    dietary_restrictions: payload.dietary_restrictions || '',
    token_used: true,
  };

  let keepAttendees = 0;
  if (payload.rsvp_status === 'Attending') {
    const details = Array.isArray(payload.attendee_details)
      ? payload.attendee_details.filter(d => d && typeof d.name === 'string' && d.name.trim())
      : [];
    const declared = Array.isArray(payload.attendee_names)
      ? payload.attendee_names.filter(n => typeof n === 'string' && n.trim())
      : [];
    const names = details.length > 0 ? partyNames(details) : declared.length > 0 ? declared : [guest.name];
    // Never exceed the party size the host granted.
    const attendee_details = mergeParty(guest.name, names, [details], Math.max(1, Number(guest.max_party_size) || 1));
    updates.attendee_names = attendee_details.map(d => d.name);
    updates.attendee_details = attendee_details;
    updates.attending_party_size = attendee_details.length;
    // Keep the legacy party-level field mirroring the lead's restriction.
    updates.dietary_restrictions = (attendee_details[0]?.dietary || payload.dietary_restrictions || '').trim();
    keepAttendees = attendee_details.length;
  } else {
    updates.attendee_names = [];
    updates.attendee_details = [];
    updates.attending_party_size = 0;
    updates.table_id = null;
  }
  const updated = await pb.collection('guests').update(guest.id, updates);
  // Declined keeps 0; a shrunk attending party keeps only its remaining chairs.
  await removeGuestFromFloorMaps(guest.id, keepAttendees);
  return fromRecord<Guest>(updated);
}

export async function resetTokenUsage(token: string): Promise<Guest> {
  const guest = await getGuestByToken(token);
  if (!guest) throw new DomainError('INVALID_TOKEN');
  if (guest.is_read_only) throw new DomainError('RSVP_READ_ONLY');
  if (!isApproved(guest)) {
    throw new DomainError(guest.approval_status === 'rejected' ? 'REGISTRATION_REJECTED' : 'PENDING_APPROVAL');
  }
  if (await isRsvpClosed()) throw new DomainError('RSVP_CLOSED');
  const updated = await pb.collection('guests').update(guest.id, { token_used: false });
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
  const guest = await getGuestByToken(token);
  if (!guest) throw new DomainError('INVALID_TOKEN');
  const channel = payload.delivery_channel || 'none';
  const email = (payload.email || '').trim();
  const phone = (payload.phone || '').trim();
  if ((channel === 'email' || channel === 'both') && !email) throw new DomainError('EMAIL_REQUIRED');
  if ((channel === 'text' || channel === 'both') && !phone) throw new DomainError('PHONE_REQUIRED');
  const updated = await pb.collection('guests').update(guest.id, { email, phone, delivery_channel: channel });
  return fromRecord<Guest>(updated);
}

export type GuestInviteResult =
  | { ok: true; invite: GuestInviteView; already_invited: boolean }
  | { ok: false; error: 'INVALID_TOKEN' | 'NAME_REQUIRED' };

async function inviteView(record: Record<string, unknown>, language: Language): Promise<GuestInviteView> {
  const invite = fromRecord<GuestInvite>(record);
  const settings = await getSettingsOrDefaults();
  const registered_guest = invite.registered_guest_id
    ? await getGuestById(invite.registered_guest_id).catch(() => undefined)
    : undefined;
  return {
    ...invite,
    invite_url: universalRegisterUrl(invite.id),
    invite_message: buildUniversalInviteMessage(settings, language, invite.id),
    registered_guest,
  };
}

// A guest invites someone from their reservation page: no guest record is
// created, just a share link (with provenance) the inviter copies/sends. The
// invitee appears in "your invitations" as pending until they self-register.
export async function createInvite(token: string, payload: { name: string; contact?: string; note?: string }): Promise<GuestInviteResult> {
  const inviter = await getGuestByToken(token);
  if (!inviter) return { ok: false, error: 'INVALID_TOKEN' };
  const name = (payload.name || '').trim();
  if (!name) return { ok: false, error: 'NAME_REQUIRED' };

  const language: Language = inviter.language_pref === 'EN' ? 'EN' : 'FR';
  const contact = (payload.contact || '').trim();
  const note = (payload.note || '').trim();

  // Same contact already invited by this guest → reuse that share link.
  if (contact) {
    const dup = await pb.collection('invites').getList(1, 1, {
      filter: `inviter_guest_id="${inviter.id}" && contact="${escFilter(contact)}"`,
      sort: '-created_at',
    });
    if (dup.items.length > 0) {
      return { ok: true, invite: await inviteView(dup.items[0], language), already_invited: true };
    }
  }

  const created = await pb.collection('invites').create({
    inviter_guest_id: inviter.id,
    inviter_guest_name: inviter.name,
    invitee_name: name,
    contact,
    note,
    created_at: new Date().toISOString(),
  });
  return { ok: true, invite: await inviteView(created, language), already_invited: false };
}

// Shares this guest created — pending ("invited") or already registered.
export async function getInvitesByGuest(token: string): Promise<GuestInviteView[]> {
  const inviter = await getGuestByToken(token);
  if (!inviter) return [];
  const language: Language = inviter.language_pref === 'EN' ? 'EN' : 'FR';
  const records = await pb.collection('invites').getFullList({
    filter: `inviter_guest_id="${inviter.id}"`,
    sort: '-created_at',
  });
  return Promise.all(records.map(r => inviteView(r, language)));
}

// Guests may remove their own pending shares; a registered invitee is a real
// guest now (host deletes those in the admin).
export async function removeInvite(token: string, inviteId: string): Promise<boolean> {
  const inviter = await getGuestByToken(token);
  if (!inviter) return false;
  const invite = await pb.collection('invites').getOne(inviteId).catch(() => null);
  if (!invite || String(invite.inviter_guest_id || '') !== inviter.id) return false;
  if (invite.registered_guest_id) return false;
  await pb.collection('invites').delete(inviteId);
  return true;
}