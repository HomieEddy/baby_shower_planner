// Guest-facing RSVP flow: view/submit via magic token, reset token usage,
// self-service contact updates and guest-to-guest invites.

import type { RouteCtx } from '../http';
import { parseJson, sendJson } from '../http';
import {
  getGuestByToken,
  getInvitesByGuest,
  inviteGuest,
  inviteMessageFor,
  removeInvite,
  resetTokenUsage,
  submitRsvp,
  updateGuestContact,
} from '../../db/service';

export async function handleRsvpRoutes(ctx: RouteCtx): Promise<boolean> {
  const { req, res, url } = ctx;
  const method = req.method || 'GET';
  const pathname = url.pathname;

  if (!pathname.startsWith('/api/rsvp/')) return false;

  const parts = pathname.replace('/api/rsvp/', '').split('/');
  const token = parts[0];
  const isReset = parts[1] === 'reset';
  const isContact = parts[1] === 'contact';
  const isInvite = parts[1] === 'invite' && parts.length === 2;
  const isInvitesList = parts[1] === 'invites' && parts.length === 2;
  const isInviteDelete = parts[1] === 'invites' && parts.length === 3;

  if (isInviteDelete && method === 'DELETE') {
    const removed = await removeInvite(token, parts[2]);
    if (!removed) return sendJson(res, 404, { error: 'NOT_FOUND', message: 'Invite not found' });
    return sendJson(res, 200, { success: true });
  }

  if (isInvitesList && method === 'GET') {
    const invites = await getInvitesByGuest(token);
    const withMessages = await Promise.all(invites.map(async (g) => ({ ...g, invite_message: await inviteMessageFor(g) })));
    return sendJson(res, 200, { invites: withMessages });
  }

  if (isInvite && method === 'POST') {
    const body = await parseJson(req);
    const result = await inviteGuest(token, {
      name: body.name, contact: body.contact, channel: body.channel, note: body.note,
    });
    if (!result.ok) {
      const msg = result.error === 'NAME_REQUIRED' ? 'Invitee name is required'
        : result.error === 'CONTACT_REQUIRED' ? 'Contact is required for that delivery channel'
        : 'Invalid invitation token';
      return sendJson(res, result.error === 'INVALID_TOKEN' ? 404 : 400, { error: result.error, message: msg });
    }
    return sendJson(res, 200, result);
  }

  if (isContact && method === 'POST') {
    const body = await parseJson(req);
    const { email, phone, delivery_channel } = body;
    if (!['none', 'email', 'text', 'both'].includes(delivery_channel)) {
      return sendJson(res, 400, { error: 'Invalid delivery channel' });
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return sendJson(res, 400, { error: 'Invalid email address' });
    }
    try {
      const guest = await updateGuestContact(token, { email, phone, delivery_channel });
      return sendJson(res, 200, { success: true, guest });
    } catch (err) {
      const msg = err instanceof Error && err.message === 'EMAIL_REQUIRED' ? 'Email is required for email delivery'
        : err instanceof Error && err.message === 'PHONE_REQUIRED' ? 'Phone number is required for SMS delivery'
        : 'Invalid invitation token';
      return sendJson(res, err instanceof Error && (err.message === 'EMAIL_REQUIRED' || err.message === 'PHONE_REQUIRED') ? 400 : 404, { error: 'CONTACT_UPDATE_FAILED', message: msg });
    }
  }

  if (isReset && method === 'POST') {
    try {
      const guest = await resetTokenUsage(token);
      return sendJson(res, 200, { success: true, guest });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'INVALID_TOKEN') return sendJson(res, 404, { error: 'INVALID_TOKEN', message: 'Invitation token not found' });
      if (msg === 'RSVP_READ_ONLY') return sendJson(res, 403, { error: 'RSVP_READ_ONLY' });
      if (msg === 'RSVP_CLOSED') return sendJson(res, 409, { error: 'RSVP_CLOSED', message: 'RSVPs are closed — the event has already passed.' });
      throw err;
    }
  }

  if (method === 'GET') {
    const guest = await getGuestByToken(token);
    if (!guest) return sendJson(res, 404, { error: 'INVALID_TOKEN', message: 'Invitation token not found' });
    return sendJson(res, 200, { guest });
  }

  if (method === 'POST') {
    const body = await parseJson(req);
    const { rsvp_status, attending_party_size, dietary_restrictions, attendee_details, attendee_names } = body;
    if (!['Attending', 'Declined'].includes(rsvp_status)) {
      return sendJson(res, 400, { error: 'Invalid RSVP status' });
    }
    try {
      const updated = await submitRsvp(token, {
        rsvp_status, attending_party_size: Number(attending_party_size) || 1,
        dietary_restrictions: dietary_restrictions || '',
        attendee_details,
        attendee_names,
      });
      return sendJson(res, 200, { success: true, guest: updated });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'INVALID_TOKEN') return sendJson(res, 404, { error: 'INVALID_TOKEN', message: 'Invitation token not found' });
      if (msg === 'RSVP_ALREADY_SUBMITTED') return sendJson(res, 409, { error: 'RSVP_ALREADY_SUBMITTED', message: 'This RSVP was already submitted. Edit it from the confirmation screen.' });
      if (msg === 'RSVP_CLOSED') return sendJson(res, 409, { error: 'RSVP_CLOSED', message: 'RSVPs are closed — the event has already passed.' });
      throw err;
    }
  }

  return false;
}