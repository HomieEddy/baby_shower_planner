import { describe, it, expect } from 'vitest';
import {
  stripPrimaryAttendees,
  buildAttendeePayload,
  getPartyMembers,
  getAttendeeDietary,
  getPartyDietarySummary,
  hasDietaryRestriction,
  isMemberCheckedIn,
  isPartyLead,
  dedupePartyNames,
  isAttending,
  mergeParty,
  partyNames,
  MAX_REGISTERED_PARTY,
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
      [{ name: 'Primary', contact: '' }, { name: 'Guest A', contact: 'a@x.com', dietary: 'Vegan' }],
      []
    );
    expect(out).toEqual([{ name: 'Guest A', contact: 'a@x.com', dietary: 'Vegan' }]);
  });

  it('strips the primary from attendee_names', () => {
    expect(stripPrimaryAttendees(undefined, ['Primary', 'Guest A', 'Guest B'])).toEqual([
      { name: 'Guest A', contact: '', dietary: '' },
      { name: 'Guest B', contact: '', dietary: '' },
    ]);
  });

  it('returns one empty row when nothing is stored', () => {
    expect(stripPrimaryAttendees([], [])).toEqual([{ name: '', contact: '', dietary: '' }]);
  });

  it('returns empty list when only the primary exists', () => {
    expect(stripPrimaryAttendees(undefined, ['Primary'])).toEqual([]);
  });
});

describe('getAttendeeDietary', () => {
  it('reads the member own restriction first', () => {
    const g = baseGuest({
      dietary_restrictions: 'Legacy lead note',
      attendee_details: [
        { name: 'Primary Name', dietary: 'Vegan' },
        { name: 'Guest A', dietary: 'Gluten-Free' },
      ],
    });
    expect(getAttendeeDietary(g, 0)).toBe('Vegan');
    expect(getAttendeeDietary(g, 1)).toBe('Gluten-Free');
  });

  it('falls back to the legacy party string for the lead only', () => {
    const g = baseGuest({ dietary_restrictions: 'Nut allergy' });
    expect(getAttendeeDietary(g, 0)).toBe('Nut allergy');
    expect(getAttendeeDietary(g, 1)).toBe('');
  });

  it('treats "none" as no restriction', () => {
    expect(hasDietaryRestriction(' none ')).toBe(false);
    expect(hasDietaryRestriction('Vegan')).toBe(true);
  });

  it('summarises only members with a restriction', () => {
    const g = baseGuest({
      attendee_details: [
        { name: 'Primary Name', dietary: 'Vegan' },
        { name: 'Guest A', dietary: '' },
        { name: 'Guest B', dietary: 'Gluten-Free' },
      ],
    });
    expect(getPartyDietarySummary(g)).toBe('Primary Name: Vegan · Guest B: Gluten-Free');
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

  it('carries per-member dietary including the lead', () => {
    const p = buildAttendeePayload(
      'Primary Name',
      [{ name: 'Guest A', contact: '', dietary: ' Vegan ' }],
      'Attending',
      ' Gluten-Free '
    );
    expect(p.attendee_details).toEqual([
      { name: 'Primary Name', contact: '', dietary: 'Gluten-Free' },
      { name: 'Guest A', contact: '', dietary: 'Vegan' },
    ]);
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

describe('isAttending', () => {
  it('is true only for Attending, and tolerates a missing guest', () => {
    expect(isAttending(baseGuest({ rsvp_status: 'Attending' }))).toBe(true);
    expect(isAttending(baseGuest({ rsvp_status: 'Declined' }))).toBe(false);
    expect(isAttending(baseGuest({ rsvp_status: 'Pending' }))).toBe(false);
    expect(isAttending(null)).toBe(false);
    expect(isAttending(undefined)).toBe(false);
  });
});

describe('dedupePartyNames', () => {
  it('keeps the primary first, trims, drops blanks and case-insensitive dupes, caps at max', () => {
    expect(dedupePartyNames('Alice', [' Bob ', 'bob', '', 'Cara', 'Dan'], 3)).toEqual(['Alice', 'Bob', 'Cara']);
  });

  it('is just the primary when there are no extras', () => {
    expect(dedupePartyNames('Alice', [], 5)).toEqual(['Alice']);
  });
});

describe('mergeParty', () => {
  it('makes the primary a member and fills contact/dietary from the details', () => {
    expect(mergeParty('Alice', ['Bob'], [[{ name: 'bob', contact: 'b@x.com', dietary: 'Vegan' }]], 5)).toEqual([
      { name: 'Alice', contact: '', dietary: '' },
      { name: 'Bob', contact: 'b@x.com', dietary: 'Vegan' },
    ]);
  });

  it('keeps a member contact/dietary across a case-only rename', () => {
    const prior = [{ name: 'Alice', contact: 'a@x.com', dietary: 'Gluten-Free' }];
    expect(mergeParty('Alice', undefined, [prior], 3)).toEqual([
      { name: 'Alice', contact: 'a@x.com', dietary: 'Gluten-Free' },
    ]);
    expect(mergeParty('alice', undefined, [prior], 3)).toEqual([
      { name: 'alice', contact: 'a@x.com', dietary: 'Gluten-Free' },
    ]);
  });

  it('lets the first source win per member and caps the party', () => {
    const incoming = [{ name: 'Bob', dietary: 'Nut-free' }];
    const prior = [{ name: 'Bob', contact: 'b@x.com', dietary: 'Vegan' }];
    expect(mergeParty('Alice', ['Bob', 'Cara'], [incoming, prior], 2)).toEqual([
      { name: 'Alice', contact: '', dietary: '' },
      { name: 'Bob', contact: '', dietary: 'Nut-free' },
    ]);
  });

  it('treats an empty declared list as the primary alone', () => {
    expect(mergeParty('Alice', [], [null, undefined], 4)).toEqual([{ name: 'Alice', contact: '', dietary: '' }]);
    expect(mergeParty('Alice', undefined, [], 4)).toEqual([{ name: 'Alice', contact: '', dietary: '' }]);
  });
});

describe('partyNames', () => {
  it('lists the stored names in order, dropping blanks', () => {
    expect(partyNames([{ name: ' Alice ' }, { name: '' }, { name: 'Cara' }])).toEqual(['Alice', 'Cara']);
    expect(partyNames(undefined)).toEqual([]);
  });

  it('caps a registered party at MAX_REGISTERED_PARTY', () => {
    expect(MAX_REGISTERED_PARTY).toBe(20);
  });
});
