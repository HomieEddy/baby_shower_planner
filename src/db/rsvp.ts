// RSVP submission, self-service contact updates and guest-to-guest invites.

import type { Guest, SubmitRsvpPayload, EventSettings } from '../types';
import {
  escFilter, fromRecord, newMagicToken, newReservationCode, pb, removeGuestFromFloorMaps,
} from './client';
import { getSettings } from './settings';
import { deleteGuest, inviteMessageFor } from './guests';

// RSVPs close the day after the event: on the day itself guests can still
// respond (people check invites on their phones while arriving).
export async function isRsvpClosed(): Promise<boolean> {
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
  const r = await pb.collection('guests').getFirstListItem(`magic_token="${escFilter(token)}"`).catch(() => null);
  if (!r) throw new Error('INVALID_TOKEN');
  if (r.is_read_only) return fromRecord<Guest>(r);
  // Second submission (open tabs, shared links) must not silently overwrite:
  // the client resets the token first, which is the only way to edit an RSVP.
  if (r.token_used) throw new Error('RSVP_ALREADY_SUBMITTED');
  if (await isRsvpClosed()) throw new Error('RSVP_CLOSED');

  const updates: Record<string, unknown> = {
    rsvp_status: payload.rsvp_status,
    dietary_restrictions: payload.dietary_restrictions || '',
    token_used: true,
  };

  if (payload.rsvp_status === 'Attending') {
    const details = Array.isArray(payload.attendee_details)
      ? payload.attendee_details.filter(d => d && typeof d.name === 'string' && d.name.trim())
      : [];
    let names: string[];
    if (details.length > 0) {
      names = details.map(d => d.name.trim());
    } else {
      const raw = Array.isArray(payload.attendee_names)
        ? payload.attendee_names.filter(n => typeof n === 'string' && n.trim())
        : [];
      names = raw.length > 0 ? raw.map(n => n.trim()) : [r.name];
    }
    // Never exceed the party size the host granted.
    names = names.slice(0, Math.max(1, Number(r.max_party_size) || 1));
    updates.attendee_details = details.slice(0, names.length);
    updates.attendee_names = names;
    updates.attending_party_size = names.length;
  } else {
    updates.attendee_names = [];
    updates.attendee_details = [];
    updates.attending_party_size = 0;
    updates.table_id = null;
  }
  const updated = await pb.collection('guests').update(r.id, updates);
  if (payload.rsvp_status === 'Declined') {
    await removeGuestFromFloorMaps(r.id);
  }
  return fromRecord<Guest>(updated);
}

export async function resetTokenUsage(token: string): Promise<Guest> {
  const r = await pb.collection('guests').getFirstListItem(`magic_token="${escFilter(token)}"`).catch(() => null);
  if (!r) throw new Error('INVALID_TOKEN');
  if (r.is_read_only) throw new Error('RSVP_READ_ONLY');
  if (await isRsvpClosed()) throw new Error('RSVP_CLOSED');
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
  const r = await pb.collection('guests').getFirstListItem(`magic_token="${escFilter(token)}"`);
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
  const inviter = await pb.collection('guests').getFirstListItem(`magic_token="${escFilter(token)}"`).catch(() => null);
  if (!inviter) return { ok: false, error: 'INVALID_TOKEN' };
  const name = (payload.name || '').trim();
  if (!name) return { ok: false, error: 'NAME_REQUIRED' };

  const contact = (payload.contact || '').trim();
  const channel = payload.channel || 'link-only';
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
  const phone = !isEmail ? contact : '';
  const email = isEmail ? contact : '';
  if (channel !== 'link-only' && !contact) return { ok: false, error: 'CONTACT_REQUIRED' };
  // The contact must actually serve the chosen channel — otherwise the invitee
  // would get a guest record that can never be reached.
  if ((channel === 'email' || channel === 'both') && !isEmail) return { ok: false, error: 'CONTACT_REQUIRED' };
  if (channel === 'text' && isEmail) return { ok: false, error: 'CONTACT_REQUIRED' };

  // Dedupe on contact (email preferred, falls back to phone) — reuse the link.
  if (contact) {
    const existing = await pb.collection('guests').getList(1, 1, {
      filter: email ? `email="${escFilter(email)}"` : `phone="${escFilter(phone)}"`,
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

  const magic_token = newMagicToken();
  const code = newReservationCode();
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
  const inviter = await pb.collection('guests').getFirstListItem(`magic_token="${escFilter(token)}"`).catch(() => null);
  if (!inviter) return [];
  const records = await pb.collection('guests').getFullList({
    filter: `invited_by_guest_id="${inviter.id}"`,
    sort: '-created_at',
  });
  return records.map(r => fromRecord<Guest>(r));
}

// Guests may remove their own invites (host can always re-add/revert in admin).
export async function removeInvite(token: string, inviteId: string): Promise<boolean> {
  const inviter = await pb.collection('guests').getFirstListItem(`magic_token="${escFilter(token)}"`).catch(() => null);
  if (!inviter) return false;
  const invite = await pb.collection('guests').getOne(inviteId).catch(() => null);
  if (!invite || String(invite.invited_by_guest_id || '') !== inviter.id) return false;
  await deleteGuest(inviteId);
  return true;
}