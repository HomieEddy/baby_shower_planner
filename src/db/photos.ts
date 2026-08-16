// Guest photo gallery + per-guest upload records with usage (quota).

import type { EventPhoto } from '../types';
import { escFilter, fromRecord, pb } from './client';
import { removeUploadFiles } from '../server/uploadFiles';

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