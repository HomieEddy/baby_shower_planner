// Bulk invitation/reminder delivery over each guest's configured channel.

import type { Guest, EventSettings } from '../types';
import { pb } from './client';
import { getAllGuests } from './guests';

async function deliverToGuest(
  g: Guest,
  settings: EventSettings,
  type: 'invitation' | 'reminder'
): Promise<boolean> {
  const channel = g.delivery_channel || 'none';
  // Link-only guests were shared manually (host or inviter) — nothing to send.
  if (channel === 'none') return true;
  let ok = true;

  if ((channel === 'email' || channel === 'both') && g.email) {
    const fn = type === 'invitation' ? 'sendInvitationEmail' : 'sendReminderEmail';
    const { [fn]: sendEmail } = await import('../lib/email');
    ok = await sendEmail(g, settings) && ok;
  }
  if ((channel === 'text' || channel === 'both') && g.phone) {
    const fn = type === 'invitation' ? 'sendInvitationSms' : 'sendReminderSms';
    const { [fn]: sendSms } = await import('../lib/sms');
    ok = await sendSms(g, settings) && ok;
  }
  return ok;
}

export async function sendInvitations(guestIds?: string[]): Promise<{ sent: number; failed: number }> {
  const all = await getAllGuests();
  const guests = guestIds && guestIds.length > 0 ? all.filter(g => guestIds.includes(g.id)) : all;
  const records = await pb.collection('settings').getFullList();
  const settings = records[0] || {};
  let sent = 0, failed = 0;
  for (const g of guests) {
    if (await deliverToGuest(g, settings as any, 'invitation')) sent++; else failed++;
  }
  return { sent, failed };
}

export async function sendReminders(): Promise<{ sent: number; failed: number }> {
  const guests = (await getAllGuests()).filter(g => g.rsvp_status === 'Pending');
  const records = await pb.collection('settings').getFullList();
  const settings = records[0] || {};
  let sent = 0, failed = 0;
  for (const g of guests) {
    if (await deliverToGuest(g, settings as any, 'reminder')) sent++; else failed++;
  }
  return { sent, failed };
}