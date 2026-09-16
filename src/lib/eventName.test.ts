import { describe, it, expect } from 'vitest';
import { eventDisplayName } from './eventName';

describe('eventDisplayName', () => {
  it('uses the organizer title when one is set', () => {
    expect(eventDisplayName({ eventTitle: "Sophie's Shower" }, 'Fallback')).toBe("Sophie's Shower");
  });

  it('falls back when the title is only whitespace', () => {
    expect(eventDisplayName({ eventTitle: '   ' }, 'Fallback')).toBe('Fallback');
  });

  it('falls back when the event has no settings at all', () => {
    expect(eventDisplayName(null, 'Fallback')).toBe('Fallback');
    expect(eventDisplayName(undefined, 'Fallback')).toBe('Fallback');
  });

  it('trims a title that has padding', () => {
    expect(eventDisplayName({ eventTitle: '  Sophie  ' }, 'Fallback')).toBe('Sophie');
  });
});
