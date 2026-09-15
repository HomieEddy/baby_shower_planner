import { describe, it, expect, beforeEach, vi } from 'vitest';

// The day-of check-in matrix (who may check in whom) is untested, and it is
// the one place a guest can write another guest's state.
const h = vi.hoisted(() => ({
  fake: undefined as unknown as ReturnType<typeof import('./pbFake').createPbFake>,
}));

vi.mock('./client', async () => {
  const { createPbFake } = await import('./pbFake');
  h.fake = createPbFake({ guests: [] });
  return { pb: h.fake.pb, fromRecord: (r: unknown) => r };
});

import { getCheckInStats, selfCheckIn } from './checkin';

const party = (over: Record<string, unknown> = {}) => ({
  id: 'g1',
  name: 'Alice',
  email: 'alice@x.com',
  phone: '555',
  code: '1234',
  magic_token: 'tok-alice',
  rsvp_status: 'Attending',
  attending_party_size: 3,
  max_party_size: 4,
  attendee_names: ['Alice', 'Bob', 'Cara'],
  attendee_details: [{ name: 'Alice' }, { name: 'Bob' }, { name: 'Cara' }],
  checked_in: false,
  checked_in_names: [],
  language_pref: 'EN',
  created_at: '2026-01-01T00:00:00Z',
  ...over,
});

beforeEach(() => h.fake.reset());

describe('selfCheckIn party lead via magic token', () => {
  beforeEach(() => h.fake.stores.guests.push(party()));

  it('checks in the whole party and scrubs the response', async () => {
    const res = await selfCheckIn({ token: 'tok-alice', all: true });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.guest.checked_in).toBe(true);
    expect(res.guest.checked_in_names).toEqual(['Bob', 'Cara']);
    // Scrub: the token holder gets their own dietary notes but not the token.
    expect(res.guest.email).toBe('');
    expect(res.guest.magic_token).toBe('');
  });

  it('undoes a whole-party check-in', async () => {
    await selfCheckIn({ token: 'tok-alice', all: true });
    const res = await selfCheckIn({ token: 'tok-alice', all: true, undo: true });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.guest.checked_in).toBe(false);
    expect(res.guest.checked_in_names).toEqual([]);
  });

  it('rejects an unknown token', async () => {
    expect(await selfCheckIn({ token: 'nope' })).toEqual({ ok: false, error: 'INVALID_TOKEN' });
  });
});

describe('selfCheckIn without a token', () => {
  beforeEach(() => h.fake.stores.guests.push(party()));

  it('lets a member check in themselves with the code and their name', async () => {
    const res = await selfCheckIn({ code: '1234', name: 'bob' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.guest.checked_in_names).toEqual(['bob']);
  });

  it('requires the code to match a guest whose party contains the name', async () => {
    expect(await selfCheckIn({ code: '1234', name: 'Mallory' })).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(await selfCheckIn({ code: '0000', name: 'Bob' })).toEqual({ ok: false, error: 'NOT_FOUND' });
    expect(await selfCheckIn({ code: '1234' })).toEqual({ ok: false, error: 'NOT_FOUND' });
  });

  it('refuses a member checking in someone else, or the whole party', async () => {
    expect(await selfCheckIn({ code: '1234', name: 'Bob', targetName: 'Cara' })).toEqual({ ok: false, error: 'ONLY_LEAD' });
    expect(await selfCheckIn({ code: '1234', name: 'Bob', all: true })).toEqual({ ok: false, error: 'ONLY_LEAD' });
  });

  it('lets the lead check in the whole party', async () => {
    const res = await selfCheckIn({ code: '1234', name: 'Alice', all: true });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.guest.checked_in).toBe(true);
  });

  it('rejects a target that is not in the party', async () => {
    expect(await selfCheckIn({ code: '1234', name: 'Alice', targetName: 'Mallory' })).toEqual({ ok: false, error: 'NOT_IN_PARTY' });
  });

  it('rejects check-in for a declined guest', async () => {
    h.fake.stores.guests[0].rsvp_status = 'Declined';
    expect(await selfCheckIn({ code: '1234', name: 'Alice', all: true })).toEqual({ ok: false, error: 'GUEST_DECLINED' });
  });
});

describe('getCheckInStats', () => {
  it('counts attending individuals, not parties, and how many arrived', async () => {
    h.fake.stores.guests.push(
      party({ id: 'g1', checked_in: true, checked_in_names: ['Bob'] }),
      party({ id: 'g2', magic_token: 'tok-carol', name: 'Carol', attendee_names: ['Carol'], attendee_details: [{ name: 'Carol' }], attending_party_size: 1, code: '5678' }),
      party({ id: 'g3', magic_token: 'tok-decl', rsvp_status: 'Declined', attendee_names: [], attendee_details: [], attending_party_size: 0, code: '9999' })
    );
    const stats = await getCheckInStats();
    expect(stats).toMatchObject({ total: 3, expected: 4, checkedIn: 2 });
  });
});
