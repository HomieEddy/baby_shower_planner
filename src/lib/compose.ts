// One source for outbound message content. Composers turn domain data into a
// channel-agnostic MessageContent; renderers turn that content into plain text
// (clipboard), concise SMS lines, or the shared email HTML. Email/SMS modules
// are adapters over this — they never re-derive event fields.

import { Guest, EventSettings, AgendaTask, Language } from '../types';
import { formatDateLong, formatTaskDue } from './dateUtils';
import { findMyTableUrl, registerUrl, rsvpUrl } from './links';
import {
  invitationTemplateValues,
  renderInvitationTemplate,
  resolveInvitationTemplate,
} from './invitationTemplate';

export type MessageKind = 'invitation' | 'reminder' | 'alert' | 'floorplan' | 'thankyou' | 'agenda';

export interface MessageRow {
  label: string;
  value: string;
}

export interface MessageContent {
  kind: MessageKind;
  language: Language;
  subject: string;
  heading: string;
  subtitle?: string;
  greetingName?: string;
  intro?: string;
  rows: MessageRow[];
  /** Formatted (FR lowercased) RSVP deadline, when set. */
  deadline?: string;
  link?: string;
  cta?: string;
  /** Plain-text confirm block (sentence + link) — clipboard/WhatsApp message. */
  confirmBlock?: string;
  code?: string;
  codeLine?: string;
  gift?: string;
  /** Full plain-text body (host-editable template) — used by email instead of
   *  the structured blocks. SMS ignores it and stays concise. */
  body?: string;
  paragraphs: string[];
  closing?: string;
  footer?: string;
}

const isEN = (language: Language) => language === 'EN';
const flowerLine = (language: Language) => (isEN(language)
  ? "A little flower is on the way, and we can't wait to celebrate with you."
  : 'Une petite fleur est en chemin et nous avons très hâte de célébrer son arrivée avec vous.');

// Join paragraphs with a blank line, dropping empty sections.
function blocks(parts: (string | undefined)[]): string {
  return parts.filter((p): p is string => !!p && p.trim() !== '').join('\n\n');
}

function heading(settings: Partial<EventSettings>, language: Language): string {
  const host = settings.parentsNames || settings.babyName || '';
  if (isEN(language)) return host ? `🌸 ${host}'s Baby Shower 🌸` : '🌸 Baby Shower 🌸';
  return host ? `🌸 Baby Shower de ${host} 🌸` : '🌸 Baby Shower 🌸';
}

function eventRows(settings: Partial<EventSettings>, language: Language): MessageRow[] {
  const rows: MessageRow[] = [];
  const venue = settings.venueName || '';
  const address = settings.venueAddress || '';
  if (settings.date) rows.push({ label: isEN(language) ? 'Date' : 'Date', value: settings.date });
  if (settings.time) rows.push({ label: isEN(language) ? 'Time' : 'Heure', value: settings.time });
  if (venue) rows.push({ label: isEN(language) ? 'Venue' : 'Lieu', value: `${venue}${address ? `, ${address}` : ''}` });
  return rows;
}

function rowsText(rows: MessageRow[], language: Language): string {
  const sep = isEN(language) ? ': ' : ' : ';
  return rows.map((r) => `${r.label}${sep}${r.value}`).join('\n');
}

function deadlineText(settings: Partial<EventSettings>, language: Language): string {
  if (!settings.rsvpDeadline) return '';
  const formatted = formatDateLong(settings.rsvpDeadline, language);
  // FR uses the date mid-sentence ("le jeudi 1 octobre"), so lowercase the weekday.
  return !isEN(language) && formatted ? formatted.charAt(0).toLowerCase() + formatted.slice(1) : formatted;
}

// "please confirm by {deadline}" lead-in, or the plain prompt when unset.
function confirmBlock(settings: Partial<EventSettings>, language: Language, link: string, linkVerb: 'register' | 'rsvp'): string {
  const deadline = deadlineText(settings, language);
  if (isEN(language)) {
    if (!deadline) {
      return linkVerb === 'register'
        ? `To confirm your attendance, please register here:\n${link}`
        : `Please confirm your attendance here:\n${link}`;
    }
    return `Please confirm your attendance by ${deadline}.\n${linkVerb === 'register' ? 'Register here' : 'RSVP here'}:\n${link}`;
  }
  if (!deadline) {
    return linkVerb === 'register'
      ? `Pour confirmer votre présence, veuillez vous inscrire ici :\n${link}`
      : `Pour confirmer votre présence, veuillez répondre ici :\n${link}`;
  }
  return `Veuillez confirmer votre présence au plus tard le ${deadline}.\n${linkVerb === 'register' ? 'Inscrivez-vous ici' : 'Répondez ici'} :\n${link}`;
}

