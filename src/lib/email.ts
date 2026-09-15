// Email adapter: renders a composed message and sends it via Resend. All the
// content lives in lib/compose; this only owns the transport and the mock.

import { Resend } from 'resend';
import { Guest } from '../types';
import { MessageContent, renderEmailHtml } from './compose';

let resend: Resend | null = null;

const isConfigured = () => !!process.env.RESEND_API_KEY;

function getClient(): Resend | null {
  if (!isConfigured()) return null;
  if (!resend) resend = new Resend(process.env.RESEND_API_KEY);
  return resend;
}

const FROM = () => process.env.EMAIL_FROM || 'Baby Shower <onboarding@resend.dev>';

export async function sendEmail(to: string | undefined, content: MessageContent): Promise<boolean> {
  if (!to) return false;
  const client = getClient();
  if (!client) {
    console.warn(`[EMAIL] RESEND_API_KEY not set — skipping send to ${to}`);
    return false;
  }
  try {
    await client.emails.send({ from: FROM(), to, subject: content.subject, html: renderEmailHtml(content) });
    console.log(`[RESEND] Sent "${content.subject}" to ${to}`);
    return true;
  } catch (err) {
    console.error(`[RESEND] Failed to send to ${to}:`, err);
    return false;
  }
}

export const sendGuestEmail = (guest: Guest, content: MessageContent): Promise<boolean> =>
  sendEmail(guest.email, content);
