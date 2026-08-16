// Guestbook read/write + moderation.

import type { GuestbookEntry, AddGuestbookPayload } from '../types';
import { fromRecord, pb } from './client';
import { removeUploadFiles } from '../server/uploadFiles';

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