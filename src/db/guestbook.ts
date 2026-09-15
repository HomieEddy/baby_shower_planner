// Guestbook read/write + moderation.

import type { GuestbookEntry, AddGuestbookPayload } from '../types';
import { escFilter, fromRecord, pb } from './client';
import { removeUploadFiles } from '../server/uploadFiles';

export async function getAllGuestbookEntries(includeHidden = false): Promise<GuestbookEntry[]> {
  const records = await pb.collection('guestbook').getFullList({ sort: '-created_at' });
  return records
    .map(r => fromRecord<GuestbookEntry>(r))
    .filter(e => includeHidden || e.visible !== false);
}

// A guest's own wishes (matched by reservation code), including hidden ones.
export async function getGuestbookEntriesByCode(code: string): Promise<GuestbookEntry[]> {
  const records = await pb.collection('guestbook').getFullList({
    sort: '-created_at',
    filter: `reservation_code="${escFilter(code)}"`,
  });
  return records.map(r => fromRecord<GuestbookEntry>(r));
}

export async function getGuestbookEntry(id: string): Promise<GuestbookEntry | undefined> {
  const r = await pb.collection('guestbook').getOne(id);
  return fromRecord<GuestbookEntry>(r);
}

// Wishes already left for a table (the per-table cap).
export async function countGuestbookEntriesForTable(tableName: string): Promise<number> {
  if (!tableName) return 0;
  const list = await pb.collection('guestbook').getList(1, 1, {
    filter: `table_name="${escFilter(tableName)}"`,
  });
  return list.totalItems;
}

export async function addGuestbookEntry(payload: AddGuestbookPayload): Promise<GuestbookEntry> {
  // New wishes start hidden; the host unhides the ones to display.
  const r = await pb.collection('guestbook').create({
    guest_name: payload.guest_name, message: payload.message,
    photo_url: payload.photo_url || '',
    reservation_code: payload.reservation_code || '',
    table_name: payload.table_name || '', table_id: payload.table_id || '',
    visible: false, created_at: new Date().toISOString(),
  });
  return fromRecord<GuestbookEntry>(r);
}

export async function updateGuestbookEntry(
  id: string,
  payload: { guest_name: string; message: string; photo_url?: string }
): Promise<GuestbookEntry> {
  const previous = await pb.collection('guestbook').getOne(id);
  const oldUrl = (previous.photo_url as string) || '';
  const nextUrl = payload.photo_url ?? oldUrl;
  const r = await pb.collection('guestbook').update(id, {
    guest_name: payload.guest_name, message: payload.message, photo_url: nextUrl,
  });
  // Replaced/removed photo no longer referenced — drop the file.
  if (oldUrl && oldUrl !== nextUrl && oldUrl.startsWith('/uploads/')) {
    try {
      removeUploadFiles([oldUrl]);
    } catch (err) {
      console.error('Failed to remove replaced guestbook photo:', err);
    }
  }
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
