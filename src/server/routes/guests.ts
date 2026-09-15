// Guest admin CRUD, reservation-code resolution, invite-message preview and
// batch import.

import { parseJson, rateLimit, sendError, sendJson } from '../http';
import type { RouteCtx } from '../http';
import { handleRoutes, type Route } from '../route';
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

const ROUTES: Route[] = [
  // Resolve a 4-digit reservation code to the guest's magic token (guest
  // portal login). Tightly rate limited: the code space is only 10k.
  {
    method: 'GET',
    path: '/api/guest/resolve',
    handler: async ({ query }, { res, ip }) => {
      const code = (query.get('code') || '').trim();
      if (!isValidCode(code)) return sendError(res, 'INVALID_CODE', 'Reservation code must be 4 digits');
      const attempt = rateLimit(`code-resolve:${ip}`, 10, 60_000);
      if (!attempt.allowed) return sendError(res, 'RATE_LIMITED');
      const guest = await getGuestByCode(code);
      if (!guest) return sendError(res, 'NOT_FOUND', 'Reservation code not found');
      return sendJson(res, 200, { magic_token: guest.magic_token });
    },
  },

  {
    method: 'GET',
    path: '/api/guests',
    admin: true,
    handler: async (_req, { res }) => sendJson(res, 200, { guests: await getAllGuests() }),
  },

  {
    method: 'POST',
    path: '/api/guests',
    admin: true,
    body: true,
    handler: async ({ body }, { res }) => {
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
      const party = PartyInputSchema.safeParse({ attendee_names: body.attendee_names, attendee_details: body.attendee_details });
      if (!party.success) return sendError(res, 'INVALID_PAYLOAD', party.error.issues[0]?.message);

      const result = await addGuest({
        name: name.trim(), email: email?.trim() || '', phone: phone?.trim() || '',
        delivery_channel: channel, max_party_size: Number(max_party_size) || 1,
        language_pref: language_pref === 'EN' ? 'EN' : 'FR',
        rsvp_status: isGoing ? 'Attending' : undefined,
        attendee_names: party.data.attendee_names,
        attendee_details: party.data.attendee_details,
      });
      return sendJson(res, 200, result);
    },
  },

  // Universal invitation message (host copies one /register link). Declared
  // before the /api/guests/:id routes so the literal path wins.
  {
    method: 'GET',
    path: '/api/guests/universal-message',
    admin: true,
    handler: async ({ query }, { res }) => {
      const lang = query.get('lang') === 'EN' ? 'EN' : 'FR';
      return sendJson(res, 200, { message: await getUniversalInviteMessage(lang) });
    },
  },

  // Host decision on a pending self-registration.
  {
    method: 'POST',
    path: /^\/api\/guests\/([^/]+)\/(approve|reject)$/,
    admin: true,
    handler: async ({ params }, { res }) => {
      const guest = await setApproval(params[0], params[1] === 'approve' ? 'approved' : 'rejected');
      return sendJson(res, 200, { guest });
    },
  },

  // Remove one member from a party/group (host control over duplicates).
  {
    method: 'POST',
    path: /^\/api\/guests\/([^/]+)\/remove-attendee$/,
    admin: true,
    body: true,
    handler: async ({ body, params }, { res }) => {
      const index = Number(body.index);
      if (!Number.isInteger(index) || index < 0) {
        return sendError(res, 'INVALID_INDEX');
      }
      const promoteName = typeof body.promote_name === 'string' ? body.promote_name.trim() : undefined;
      const result = await removeGuestAttendee(params[0], index, promoteName);
      return sendJson(res, 200, { success: true, deleted: result.deleted, guest: result.guest });
    },
  },

  {
    method: 'POST',
    path: '/api/guests/batch-import',
    admin: true,
    body: true,
    handler: async ({ body }, { res }) => {
      if (!Array.isArray(body.guests) || body.guests.length === 0) {
        return sendError(res, 'INVALID_PAYLOAD', 'Array of guest objects is required');
      }
      const result = await batchImportGuests(body.guests);
      return sendJson(res, 200, { success: true, count: result.count, imported: result.imported });
    },
  },

  {
    method: 'GET',
    path: /^\/api\/guests\/([^/]+)\/invite-message$/,
    admin: true,
    handler: async ({ params }, { res }) => {
      const guest = await getGuestById(params[0]);
      return sendJson(res, 200, { message: await inviteMessageFor(guest) });
    },
  },

  {
    method: 'PUT',
    path: /^\/api\/guests\/([^/]+)$/,
    admin: true,
    body: true,
    handler: async ({ body, params }, { res }) => {
      const validation = EditGuestSchema.partial().safeParse(body);
      if (!validation.success) {
        return sendError(res, 'INVALID_PAYLOAD', validation.error.issues[0]?.message);
      }
      const guest = await updateGuest(params[0], validation.data);
      return sendJson(res, 200, { guest });
    },
  },

  {
    method: 'DELETE',
    path: /^\/api\/guests\/([^/]+)$/,
    admin: true,
    handler: async ({ params }, { res }) => {
      await deleteGuest(params[0]);
      return sendJson(res, 200, { success: true });
    },
  },
];

export const handleGuestRoutes = (ctx: RouteCtx): Promise<boolean> => handleRoutes(ROUTES, ctx);
