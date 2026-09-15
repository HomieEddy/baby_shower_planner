// Schedule-of-the-day ordering + validation. Times are stored 24h ("HH:MM");
// legacy values ("2:00 PM") are normalized on read/save.

import type { ScheduleItem } from '../types';
import { formatTime12h, parseTimeTo24h } from './dateUtils';

// "2:00 PM" | "14:00" → "14:00"; unparseable/empty → ''.
export function normalizeScheduleTime(time: string): string {
  return parseTimeTo24h(time) ?? '';
}

// Chronological order; untimed items keep their relative order at the end.
export function sortScheduleByTime(items: ScheduleItem[]): ScheduleItem[] {
  return items
    .map((item, index) => ({ item, index, key: normalizeScheduleTime(item.time) }))
    .sort((a, b) => {
      if (a.key && b.key) return a.key === b.key ? a.index - b.index : a.key < b.key ? -1 : 1;
      if (a.key) return -1;
      if (b.key) return 1;
      return a.index - b.index;
    })
    .map(({ item }) => item);
}

// Start times shared by more than one item (normalized, 24h). Empty excluded.
export function findDuplicateScheduleTimes(items: ScheduleItem[]): string[] {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = normalizeScheduleTime(item.time);
    if (!key) continue;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].filter(([, n]) => n > 1).map(([key]) => key);
}

// Display label for a stored time, localized (EN 12h / FR 24h).
export function formatScheduleTime(time: string, language: 'EN' | 'FR'): string {
  if (!time) return '';
  return formatTime12h(normalizeScheduleTime(time) || time, language);
}
