// Guest photo gallery + per-guest upload records with usage (quota) + handler.

import fs from 'node:fs';
import crypto from 'node:crypto';
import type { EventPhoto } from '../types';
import { escFilter, fromRecord, pb } from './client';
import { getUploadFilePath, removeUploadFiles } from '../server/uploadFiles';
import type { RouteCtx } from '../server/http';
import { parseJson, sendGuestLocked, sendJson } from '../server/http';
import { isValidCode } from '../lib/validation';

// Per-guest photo quota (keyed by reservation code).
const MAX_PHOTOS_PER_GUEST = 12;
const MAX_PHOTOS_BYTES_PER_GUEST = 24 * 1024 * 1024; // 24 MB across all 12

export async function getAllPhotos(includeHidden = false): Promise<EventPhoto[]> {
  const records = await pb.collection('photos').getFullList({ sort: '-created_at' });
  return records
    .map(r => fromRecord<EventPhoto>(r))
    .filter(p => includeHidden || p.visible !== false);
}

export async function addPhotosBatch(newPhotos: Array<{ url: string; filename: string; caption?: string; uploader_name?: string; table_name?: string; table_id?: string; reservation_code?: string; file_size?: number }>): Promise<EventPhoto[]> {
  const created: EventPhoto[] = [];
  for (const p of newPhotos) {
    const r = await pb.collection('photos').create({
      url: p.url, filename: p.filename, caption: p.caption || '',
      uploader_name: p.uploader_name || 'Guest', table_name: p.table_name || 'Open Seating',
      table_id: p.table_id || '', reservation_code: p.reservation_code || '',
      file_size: p.file_size || 0, visible: true, created_at: new Date().toISOString(),
    });
    created.push(fromRecord<EventPhoto>(r));
  }
  return created;
}

export async function deletePhoto(id: string): Promise<void> {
  const r = await pb.collection('photos').getOne(id);
  await pb.collection('photos').delete(id);
  // Remove the file so uploads don't accumulate orphans.
  try {
    const url = (r.url as string) || '';
    if (url.startsWith('/uploads/')) removeUploadFiles([url]);
  } catch (err) {
    console.error('Failed to remove photo file:', err);
  }
}

export async function setPhotoVisibility(id: string, visible: boolean): Promise<EventPhoto> {
  const r = await pb.collection('photos').update(id, { visible });
  return fromRecord<EventPhoto>(r);
}

// Photos already stored under a reservation code (per-guest quota).
export async function getGuestPhotoUsage(reservationCode: string): Promise<{ count: number; bytes: number }> {
  const records = await pb.collection('photos').getFullList({
    filter: `reservation_code="${escFilter(reservationCode)}"`,
  });
  let count = 0;
  let bytes = 0;
  for (const r of records) {
    count++;
    bytes += Number(r.file_size) || 0;
  }
  return { count, bytes };
}

// ─── HTTP handler ──────────────────────────────────────────────────

