import { describe, it, expect, beforeEach, vi } from 'vitest';

// The day-of roster is a PUBLIC endpoint, so the scrubbing is the security
// property under test: no other guest's name, code, contact, token or dietary
// note may leave the server.
const h = vi.hoisted(() => ({
  fake: undefined as unknown as ReturnType<typeof import('./pbFake').createPbFake>,
}));

vi.mock('./client', async () => {
  const { createPbFake } = await import('./pbFake');
  h.fake = createPbFake({ guests: [] });
  return { pb: h.fake.pb, fromRecord: (r: unknown) => r };
});

import { getSeatingRoster, scrubForGuestLookup, scrubForRoster } from './roster';

const guestRecord = (over: Record<string, unknown> = {}) => ({
  id: 'g1',
  name: 'Alice',
  email: 'alice@x.com',
  phone: '555',
  code: '1234',
  magic_token: 'tok-alice',
  rsvp_status: 'Attending',
  attending_party_size: 2,
  max_party_size: 4,
  dietary_restrictions: 'Vegan',
  attendee_names: ['Alice', 'Bob'],
  attendee_details: [{ name: 'Alice', contact: 'alice@x.com', dietary: 'Vegan', magic_token: 'm1' }, { name: 'Bob', contact: 'bob@x.com', dietary: 'Nut-free' }],
  delivery_channel: 'email',
  checked_in: false,
  token_used: true,
  language_pref: 'EN',
  created_at: '2026-01-01T00:00:00Z',
  ...over,
});

beforeEach(() => h.fake.reset());

describe('scrubForRoster', () => {
  it('drops contact, token and dietary but keeps the lookup code', () => {
    const scrubbed = scrubForRoster(guestRecord() as never);
    expect(scrubbed).toMatchObject({
      code: '1234',
      email: '',
      phone: '',
      magic_token: '',
      token_used: false,
      dietary_restrictions: '',
      attendee_details: undefined,
      delivery_channel: undefined,
    });
  });

  it('keeps the party names: the day-of card lists the members it is checking in', () => {
    // The caller reached this record with its own 4-digit code and a member
    // name, and the finder card re-reads the party from the response, so the
    // name list stays. The seat list is anonymized by getSeatingRoster instead.
    expect(scrubForRoster(guestRecord() as never).attendee_names).toEqual(['Alice', 'Bob']);
  });
});

describe('scrubForGuestLookup', () => {
  it('keeps the guest own dietary notes but drops member contacts and the token', () => {
    const scrubbed = scrubForGuestLookup(guestRecord() as never);
    expect(scrubbed.magic_token).toBe('');
    expect(scrubbed.email).toBe('');
    expect(scrubbed.dietary_restrictions).toBe('Vegan');
    expect(scrubbed.attendee_details).toEqual([
      { name: 'Alice', dietary: 'Vegan' },
      { name: 'Bob', dietary: 'Nut-free' },
    ]);
  });
});

describe('getSeatingRoster', () => {
  beforeEach(() => {
    h.fake.stores.guests.push(
      guestRecord(),
      guestRecord({ id: 'g2', name: 'Carol', code: '5678', magic_token: 'tok-carol', rsvp_status: 'Declined', attending_party_size: 0 })
    );
  });

  it('returns anonymized seats for attending parties only, sized canonically', async () => {
    const { seats } = await getSeatingRoster();
    expect(seats).toHaveLength(1);
    expect(seats[0]).toMatchObject({
      name: '',
      code: '',
      email: '',
      phone: '',
      magic_token: '',
      attendee_names: [],
      attendee_details: undefined,
      attending_party_size: 2,
    });
  });

  it('sizes a legacy party from attending_party_size when no names are stored', async () => {
    h.fake.stores.guests.push(guestRecord({ id: 'g3', code: '9999', attendee_names: [], attendee_details: undefined, attending_party_size: 3 }));
    const { seats } = await getSeatingRoster();
    const legacy = seats.find((s) => s.id === 'g3');
    expect(legacy?.attending_party_size).toBe(3);
  });

  it('returns only the matching party for a 4-digit code, and nothing otherwise', async () => {
    const found = await getSeatingRoster(undefined, '1234');
    expect(found.guests.map((g) => g.id)).toEqual(['g1']);
    expect(found.guests[0].email).toBe('');
    expect(found.guests[0].attendee_details).toEqual([
      { name: 'Alice', dietary: 'Vegan' },
      { name: 'Bob', dietary: 'Nut-free' },
    ]);

    expect((await getSeatingRoster(undefined, '0000')).guests).toEqual([]);
    expect((await getSeatingRoster(undefined, 'abcd')).guests).toEqual([]);
  });

  it('resolves a magic token to that guest only, and null when unknown', async () => {
    const found = await getSeatingRoster('tok-alice');
    expect(found.guest?.id).toBe('g1');
    expect(found.guest?.magic_token).toBe('');
    expect((await getSeatingRoster('nope')).guest).toBeNull();
  });
});
