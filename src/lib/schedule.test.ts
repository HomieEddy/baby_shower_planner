import { describe, it, expect } from 'vitest';
import type { ScheduleItem } from '../types';
import { findDuplicateScheduleTimes, formatScheduleTime, normalizeScheduleTime, sortScheduleByTime } from './schedule';

const item = (id: string, time: string): ScheduleItem => ({ id, time, titleEn: id, titleFr: id });

describe('normalizeScheduleTime', () => {
  it('normalizes 24h, 12h and single-digit times; blanks the unparseable', () => {
    expect(normalizeScheduleTime('14:00')).toBe('14:00');
    expect(normalizeScheduleTime('2:00 PM')).toBe('14:00');
    expect(normalizeScheduleTime('9:30')).toBe('09:30');
    expect(normalizeScheduleTime('')).toBe('');
    expect(normalizeScheduleTime('whenever')).toBe('');
  });
});

describe('sortScheduleByTime', () => {
  it('orders chronologically and keeps untimed items last, in place', () => {
    const sorted = sortScheduleByTime([
      item('b', '15:00'),
      item('untimed-1', ''),
      item('a', '09:30'),
      item('untimed-2', ''),
      item('c', '2:00 PM'),
    ]);
    expect(sorted.map((i) => i.id)).toEqual(['a', 'c', 'b', 'untimed-1', 'untimed-2']);
  });

  it('is stable for equal times', () => {
    const sorted = sortScheduleByTime([item('x', '10:00'), item('y', '10:00')]);
    expect(sorted.map((i) => i.id)).toEqual(['x', 'y']);
  });
});

describe('findDuplicateScheduleTimes', () => {
  it('reports shared start times, ignoring empties and 12h/24h duplicates', () => {
    expect(findDuplicateScheduleTimes([item('a', '14:00'), item('b', '2:00 PM'), item('c', '15:00'), item('d', '')])).toEqual(['14:00']);
  });

  it('is empty when every time is unique', () => {
    expect(findDuplicateScheduleTimes([item('a', '14:00'), item('b', '15:00')])).toEqual([]);
  });
});

describe('formatScheduleTime', () => {
  it('localizes stored times (EN 12h, FR 24h) and tolerates legacy values', () => {
    expect(formatScheduleTime('14:00', 'EN')).toBe('2:00 PM');
    expect(formatScheduleTime('14:00', 'FR')).toBe('14:00');
    expect(formatScheduleTime('2:00 PM', 'FR')).toBe('14:00');
    expect(formatScheduleTime('', 'EN')).toBe('');
  });
});
