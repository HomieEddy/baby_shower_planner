// Guestbook read/write + moderation + HTTP handler for /api/guestbook.

import type { GuestbookEntry, AddGuestbookPayload } from '../types';
import { fromRecord, pb } from './client';
import { removeUploadFiles } from '../server/uploadFiles';
import { GuestbookEntrySchema } from '../lib/validation';
import type { RouteCtx } from '../server/http';
import { parseJson, sendError, sendGuestLocked, sendJson } from '../server/http';

export async function getAllGuestbookEntries(includeHidden = false): Promise<GuestbookEntry[]> {
  const records = await pb.collection('guestbook').getFullList({ sort: '-created_at' });
  return records
    .map(r => fromRecord<GuestbookEntry>(r))
    .filter(e => includeHidden || e.visible !== false);
}

export async function addGuestbookEntry(payload: AddGuestbookPayload): Promise<GuestbookEntry> {
  const r = await pb.collection('guestbook').create({
    guest_name: payload.guest_name, message: payload.message,
    photo_url: payload.photo_url || '', visible: true, created_at: new Date().toISOString(),
  });
  return fromRecord<GuestbookEntry>(r);
}

export async function setGuestbookEntryVisibility(id: string, visible: boolean): Promise<GuestbookEntry> {
  const r = await pb.collection('guestbook').update(id, { visible });
  return fromRecord<GuestbookEntry>(r);
}

export async function deleteGuestbookEntry(id: string): Promise<void> {
  const r = await pb.collection('guestbook').getOne(id);
  await pb.collection('guestbook').delete(id);
  // Remove any attached photo file so uploads don't accumulate orphans.
  try {
    const url = (r.photo_url as string) || '';
    if (url.startsWith('/uploads/')) removeUploadFiles([url]);
  } catch (err) {
    console.error('Failed to remove guestbook photo file:', err);
  }
}

// ─── HTTP handler ──────────────────────────────────────────────────

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