function giftBlock(settings: Partial<EventSettings>, language: Language): string {
  if (!settings.registryUrl) return '';
  return isEN(language) ? `🎁 Gift registry:\n${settings.registryUrl}` : `🎁 Liste de cadeaux :\n${settings.registryUrl}`;
}

function closingBlock(settings: Partial<EventSettings>, language: Language): string {
  const parents = settings.parentsNames || settings.babyName || '';
  if (!parents) return '';
  return isEN(language)
    ? `We can't wait to celebrate with you,\n${parents}`
    : `Au plaisir de célébrer avec vous,\n${parents}`;
}

function invitationSubject(settings: Partial<EventSettings>, language: Language): string {
  const host = settings.parentsNames || settings.babyName || '';
  if (isEN(language)) return `You're invited to ${host ? `${host}'s Baby Shower` : 'the Baby Shower'}!`;
  return `Vous êtes invité${host ? ` au baby shower de ${host}` : ' au baby shower'} !`;
}

function guestCodeLine(code: string, language: Language): string {
  return isEN(language)
    ? `Your reservation code: ${code}\nIt will let you find your table at the event.`
    : `Votre code de réservation : ${code}\nIl vous permettra de retrouver votre table lors de l'événement.`;
}

// One invitation message for both flows: the host-editable template (or the
// shipped default) with the recipient's link + per-guest tokens filled in.
function renderGuestInvitation(guest: Guest, settings: Partial<EventSettings>, language: Language): string {
  const stored = language === 'EN' ? settings.invitationTemplateEn : settings.invitationTemplateFr;
  const template = resolveInvitationTemplate(stored, language);
  const text = renderInvitationTemplate(
    template,
    invitationTemplateValues(settings, language, rsvpUrl(guest.magic_token), { guestName: guest.name, code: guest.code })
  );
  // Keep the reservation code unless the template already places it.
  const hasCodeToken = /\{\{\s*code\s*\}\}/.test(template);
  return !hasCodeToken && guest.code ? `${text}\n\n${guestCodeLine(guest.code, language)}` : text;
}

// ─── Composers ─────────────────────────────────────────────────────

// Personal invitation for a host-added guest: straight to their RSVP link.
export function composeInvitation(guest: Guest, settings: Partial<EventSettings>, language?: Language): MessageContent {
  const lang = language ?? guest.language_pref ?? 'FR';
  const link = rsvpUrl(guest.magic_token);
  return {
    kind: 'invitation',
    language: lang,
    subject: invitationSubject(settings, lang),
    heading: heading(settings, lang),
    subtitle: settings.parentsNames,
    greetingName: guest.name,
    intro: flowerLine(lang),
    rows: eventRows(settings, lang),
    deadline: deadlineText(settings, lang),
    link,
    cta: isEN(lang) ? 'RSVP Now' : 'Répondre',
    confirmBlock: confirmBlock(settings, lang, link, 'rsvp'),
    code: guest.code,
    codeLine: guestCodeLine(guest.code, lang),
    body: renderGuestInvitation(guest, settings, lang),
    gift: giftBlock(settings, lang),
    paragraphs: [],
    closing: closingBlock(settings, lang),
  };
}

export function composeReminder(guest: Guest, settings: Partial<EventSettings>, language?: Language): MessageContent {
  const lang = language ?? guest.language_pref ?? 'FR';
  const host = settings.parentsNames || settings.babyName || '';
  const showerLabel = isEN(lang)
    ? (host ? `${host}'s Baby Shower` : 'the Baby Shower')
    : (host ? `le baby shower de ${host}` : 'le baby shower');
  const date = settings.date || '';
  return {
    kind: 'reminder',
    language: lang,
    subject: isEN(lang) ? `⏰ Reminder: RSVP for ${showerLabel} (${date})` : `⏰ Rappel : RSVP pour ${showerLabel} (${date})`,
    heading: isEN(lang) ? 'Friendly Reminder' : 'Petit rappel',
    greetingName: guest.name,
    intro: isEN(lang)
      ? `We haven't heard from you yet! Please let us know if you can make it to ${showerLabel} on ${date}.`
      : `Nous n'avons pas encore de nouvelles de vous ! Merci de nous confirmer votre présence au ${showerLabel} le ${date}.`,
    rows: [],
    link: rsvpUrl(guest.magic_token),
    cta: isEN(lang) ? 'RSVP Now' : 'Répondre',
    code: guest.code,
    paragraphs: [],
  };
}

