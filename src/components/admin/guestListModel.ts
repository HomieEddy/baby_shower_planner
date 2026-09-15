// Pure guest-list derivation: filtering + metric counts. Extracted from
// AdminGuestsTab so the controller's behaviour is testable without the DOM.

import type { Guest } from '../../types';
import { getGuestPartySize } from '../../lib/tableAssignment';
import { isAttending } from '../../lib/guestAttendees';

export type StatusFilter = 'All' | 'Attending' | 'Pending' | 'Declined';
export type SourceFilter = 'All' | 'Host' | 'Guest-invited';
export type MetricMode = 'invites' | 'party';

export interface GuestFilters {
  searchTerm: string;
  statusFilter: StatusFilter;
  sourceFilter: SourceFilter;
}

export function filterGuests(guests: Guest[], f: GuestFilters): Guest[] {
  const term = f.searchTerm.toLowerCase();
  return guests.filter((g) => {
    const matchesSearch =
      g.name.toLowerCase().includes(term) || g.email.toLowerCase().includes(term);
    const matchesStatus = f.statusFilter === 'All' || g.rsvp_status === f.statusFilter;
    const matchesSource =
      f.sourceFilter === 'All' ||
      (f.sourceFilter === 'Guest-invited' ? !!g.invited_by_guest_id : !g.invited_by_guest_id);
    return matchesSearch && matchesStatus && matchesSource;
  });
}

export interface GuestMetrics {
  attendingGuests: Guest[];
  pendingGuests: Guest[];
  declinedGuests: Guest[];
  pendingApprovals: Guest[];
  totalPartySize: number;
  totalAttendingPartySize: number;
  pendingPartySize: number;
  declinedPartySize: number;
}

const partySum = (guests: Guest[]) => guests.reduce((acc, g) => acc + getGuestPartySize(g), 0);

export function computeGuestMetrics(guests: Guest[]): GuestMetrics {
  const primary = guests.filter((g) => !g.is_read_only);
  // Self-registrations only count once approved.
  const approved = primary.filter((g) => (g.approval_status || 'approved') === 'approved');
  const attendingGuests = approved.filter(isAttending);
  const pendingGuests = approved.filter((g) => g.rsvp_status === 'Pending');
  const declinedGuests = approved.filter((g) => g.rsvp_status === 'Declined');
  return {
    attendingGuests,
    pendingGuests,
    declinedGuests,
    pendingApprovals: primary.filter((g) => g.approval_status === 'pending'),
    totalAttendingPartySize: partySum(attendingGuests),
    pendingPartySize: partySum(pendingGuests),
    declinedPartySize: partySum(declinedGuests),
    totalPartySize: partySum(guests),
  };
}
