import { describe, it, expect, beforeEach, vi } from 'vitest';

// Minimal in-memory PocketBase so the registration/approval logic can be
// exercised without a running server.
const h = vi.hoisted(() => {
  const stores: Record<string, any[]> = { guests: [], invites: [] };
  let seq = 0;
  const match = (rec: any, filter: string) => {
    const pairs = [...filter.matchAll(/(\w+)="([^"]*)"/g)];
    return pairs.length > 0 && pairs.every(([, key, value]) => String(rec[key] ?? '') === value);
  };
  const collection = (name: string) => ({
    getList: async (_p: number, _pp: number, opts: any) => {
      const items = stores[name].filter((r) => match(r, opts?.filter || ''));
      return { items, totalItems: items.length };
    },
    getFirstListItem: async (filter: string) => {
      const found = stores[name].find((r) => match(r, filter));
      if (!found) throw new Error('not found');
      return found;
    },
    getFullList: async (opts: any = {}) => {
      let items = [...stores[name]];
      if (opts.filter) items = items.filter((r) => match(r, opts.filter));
      if (opts.sort) {
        const desc = opts.sort.startsWith('-');
        const key = opts.sort.replace(/^-/, '');
        items.sort((a, b) => String(a[key]).localeCompare(String(b[key])) * (desc ? -1 : 1));
      }
      return items;
    },
    getOne: async (id: string) => {
      const found = stores[name].find((r) => r.id === id);
      if (!found) throw new Error('not found');
      return found;
    },
    create: async (data: any) => {
      const rec = { id: `${name}-${++seq}`, ...data };
      stores[name].push(rec);
      return rec;
    },
    update: async (id: string, data: any) => {
      const found = stores[name].find((r) => r.id === id);
      if (!found) throw new Error('not found');
      Object.assign(found, data);
      return found;
    },
    delete: async (id: string) => {
      stores[name] = stores[name].filter((r) => r.id !== id);
    },
  });
  return {
    stores,
    pb: { collection },
    reset: () => { stores.guests = []; stores.invites = []; seq = 0; },
  };
});

vi.mock('./client', () => ({
  pb: h.pb,
  escFilter: (s: string) => s,
  fromRecord: (r: any) => r,
  newMagicToken: () => 'token-test',
  newReservationCode: () => '9999',
  removeGuestFromFloorMaps: async () => {},
}));

vi.mock('./settings', () => ({ getSettings: async () => ({ date: '', language: 'EN' }) }));

import { registerGuest, isApproved } from './guests';
import { createInvite, submitRsvp } from './rsvp';
import { buildUniversalInviteMessage } from '../lib/inviteMessage';

beforeEach(() => h.reset());

describe('isApproved', () => {
  it('treats missing and approved as approved, pending/rejected as not', () => {
    expect(isApproved({})).toBe(true);
    expect(isApproved({ approval_status: 'approved' })).toBe(true);
    expect(isApproved({ approval_status: 'pending' })).toBe(false);
    expect(isApproved({ approval_status: 'rejected' })).toBe(false);
  });
});

describe('buildUniversalInviteMessage', () => {
  it('points at /register and appends the inviter ref', () => {
    expect(buildUniversalInviteMessage({}, 'EN')).toContain('/register');
    expect(buildUniversalInviteMessage({}, 'EN', 'inv1')).toContain('ref=inv1');
  });
});

describe('registerGuest', () => {
  it('creates a pending, already-attending record for the whole party', async () => {
    const result = await registerGuest({ name: 'Alice', email: 'a@x.com', language_pref: 'EN', attendee_names: ['Alice', 'Bob'] });
    expect(result.already_registered).toBe(false);
    expect(result.guest.approval_status).toBe('pending');
    expect(result.guest.rsvp_status).toBe('Attending');
    expect(result.guest.token_used).toBe(true);
    expect(result.guest.attending_party_size).toBe(2);
    expect(result.guest.delivery_channel).toBe('email');
  });

  it('dedupes by contact instead of creating a second record', async () => {
    const first = await registerGuest({ name: 'Alice', email: 'a@x.com', language_pref: 'EN', attendee_names: ['Alice'] });
    const again = await registerGuest({ name: 'Alice', email: 'a@x.com', language_pref: 'EN', attendee_names: ['Alice'] });
    expect(again.already_registered).toBe(true);
    expect(again.guest.id).toBe(first.guest.id);
    expect(h.stores.guests.length).toBe(1);
  });

  it('stamps inviter provenance from the share ref', async () => {
    h.stores.invites.push({ id: 'inv1', inviter_guest_id: 'g0', inviter_guest_name: 'Host', invitee_name: 'Bob', note: 'hi' });
    const result = await registerGuest({ name: 'Bob', email: 'b@x.com', language_pref: 'EN', attendee_names: ['Bob'] }, 'inv1');
    expect(result.guest.invited_by_guest_id).toBe('g0');
    expect(result.guest.invited_by_guest_name).toBe('Host');
    expect(result.guest.guest_note).toBe('hi');
    expect(h.stores.invites.find((i) => i.id === 'inv1').registered_guest_id).toBe(result.guest.id);
  });
});

describe('submitRsvp approval gate', () => {
  it('blocks pending and rejected registrations', async () => {
    const { guest } = await registerGuest({ name: 'Alice', email: 'a@x.com', language_pref: 'EN', attendee_names: ['Alice'] });
    await expect(submitRsvp(guest.magic_token, { rsvp_status: 'Attending', dietary_restrictions: '' }))
      .rejects.toThrow('PENDING_APPROVAL');

    await h.pb.collection('guests').update(guest.id, { approval_status: 'rejected' });
    await expect(submitRsvp(guest.magic_token, { rsvp_status: 'Attending', dietary_restrictions: '' }))
      .rejects.toThrow('REGISTRATION_REJECTED');
  });

  it('allows submission once approved and unlocked', async () => {
    const { guest } = await registerGuest({ name: 'Alice', email: 'a@x.com', language_pref: 'EN', attendee_names: ['Alice'] });
    await h.pb.collection('guests').update(guest.id, { approval_status: 'approved', token_used: false });
    const updated = await submitRsvp(guest.magic_token, { rsvp_status: 'Attending', attendee_names: ['Alice'], dietary_restrictions: 'x' });
    expect(updated.rsvp_status).toBe('Attending');
    expect(updated.dietary_restrictions).toBe('x');
  });
});

describe('createInvite', () => {
  beforeEach(() => {
    h.stores.guests.push({ id: 'g0', magic_token: 'tok-a', name: 'Host', language_pref: 'EN' });
  });

  it('creates a share link with ref and dedupes by contact', async () => {
    const res = await createInvite('tok-a', { name: 'Carol', contact: 'c@x.com', note: 'n' });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.invite.invitee_name).toBe('Carol');
    expect(res.invite.invite_url).toContain('/register?ref=');
    expect(res.invite.invite_message).toContain('/register');

    const dup = await createInvite('tok-a', { name: 'Carol Two', contact: 'c@x.com' });
    expect(dup.ok && dup.already_invited).toBe(true);
    expect(h.stores.invites.length).toBe(1);
  });
});
