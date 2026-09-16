// Host-editable self-serve invitation message. Client-safe (no server env):
// both the composer (server) and the settings editor (client) import from here.
//
// The message is plain text with {{token}} placeholders. `invitationTemplateValues`
// turns event settings into the token values; `renderInvitationTemplate` does the
// substitution. Keep the default wording free of em/en/triple dashes (clipboard +
// SMS readability) — sections are separated by blank lines.

import type { EventSettings } from '../types';
import { formatDateLong } from './dateUtils';

export interface InvitationPlaceholder {
  token: string;
  /** translations key for the chip label */
  labelKey: string;
}

// The tokens a host can drop into their message. Order = editor chip order.
export const INVITATION_PLACEHOLDERS: InvitationPlaceholder[] = [
  { token: 'date', labelKey: 'eventDateLabel2' },
  { token: 'time', labelKey: 'eventTimeRangeLabel' },
  { token: 'venue', labelKey: 'invitePhVenue' },
  { token: 'venueName', labelKey: 'venueNameLabel2' },
  { token: 'venueAddress', labelKey: 'fullVenueAddressLabel' },
  { token: 'registryUrl', labelKey: 'registryLinkLabel' },
  { token: 'rsvpDeadline', labelKey: 'rsvpDeadlineLabel' },
  { token: 'parentsNames', labelKey: 'parentsNamesLabel2' },
  { token: 'babyName', labelKey: 'babyNameOptionalLabel' },
  { token: 'registerLink', labelKey: 'invitePhRegisterLink' },
  { token: 'guestName', labelKey: 'guestNameCol' },
  { token: 'code', labelKey: 'reservationCodeCol' },
];

// The shipped default. Event-neutral on purpose: it names no event type, no
// registry service and no date — the host's own settings and wording fill it in.
export const DEFAULT_INVITATION_TEMPLATE: Record<'FR' | 'EN', string> = {
  FR: [
    'Bonjour,',
    '',
    'Nous avons hâte de célébrer ce moment avec vous.',
    '',
    'Date : {{date}}',
    'Heure : {{time}}',
    'Lieu : {{venue}}',
    '',
    'Liste de cadeaux :',
    '{{registryUrl}}',
    '',
    'RSVP',
    'Afin de confirmer votre présence, veuillez vous inscrire en utilisant le lien suivant :',
    '{{registerLink}}',
    '',
    'Lors de votre inscription, vous pourrez inscrire votre nom ainsi que le nom de toutes les personnes qui vous accompagneront.',
    "Une fois votre inscription complétée, vous recevrez un code à 4 chiffres qui vous permettra de retrouver votre table lors de l'événement.",
    '',
    'Nous vous prions de bien vouloir confirmer votre présence au plus tard le {{rsvpDeadline}}.',
    '',
    "Après votre inscription, si des modifications à l'horaire ou d'autres changements surviennent, vous recevrez une notification.",
    '',
    'Au plaisir de célébrer avec vous,',
    '{{parentsNames}}',
  ].join('\n'),
  EN: [
    'Hello,',
    '',
    "We can't wait to celebrate this moment with you.",
    '',
    'Date: {{date}}',
    'Time: {{time}}',
    'Venue: {{venue}}',
    '',
    'Gift registry:',
    '{{registryUrl}}',
    '',
    'RSVP',
    'To confirm your attendance, please register using this link:',
    '{{registerLink}}',
    '',
    'When you register, you can enter your name and the names of everyone joining you.',
    'Once your registration is complete, you will receive a 4-digit code to find your table at the event.',
    '',
    'Please confirm your attendance no later than {{rsvpDeadline}}.',
    '',
    'After you register, if there are any schedule changes or other updates, you will receive a notification.',
    '',
    'We look forward to celebrating with you,',
    '{{parentsNames}}',
  ].join('\n'),
};

// Event settings → the display fields every message derives from: the joined
// venue string and the FR-lowercased deadline. One derivation shared by the
// invitation template, the email rows, and SMS.
export interface EventContext {
  date: string;
  time: string;
  venueName: string;
  venueAddress: string;
  venue: string;
  rsvpDeadline: string;
  registryUrl: string;
  parentsNames: string;
  babyName: string;
}

export function eventContext(settings: Partial<EventSettings>, language: 'FR' | 'EN'): EventContext {
  const venueName = settings.venueName || '';
  const venueAddress = settings.venueAddress || '';
  // FR formats the weekday capitalized ("Jeudi 1 octobre"); the default message
  // uses it mid-sentence ("au plus tard le {{rsvpDeadline}}"), so lowercase it.
  const rawDeadline = settings.rsvpDeadline ? formatDateLong(settings.rsvpDeadline, language) : '';
  const rsvpDeadline = language === 'FR' && rawDeadline
    ? rawDeadline.charAt(0).toLowerCase() + rawDeadline.slice(1)
    : rawDeadline;
  return {
    date: settings.date || '',
    time: settings.time || '',
    venueName,
    venueAddress,
    venue: venueName ? `${venueName}${venueAddress ? `, ${venueAddress}` : ''}` : venueAddress,
    rsvpDeadline,
    registryUrl: settings.registryUrl || '',
    parentsNames: settings.parentsNames || settings.babyName || '',
    babyName: settings.babyName || '',
  };
}

// Event settings → token values for one language. `link` is context-resolved:
// the /register link for the self-serve message, or a guest's personal RSVP
// link for a host-added guest. Per-guest tokens stay blank otherwise.
export function invitationTemplateValues(
  settings: Partial<EventSettings>,
  language: 'FR' | 'EN',
  link: string,
  extra: { guestName?: string; code?: string } = {}
): Record<string, string> {
  const ctx = eventContext(settings, language);
  return {
    date: ctx.date,
    time: ctx.time,
    venue: ctx.venue,
    venueName: ctx.venueName,
    venueAddress: ctx.venueAddress,
    registryUrl: ctx.registryUrl,
    rsvpDeadline: ctx.rsvpDeadline,
    parentsNames: ctx.parentsNames,
    babyName: ctx.babyName,
    registerLink: link,
    // Alias: a template may use either link token; both resolve to `link`.
    rsvpLink: link,
    guestName: extra.guestName || '',
    code: extra.code || '',
  };
}

// Replace {{token}} (whitespace-tolerant) with its value; unknown/empty → ''.
export function renderInvitationTemplate(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, key: string) => values[key] ?? '');
}

// A stored template wins; an unset/blank one falls back to the shipped default.
export function resolveInvitationTemplate(stored: string | null | undefined, language: 'FR' | 'EN'): string {
  const trimmed = (stored ?? '').trim();
  return trimmed || DEFAULT_INVITATION_TEMPLATE[language];
}
