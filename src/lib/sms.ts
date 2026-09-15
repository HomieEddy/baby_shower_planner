// SMS adapter: renders a composed message to concise lines and sends via
// Twilio. Content lives in lib/compose; this owns transport and the config guard.

import { Guest } from '../types';
import { MessageContent, renderSms } from './compose';

let twilioClient: any = null;

// All three vars are required for a real send.
const isConfigured = () => !!(
  process.env.TWILIO_ACCOUNT_SID &&
  process.env.TWILIO_AUTH_TOKEN &&
  process.env.TWILIO_PHONE_NUMBER
);

async function getClient() {
  if (!isConfigured()) return null;
  if (!twilioClient) {
    // Dynamic import so twilio isn't loaded unless configured. Kept as `import()`
    // (not createRequire(import.meta.url)) because import.meta is empty in the
    // CJS production bundle, which made require throw on first SMS send.
    const mod: any = await import('twilio');
    const twilio = mod.default ?? mod;
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
  return twilioClient;
}

export async function sendSms(to: string | undefined, content: MessageContent): Promise<boolean> {
  if (!to) return false;
  if (!isConfigured()) {
    console.warn(`[SMS] Twilio not configured — skipping send to ${to}`);
    return false;
  }
  const body = renderSms(content);
  const client = await getClient();
  if (!client) return false;
  try {
    // 640 chars = 4 GSM-7 segments (max 160/segment); keeps per-segment cost down.
    await client.messages.create({ body: body.slice(0, 640), from: process.env.TWILIO_PHONE_NUMBER as string, to });
    console.log(`[TWILIO] SMS sent to ${to}`);
    return true;
  } catch (err) {
    console.error(`[TWILIO] Failed to send to ${to}:`, err);
    return false;
  }
}

export const sendGuestSms = (guest: Guest, content: MessageContent): Promise<boolean> =>
  sendSms(guest.phone, content);
