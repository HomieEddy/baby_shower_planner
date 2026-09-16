import { describe, it, expect } from 'vitest';
import { translations } from '../translations';
import { DEFAULT_INVITATION_TEMPLATE, resolveInvitationTemplate } from './invitationTemplate';

// Ticket 08: guest-facing copy is the event's, not the founder's.
describe('event-neutral guest copy', () => {
  it('bakes no fixed date into the RSVP confirmation', () => {
    expect(translations.EN.rsvpConfirmedMsgAttending).not.toMatch(/\d/);
    expect(translations.FR.rsvpConfirmedMsgAttending).not.toMatch(/\d/);
  });

  it('names no single registry service in the registry call to action', () => {
    for (const t of [translations.EN, translations.FR]) {
      expect(t.registryBtnText).not.toMatch(/amazon|target|babylist/i);
    }
  });

  it('seeds the invitation message with event-neutral copy', () => {
    for (const template of Object.values(DEFAULT_INVITATION_TEMPLATE)) {
      expect(template).not.toMatch(/baby shower|princess|amazon|petite fleur|flower is on the way/i);
    }
  });

  it('keeps the invitation templates placeholder-symmetric across languages', () => {
    const tokens = (text: string) =>
      (text.match(/\{\{\s*\w+\s*\}\}/g) ?? []).map((m) => m.replace(/[{} ]/g, '')).sort();
    expect(tokens(DEFAULT_INVITATION_TEMPLATE.FR)).toEqual(tokens(DEFAULT_INVITATION_TEMPLATE.EN));
  });

  it('falls back to the neutral default when the organizer has not written one', () => {
    expect(resolveInvitationTemplate(undefined, 'EN')).toBe(DEFAULT_INVITATION_TEMPLATE.EN);
    expect(resolveInvitationTemplate('   ', 'FR')).toBe(DEFAULT_INVITATION_TEMPLATE.FR);
    // An organizer's own wording is kept as-is.
    expect(resolveInvitationTemplate('Custom {{date}}', 'EN')).toBe('Custom {{date}}');
  });
});
