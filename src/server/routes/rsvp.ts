// Guest-facing RSVP flow: view/submit via magic token, reset token usage,
// self-service contact updates and guest-to-guest invites.

import { sendError, sendJson } from '../http';
import type { RouteCtx } from '../http';
import { handleRoutes, parseOrFail, type Route } from '../route';
import { GuestRsvpSchema, isValidEmail } from '../../lib/validation';
import {
  createInvite,
  getGuestByToken,
  getInvitesByGuest,
  removeInvite,
  resetTokenUsage,
  submitRsvp,
  updateGuestContact,
} from '../../db/service';

const ROUTES: Route[] = [
  {
    method: 'DELETE',
    path: /^\/api\/rsvp\/([^/]+)\/invites\/([^/]+)$/,
    handler: async ({ params }, { res }) => {
      const [token, inviteId] = params;
      const removed = await removeInvite(token, inviteId);
      if (!removed) return sendError(res, 'NOT_FOUND', 'Invite not found');
      return sendJson(res, 200, { success: true });
    },
  },

  {
    method: 'GET',
    path: /^\/api\/rsvp\/([^/]+)\/invites$/,
    handler: async ({ params }, { res }) => sendJson(res, 200, { invites: await getInvitesByGuest(params[0]) }),
  },

  {
    method: 'POST',
    path: /^\/api\/rsvp\/([^/]+)\/invite$/,
    body: true,
    handler: async ({ body, params }, { res }) => {
      const result = await createInvite(params[0], {
        name: body.name, contact: body.contact, note: body.note,
      });
      if (!result.ok) return sendError(res, result.error);
      return sendJson(res, 200, result);
    },
  },

  {
    method: 'POST',
    path: /^\/api\/rsvp\/([^/]+)\/contact$/,
    body: true,
    handler: async ({ body, params }, { res }) => {
      const { email, phone, delivery_channel } = body;
      if (!['none', 'email', 'text', 'both'].includes(delivery_channel)) {
        return sendError(res, 'INVALID_CHANNEL');
      }
      if (email && !isValidEmail(email)) {
        return sendError(res, 'INVALID_EMAIL');
      }
      // INVALID_TOKEN / EMAIL_REQUIRED / PHONE_REQUIRED propagate as DomainError.
      const guest = await updateGuestContact(params[0], { email, phone, delivery_channel });
      return sendJson(res, 200, { success: true, guest });
    },
  },

  {
    method: 'POST',
    path: /^\/api\/rsvp\/([^/]+)\/reset$/,
    handler: async ({ params }, { res }) => {
      const guest = await resetTokenUsage(params[0]);
      return sendJson(res, 200, { success: true, guest });
    },
  },

  {
    method: 'GET',
    path: /^\/api\/rsvp\/([^/]+)$/,
    handler: async ({ params }, { res }) => {
      const guest = await getGuestByToken(params[0]);
      if (!guest) return sendError(res, 'INVALID_TOKEN');
      return sendJson(res, 200, { guest });
    },
  },

  {
    method: 'POST',
    path: /^\/api\/rsvp\/([^/]+)$/,
    body: true,
    handler: async ({ body, params }, { res }) => {
      const data = parseOrFail(GuestRsvpSchema, body, res);
      if (!data) return true;
      const updated = await submitRsvp(params[0], {
        rsvp_status: data.rsvp_status,
        attending_party_size: data.attending_party_size ?? 1,
        dietary_restrictions: data.dietary_restrictions || '',
        attendee_details: data.attendee_details,
        attendee_names: data.attendee_names,
      });
      return sendJson(res, 200, { success: true, guest: updated });
    },
  },
];

export const handleRsvpRoutes = (ctx: RouteCtx): Promise<boolean> => handleRoutes(ROUTES, ctx);
