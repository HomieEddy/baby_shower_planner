// Guestbook read/write (guest content window + moderation).

import type { RouteCtx } from '../http';
import { parseJson, sendJson } from '../http';
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
    if (lock) {
      return sendJson(res, 403, { error: 'GUEST_CONTENT_LOCKED', opensAt: lock.opensAt, closesAt: lock.closesAt });
    }
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
        return sendJson(res, 400, { error: validation.error.issues[0]?.message || 'Invalid guestbook entry' });
      }
      // Only our own uploads dir may be referenced.
      if (validation.data.photo_url && !validation.data.photo_url.startsWith('/uploads/')) {
        return sendJson(res, 400, { error: 'Invalid photo URL' });
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
      if (typeof body.visible !== 'boolean') return sendJson(res, 400, { error: 'visible (boolean) is required' });
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