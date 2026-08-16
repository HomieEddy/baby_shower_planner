// Event settings read/write + the guest content window (guestbook + photos).

import type { EventSettings } from '../types';
import { fromRecord, pb } from './client';

export async function getSettings(): Promise<EventSettings> {
  const records = await pb.collection('settings').getFullList();
  if (records.length === 0) throw new Error('No settings found');
  return fromRecord<EventSettings>(records[0]);
}

export interface GuestContentLock {
  locked: boolean;
  opensAt?: string;
  closesAt?: string;
}

// Guestbook and photo uploads are locked until the event starts
// (contentOpenAt) and lock again after contentCloseAt.
export async function getGuestContentLock(now: Date = new Date()): Promise<GuestContentLock> {
  const settings = await getSettings().catch(() => null);
  if (!settings) return { locked: true };
  const ts = now.getTime();
  const openAt = settings.contentOpenAt ? new Date(settings.contentOpenAt).getTime() : NaN;
  const closeAt = settings.contentCloseAt ? new Date(settings.contentCloseAt).getTime() : NaN;
  const locked = Number.isNaN(openAt) || ts < openAt || (!Number.isNaN(closeAt) && ts >= closeAt);
  return {
    locked,
    opensAt: settings.contentOpenAt || undefined,
    closesAt: settings.contentCloseAt || undefined,
  };
}

export async function updateSettings(payload: Partial<EventSettings>): Promise<EventSettings> {
  const records = await pb.collection('settings').getFullList();
  const id = records[0]?.id;
  if (id) {
    const r = await pb.collection('settings').update(id, payload);
    return fromRecord<EventSettings>(r);
  }
  const r = await pb.collection('settings').create(payload);
  return fromRecord<EventSettings>(r);
}