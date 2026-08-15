import { createRequire } from 'node:module';
import { Guest, EventSettings, AgendaTask } from '../types';
import { formatTaskDue } from './dateUtils';

const require = createRequire(import.meta.url);

let twilioClient: any = null;

function getClient() {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return null;
  if (!twilioClient) {
    // Dynamic import so twilio isn't loaded unless configured
    const twilio = require('twilio');
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
  return twilioClient;
}

function buildGuestSms(guest: Guest, settings: EventSettings, type: 'invitation' | 'reminder'): string {
  const babyName = settings.babyName || '';
  const date = settings.date || '';
  const time = settings.time || '';
  const venue = settings.venueName || '';
  const link = `${process.env.APP_URL || 'http://localhost:3025'}/rsvp/${guest.magic_token}`;
  const showerLabel = babyName ? `${babyName}'s Baby Shower` : 'the Baby Shower';

  if (type === 'reminder') {
    return [
      `Reminder: ${showerLabel} is ${date}!`,
      `${venue}`,
      `RSVP: ${link}`,
      `Code: ${guest.code}`,
    ].join('\n');
  }

  return [
    `You're invited to ${showerLabel}!`,
    `${date} ${time}`,
    `${venue}`,
    `RSVP: ${link}`,
    `Code: ${guest.code}`,
  ].join('\n');
}

export async function sendInvitationSms(guest: Guest, settings: EventSettings): Promise<boolean> {
  const client = getClient();
  const body = buildGuestSms(guest, settings, 'invitation');

  if (!client || !process.env.TWILIO_PHONE_NUMBER) {
    console.log(`[MOCK SMS] To: ${guest.phone} | Body: ${body}`);
    return true;
  }

  try {
    await client.messages.create({
      body,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: guest.phone,
    });
    console.log(`[TWILIO] SMS sent to ${guest.phone}`);
    return true;
  } catch (err) {
    console.error(`[TWILIO] Failed to send to ${guest.phone}:`, err);
    return false;
  }
}

export async function sendReminderSms(guest: Guest, settings: EventSettings): Promise<boolean> {
  const client = getClient();
  const body = buildGuestSms(guest, settings, 'reminder');

  if (!client || !process.env.TWILIO_PHONE_NUMBER) {
    console.log(`[MOCK SMS REMINDER] To: ${guest.phone} | Body: ${body}`);
    return true;
  }

  try {
    await client.messages.create({ body, from: process.env.TWILIO_PHONE_NUMBER, to: guest.phone });
    return true;
  } catch (err) {
    console.error(`[TWILIO] Reminder failed for ${guest.phone}:`, err);
    return false;
  }
}

export async function sendThankYouSms(guest: Guest, text: string): Promise<boolean> {
  const client = getClient();
  if (!client || !process.env.TWILIO_PHONE_NUMBER) {
    console.log(`[MOCK THANKYOU SMS] To: ${guest.phone} | Body: ${text.slice(0, 100)}...`);
    return true;
  }
  try {
    await client.messages.create({
      // 640 chars = 4 GSM-7 segments (max 160/segment). Long enough for a
      // warm note, without inflating per-segment Twilio charges.
      body: text.slice(0, 640),
      from: process.env.TWILIO_PHONE_NUMBER,
      to: guest.phone,
    });
    console.log(`[TWILIO] Thank-you SMS sent to ${guest.phone}`);
    return true;
  } catch (err) {
    console.error(`[TWILIO] Thank-you SMS failed for ${guest.phone}:`, err);
    return false;
  }
}

// Agenda reminder for the host (single-language, per settings.language).
export async function sendAgendaReminderSms(to: string, task: AgendaTask, settings: EventSettings): Promise<boolean> {
  const client = getClient();
  const fr = settings.language === 'FR';
  const when = formatTaskDue(task.due_date || '', task.due_time, settings.language || 'EN');
  const lines = [
    fr ? `Rappel: ${task.title}` : `Reminder: ${task.title}`,
    ...(when ? [when] : []),
    ...(task.description ? [task.description] : []),
  ];
  const body = lines.join('\n');

  if (!client || !process.env.TWILIO_PHONE_NUMBER) {
    console.log(`[MOCK AGENDA SMS] To: ${to} | Body: ${body}`);
    return true;
  }
  try {
    await client.messages.create({
      body: body.slice(0, 640),
      from: process.env.TWILIO_PHONE_NUMBER,
      to,
    });
    console.log(`[TWILIO] Agenda reminder SMS sent to ${to}`);
    return true;
  } catch (err) {
    console.error(`[TWILIO] Agenda reminder SMS failed for ${to}:`, err);
    return false;
  }
}
