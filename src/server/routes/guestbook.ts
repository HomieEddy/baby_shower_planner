// Guestbook: guest read/write plus host moderation.

import { sendError, sendJson } from '../http';
import type { RouteCtx } from '../http';
import { handleRoutes, parseOrFail, type Route } from '../route';
import { GuestbookEntrySchema } from '../../lib/validation';
import {
  addGuestbookEntry,
  deleteGuestbookEntry,
  getAllGuestbookEntries,
  setGuestbookEntryVisibility,
} from '../../db/service';

const ROUTES: Route[] = [
  {
    method: 'GET',
    path: '/api/guestbook',
    lock: true,
    handler: async (_req, { res, adminOnly }) => {
      // Admins see hidden entries too (moderation); guests only visible ones.
      const entries = await getAllGuestbookEntries(adminOnly());
      return sendJson(res, 200, { entries });
    },
  },

  {
    method: 'POST',
    path: '/api/guestbook',
    lock: true,
    body: true,
    handler: async ({ body }, { res }) => {
      const data = parseOrFail(GuestbookEntrySchema, {
        guest_name: body.guest_name,
        message: body.message,
        photo_url: body.photo_url || undefined,
      }, res);
      if (!data) return true;
      // Only our own uploads dir may be referenced.
      if (data.photo_url && !data.photo_url.startsWith('/uploads/')) {
        return sendError(res, 'INVALID_PHOTO_URL');
      }
      const entry = await addGuestbookEntry(data);
      return sendJson(res, 200, { success: true, entry });
    },
  },

  {
    method: 'PATCH',
    path: /^\/api\/guestbook\/([^/]+)$/,
    admin: true,
    body: true,
    handler: async ({ body, params }, { res }) => {
      if (typeof body.visible !== 'boolean') return sendError(res, 'INVALID_PAYLOAD', 'visible (boolean) is required');
      const entry = await setGuestbookEntryVisibility(params[0], body.visible);
      return sendJson(res, 200, { success: true, entry });
    },
  },

  {
    method: 'DELETE',
    path: /^\/api\/guestbook\/([^/]+)$/,
    admin: true,
    handler: async ({ params }, { res }) => {
      await deleteGuestbookEntry(params[0]);
      return sendJson(res, 200, { success: true });
    },
  },
];

export const handleGuestbookRoutes = (ctx: RouteCtx): Promise<boolean> => handleRoutes(ROUTES, ctx);
