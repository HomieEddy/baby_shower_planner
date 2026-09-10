// SMS adapter: renders a composed message to concise lines and sends via
// Twilio. Content lives in lib/compose; this owns transport and the mock.

import { createRequire } from 'node:module';
import { Guest } from '../types';
import { MessageContent, renderSms } from './compose';

const require = createRequire(import.meta.url);

let twilioClient: any = null;

function getClient() {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) return null;
  if (!twilioClient) {
    // Dynamic import so twilio isn't loaded unless configured.
    const twilio = require('twilio');
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
  return twilioClient;
}

export async function sendSms(to: string | undefined, content: MessageContent): Promise<boolean> {
  if (!to) return false;
  const body = renderSms(content);
  const client = getClient();
  if (!client || !process.env.TWILIO_PHONE_NUMBER) {
    console.log(`[MOCK SMS] To: ${to} | Body: ${body}`);
    return true;
  }
  try {
    // 640 chars = 4 GSM-7 segments (max 160/segment); keeps per-segment cost down.
    await client.messages.create({ body: body.slice(0, 640), from: process.env.TWILIO_PHONE_NUMBER, to });
    console.log(`[TWILIO] SMS sent to ${to}`);
    return true;
  } catch (err) {
    console.error(`[TWILIO] Failed to send to ${to}:`, err);
    return false;
  }
}

export const sendGuestSms = (guest: Guest, content: MessageContent): Promise<boolean> =>
  sendSms(guest.phone, content);
