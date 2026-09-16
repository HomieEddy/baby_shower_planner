// Event alerts: read, create (with fan-out to recipients), delete.

import type { EventAlert, AlertType } from '../types';
import { fromRecord, pb } from './client';
import { getAllGuests } from './guests';
import { getSettingsOrDefaults } from './settings';
import { composeAlert } from '../lib/compose';
import { isAttending } from '../lib/guestAttendees';
import { notifyGuest } from './notify';
import { requireProvider } from './providers';

export async function getAlerts(): Promise<EventAlert[]> {
  const records = await pb.collection('alerts').getFullList({ sort: '-created_at' });
  return records.map(r => fromRecord<EventAlert>(r));
}

// What a guest page renders of an alert. Explicitly picked, not spread-and-drop,
// so a field added to AlertSchema cannot leak to guests by default. The delivery
// counter is host-internal.
type GuestAlert = Omit<EventAlert, 'notified_guests_count'>;

export function projectAlertForGuest(alert: EventAlert): GuestAlert {
  return {
    id: alert.id,
    type: alert.type,
    title: alert.title,
    message: alert.message,
    active: alert.active,
    target_audience: alert.target_audience,
    created_at: alert.created_at,
  };
}

export async function createAlert(payload: { type: AlertType; title: string; message: string; target_audience?: 'ALL' | 'PENDING' | 'ATTENDING' }): Promise<{ alert: EventAlert; notified_count: number }> {
  requireProvider(['email', 'text']);
  const r = await pb.collection('alerts').create({
    type: payload.type, title: payload.title, message: payload.message,
    active: true, target_audience: payload.target_audience || 'ALL',
    notified_guests_count: 0, created_at: new Date().toISOString(),
  });
  const guests = await getAllGuests();
  const target = payload.target_audience || 'ALL';
  const recipientGuests = guests.filter(g => {
    // Cancellations must reach everyone — declined guests might still show up.
    if (payload.type === 'CANCELLATION') return true;
    if (g.rsvp_status === 'Declined') return false;
    if (target === 'PENDING') return g.rsvp_status === 'Pending';
    if (target === 'ATTENDING') return isAttending(g);
    return true;
  });
  const settings = await getSettingsOrDefaults();
  let notified = 0;
  for (const g of recipientGuests) {
    // Link-only guests resolve to no channels inside notifyGuest.
    const { sent } = await notifyGuest(g, composeAlert(g, settings, payload.title, payload.message, g.language_pref));
    if (sent.length > 0) notified++;
  }
  await pb.collection('alerts').update(r.id, { notified_guests_count: notified });
  return { alert: fromRecord<EventAlert>({ ...r, notified_guests_count: notified }), notified_count: notified };
}

export async function deleteAlert(id: string): Promise<EventAlert[]> {
  await pb.collection('alerts').delete(id);
  return getAlerts();
}
