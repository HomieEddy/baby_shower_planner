import { describe, it, expect } from 'vitest';
import type { Guest } from '../../types';
import { computeGuestMetrics, filterGuests } from './guestListModel';

const guest = (over: Partial<Guest> = {}): Guest => ({
  id: 'g1',
  name: 'Alice',
  email: 'alice@example.com',
  code: '1111',
  max_party_size: 2,
  rsvp_status: 'Attending',
  attending_party_size: 1,
  attendee_names: ['Alice'],
  dietary_restrictions: '',
  language_pref: 'EN',
  magic_token: '',
  token_used: false,
  created_at: '',
  ...over,
});

describe('filterGuests', () => {
  const guests = [
    guest({ id: 'a', name: 'Alice', email: 'alice@x.com', rsvp_status: 'Attending' }),
    guest({ id: 'b', name: 'Bob', email: 'bob@x.com', rsvp_status: 'Pending', invited_by_guest_id: 'a' }),
    guest({ id: 'c', name: 'Cara', email: 'cara@x.com', rsvp_status: 'Declined' }),
  ];

  it('matches name/email case-insensitively and applies status + source', () => {
    expect(filterGuests(guests, { searchTerm: 'ali', statusFilter: 'All', sourceFilter: 'All' }).map((g) => g.id)).toEqual(['a']);
    expect(filterGuests(guests, { searchTerm: '', statusFilter: 'Pending', sourceFilter: 'All' }).map((g) => g.id)).toEqual(['b']);
    expect(filterGuests(guests, { searchTerm: '', statusFilter: 'All', sourceFilter: 'Guest-invited' }).map((g) => g.id)).toEqual(['b']);
    expect(filterGuests(guests, { searchTerm: '', statusFilter: 'All', sourceFilter: 'Host' }).map((g) => g.id)).toEqual(['a', 'c']);
  });
});

describe('computeGuestMetrics', () => {
  it('counts approved non-read-only guests by status and sums party sizes', () => {
    const guests = [
      guest({ id: 'a', rsvp_status: 'Attending', attending_party_size: 2, attendee_names: ['Alice', 'Bob'] }),
      guest({ id: 'b', rsvp_status: 'Pending', approval_status: 'pending' }),
      guest({ id: 'c', rsvp_status: 'Declined' }),
      guest({ id: 'ro', is_read_only: true }),
    ];
    const m = computeGuestMetrics(guests);
    expect(m.attendingGuests.map((g) => g.id)).toEqual(['a']);
    expect(m.pendingGuests).toEqual([]);
    expect(m.declinedGuests.map((g) => g.id)).toEqual(['c']);
    expect(m.pendingApprovals.map((g) => g.id)).toEqual(['b']);
    expect(m.totalAttendingPartySize).toBe(2);
    expect(m.declinedPartySize).toBe(2);
    expect(m.totalPartySize).toBe(7); // read-only guest still counts in the total
  });
});
