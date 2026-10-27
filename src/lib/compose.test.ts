import { describe, it, expect } from 'vitest';
import type { EventSettings, Guest } from '../types';
import {
  buildInviteMessage,
  buildUniversalInviteMessage,
  composeFloorPlan,
  composeInvitation,
  composeReminder,
  renderEmailHtml,
  renderSms,
  renderText,
} from './compose';
import { renderInvitationTemplate } from './invitationTemplate';

const guest = (over: Partial<Guest> = {}): Guest => ({
  id: 'g1',
  name: 'Alice',
  email: 'alice@example.com',
  phone: '+15550000',
  delivery_channel: 'both',
  code: '2468',
  max_party_size: 2,
  rsvp_status: 'Pending',
  attending_party_size: 0,
  dietary_restrictions: '',
  language_pref: 'FR',
  magic_token: 'tok-123',
  token_used: false,
  created_at: '',
  ...over,
});

const settings = (over: Partial<EventSettings> = {}): Partial<EventSettings> => ({
  parentsNames: 'Emma & Noah',
  date: '12 septembre 2026',
  time: '18 h à 22 h',
  venueName: 'Salle Maplewood',
  venueAddress: '428 avenue Rosewood, Montréal',
  registryUrl: 'https://registry.example.com/list',
  rsvpDeadline: '2026-10-01',
  ...over,
});

describe('buildUniversalInviteMessage (self-serve)', () => {
  it('renders event details, registry and deadline, with no em-dashes', () => {
    const msg = buildUniversalInviteMessage(settings(), 'FR');
    expect(msg).toContain('Nous avons hâte de célébrer ce moment avec vous.');
    expect(msg).toContain('Emma & Noah');
    expect(msg).toContain('12 septembre 2026');
    expect(msg).toContain('Salle Maplewood, 428 avenue Rosewood, Montréal');
    expect(msg).toContain('https://registry.example.com/list');
    expect(msg).toContain('/register');
    expect(msg).toContain('au plus tard le jeudi 1 octobre 2026');
    expect(msg).not.toMatch(/[\u2014\u2013\u2E3B]/);
    expect(msg).not.toContain('{{');
  });

  it('carries the inviter ref into the register link', () => {
    expect(buildUniversalInviteMessage({}, 'EN', 'inv1')).toContain('ref=inv1');
  });

  it('leaves no unreplaced placeholder when a setting is unset', () => {
    const msg = buildUniversalInviteMessage({}, 'EN');
    expect(msg).toContain('/register');
    expect(msg).not.toContain('{{');
  });

  it('prefers a stored template over the default', () => {
    const msg = buildUniversalInviteMessage(
      { ...settings(), invitationTemplateFr: 'Salut {{parentsNames}} — {{date}} — {{registerLink}}' },
      'FR'
    );
    expect(msg).toMatch(/^Salut Emma & Noah — 12 septembre 2026 — https?:\/\/.+\/register$/);
    expect(msg).not.toContain('BABY SHOWER');
  });
});

describe('renderInvitationTemplate', () => {
  it('substitutes tokens and drops unknown/empty ones', () => {
    expect(renderInvitationTemplate('a {{ date }} b {{missing}} c', { date: 'X' })).toBe('a X b  c');
  });
});

describe('per-guest invitation shares the universal template', () => {
  it('resolves the RSVP link, guest name and code', () => {
    const msg = buildInviteMessage(guest(), {
      ...settings(),
      invitationTemplateFr: 'Bonjour {{guestName}} : {{rsvpLink}}',
    });
    expect(msg).toContain('Bonjour Alice');
    expect(msg).toContain('/rsvp/tok-123');
  });

  it('appends the reservation code when the template omits {{code}}', () => {
    const msg = buildInviteMessage(guest(), { ...settings(), invitationTemplateFr: 'Salut {{guestName}}' });
    expect(msg).toContain('Salut Alice');
    expect(msg).toContain('Votre code de réservation : 2468');
  });

  it('does not duplicate the code when the template places it', () => {
    const msg = buildInviteMessage(guest(), { ...settings(), invitationTemplateFr: 'Code {{code}}' });
    expect(msg).toBe('Code 2468');
  });

  it('falls back to the shipped default message', () => {
    expect(buildInviteMessage(guest(), {})).toContain('Nous avons hâte de célébrer ce moment avec vous.');
  });

  it('uses the template as the email body', () => {
    const html = renderEmailHtml(composeInvitation(guest(), settings()));
    expect(html).toContain('Nous avons hâte de célébrer ce moment avec vous.');
  });
});

describe('composeInvitation', () => {
  it('uses the guest language and their RSVP link + code', () => {
    const content = composeInvitation(guest({ language_pref: 'EN' }), settings());
    expect(content.language).toBe('EN');
    expect(content.link).toContain('/rsvp/tok-123');
    const text = renderText(content);
    expect(text).toContain("We can't wait to celebrate with you.");
    expect(text).toContain('Your reservation code: 2468');
  });

  it('falls back gracefully with empty settings', () => {
    const text = buildInviteMessage(guest(), {});
    expect(text).toContain('/rsvp/tok-123');
    expect(text).toContain('Nous avons hâte de célébrer ce moment avec vous.');
  });
});

describe('renderSms', () => {
  it('is concise — heading, rows, link and code only', () => {
    const sms = renderSms(composeInvitation(guest({ language_pref: 'EN' }), settings()));
    expect(sms).toContain('/rsvp/tok-123');
    expect(sms).toContain('Code: 2468');
    // The long clipboard paragraphs are not part of the SMS.
    expect(sms).not.toContain("It will let you find your table");
  });

  it('renders French SMS (no EN-only gap)', () => {
    const sms = renderSms(composeInvitation(guest({ language_pref: 'FR' }), settings()));
    expect(sms).toContain('Baby Shower de Emma & Noah');
    expect(sms).toContain('RSVP: ');
  });
});

describe('event title', () => {
  it('names the event by its title in headings and subjects when set', () => {
    const titled = settings({ eventTitle: 'Mia & Leo Shower' });
    const invite = composeInvitation(guest({ language_pref: 'EN' }), titled);
    expect(invite.heading).toContain('Mia & Leo Shower');
    expect(invite.subject).toBe("You're invited: Mia & Leo Shower!");
    expect(composeReminder(guest({ language_pref: 'FR' }), titled).intro).toContain('à « Mia & Leo Shower » le 12 septembre 2026');
    expect(composeFloorPlan(guest({ language_pref: 'EN' }), titled, 'A', '').subject).toBe('Your table for Mia & Leo Shower');
  });

  it('keeps the generic wording without a title', () => {
    expect(composeInvitation(guest({ language_pref: 'EN' }), settings()).subject).toBe("You're invited to Emma & Noah's Baby Shower!");
  });

  it('leaves no empty date in reminders when the date is unset', () => {
    const reminder = composeReminder(guest({ language_pref: 'EN' }), settings({ date: '' }));
    expect(reminder.subject).not.toContain('()');
    expect(reminder.intro).not.toMatch(/ on \.$/);
  });
});
