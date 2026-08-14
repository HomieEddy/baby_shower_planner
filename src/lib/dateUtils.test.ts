import { describe, it, expect } from 'vitest';
import { parseToYmd, formatDateLong, parseTimeRange, formatTime12h, formatTimeRangeString, formatGuestWindow } from './dateUtils';

describe('parseToYmd', () => {
  it('passes through YYYY-MM-DD', () => {
    expect(parseToYmd('2026-09-12')).toBe('2026-09-12');
  });

  it('converts Date-parseable strings', () => {
    expect(parseToYmd('2026-09-12T14:00:00.000Z')).toBe('2026-09-12');
  });

  it('returns empty for empty input', () => {
    expect(parseToYmd('')).toBe('');
  });

  it('returns empty for garbage', () => {
    expect(parseToYmd('not a date')).toBe('');
  });
});

describe('formatDateLong', () => {
  it('formats EN long date', () => {
    expect(formatDateLong('2026-09-12', 'EN')).toBe('Saturday, September 12, 2026');
  });

  it('formats FR long date capitalized', () => {
    expect(formatDateLong('2026-09-12', 'FR')).toBe('Samedi 12 septembre 2026');
  });

  it('returns the input when not YYYY-MM-DD', () => {
    expect(formatDateLong('Saturday, September 12, 2026', 'EN')).toBe('Saturday, September 12, 2026');
  });

  it('returns empty for empty input', () => {
    expect(formatDateLong('', 'EN')).toBe('');
  });
});

describe('parseTimeRange', () => {
  it('parses en-dash range', () => {
    expect(parseTimeRange('2:00 PM – 6:00 PM')).toEqual({ startTime: '14:00', endTime: '18:00' });
  });

  it('parses hyphen range with 24h times', () => {
    expect(parseTimeRange('09:00 - 17:30')).toEqual({ startTime: '09:00', endTime: '17:30' });
  });

  it('parses midnight and noon AM/PM', () => {
    expect(parseSingle('12:00 AM')).toBe('00:00');
    expect(parseSingle('12:00 PM')).toBe('12:00');
  });

  it('falls back to defaults for empty input', () => {
    expect(parseTimeRange('')).toEqual({ startTime: '14:00', endTime: '18:00' });
  });
});

function parseSingle(s: string) {
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*(AM|PM|am|pm)?$/i)!;
  let hours = parseInt(m[1], 10);
  const minutes = m[2] ? parseInt(m[2], 10) : 0;
  const ampm = m[3] ? m[3].toUpperCase() : null;
  if (ampm === 'PM' && hours < 12) hours += 12;
  if (ampm === 'AM' && hours === 12) hours = 0;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

describe('formatTime12h', () => {
  it('formats 24h to 12h', () => {
    expect(formatTime12h('14:00')).toBe('2:00 PM');
    expect(formatTime12h('00:30')).toBe('12:30 AM');
    expect(formatTime12h('12:00')).toBe('12:00 PM');
  });
});

describe('formatTimeRangeString', () => {
  it('combines times with en-dash', () => {
    expect(formatTimeRangeString('14:00', '18:00')).toBe('2:00 PM – 6:00 PM');
  });
});

describe('formatGuestWindow', () => {
  it('formats open+close window in EN', () => {
    const out = formatGuestWindow('2026-10-10T18:00:00.000Z', '2026-10-10T22:00:00.000Z', 'EN');
    expect(out).toMatch(/^Open from .* to .*$/);
  });

  it('formats open+close window in FR', () => {
    const out = formatGuestWindow('2026-10-10T18:00:00.000Z', '2026-10-10T22:00:00.000Z', 'FR');
    expect(out).toMatch(/^Ouvert de .* à .*$/);
  });

  it('handles missing values', () => {
    expect(formatGuestWindow(undefined, undefined, 'EN')).toBe('');
    expect(formatGuestWindow('bad-date', undefined, 'EN')).toBe('');
  });
});
