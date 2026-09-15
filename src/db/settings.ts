// Event settings read/write + the guest content window (guestbook + photos).

import type { EventSettings } from '../types';
import type { GuestContentLock } from '../lib/guestLock';
import { fromRecord, pb } from './client';
import { isRehearsalActive } from './rehearsal';
import { findDuplicateScheduleTimes, normalizeScheduleItems } from '../lib/schedule';
import { DomainError } from '../lib/errors';

export type { GuestContentLock } from '../lib/guestLock';

export async function getSettings(): Promise<EventSettings> {
  const records = await pb.collection('settings').getFullList();
  if (records.length === 0) throw new Error('No settings found');
  return fromRecord<EventSettings>(records[0]);
}

// Settings for read paths that tolerate an unseeded event: an empty object
// stands in for the missing row, so callers stop hand-rolling try/catch.
export const getSettingsOrDefaults = async (): Promise<Partial<EventSettings>> =>
  getSettings().catch(() => ({}));

// Guestbook and photo uploads are locked until the event starts
// (contentOpenAt) and lock again after contentCloseAt.
export async function getGuestContentLock(now: Date = new Date()): Promise<GuestContentLock> {
  // A rehearsal unlocks guestbook + photo uploads regardless of the host's real
  // content window, so both flows can be smoke-tested any time of day.
  if (isRehearsalActive()) return { locked: false };
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
  const next: Partial<EventSettings> = { ...payload };
  // One canonical schedule at the write seam: 24h times, chronological, and no
  // two items sharing a start time. The host form pre-checks; this is the guard.
  if (Array.isArray(next.schedule)) {
    const normalized = normalizeScheduleItems(next.schedule);
    const duplicates = findDuplicateScheduleTimes(normalized);
    if (duplicates.length > 0) throw new DomainError('SCHEDULE_DUPLICATE_TIME', { time: duplicates[0] });
    next.schedule = normalized;
  }
  const records = await pb.collection('settings').getFullList();
  const id = records[0]?.id;
  if (id) {
    const r = await pb.collection('settings').update(id, next);
    return fromRecord<EventSettings>(r);
  }
  const r = await pb.collection('settings').create(next);
  return fromRecord<EventSettings>(r);
}