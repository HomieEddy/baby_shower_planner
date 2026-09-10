import { Guest, EventSettings, Language } from '../types';

// Universal registration link everyone can use (host broadcasts it; guests
// share it to invite others). Guests then self-register and wait for the host
// to approve them. `refId` carries the inviter's share id so provenance is
// stamped on the resulting registration.
export function universalRegisterUrl(refId?: string): string {
  const base = `${process.env.APP_URL || 'http://localhost:3025'}/register`;
  return refId ? `${base}?ref=${encodeURIComponent(refId)}` : base;
}

export function buildUniversalInviteMessage(settings: Partial<EventSettings>, language: Language = 'FR', refId?: string): string {
  const link = universalRegisterUrl(refId);
  const baby = settings.babyName || '';
  const parents = settings.parentsNames || '';
  const host = parents || baby;
  const date = settings.date || '';
  const time = settings.time || '';
  const venue = settings.venueName || '';
  const address = settings.venueAddress || '';
  const shower = host ? `${host}'s Baby Shower` : 'Baby Shower';
  const lines =
    language === 'EN'
      ? [
          `You're invited to ${shower}!`,
          date ? `Date: ${date}` : '',
          time ? `Time: ${time}` : '',
          venue ? `Venue: ${venue}${address ? `, ${address}` : ''}` : '',
          '',
          `Register here: ${link}`,
        ]
      : [
          `Vous êtes invité ${host ? `au baby shower de ${host}` : 'au baby shower'} !`,
          date ? `Date : ${date}` : '',
          time ? `Heure : ${time}` : '',
          venue ? `Lieu : ${venue}${address ? `, ${address}` : ''}` : '',
          '',
          `Inscrivez-vous ici : ${link}`,
        ];
  return lines.filter(Boolean).join('\n');
}

// Ready-to-paste invitation message (text) for manually shared links
// (host "Link only" invites + guest-to-guest invites). Bilingual via the
// guest's language preference.
export function buildInviteMessage(guest: Guest, settings: Partial<EventSettings>, language: Language = 'FR'): string {
  const link = `${process.env.APP_URL || 'http://localhost:3025'}/rsvp/${guest.magic_token}`;
  const baby = settings.babyName || '';
  const parents = settings.parentsNames || '';
  const host = parents || baby;
  const date = settings.date || '';
  const time = settings.time || '';
  const venue = settings.venueName || '';
  const address = settings.venueAddress || '';
  const shower = host ? `${host}'s Baby Shower` : 'Baby Shower';
  const lines =
    language === 'EN'
      ? [
          `You're invited to ${shower}!`,
          date ? `Date: ${date}` : '',
          time ? `Time: ${time}` : '',
          venue ? `Venue: ${venue}${address ? `, ${address}` : ''}` : '',
          '',
          `RSVP here: ${link}`,
          `Your reservation code: ${guest.code}`,
        ]
      : [
          `Vous êtes invité ${host ? `au baby shower de ${host}` : 'au baby shower'} !`,
          date ? `Date : ${date}` : '',
          time ? `Heure : ${time}` : '',
          venue ? `Lieu : ${venue}${address ? `, ${address}` : ''}` : '',
          '',
          `Répondez ici : ${link}`,
          `Votre code de réservation : ${guest.code}`,
        ];
  return lines.filter(Boolean).join('\n');
}
