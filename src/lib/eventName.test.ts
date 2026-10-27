import { describe, it, expect } from 'vitest';
import { eventDisplayName, eventFileSlug } from './eventName';

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

describe('eventFileSlug', () => {
  it('slugs the organizer title, accents and punctuation included', () => {
    expect(eventFileSlug({ eventTitle: "Le shower d'Amélie & Noé!" })).toBe('le-shower-d-amelie-noe');
  });

  it('is a neutral stem when no title is set', () => {
    expect(eventFileSlug({ eventTitle: '  ' })).toBe('event');
    expect(eventFileSlug(null)).toBe('event');
  });
});
