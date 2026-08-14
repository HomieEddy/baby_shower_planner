import { Guest, EventSettings, Language } from '../types';

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
