// Guest-facing RSVP flow: view/submit via magic token, reset token usage,
// self-service contact updates and guest-to-guest invites.

import type { RouteCtx } from '../http';
import { parseJson, sendJson } from '../http';
import { GuestRsvpSchema } from '../../lib/validation';
import { errorMessage, errorStatus } from '../../lib/errors';
import {
  createInvite,
  getGuestByToken,
  getInvitesByGuest,
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
    return sendJson(res, 200, { invites });
  }

  if (isInvite && method === 'POST') {
    const body = await parseJson(req);
    const result = await createInvite(token, {
      name: body.name, contact: body.contact, note: body.note,
    });
    if (!result.ok) {
      return sendJson(res, errorStatus(result.error), { error: result.error, message: errorMessage(result.error) });
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
    // INVALID_TOKEN / EMAIL_REQUIRED / PHONE_REQUIRED propagate as DomainError.
    const guest = await updateGuestContact(token, { email, phone, delivery_channel });
    return sendJson(res, 200, { success: true, guest });
  }

  if (isReset && method === 'POST') {
    const guest = await resetTokenUsage(token);
    return sendJson(res, 200, { success: true, guest });
  }

  if (method === 'GET') {
    const guest = await getGuestByToken(token);
    if (!guest) return sendJson(res, 404, { error: 'INVALID_TOKEN', message: 'Invitation token not found' });
    return sendJson(res, 200, { guest });
  }

  if (method === 'POST') {
    const body = await parseJson(req);
    const parsed = GuestRsvpSchema.safeParse(body);
    if (!parsed.success) {
      return sendJson(res, 400, { error: 'Invalid RSVP', message: parsed.error.issues[0]?.message || 'Invalid RSVP payload' });
    }
    const { rsvp_status, attending_party_size, dietary_restrictions, attendee_details, attendee_names } = parsed.data;
    const updated = await submitRsvp(token, {
      rsvp_status,
      attending_party_size: attending_party_size ?? 1,
      dietary_restrictions: dietary_restrictions || '',
      attendee_details,
      attendee_names,
    });
    return sendJson(res, 200, { success: true, guest: updated });
  }

  return false;
}