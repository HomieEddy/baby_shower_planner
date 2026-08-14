import { Resend } from 'resend';
import { Guest, EventSettings } from '../types';

let resend: Resend | null = null;

function getClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!resend) resend = new Resend(process.env.RESEND_API_KEY);
  return resend;
}

const isEN = (g: Guest) => g.language_pref === 'EN';

function buildGuestEmail(guest: Guest, settings: EventSettings): { subject: string; html: string } {
  const fr = !isEN(guest);
  const host = settings.parentsNames || settings.babyName || '';
  const date = settings.date || '';
  const time = settings.time || '';
  const venue = settings.venueName || '';
  const venueAddress = settings.venueAddress || '';
  const link = `${process.env.APP_URL || 'http://localhost:3025'}/rsvp/${guest.magic_token}`;
  const showerLabel = host ? `${host}'s Baby Shower` : 'the Baby Shower';
  const showerLabelFr = host ? `le baby shower de ${host}` : 'le baby shower';

  const subject = fr
    ? `Vous êtes invité${host ? ` au baby shower de ${host}` : ' au baby shower'} !`
    : `You're invited to ${showerLabel}!`;
  const html = `
    <div style="font-family: Georgia, serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background: #FDFBF7; color: #4A3F35;">
      <div style="text-align: center; margin-bottom: 24px;">
        <div style="font-size: 28px; font-weight: bold; color: #8B735B;">${fr ? showerLabelFr : showerLabel}</div>
        <div style="font-size: 14px; color: #A09080; margin-top: 4px;">${settings.parentsNames || ''}</div>
      </div>
      <div style="background: white; border-radius: 16px; padding: 24px; border: 1px solid #E8E0D4;">
        <p style="font-size: 16px; margin: 0 0 16px;">${fr ? `Bonjour ${guest.name},` : `Dear ${guest.name},`}</p>
        <p style="font-size: 14px; line-height: 1.6; color: #5D5449;">${fr
          ? `Vous êtes chaleureusement invités à célébrer l'arrivée de notre petit ange ! Rejoignez-nous pour une après-midi de jeux, gourmandises et souvenirs.`
          : 'You are warmly invited to celebrate the upcoming arrival of our little angel! Join us for an afternoon of games, treats, and memories.'}</p>
        <table style="width: 100%; margin: 16px 0; font-size: 13px;">
          <tr><td style="padding: 4px 0; color: #8B735B; width: 70px;">Date</td><td style="padding: 4px 0;"><strong>${date}</strong></td></tr>
          <tr><td style="padding: 4px 0; color: #8B735B;">${fr ? 'Heure' : 'Time'}</td><td style="padding: 4px 0;"><strong>${time}</strong></td></tr>
          <tr><td style="padding: 4px 0; color: #8B735B; vertical-align: top;">${fr ? 'Lieu' : 'Venue'}</td><td style="padding: 4px 0;"><strong>${venue}</strong><br/><span style="color: #A09080;">${venueAddress}</span></td></tr>
        </table>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${link}" style="display: inline-block; padding: 12px 32px; background: #8B735B; color: white; text-decoration: none; border-radius: 40px; font-size: 15px; font-weight: bold;">${fr ? 'Répondre' : 'RSVP Now'}</a>
        </div>
        <p style="font-size: 12px; color: #A09080; text-align: center;">${fr ? 'Votre code de réservation :' : 'Your reservation code:'} <strong style="color: #4A3F35;">${guest.code}</strong></p>
        <p style="font-size: 12px; color: #A09080; text-align: center;">${fr ? "Impossible de cliquer ? Copiez ce lien dans votre navigateur :" : "Can't click the button? Copy this link into your browser:"}<br/><span style="color: #8B735B;">${link}</span></p>
      </div>
      <div style="text-align: center; margin-top: 16px; font-size: 11px; color: #A09080;">
        ${fr ? `Envoyé avec amour pour ${showerLabelFr}` : `Sent with love for ${showerLabel}`}
      </div>
    </div>`;
  return { subject, html };
}

export async function sendInvitationEmail(guest: Guest, settings: EventSettings): Promise<boolean> {
  const client = getClient();
  if (!client) {
    console.log(`[MOCK EMAIL] To: ${guest.email} | Subject: Invitation to ${settings.babyName ? `${settings.babyName}'s` : 'the'} Baby Shower | Link: /rsvp/${guest.magic_token}`);
    return true;
  }
  const { subject, html } = buildGuestEmail(guest, settings);
  try {
    await client.emails.send({
      from: process.env.EMAIL_FROM || 'Baby Shower <onboarding@resend.dev>',
      to: guest.email,
      subject,
      html,
    });
    console.log(`[RESEND] Invitation sent to ${guest.email}`);
    return true;
  } catch (err) {
    console.error(`[RESEND] Failed to send to ${guest.email}:`, err);
    return false;
  }
}

export async function sendReminderEmail(guest: Guest, settings: EventSettings): Promise<boolean> {
  const fr = !isEN(guest);
  const date = settings.date || '';
  const link = `${process.env.APP_URL || 'http://localhost:3025'}/rsvp/${guest.magic_token}`;
  const host = settings.parentsNames || settings.babyName || '';
  const showerLabel = host ? `${host}'s Baby Shower` : 'the Baby Shower';
  const showerLabelFr = host ? `le baby shower de ${host}` : 'le baby shower';
  const subject = fr
    ? `⏰ Rappel : RSVP pour ${showerLabelFr} (${date})`
    : `⏰ Reminder: RSVP for ${showerLabel} (${date})`;

  const html = `
    <div style="font-family: Georgia, serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background: #FDFBF7; color: #4A3F35;">
      <div style="text-align: center; margin-bottom: 20px;">
        <div style="font-size: 22px; font-weight: bold; color: #8B735B;">${fr ? 'Petit rappel' : 'Friendly Reminder'}</div>
      </div>
      <div style="background: white; border-radius: 16px; padding: 24px; border: 1px solid #E8E0D4;">
        <p style="font-size: 15px; margin: 0 0 12px;">${fr ? `Bonjour ${guest.name},` : `Hi ${guest.name},`}</p>
        <p style="font-size: 13px; line-height: 1.5; color: #5D5449;">${fr
          ? `Nous n'avons pas encore de nouvelles de vous ! Merci de nous confirmer votre présence au <strong>${showerLabelFr}</strong> le <strong>${date}</strong>.`
          : `We haven't heard from you yet! Please let us know if you can make it to <strong>${showerLabel}</strong> on <strong>${date}</strong>.`}</p>
        <div style="text-align: center; margin: 20px 0;">
          <a href="${link}" style="display: inline-block; padding: 11px 28px; background: #8B735B; color: white; text-decoration: none; border-radius: 40px; font-size: 14px; font-weight: bold;">${fr ? 'Répondre' : 'RSVP Now'}</a>
        </div>
        <p style="font-size: 11px; color: #A09080; text-align: center;">${fr ? 'Code :' : 'Code:'} <strong>${guest.code}</strong></p>
      </div>
    </div>`;

  const client = getClient();
  if (!client) {
    console.log(`[MOCK REMINDER] To: ${guest.email} | Subject: ${subject}`);
    return true;
  }
  try {
    await client.emails.send({
      from: process.env.EMAIL_FROM || 'Baby Shower <onboarding@resend.dev>',
      to: guest.email,
      subject,
      html,
    });
    return true;
  } catch (err) {
    console.error(`[RESEND] Reminder failed for ${guest.email}:`, err);
    return false;
  }
}

export async function sendAlertEmail(guest: Guest, settings: EventSettings, title: string, message: string): Promise<boolean> {
  const fr = !isEN(guest);
  const link = `${process.env.APP_URL || 'http://localhost:3025'}/rsvp/${guest.magic_token}`;
  const subject = `📢 ${title}`;
  const html = `
    <div style="font-family: Georgia, serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background: #FDFBF7; color: #4A3F35;">
      <div style="text-align: center; margin-bottom: 20px;">
        <div style="font-size: 20px; font-weight: bold; color: #8B735B;">${title}</div>
      </div>
      <div style="background: white; border-radius: 16px; padding: 24px; border: 1px solid #E8E0D4;">
        <p style="font-size: 15px; margin: 0 0 12px;">${fr ? `Bonjour ${guest.name},` : `Hi ${guest.name},`}</p>
        <p style="font-size: 13px; line-height: 1.6; color: #5D5449;">${message}</p>
        <div style="text-align: center; margin: 20px 0;">
          <a href="${link}" style="display: inline-block; padding: 11px 28px; background: #8B735B; color: white; text-decoration: none; border-radius: 40px; font-size: 14px; font-weight: bold;">${fr ? 'Voir le RSVP' : 'View RSVP'}</a>
        </div>
        <p style="font-size: 11px; color: #A09080; text-align: center;">${fr ? 'Code :' : 'Code:'} <strong>${guest.code}</strong></p>
      </div>
    </div>`;

  const client = getClient();
  if (!client) {
    console.log(`[MOCK ALERT EMAIL] To: ${guest.email} | Subject: ${subject}`);
    return true;
  }
  try {
    await client.emails.send({
      from: process.env.EMAIL_FROM || 'Baby Shower <onboarding@resend.dev>',
      to: guest.email,
      subject,
      html,
    });
    console.log(`[RESEND] Alert sent to ${guest.email}`);
    return true;
  } catch (err) {
    console.error(`[RESEND] Alert failed for ${guest.email}:`, err);
    return false;
  }
}

// Free-form thank-you note (used by the gift tracker; delivered as plain HTML paragraphs)
export async function sendThankYouEmail(guest: Guest, text: string): Promise<boolean> {
  const client = getClient();
  if (!client) {
    console.log(`[MOCK THANKYOU EMAIL] To: ${guest.email} | Body: ${text.slice(0, 100)}...`);
    return true;
  }
  try {
    const html = text
      .split('\n')
      .filter((p) => p.trim())
      .map((p) => `<p style="font-size:14px; line-height:1.6; color:#4A3F35; margin:0 0 12px;">${p}</p>`)
      .join('');
    await client.emails.send({
      from: process.env.EMAIL_FROM || 'Baby Shower <onboarding@resend.dev>',
      to: guest.email,
      subject: 'Thank You!',
      html: `<div style="font-family: Georgia, serif; max-width: 560px; margin: 0 auto; padding: 32px 24px; background: #FDFBF7; color: #4A3F35;">${html}</div>`,
    });
    console.log(`[RESEND] Thank-you sent to ${guest.email}`);
    return true;
  } catch (err) {
    console.error(`[RESEND] Thank-you failed for ${guest.email}:`, err);
    return false;
  }
}