export async function handlePhotoRoutes(ctx: RouteCtx): Promise<boolean> {
  const { req, res, url } = ctx;
  const method = req.method || 'GET';
  const pathname = url.pathname;

  if (pathname === '/api/upload' && method === 'POST') {
    const body = await parseJson(req);
    const matches = typeof body.photo_base64 === 'string'
      ? body.photo_base64.match(/^data:([A-Za-z-+]+);base64,(.+)$/)
      : null;
    if (!matches || matches.length !== 3) {
      return sendJson(res, 400, { error: 'photo_base64 data URL is required' });
    }
    const allowed: Record<string, string> = { jpeg: 'jpg', jpg: 'jpg', png: 'png', webp: 'webp', gif: 'gif', heic: 'heic' };
    const ext = allowed[matches[1].split('/')[1]] || 'jpg';
    const filename = `photo-${Date.now()}-${crypto.randomInt(1e9)}.${ext}`;
    fs.writeFileSync(getUploadFilePath(filename), Buffer.from(matches[2], 'base64'));
    return sendJson(res, 200, { photo_url: `/uploads/${filename}` });
  }

  if (pathname === '/api/photos') {
    const lock = await ctx.guestLock();
    if (lock) return sendGuestLocked(res, lock);
    if (method === 'GET') {
      // Admins see hidden photos too (moderation); guests only visible ones.
      const photos = await getAllPhotos(ctx.adminOnly());
      return sendJson(res, 200, { photos });
    }
  }

  if (pathname === '/api/photos/upload' && method === 'POST') {
    const lock = await ctx.guestLock();
    if (lock) return sendGuestLocked(res, lock);

    const body = await parseJson(req);
    const { uploader_name, caption, table_name, table_id, reservation_code, photos } = body;
    const list = Array.isArray(photos) ? photos : [];
    if (list.length === 0) return sendJson(res, 400, { error: 'photos array is required' });
    for (const p of list) {
      if (typeof p?.url !== 'string' || !p.url.startsWith('/uploads/')) {
        return sendJson(res, 400, { error: 'Invalid photo URL' });
      }
    }
    // Files were written to disk in the previous step; remove them if the
    // registration is rejected so uploads don't accumulate orphans.
    const removeBatchFiles = () => removeUploadFiles(list.map((p: any) => String(p.url)));
    // Per-guest quota: uploads are attributed to a reservation code.
    const code = typeof reservation_code === 'string' ? reservation_code.trim() : '';
    if (!isValidCode(code)) {
      removeBatchFiles();
      return sendJson(res, 400, { error: 'INVALID_CODE', message: 'A valid 4-digit reservation code is required' });
    }
    const guest = await pb.collection('guests').getFirstListItem(`code="${code}"`).catch(() => null);
    if (!guest) {
      removeBatchFiles();
      return sendJson(res, 400, { error: 'INVALID_CODE', message: 'Reservation code not found' });
    }
    const usage = await getGuestPhotoUsage(code);
    if (usage.count + list.length > MAX_PHOTOS_PER_GUEST) {
      removeBatchFiles();
      return sendJson(res, 400, {
        error: 'PHOTO_LIMIT_REACHED',
        message: `Photo limit reached`,
        uploaded: usage.count,
        remaining: Math.max(0, MAX_PHOTOS_PER_GUEST - usage.count),
        max: MAX_PHOTOS_PER_GUEST,
      });
    }
    // Size the incoming files on disk (uploaded in the previous step).
    let batchBytes = 0;
    for (const p of list) {
      const filePath = getUploadFilePath(String(p.url));
      if (!fs.existsSync(filePath)) {
        removeBatchFiles();
        return sendJson(res, 400, { error: 'Invalid photo URL' });
      }
      batchBytes += fs.statSync(filePath).size;
    }
    if (usage.bytes + batchBytes > MAX_PHOTOS_BYTES_PER_GUEST) {
      removeBatchFiles();
      return sendJson(res, 400, {
        error: 'PHOTO_SIZE_LIMIT_REACHED',
        message: `Total photo size limit reached`,
        uploadedBytes: usage.bytes,
        remainingBytes: Math.max(0, MAX_PHOTOS_BYTES_PER_GUEST - usage.bytes),
        maxBytes: MAX_PHOTOS_BYTES_PER_GUEST,
      });
    }
    const created = await addPhotosBatch(list.map((p: any) => {
      return {
        url: p.url, filename: p.filename || 'photo.jpg',
        caption: caption || '', uploader_name: uploader_name || 'Guest',
        table_name: table_name || 'Table Visitor', table_id: table_id || '',
        reservation_code: code,
        file_size: fs.statSync(getUploadFilePath(String(p.url))).size,
      };
    }));
    return sendJson(res, 200, { success: true, count: created.length, photos: created });
  }

  if (pathname.startsWith('/api/photos/')) {
    const id = pathname.replace('/api/photos/', '').split('/')[0];
    if (method === 'PATCH') {
      ctx.requireAdmin();
      const body = await parseJson(req);
      if (typeof body.visible !== 'boolean') return sendJson(res, 400, { error: 'visible (boolean) is required' });
      const photo = await setPhotoVisibility(id, body.visible);
      return sendJson(res, 200, { success: true, photo });
    }
    if (method === 'DELETE') {
      ctx.requireAdmin();
      await deletePhoto(id);
      return sendJson(res, 200, { success: true });
    }
  }

  return false;
}