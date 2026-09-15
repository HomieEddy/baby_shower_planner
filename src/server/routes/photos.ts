// Photo upload, gallery read, and host moderation.

import fs from 'node:fs';
import crypto from 'node:crypto';
import { rateLimit, sendError, sendJson } from '../http';
import type { RouteCtx } from '../http';
import { handleRoutes, type Route } from '../route';
import { isValidCode } from '../../lib/validation';
import { getUploadFilePath, removeUploadFiles } from '../uploadFiles';
import {
  addPhotosBatch,
  deletePhoto,
  getAllPhotos,
  getGuestByCode,
  getGuestPhotoUsage,
  setPhotoVisibility,
} from '../../db/service';

// Per-guest photo quota (keyed by reservation code).
const MAX_PHOTOS_PER_GUEST = 12;
const MAX_PHOTOS_BYTES_PER_GUEST = 24 * 1024 * 1024; // 24 MB across all 12
const MAX_UPLOADS_PER_MINUTE = 30; // bounds orphaned files on disk

const ROUTES: Route[] = [
  // Raw file write, step one of the two-step upload.
  {
    method: 'POST',
    path: '/api/upload',
    lock: true,
    body: true,
    handler: ({ body }, { res, ip }) => {
      // Orphans (a file written but never registered) are unbounded disk, so
      // the write also gets its own per-IP budget.
      if (!rateLimit(`upload:${ip}`, MAX_UPLOADS_PER_MINUTE, 60_000).allowed) {
        return sendError(res, 'RATE_LIMITED');
      }
      const matches = typeof body.photo_base64 === 'string'
        // The MIME type contains a slash (`data:image/jpeg;base64,…`), so the
        // capture class must allow it — without `/` every valid upload 400s.
        ? body.photo_base64.match(/^data:([A-Za-z-+/]+);base64,(.+)$/)
        : null;
      if (!matches || matches.length !== 3) {
        return sendError(res, 'INVALID_PAYLOAD', 'photo_base64 data URL is required');
      }
      const allowed: Record<string, string> = { jpeg: 'jpg', jpg: 'jpg', png: 'png', webp: 'webp', gif: 'gif', heic: 'heic' };
      const ext = allowed[matches[1].split('/')[1]] || 'jpg';
      const filename = `photo-${Date.now()}-${crypto.randomInt(1e9)}.${ext}`;
      fs.writeFileSync(getUploadFilePath(filename), Buffer.from(matches[2], 'base64'));
      return sendJson(res, 200, { photo_url: `/uploads/${filename}` });
    },
  },

  {
    method: 'GET',
    path: '/api/photos',
    lock: true,
    handler: async (_req, { res, adminOnly }) => {
      // Admins see hidden photos too (moderation); guests only visible ones.
      const photos = await getAllPhotos(adminOnly());
      return sendJson(res, 200, { photos });
    },
  },

  // Step two: register the uploaded files and enforce the per-guest quota.
  {
    method: 'POST',
    path: '/api/photos/upload',
    lock: true,
    body: true,
    handler: async ({ body }, { res }) => {
      const { uploader_name, caption, table_name, table_id, reservation_code, photos } = body;
      const list = Array.isArray(photos) ? photos : [];
      if (list.length === 0) return sendError(res, 'INVALID_PAYLOAD', 'photos array is required');
      for (const p of list) {
        if (typeof p?.url !== 'string' || !p.url.startsWith('/uploads/')) {
          return sendError(res, 'INVALID_PHOTO_URL');
        }
      }
      // Files were written to disk in the previous step; remove them if the
      // registration is rejected so uploads don't accumulate orphans.
      const removeBatchFiles = () => removeUploadFiles(list.map((p: any) => String(p.url)));
      // Per-guest quota: uploads are attributed to a reservation code.
      const code = typeof reservation_code === 'string' ? reservation_code.trim() : '';
      if (!isValidCode(code)) {
        removeBatchFiles();
        return sendError(res, 'INVALID_CODE', 'A valid 4-digit reservation code is required');
      }
      const guest = await getGuestByCode(code);
      if (!guest) {
        removeBatchFiles();
        return sendError(res, 'INVALID_CODE', 'Reservation code not found');
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
          return sendError(res, 'INVALID_PHOTO_URL');
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
    },
  },

  {
    method: 'PATCH',
    path: /^\/api\/photos\/([^/]+)$/,
    admin: true,
    body: true,
    handler: async ({ body, params }, { res }) => {
      if (typeof body.visible !== 'boolean') return sendError(res, 'INVALID_PAYLOAD', 'visible (boolean) is required');
      const photo = await setPhotoVisibility(params[0], body.visible);
      return sendJson(res, 200, { success: true, photo });
    },
  },

  {
    method: 'DELETE',
    path: /^\/api\/photos\/([^/]+)$/,
    admin: true,
    handler: async ({ params }, { res }) => {
      await deletePhoto(params[0]);
      return sendJson(res, 200, { success: true });
    },
  },
];

export const handlePhotoRoutes = (ctx: RouteCtx): Promise<boolean> => handleRoutes(ROUTES, ctx);
