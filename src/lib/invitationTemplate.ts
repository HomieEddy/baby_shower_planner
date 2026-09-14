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
];

export const DEFAULT_INVITATION_TEMPLATE: Record<'FR' | 'EN', string> = {
  FR: [
    '🌸🩷✨ BABY SHOWER ✨🩷🌸',
    '',
    'Une petite fleur est en chemin… 🌷👶🏽',
    'Et nous avons très hâte de célébrer son arrivée avec vous ! 🩷👑',
    '',
    "Joignez-vous à nous pour une magnifique soirée remplie d'amour, de bonheur, de rires et de beaux souvenirs 🌸✨",
    '',
    '🩷 Date : {{date}}',
    '🕕 Heure : {{time}}',
    '📍 Lieu : {{venue}}',
    '',
    '🎁🩷 Baby Registry',
    'Pour ceux et celles qui souhaitent nous gâter, voici notre liste de cadeaux Amazon :',
    '{{registryUrl}}',
    '',
    '📝 Confirmation de présence',
    'Afin de confirmer votre présence, veuillez vous inscrire en utilisant le lien suivant :',
    '🔗 {{registerLink}}',
    '',
    'Lors de votre inscription, vous pourrez inscrire votre nom ainsi que le nom de toutes les personnes qui vous accompagneront, incluant votre conjoint(e) et vos enfants. 🩷',
    "Une fois votre inscription complétée, vous recevrez un code à 4 chiffres qui vous permettra de retrouver votre table lors de l'événement. ✨",
    '',
    '🌸 Nous vous demandons de bien vouloir confirmer votre présence au plus tard le {{rsvpDeadline}}.',
    '',
    "Après votre inscription, si des modifications à l'horaire ou autres changements surviennent, vous recevrez une notification vous en informant. 🩷✨",
    '',
    'Votre présence rendra cette soirée encore plus spéciale et mémorable 🥰🩷',
    '🌸✨ Au plaisir de célébrer ce merveilleux petit bonheur avec vous ! ✨🌸',
    '',
    'Futurs parents de la princesse 👑 :',
    '{{parentsNames}} 🩷👶🏽🌷',
  ].join('\n'),
  EN: [
    '🌸🩷✨ BABY SHOWER ✨🩷🌸',
    '',
    'A little flower is on the way… 🌷👶🏽',
    "And we can't wait to celebrate their arrival with you! 🩷👑",
    '',
    'Join us for a wonderful evening filled with love, happiness, laughter and beautiful memories 🌸✨',
    '',
    '🩷 Date: {{date}}',
    '🕕 Time: {{time}}',
    '📍 Venue: {{venue}}',
    '',
    '🎁🩷 Baby Registry',
    'For those who would like to spoil us, here is our Amazon gift list:',
    '{{registryUrl}}',
    '',
    '📝 RSVP',
    'To confirm your attendance, please register using this link:',
    '🔗 {{registerLink}}',
    '',
    'When you register, you can enter your name and the names of everyone joining you, including your partner and children. 🩷',
    'Once your registration is complete, you will receive a 4-digit code to find your table at the event. ✨',
    '',
    '🌸 Please confirm your attendance no later than {{rsvpDeadline}}.',
    '',
    'After you register, if there are any schedule changes or other updates, you will receive a notification. 🩷✨',
    '',
    'Your presence will make this evening even more special and memorable 🥰🩷',
    '🌸✨ We cannot wait to celebrate this wonderful little joy with you! ✨🌸',
    '',
    'Future parents of the princess 👑:',
    '{{parentsNames}} 🩷👶🏽🌷',
  ].join('\n'),
};

// Event settings → token values for one language. The register link is passed in
// (server builds it with APP_URL; the editor preview uses the browser origin).
export function invitationTemplateValues(
  settings: Partial<EventSettings>,
  language: 'FR' | 'EN',
  registerLink: string
): Record<string, string> {
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
    venue: venueName ? `${venueName}${venueAddress ? `, ${venueAddress}` : ''}` : venueAddress,
    venueName,
    venueAddress,
    registryUrl: settings.registryUrl || '',
    rsvpDeadline,
    parentsNames: settings.parentsNames || settings.babyName || '',
    babyName: settings.babyName || '',
    registerLink,
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
