// Guest notification dispatch: resolve the guest's channel and send a composed
// message through the adapters. One place for the channel branching that used
// to live in four modules.

import type { Guest, EventSettings } from '../types';
import type { MessageContent } from '../lib/compose';
import { composeInvitation, composeReminder } from '../lib/compose';
import { getSettings } from './settings';
import { requireProvider } from './providers';

export type Channel = 'email' | 'text';

export interface NotifyDeps {
  email: (guest: Guest, content: MessageContent) => Promise<boolean>;
  sms: (guest: Guest, content: MessageContent) => Promise<boolean>;
}

// Real adapters are loaded lazily so the transport libs stay server-only.
const defaultDeps: NotifyDeps = {
  email: async (guest, content) => (await import('../lib/email')).sendGuestEmail(guest, content),
  sms: async (guest, content) => (await import('../lib/sms')).sendGuestSms(guest, content),
};

export interface NotifyResult {
  sent: Channel[];
  failed: Channel[];
}

// Send on an explicit set of channels (used where the caller, not the guest's
// delivery_channel, decides — e.g. the gift tracker or a table-share email).
export async function notifyChannels(
  guest: Guest,
  content: MessageContent,
  channels: Channel[],
  deps: NotifyDeps = defaultDeps
): Promise<NotifyResult> {
  const sent: Channel[] = [];
  const failed: Channel[] = [];
  if (channels.includes('email') && guest.email) {
    if (await deps.email(guest, content)) sent.push('email'); else failed.push('email');
  }
  if (channels.includes('text') && guest.phone) {
    if (await deps.sms(guest, content)) sent.push('text'); else failed.push('text');
  }
  return { sent, failed };
}

// Send on the guest's configured delivery channel. `none` = link-only guest
// (shared manually) — nothing to send.
export async function notifyGuest(
  guest: Guest,
  content: MessageContent,
  deps: NotifyDeps = defaultDeps
): Promise<NotifyResult> {
  const channel = guest.delivery_channel || 'none';
  if (channel === 'none') return { sent: [], failed: [] };
  const channels: Channel[] = [];
  if (channel === 'email' || channel === 'both') channels.push('email');
  if (channel === 'text' || channel === 'both') channels.push('text');
  return notifyChannels(guest, content, channels, deps);
}

async function loadSettings(): Promise<Partial<EventSettings>> {
  try {
    return await getSettings();
  } catch {
    return {};
  }
}

// A guest counts as notified unless a channel it tried actually failed.
const failedDelivery = (r: NotifyResult) => r.failed.length > 0;

export async function sendInvitations(guestIds?: string[]): Promise<{ sent: number; failed: number }> {
  requireProvider(['email', 'text']);
  const { getAllGuests } = await import('./guests');
  const all = await getAllGuests();
  const guests = guestIds && guestIds.length > 0 ? all.filter((g) => guestIds.includes(g.id)) : all;
  const settings = await loadSettings();
  let sent = 0, failed = 0;
  for (const g of guests) {
    const result = await notifyGuest(g, composeInvitation(g, settings, g.language_pref));
    if (failedDelivery(result)) failed++; else sent++;
  }
  return { sent, failed };
}

export async function sendReminders(): Promise<{ sent: number; failed: number }> {
  requireProvider(['email', 'text']);
  const { getAllGuests } = await import('./guests');
  const guests = (await getAllGuests()).filter((g) => g.rsvp_status === 'Pending');
  const settings = await loadSettings();
  let sent = 0, failed = 0;
  for (const g of guests) {
    const result = await notifyGuest(g, composeReminder(g, settings, g.language_pref));
    if (failedDelivery(result)) failed++; else sent++;
  }
  return { sent, failed };
}
