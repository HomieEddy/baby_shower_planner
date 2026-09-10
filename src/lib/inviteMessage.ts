import { Guest, EventSettings, Language } from '../types';

// Universal registration link everyone can use (host broadcasts it; guests
// share it to invite others). Guests then self-register and wait for the host
// to approve them. `refId` carries the inviter's share id so provenance is
// stamped on the resulting registration.
export function universalRegisterUrl(refId?: string): string {
  const base = `${process.env.APP_URL || 'http://localhost:3025'}/register`;
  return refId ? `${base}?ref=${encodeURIComponent(refId)}` : base;
}

// Join paragraphs with a blank line, dropping empty sections. Keeps intentional
// spacing inside a section (e.g. a link under its label).
function blocks(parts: (string | undefined)[]): string {
  return parts.filter((p): p is string => !!p && p.trim() !== '').join('\n\n');
}

function title(settings: Partial<EventSettings>, language: Language): string {
  const host = settings.parentsNames || settings.babyName || '';
  if (language === 'EN') return host ? `🌸 ${host}'s Baby Shower 🌸` : '🌸 Baby Shower 🌸';
  return host ? `🌸 Baby Shower de ${host} 🌸` : '🌸 Baby Shower 🌸';
}

function eventBlock(settings: Partial<EventSettings>, language: Language): string {
  const date = settings.date || '';
  const time = settings.time || '';
  const venue = settings.venueName || '';
  const address = settings.venueAddress || '';
  const lines = language === 'EN'
    ? [date && `Date: ${date}`, time && `Time: ${time}`, venue && `Venue: ${venue}${address ? `, ${address}` : ''}`]
    : [date && `Date : ${date}`, time && `Heure : ${time}`, venue && `Lieu : ${venue}${address ? `, ${address}` : ''}`];
  return lines.filter(Boolean).join('\n');
}

function giftBlock(settings: Partial<EventSettings>, language: Language): string {
  const registry = settings.registryUrl || '';
  if (!registry) return '';
  return language === 'EN' ? `🎁 Gift registry:\n${registry}` : `🎁 Liste de cadeaux :\n${registry}`;
}

function closingBlock(settings: Partial<EventSettings>, language: Language): string {
  const parents = settings.parentsNames || settings.babyName || '';
  if (!parents) return '';
  return language === 'EN'
    ? `We can't wait to celebrate with you,\n${parents}`
    : `Au plaisir de célébrer avec vous,\n${parents}`;
}

// Personal invitation for a host-added guest: straight to their own RSVP link,
// with the reservation code they already have.
export function buildInviteMessage(guest: Guest, settings: Partial<EventSettings>, language: Language = 'FR'): string {
  const link = `${process.env.APP_URL || 'http://localhost:3025'}/rsvp/${guest.magic_token}`;
  if (language === 'EN') {
    return blocks([
      title(settings, 'EN'),
      'A little flower is on the way, and we can\'t wait to celebrate with you.',
      eventBlock(settings, 'EN'),
      `Please confirm your attendance here:\n${link}`,
      `Your reservation code: ${guest.code}\nIt will let you find your table at the event.`,
      giftBlock(settings, 'EN'),
      closingBlock(settings, 'EN'),
    ]);
  }
  return blocks([
    title(settings, 'FR'),
    'Une petite fleur est en chemin et nous avons très hâte de célébrer son arrivée avec vous.',
    eventBlock(settings, 'FR'),
    `Pour confirmer votre présence, veuillez répondre ici :\n${link}`,
    `Votre code de réservation : ${guest.code}\nIl vous permettra de retrouver votre table lors de l'événement.`,
    giftBlock(settings, 'FR'),
    closingBlock(settings, 'FR'),
  ]);
}

// Universal invitation: everyone registers through the same link and gets
// their 4-digit code once their registration is complete.
export function buildUniversalInviteMessage(settings: Partial<EventSettings>, language: Language = 'FR', refId?: string): string {
  const link = universalRegisterUrl(refId);
  if (language === 'EN') {
    return blocks([
      title(settings, 'EN'),
      'A little flower is on the way, and we can\'t wait to celebrate with you.',
      eventBlock(settings, 'EN'),
      `To confirm your attendance, please register here:\n${link}`,
      'When you register, you can enter your name and the names of everyone joining you, including your partner and children. Once your registration is complete, you will receive a 4-digit code to find your table at the event.',
      'If anything changes after you register, we will send you a notification.',
      giftBlock(settings, 'EN'),
      closingBlock(settings, 'EN'),
    ]);
  }
  return blocks([
    title(settings, 'FR'),
    'Une petite fleur est en chemin et nous avons très hâte de célébrer son arrivée avec vous.',
    eventBlock(settings, 'FR'),
    `Pour confirmer votre présence, veuillez vous inscrire ici :\n${link}`,
    'Lors de votre inscription, vous pourrez indiquer votre nom ainsi que le nom de toutes les personnes qui vous accompagnent, conjoint(e) et enfants inclus. Une fois votre inscription complétée, vous recevrez un code à 4 chiffres qui vous permettra de retrouver votre table lors de l\'événement.',
    'Après votre inscription, si des changements surviennent, vous recevrez une notification.',
    giftBlock(settings, 'FR'),
    closingBlock(settings, 'FR'),
  ]);
}
