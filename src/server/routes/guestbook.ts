// Guestbook: guest read/write plus host moderation.

import type { RouteCtx } from '../http';
import { parseJson, sendError, sendGuestLocked, sendJson } from '../http';
import { GuestbookEntrySchema } from '../../lib/validation';
import {
  addGuestbookEntry,
  deleteGuestbookEntry,
  getAllGuestbookEntries,
  setGuestbookEntryVisibility,
} from '../../db/service';

export async function handleGuestbookRoutes(ctx: RouteCtx): Promise<boolean> {
  const { req, res, url } = ctx;
  const method = req.method || 'GET';
  const pathname = url.pathname;

  if (pathname === '/api/guestbook') {
    const lock = await ctx.guestLock();
    if (lock) return sendGuestLocked(res, lock);

    if (method === 'GET') {
      // Admins see hidden entries too (moderation); guests only visible ones.
      const entries = await getAllGuestbookEntries(ctx.adminOnly());
      return sendJson(res, 200, { entries });
    }
    if (method === 'POST') {
      const body = await parseJson(req);
      const validation = GuestbookEntrySchema.safeParse({
        guest_name: body.guest_name,
        message: body.message,
        photo_url: body.photo_url || undefined,
      });
      if (!validation.success) {
        return sendError(res, 'INVALID_PAYLOAD', validation.error.issues[0]?.message);
      }
      // Only our own uploads dir may be referenced.
      if (validation.data.photo_url && !validation.data.photo_url.startsWith('/uploads/')) {
        return sendError(res, 'INVALID_PHOTO_URL');
      }
      const entry = await addGuestbookEntry(validation.data);
      return sendJson(res, 200, { success: true, entry });
    }
  }

  if (pathname.startsWith('/api/guestbook/')) {
    ctx.requireAdmin();
    const id = pathname.replace('/api/guestbook/', '');
    if (method === 'PATCH') {
      const body = await parseJson(req);
      if (typeof body.visible !== 'boolean') return sendError(res, 'INVALID_PAYLOAD', 'visible (boolean) is required');
      const entry = await setGuestbookEntryVisibility(id, body.visible);
      return sendJson(res, 200, { success: true, entry });
    }
    if (method === 'DELETE') {
      await deleteGuestbookEntry(id);
      return sendJson(res, 200, { success: true });
    }
  }

  return false;
}
