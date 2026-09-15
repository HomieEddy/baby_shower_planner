// Guest admin CRUD, reservation-code resolution, invite-message preview and
// batch import.

import type { RouteCtx } from '../http';
import { parseJson, rateLimit, sendError, sendJson } from '../http';
import { EditGuestSchema, isValidCode, PartyInputSchema } from '../../lib/validation';
import {
  addGuest,
  batchImportGuests,
  deleteGuest,
  getAllGuests,
  getGuestByCode,
  getGuestById,
  getUniversalInviteMessage,
  inviteMessageFor,
  removeGuestAttendee,
  setApproval,
  updateGuest,
} from '../../db/service';

export async function handleGuestRoutes(ctx: RouteCtx): Promise<boolean> {
  const { req, res, url, ip, requireAdmin } = ctx;
  const method = req.method || 'GET';
  const pathname = url.pathname;

  // Resolve a 4-digit reservation code to the guest's magic token (guest
  // portal login). Tightly rate limited: the code space is only 10k.
  if (pathname === '/api/guest/resolve' && method === 'GET') {
    const code = (url.searchParams.get('code') || '').trim();
    if (!isValidCode(code)) return sendError(res, 'INVALID_CODE', 'Reservation code must be 4 digits');
    const attempt = rateLimit(`code-resolve:${ip}`, 10, 60_000);
    if (!attempt.allowed) return sendError(res, 'RATE_LIMITED');
    const guest = await getGuestByCode(code);
    if (!guest) return sendError(res, 'NOT_FOUND', 'Reservation code not found');
    return sendJson(res, 200, { magic_token: guest.magic_token });
  }

  if (pathname === '/api/guests') {
    requireAdmin();
    if (method === 'GET') {
      const guests = await getAllGuests();
      return sendJson(res, 200, { guests });
    }
    if (method === 'POST') {
      const body = await parseJson(req);
      const { name, email, phone, delivery_channel, max_party_size, language_pref, going } = body;
      const isGoing = going === true;
      // A going guest is registered directly and never sent an invitation, so
      // it carries no delivery channel (a stale "email" selection must not
      // trigger the email-required guard).
      const channel = isGoing ? 'none' : (delivery_channel || 'none');
      if (!name || !name.trim()) return sendError(res, 'NAME_REQUIRED', 'Guest name is required');
      if ((channel === 'email' || channel === 'both') && (!email || !email.trim())) return sendError(res, 'EMAIL_REQUIRED', 'Email address is required');
      if ((channel === 'text' || channel === 'both') && (!phone || !phone.trim())) return sendError(res, 'PHONE_REQUIRED', 'Phone number is required');
      if (!['email', 'text', 'both', 'none'].includes(channel)) return sendError(res, 'INVALID_CHANNEL');
      // Party members are part of the domain shape, so they are validated as
      // such instead of being sliced by hand.
      const party = PartyInputSchema.safeParse({
        attendee_names: body.attendee_names,
        attendee_details: body.attendee_details,
      });
      if (!party.success) return sendError(res, 'INVALID_PAYLOAD', party.error.issues[0]?.message);
      const { attendee_names: extraNames, attendee_details: attendeeDetails } = party.data;

      const result = await addGuest({
        name: name.trim(), email: email?.trim() || '', phone: phone?.trim() || '',
        delivery_channel: channel, max_party_size: Number(max_party_size) || 1,
        language_pref: language_pref === 'EN' ? 'EN' : 'FR',
        rsvp_status: isGoing ? 'Attending' : undefined,
        attendee_names: extraNames,
        attendee_details: attendeeDetails,
      });
      return sendJson(res, 200, result);
    }
  }

  // Universal invitation message (host copies one /register link).
  if (pathname === '/api/guests/universal-message' && method === 'GET') {
    requireAdmin();
    const lang = url.searchParams.get('lang') === 'EN' ? 'EN' : 'FR';
    return sendJson(res, 200, { message: await getUniversalInviteMessage(lang) });
  }

  // Host decision on a pending self-registration.
  const approval = pathname.match(/^\/api\/guests\/([^/]+)\/(approve|reject)$/);
  if (approval && method === 'POST') {
    requireAdmin();
    const guest = await setApproval(approval[1], approval[2] === 'approve' ? 'approved' : 'rejected');
    return sendJson(res, 200, { guest });
  }

  // Remove one member from a party/group (host control over duplicates).
  const removeAttendee = pathname.match(/^\/api\/guests\/([^/]+)\/remove-attendee$/);
  if (removeAttendee && method === 'POST') {
    requireAdmin();
    const body = await parseJson(req);
    const index = Number(body.index);
    if (!Number.isInteger(index) || index < 0) {
      return sendError(res, 'INVALID_INDEX');
    }
    const promoteName = typeof body.promote_name === 'string' ? body.promote_name.trim() : undefined;
    const result = await removeGuestAttendee(removeAttendee[1], index, promoteName);
    return sendJson(res, 200, { success: true, deleted: result.deleted, guest: result.guest });
  }

  if (pathname.startsWith('/api/guests/') && pathname !== '/api/guests/batch-import') {
    if (method === 'GET' && pathname.endsWith('/invite-message')) {
      requireAdmin();
      const id = pathname.replace('/api/guests/', '').replace('/invite-message', '');
      const guest = await getGuestById(id);
      return sendJson(res, 200, { message: await inviteMessageFor(guest) });
    }
    const id = pathname.replace('/api/guests/', '');
    requireAdmin();
    if (method === 'PUT') {
      const body = await parseJson(req);
      const validation = EditGuestSchema.partial().safeParse(body);
      if (!validation.success) {
        return sendError(res, 'INVALID_PAYLOAD', validation.error.issues[0]?.message);
      }
      const guest = await updateGuest(id, validation.data);
      return sendJson(res, 200, { guest });
    }
    if (method === 'DELETE') {
      await deleteGuest(id);
      return sendJson(res, 200, { success: true });
    }
  }

  if (pathname === '/api/guests/batch-import' && method === 'POST') {
    requireAdmin();
    const body = await parseJson(req);
    if (!Array.isArray(body.guests) || body.guests.length === 0) {
      return sendError(res, 'INVALID_PAYLOAD', 'Array of guest objects is required');
    }
    const result = await batchImportGuests(body.guests);
    return sendJson(res, 200, { success: true, count: result.count, imported: result.imported });
  }

  return false;
}