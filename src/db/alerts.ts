// Event alerts: read, create (with fan-out to recipients), delete, and a
// one-off test send to a single address or number.

import type { EventAlert, AlertType, Language } from '../types';
import { fromRecord, pb } from './client';
import { getAllGuests } from './guests';
import { getSettingsOrDefaults } from './settings';
import { composeAlert, composeDayOf, DAY_OF_CODE_TOKEN, type MessageContent } from '../lib/compose';
import { notifyChannels } from './notify';
import { requireProvider } from './providers';
import { alertRecipients, channelsFor, type AlertAudience, type AlertChannel } from '../lib/alertRecipients';

export async function getAlerts(): Promise<EventAlert[]> {
  const records = await pb.collection('alerts').getFullList({ sort: '-created_at' });
  return records.map(r => fromRecord<EventAlert>(r));
}

export interface CreateAlertPayload {
  type: AlertType;
  title: string;
  message: string;
  target_audience?: AlertAudience;
  channel?: AlertChannel;
  guest_ids?: string[];
}

export async function createAlert(payload: CreateAlertPayload): Promise<{ alert: EventAlert; notified_count: number }> {
  const channel: AlertChannel = payload.channel ?? 'both';
  const audience: AlertAudience = payload.target_audience ?? 'ALL';
  requireProvider(channelsFor(channel));
  const r = await pb.collection('alerts').create({
    type: payload.type, title: payload.title, message: payload.message,
    active: true, target_audience: audience, channel,
    notified_guests_count: 0, created_at: new Date().toISOString(),
  });
  const guests = await getAllGuests();
  const recipients = alertRecipients(guests, payload.type, audience, payload.guest_ids ?? [], channel);
  const settings = await getSettingsOrDefaults();
  const channels = channelsFor(channel);
  let notified = 0;
  for (const g of recipients) {
    // Day-of reminders carry the code and entrance instructions, no RSVP link.
    const content = payload.type === 'DAY_OF'
      ? composeDayOf(g, payload.title, payload.message, g.language_pref)
      : composeAlert(g, settings, payload.title, payload.message, g.language_pref);
    const { sent } = await notifyChannels(g, content, channels);
    if (sent.length > 0) notified++;
  }
  await pb.collection('alerts').update(r.id, { notified_guests_count: notified });
  return { alert: fromRecord<EventAlert>({ ...r, notified_guests_count: notified }), notified_count: notified };
}

export interface TestAlertPayload {
  channel: 'email' | 'text';
  to: string;
  title: string;
  message: string;
  language?: Language;
}

// Sends one draft to a single address or number so the host can check the
// wording and delivery. No RSVP link: there is no real guest behind it.
export async function sendTestAlert(payload: TestAlertPayload): Promise<boolean> {
  requireProvider([payload.channel]);
  const language = payload.language ?? 'FR';
  const content: MessageContent = {
    kind: 'alert',
    language,
    subject: `[TEST] 📢 ${payload.title}`,
    heading: payload.title,
    rows: [],
    paragraphs: [payload.message.split(DAY_OF_CODE_TOKEN).join('XXXX')],
  };
  if (payload.channel === 'email') {
    const { sendEmail } = await import('../lib/email');
    return sendEmail(payload.to, content);
  }
  const { sendSms } = await import('../lib/sms');
  return sendSms(payload.to, { ...content, subject: `[TEST] ${payload.title}` });
}

export async function deleteAlert(id: string): Promise<EventAlert[]> {
  await pb.collection('alerts').delete(id);
  return getAlerts();
}
