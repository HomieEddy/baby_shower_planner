// SMS adapter: renders a composed message to concise lines and sends via
// Twilio. Content lives in lib/compose; this owns transport, phone format and
// the config guard.

import { Guest } from '../types';
import { MessageContent } from './compose';
import { smsParts, smsText } from './smsParts';

let twilioClient: any = null;

// Every SMS is folded to GSM-7 (a single ê or emoji would switch the whole
// text to UCS-2 and more than double its cost) and split into standalone
// texts of up to 160 characters, sent in order. Nothing is cut off.
export { isGsm7 } from './gsm7';
export { smsParts };
export const smsBody = smsText;

// Twilio needs E.164 (+15145551234). Guests type numbers freely, so we accept
// the common forms and assume North American (+1) for 10-digit numbers.
// Returns null when the input can't be a valid phone number.
export function toE164(raw: string | undefined | null, defaultCountryCode = '1'): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  let digits: string;
  if (trimmed.startsWith('+')) {
    digits = trimmed.slice(1).replace(/\D/g, '');
  } else if (trimmed.startsWith('00')) {
    digits = trimmed.slice(2).replace(/\D/g, '');
  } else {
    const national = trimmed.replace(/\D/g, '');
    digits = national.length === 10 ? defaultCountryCode + national : national;
  }
  return /^\d{8,15}$/.test(digits) ? `+${digits}` : null;
}

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

// Twilio error codes we translate into a plain log line for the host.
const TWILIO_HINTS: Record<number, string> = {
  21610: 'recipient replied STOP (opted out); they must text START to re-subscribe',
  21608: 'trial account: recipient number is not verified in the Twilio console',
  21211: 'invalid "to" number',
  21614: '"to" number is not a mobile number that can receive SMS',
};

export async function sendSms(to: string | undefined, content: MessageContent): Promise<boolean> {
  if (!to) return false;
  if (!isConfigured()) {
    console.warn(`[SMS] Twilio not configured — skipping send to ${to}`);
    return false;
  }
  const recipient = toE164(to);
  if (!recipient) {
    console.error(`[TWILIO] Not a valid phone number, skipped: "${to}"`);
    return false;
  }
  const client = await getClient();
  if (!client) return false;
  const parts = smsParts(content);
  // Sent one after another so the texts arrive in reading order. A failure
  // stops the rest, so a guest never gets a later part without the first.
  for (const [i, body] of parts.entries()) {
    try {
      await client.messages.create({
        body,
        from: process.env.TWILIO_PHONE_NUMBER as string,
        to: recipient,
      });
    } catch (err: any) {
      const hint = TWILIO_HINTS[err?.code];
      console.error(`[TWILIO] Failed to send part ${i + 1}/${parts.length} to ${recipient}${hint ? ` (${hint})` : ''}:`, err);
      return false;
    }
  }
  console.log(`[TWILIO] SMS sent to ${recipient} (${parts.length} text${parts.length === 1 ? '' : 's'})`);
  return parts.length > 0;
}

export const sendGuestSms = (guest: Guest, content: MessageContent): Promise<boolean> =>
  sendSms(guest.phone, content);
