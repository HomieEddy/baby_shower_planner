// Guestbook: guest read/write of their own wishes plus host moderation.

import { sendError, sendJson } from '../http';
import type { RouteCtx } from '../http';
import { handleRoutes, parseOrFail, type Route } from '../route';
import { GuestbookEntrySchema, isValidCode } from '../../lib/validation';
import {
  addGuestbookEntry,
  countGuestbookEntriesForTable,
  deleteGuestbookEntry,
  getAllGuestbookEntries,
  getGuestbookEntriesByCode,
  getGuestbookEntry,
  getGuestByCode,
  setGuestbookEntryVisibility,
  updateGuestbookEntry,
} from '../../db/service';

// Wishes a single table may collect (enforced on create).
const MAX_WISHES_PER_TABLE = 10;

const ROUTES: Route[] = [
  {
    method: 'GET',
    path: '/api/guestbook',
    lock: true,
    handler: async ({ query }, { res, adminOnly }) => {
      // Admins see every entry (moderation); guests see only their own wishes,
      // matched by reservation code — there is no public wall.
      if (adminOnly()) return sendJson(res, 200, { entries: await getAllGuestbookEntries(true) });
      const code = (query.get('code') || '').trim();
      if (!isValidCode(code)) return sendJson(res, 200, { entries: [] });
      return sendJson(res, 200, { entries: await getGuestbookEntriesByCode(code) });
    },
  },

  {
    method: 'POST',
    path: '/api/guestbook',
    lock: true,
    body: true,
    handler: async ({ body }, { res }) => {
      const code = typeof body.reservation_code === 'string' ? body.reservation_code.trim() : '';
      if (!isValidCode(code)) return sendError(res, 'INVALID_CODE', 'A valid 4-digit reservation code is required');
      const guest = await getGuestByCode(code);
      if (!guest) return sendError(res, 'INVALID_CODE', 'Reservation code not found');

      const tableName = typeof body.table_name === 'string' ? body.table_name.trim() : '';
      if (tableName && (await countGuestbookEntriesForTable(tableName)) >= MAX_WISHES_PER_TABLE) {
        return sendError(res, 'GUESTBOOK_TABLE_FULL', 'This table has reached its wish limit');
      }

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
      const entry = await addGuestbookEntry({
        ...data,
        reservation_code: code,
        table_name: tableName,
        table_id: typeof body.table_id === 'string' ? body.table_id.trim() : '',
      });
      return sendJson(res, 200, { success: true, entry });
    },
  },

  // Guest-owned edit/delete: the reservation code that wrote the wish is the
  // only credential. Routes are namespaced under /mine so the admin endpoints
  // stay admin-only.
  {
    method: 'PATCH',
    path: /^\/api\/guestbook\/mine\/([^/]+)$/,
    lock: true,
    body: true,
    handler: async ({ body, params }, { res }) => {
      const code = typeof body.reservation_code === 'string' ? body.reservation_code.trim() : '';
      if (!isValidCode(code)) return sendError(res, 'INVALID_CODE');
      const existing = await getGuestbookEntry(params[0]).catch(() => undefined);
      if (!existing || existing.reservation_code !== code) return sendError(res, 'NOT_FOUND');
      const data = parseOrFail(GuestbookEntrySchema, {
        guest_name: body.guest_name,
        message: body.message,
        photo_url: existing.photo_url,
      }, res);
      if (!data) return true;
      const entry = await updateGuestbookEntry(params[0], { guest_name: data.guest_name, message: data.message });
      return sendJson(res, 200, { success: true, entry });
    },
  },

  {
    method: 'DELETE',
    path: /^\/api\/guestbook\/mine\/([^/]+)$/,
    lock: true,
    handler: async ({ params, query }, { res }) => {
      const code = (query.get('code') || '').trim();
      if (!isValidCode(code)) return sendError(res, 'INVALID_CODE');
      const existing = await getGuestbookEntry(params[0]).catch(() => undefined);
      if (!existing || existing.reservation_code !== code) return sendError(res, 'NOT_FOUND');
      await deleteGuestbookEntry(params[0]);
      return sendJson(res, 200, { success: true });
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
