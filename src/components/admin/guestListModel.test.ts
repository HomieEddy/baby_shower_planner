import { describe, it, expect } from 'vitest';
import type { Guest } from '../../types';
import { buildGuestCsv, computeGuestMetrics, filterGuests, parseGuestCsvRows } from './guestListModel';

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

describe('parseGuestCsvRows', () => {
  const header = 'Guest Name,Email,Phone,Max Party Size,Delivery Channel';

  it('skips the header and blank lines, and defaults the channel and party size', () => {
    const rows = parseGuestCsvRows(`${header}\nAlice,alice@x.com,555,3,text\n\nBob,bob@x.com,,,`, 'FR');
    expect(rows).toEqual([
      { name: 'Alice', email: 'alice@x.com', phone: '555', max_party_size: 3, delivery_channel: 'text', language_pref: 'FR' },
      { name: 'Bob', email: 'bob@x.com', phone: '', max_party_size: 2, delivery_channel: 'email', language_pref: 'FR' },
    ]);
  });

  it('keeps quoted commas inside a cell and falls back on an unknown channel', () => {
    const rows = parseGuestCsvRows('"Doe, Jane",jane@x.com,,2,carrier-pigeon\nalice,alice@x.com,,2,text', 'EN');
    expect(rows[0].name).toBe('Doe, Jane');
    expect(rows[0].delivery_channel).toBe('email');
    expect(rows[1]).toMatchObject({ name: 'alice', delivery_channel: 'text' });
    expect(rows).toHaveLength(2);
  });

  it('returns nothing for an empty document', () => {
    expect(parseGuestCsvRows('   \n  ', 'EN')).toEqual([]);
  });
});

describe('buildGuestCsv', () => {
  it('writes one row per person, with the party code, table and per-member dietary', () => {
    const guests = [
      guest({
        id: 'g1', name: 'Alice', code: '1234', magic_token: 'tok', attended: undefined,
        attendee_names: ['Alice', 'Bob'], attending_party_size: 2,
        attendee_details: [{ name: 'Alice', dietary: 'Vegan' }, { name: 'Bob', dietary: 'Nut-free' }],
      } as Partial<Guest>),
    ];
    const map = {
      tables: [{ id: 't1', name: 'Table 1', capacity: 4, assignedGuestIds: ['g1'], seats: [{ guestId: 'g1', attendeeIndex: 0 }, null, null, null] }],
    } as never;

    const { headers, rows } = buildGuestCsv(guests, map, 'https://shower.test');
    expect(headers[0]).toBe('Guest Name');
    expect(rows).toHaveLength(2);
    expect(rows[0][0]).toBe('"Alice"');
    expect(rows[0][5]).toBe('"1234"');
    expect(rows[0][7]).toBe('"Table 1"');
    expect(rows[0][8]).toBe('1');
    expect(rows[0][11]).toBe('"Vegan"');
    expect(rows[0][13]).toBe('"https://shower.test/rsvp/tok"');
    expect(rows[1][11]).toBe('"Nut-free"');
  });

  it('falls back to the party table when no floor map is loaded', () => {
    const guests = [guest({ id: 'g1', table_id: 't9', attendee_names: ['Alice'], attending_party_size: 1 })];
    const { rows } = buildGuestCsv(guests, null, 'https://shower.test');
    expect(rows).toHaveLength(1);
    expect(rows[0][7]).toBe('""');
  });
});
