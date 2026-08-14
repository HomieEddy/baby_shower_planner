import { describe, it, expect } from 'vitest';
import {
  stripPrimaryAttendees,
  buildAttendeePayload,
  getPartyMembers,
  isMemberCheckedIn,
  isPartyLead,
} from './guestAttendees';
import { Guest } from '../types';

const baseGuest = (over: Partial<Guest> = {}): Guest => ({
  id: 'g1',
  name: 'Primary Name',
  email: '',
  code: '2026',
  max_party_size: 4,
  rsvp_status: 'Attending',
  attending_party_size: 3,
  dietary_restrictions: '',
  language_pref: 'EN',
  magic_token: 'token-x',
  token_used: false,
  created_at: '2026-01-01T00:00:00Z',
  ...over,
});

describe('stripPrimaryAttendees', () => {
  it('strips the primary (index 0) from attendee_details', () => {
    const out = stripPrimaryAttendees(
      [{ name: 'Primary', contact: '' }, { name: 'Guest A', contact: 'a@x.com' }],
      []
    );
    expect(out).toEqual([{ name: 'Guest A', contact: 'a@x.com' }]);
  });

  it('strips the primary from attendee_names', () => {
    expect(stripPrimaryAttendees(undefined, ['Primary', 'Guest A', 'Guest B'])).toEqual([
      { name: 'Guest A', contact: '' },
      { name: 'Guest B', contact: '' },
    ]);
  });

  it('returns one empty row when nothing is stored', () => {
    expect(stripPrimaryAttendees([], [])).toEqual([{ name: '', contact: '' }]);
  });

  it('returns empty list when only the primary exists', () => {
    expect(stripPrimaryAttendees(undefined, ['Primary'])).toEqual([]);
  });
});

describe('buildAttendeePayload', () => {
  it('prepends the primary guest for attending', () => {
    const p = buildAttendeePayload('Primary Name', [{ name: 'Guest A', contact: '' }], 'Attending');
    expect(p.attendee_names).toEqual(['Primary Name', 'Guest A']);
    expect(p.attendee_details).toHaveLength(2);
  });

  it('returns empty lists when declining', () => {
    const p = buildAttendeePayload('Primary Name', [{ name: 'Guest A' }], 'Declined');
    expect(p.attendee_names).toEqual([]);
    expect(p.attendee_details).toEqual([]);
  });

  it('handles no additional guests', () => {
    const p = buildAttendeePayload('Primary Name', [], 'Attending');
    expect(p.attendee_names).toEqual(['Primary Name']);
  });
});

describe('getPartyMembers', () => {
  it('prefers attendee_details and keeps the primary first', () => {
    const g = baseGuest({
      attendee_details: [
        { name: 'Primary Name', contact: '' },
        { name: '  Guest A  ', contact: '' },
        { name: 'Guest B', contact: '' },
      ],
      attendee_names: ['Primary Name', 'Guest A', 'Guest B'],
    });
    expect(getPartyMembers(g)).toEqual(['Primary Name', 'Guest A', 'Guest B']);
  });

  it('dedupes repeated names', () => {
    const g = baseGuest({
      attendee_details: [
        { name: 'Primary Name', contact: '' },
        { name: 'Guest A', contact: '' },
        { name: 'guest a', contact: '' },
      ],
    });
    expect(getPartyMembers(g)).toEqual(['Primary Name', 'Guest A']);
  });

  it('falls back to attendee_names', () => {
    const g = baseGuest({ attendee_names: ['Primary Name', 'Guest A'] });
    expect(getPartyMembers(g)).toEqual(['Primary Name', 'Guest A']);
  });

  it('falls back to the primary alone when no names are stored', () => {
    expect(getPartyMembers(baseGuest())).toEqual(['Primary Name']);
  });
});

describe('isMemberCheckedIn', () => {
  it('primary is tracked by checked_in', () => {
    expect(isMemberCheckedIn(baseGuest({ checked_in: true }), 'Primary Name')).toBe(true);
    expect(isMemberCheckedIn(baseGuest({ checked_in: false }), 'primary name')).toBe(false);
  });

  it('other members are tracked by checked_in_names, case-insensitively', () => {
    expect(
      isMemberCheckedIn(baseGuest({ checked_in_names: ['Guest A'] }), 'guest a')
    ).toBe(true);
    expect(isMemberCheckedIn(baseGuest({ checked_in_names: ['Guest B'] }), 'Guest A')).toBe(false);
  });

  it('ignores empty names', () => {
    expect(isMemberCheckedIn(baseGuest({ checked_in: true }), '  ')).toBe(false);
  });
});

describe('isPartyLead', () => {
  it('matches the primary case-insensitively', () => {
    expect(isPartyLead(baseGuest(), 'primary name')).toBe(true);
    expect(isPartyLead(baseGuest(), 'Guest A')).toBe(false);
  });
});