export function composeAlert(guest: Guest, settings: Partial<EventSettings>, title: string, message: string, language?: Language): MessageContent {
  const lang = language ?? guest.language_pref ?? 'FR';
  return {
    kind: 'alert',
    language: lang,
    subject: `📢 ${title}`,
    heading: title,
    greetingName: guest.name,
    rows: [],
    link: rsvpUrl(guest.magic_token),
    cta: isEN(lang) ? 'View RSVP' : 'Voir le RSVP',
    code: guest.code,
    paragraphs: [message],
  };
}

export function composeFloorPlan(guest: Guest, settings: Partial<EventSettings>, tableName: string, customMessage: string, language?: Language): MessageContent {
  const lang = language ?? guest.language_pref ?? 'FR';
  const tableLine = tableName
    ? (isEN(lang) ? `You are seated at table: ${tableName}.` : `Vous êtes à la table : ${tableName}.`)
    : (isEN(lang) ? 'You have open seating.' : "Vous n'avez pas de table attitrée.");
  return {
    kind: 'floorplan',
    language: lang,
    subject: isEN(lang) ? 'Your table for the Baby Shower' : 'Votre table pour le baby shower',
    heading: isEN(lang) ? 'Your Seat' : 'Votre place',
    greetingName: guest.name,
    rows: [],
    link: findMyTableUrl(guest.magic_token),
    cta: isEN(lang) ? 'Find My Table' : 'Trouver ma table',
    code: guest.code,
    paragraphs: customMessage ? [tableLine, customMessage] : [tableLine],
  };
}

export function composeThankYou(guest: Guest, text: string, language?: Language): MessageContent {
  return {
    kind: 'thankyou',
    language: language ?? guest.language_pref ?? 'FR',
    subject: 'Thank You!',
    heading: '',
    rows: [],
    paragraphs: text.split('\n').filter((p) => p.trim() !== ''),
  };
}

// Host-facing agenda reminder (single-language, per settings.language).
export function composeAgenda(settings: EventSettings, task: AgendaTask): MessageContent {
  const lang: Language = settings.language === 'FR' ? 'FR' : 'EN';
  const when = formatTaskDue(task.due_date || '', task.due_time, lang);
  return {
    kind: 'agenda',
    language: lang,
    subject: isEN(lang) ? `⏰ Reminder: ${task.title}` : `⏰ Rappel : ${task.title}`,
    heading: isEN(lang) ? 'Task Reminder' : 'Rappel de tâche',
    intro: isEN(lang) ? 'Hi, just a quick reminder:' : 'Bonjour, juste un petit rappel :',
    rows: when ? [{ label: '', value: when }] : [],
    paragraphs: task.description ? [task.description] : [],
  };
}

// ─── Renderers ─────────────────────────────────────────────────────

// Full plain-text message (clipboard / WhatsApp share).
export function renderText(content: MessageContent): string {
  return blocks([
    content.heading,
    content.intro,
    rowsText(content.rows, content.language),
    content.confirmBlock,
    ...content.paragraphs,
    content.codeLine,
    content.gift,
    content.closing,
  ]);
}

// Concise plain-text lines for SMS.
export function renderSms(content: MessageContent): string {
  const lines = [
    content.heading,
    ...content.rows.map((r) => (r.label ? `${r.label}${isEN(content.language) ? ': ' : ' : '}${r.value}` : r.value)),
    content.deadline ? (isEN(content.language) ? `RSVP by ${content.deadline}` : `Réponse avant le ${content.deadline}`) : '',
    ...content.paragraphs,
    content.link ? `RSVP: ${content.link}` : '',
    content.code ? `Code: ${content.code}` : '',
  ];
  return lines.filter((l) => l && l.trim() !== '').join('\n');
}

