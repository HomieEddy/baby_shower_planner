// Who an event alert reaches. One rule set for the admin preview and the
// server fan-out, so the count the host sees is the count that gets sent.

import type { Guest } from '../types';
import { isAttending } from './guestAttendees';

export type AlertAudience = 'ALL' | 'PENDING' | 'ATTENDING' | 'SELECTED';
export type AlertChannel = 'email' | 'text' | 'both';

export const channelsFor = (channel: AlertChannel): Array<'email' | 'text'> =>
  channel === 'both' ? ['email', 'text'] : [channel];

// A guest is reachable on a channel only when they have that contact detail.
export const hasContactFor = (guest: Pick<Guest, 'email' | 'phone'>, channel: AlertChannel): boolean =>
  (channel !== 'text' && !!guest.email) || (channel !== 'email' && !!guest.phone);

// Guests the audience selects, before the channel's contact check.
// CANCELLATION reaches everyone (declined guests may still show up), unless the
// host picked specific guests, which always wins.
export function alertCandidates(
  guests: Guest[],
  type: string,
  audience: AlertAudience,
  selectedIds: readonly string[]
): Guest[] {
  if (audience === 'SELECTED') {
    const picked = new Set(selectedIds);
    return guests.filter((g) => picked.has(g.id));
  }
  return guests.filter((g) => {
    if (type === 'CANCELLATION') return true;
    if (g.rsvp_status === 'Declined') return false;
    if (audience === 'PENDING') return g.rsvp_status === 'Pending';
    if (audience === 'ATTENDING') return isAttending(g);
    return true;
  });
}

// Final recipients: the candidates that have a contact for the channel.
export function alertRecipients(
  guests: Guest[],
  type: string,
  audience: AlertAudience,
  selectedIds: readonly string[],
  channel: AlertChannel
): Guest[] {
  return alertCandidates(guests, type, audience, selectedIds).filter((g) => hasContactFor(g, channel));
}