// Shared email HTML shell. One template for every kind; only the content varies.
export function renderEmailHtml(content: MessageContent): string {
  const fr = !isEN(content.language);
  const escapeHtml = (s: string) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string));
  const greet = content.greetingName ? (fr ? `Bonjour ${content.greetingName},` : `Dear ${content.greetingName},`) : '';
  const rowsHtml = content.rows
    .map((r) => `<tr><td style="padding: 4px 0; color: #8B735B;${r === content.rows[0] ? ' width: 70px;' : ''}">${r.label}</td><td style="padding: 4px 0;"><strong>${r.value}</strong></td></tr>`)
    .join('');
  const deadlineHtml = content.deadline
    ? `<p style="font-size: 13px; color: #8B735B; text-align: center; margin: 0 0 4px;">${fr ? 'Merci de confirmer votre présence avant le' : 'Please confirm your attendance by'} <strong style="color: #4A3F35;">${content.deadline}</strong>.</p>`
    : '';
  const paragraphsHtml = content.paragraphs
    .map((p) => `<p style="font-size: 13px; line-height: 1.6; color: #5D5449;">${p}</p>`)
    .join('');
  const buttonHtml = content.link && content.cta
    ? `<div style="text-align: center; margin: 24px 0;"><a href="${content.link}" style="display: inline-block; padding: 12px 32px; background: #8B735B; color: white; text-decoration: none; border-radius: 40px; font-size: 15px; font-weight: bold;">${content.cta}</a></div>`
    : '';
  const codeHtml = content.code
    ? `<p style="font-size: 12px; color: #A09080; text-align: center;">${fr ? 'Votre code de réservation :' : 'Your reservation code:'} <strong style="color: #4A3F35;">${content.code}</strong></p>`
    : '';
  const linkHtml = content.link
    ? `<p style="font-size: 12px; color: #A09080; text-align: center;">${fr ? 'Impossible de cliquer ? Copiez ce lien dans votre navigateur :' : "Can't click the button? Copy this link into your browser:"}<br/><span style="color: #8B735B;">${content.link}</span></p>`
    : '';

  return `
    <div style="font-family: Georgia, serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background: #FDFBF7; color: #4A3F35;">
      ${content.heading ? `<div style="text-align: center; margin-bottom: 20px;">
        <div style="font-size: 24px; font-weight: bold; color: #8B735B;">${content.heading}</div>
        ${content.subtitle ? `<div style="font-size: 14px; color: #A09080; margin-top: 4px;">${content.subtitle}</div>` : ''}
      </div>` : ''}
      <div style="background: white; border-radius: 16px; padding: 24px; border: 1px solid #E8E0D4;">
        ${greet ? `<p style="font-size: 16px; margin: 0 0 16px;">${greet}</p>` : ''}
        ${content.body
          ? `<div style="white-space: pre-wrap; font-size: 13px; line-height: 1.6; color: #5D5449;">${escapeHtml(content.body)}</div>`
          : `${content.intro ? `<p style="font-size: 14px; line-height: 1.6; color: #5D5449;">${content.intro}</p>` : ''}
        ${rowsHtml ? `<table style="width: 100%; margin: 16px 0; font-size: 13px;">${rowsHtml}</table>` : ''}
        ${deadlineHtml}
        ${paragraphsHtml}`}
        ${buttonHtml}
        ${codeHtml}
        ${content.body ? '' : linkHtml}
      </div>
      <div style="text-align: center; margin-top: 16px; font-size: 11px; color: #A09080;">${content.footer || content.closing || ''}</div>
    </div>`;
}

// Back-compat text builders (clipboard / universal host message).
export const buildInviteMessage = (guest: Guest, settings: Partial<EventSettings>, language: Language = 'FR'): string =>
  renderGuestInvitation(guest, settings, language);

// The self-serve invitation is host-editable: a stored template (per language)
// wins, otherwise the shipped default. Both are plain text with {{token}}s.
export const buildUniversalInviteMessage = (settings: Partial<EventSettings>, language: Language = 'FR', refId?: string): string => {
  const stored = language === 'EN' ? settings.invitationTemplateEn : settings.invitationTemplateFr;
  const template = resolveInvitationTemplate(stored, language);
  return renderInvitationTemplate(template, invitationTemplateValues(settings, language, registerUrl(refId)));
};

export { registerUrl as universalRegisterUrl };
