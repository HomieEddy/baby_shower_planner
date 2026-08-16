// Check-in (admin by id, public self-service by token/code).

import type { Guest } from '../types';
import { getPartyMembers, isMemberCheckedIn, isPartyLead } from '../lib/guestAttendees';
import { fromRecord, pb } from './client';
import { scrubForGuestLookup, scrubForRoster } from './roster';

// Check in one party member (by name) or the whole party (name omitted).
// The primary guest is tracked by `checked_in`, other members by
// `checked_in_names` (the primary is never duplicated into the array).
export async function checkInGuest(id: string, name?: string): Promise<Guest> {
  const now = new Date().toISOString();
  const guest = fromRecord<Guest>(await pb.collection('guests').getOne(id));
  if (guest.rsvp_status === 'Declined') throw new Error('GUEST_DECLINED');
  const members = getPartyMembers(guest);

  if (name !== undefined) {
    const target = name.trim();
    if (!members.some((m) => m.toLowerCase() === target.toLowerCase())) {
      throw new Error('NOT_IN_PARTY');
    }
    if (isPartyLead(guest, target)) {
      const updated = await pb.collection('guests').update(id, { checked_in: true, checked_in_at: now });
      return fromRecord<Guest>(updated);
    }
    const checked_in_names = Array.from(new Set([...(guest.checked_in_names || []), target]));
    const updated = await pb.collection('guests').update(id, { checked_in_names, checked_in_at: now });
    return fromRecord<Guest>(updated);
  }

  // Whole party: primary via the flag, everyone else by name.
  const checked_in_names = members.filter((m) => !isPartyLead(guest, m));
  const updated = await pb.collection('guests').update(id, { checked_in: true, checked_in_names, checked_in_at: now });
  return fromRecord<Guest>(updated);
}

export async function undoCheckIn(id: string, name?: string): Promise<Guest> {
  const guest = fromRecord<Guest>(await pb.collection('guests').getOne(id));

  if (name !== undefined) {
    const target = name.trim();
    if (isPartyLead(guest, target)) {
      const updated = await pb.collection('guests').update(id, { checked_in: false });
      return fromRecord<Guest>(updated);
    }
    const checked_in_names = (guest.checked_in_names || []).filter(
      (n) => n.toLowerCase() !== target.toLowerCase()
    );
    const updated = await pb.collection('guests').update(id, { checked_in_names });
    return fromRecord<Guest>(updated);
  }

  const updated = await pb.collection('guests').update(id, {
    checked_in: false,
    checked_in_names: [],
    checked_in_at: null,
  });
  return fromRecord<Guest>(updated);
}

// Counts individuals: party members when names are stored, otherwise the guest
// as a single unit. `expected` = attending individuals, `checkedIn` = how many
// of them have checked in.
export async function getCheckInStats(): Promise<{ total: number; checkedIn: number; expected: number }> {
  const all = await pb.collection('guests').getFullList();
  const total = all.length;
  let checkedIn = 0;
  let expected = 0;
  for (const r of all) {
    const g = fromRecord<Guest>(r);
    if (g.rsvp_status !== 'Attending') continue;
    const members = getPartyMembers(g);
    if (members.length > 0) {
      expected += members.length;
      checkedIn += members.filter((m) => isMemberCheckedIn(g, m)).length;
    } else {
      expected += g.attending_party_size || 1;
      checkedIn += g.checked_in ? 1 : 0;
    }
  }
  return { total, checkedIn, expected };
}

// ─── Check-in (public, self-service) ─────────────────────────────

export type SelfCheckInResult =
  | { ok: true; guest: Guest }
  | { ok: false; error: 'INVALID_TOKEN' | 'NOT_FOUND' | 'NOT_IN_PARTY' | 'ONLY_LEAD' | 'DECLINED' };

// Check in / undo one party member (targetName) or the whole party (all).
// With a magic token the caller is the party lead and may act for anyone;
// with code+name, members may only check in themselves and only the lead
// may use `all`.
export async function selfCheckIn(opts: {
  token?: string;
  code?: string;
  name?: string;
  targetName?: string;
  all?: boolean;
  undo?: boolean;
}): Promise<SelfCheckInResult> {
  const records = await pb.collection('guests').getFullList();
  const { token, code, name } = opts;

  let record;
  if (token) {
    record = records.find((r) => r.magic_token === token);
    if (!record) return { ok: false, error: 'INVALID_TOKEN' };
  } else if (code && name) {
    record = records.find((r) =>
      r.code === code.trim() &&
      getPartyMembers(fromRecord<Guest>(r)).some((m) => m.toLowerCase() === name.trim().toLowerCase())
    );
    if (!record) return { ok: false, error: 'NOT_FOUND' };
  } else {
    return { ok: false, error: 'NOT_FOUND' };
  }

  const guest = fromRecord<Guest>(record);
  if (guest.rsvp_status === 'Declined') return { ok: false, error: 'DECLINED' };
  const identified = name?.trim() || guest.name;
  const isLead = isPartyLead(guest, identified);
  const scrub = (g: Guest) => (token ? scrubForGuestLookup(g) : scrubForRoster(g));

  if (opts.all) {
    if (!token && !isLead) return { ok: false, error: 'ONLY_LEAD' };
    const updated = opts.undo ? await undoCheckIn(record.id) : await checkInGuest(record.id);
    return { ok: true, guest: scrub(updated) };
  }

  const target = opts.targetName?.trim() || identified;
  if (!getPartyMembers(guest).some((m) => m.toLowerCase() === target.toLowerCase())) {
    return { ok: false, error: 'NOT_IN_PARTY' };
  }
  if (!token && !isLead && target.toLowerCase() !== identified.toLowerCase()) {
    return { ok: false, error: 'ONLY_LEAD' };
  }
  try {
    const updated = opts.undo
      ? await undoCheckIn(record.id, target)
      : await checkInGuest(record.id, target);
    return { ok: true, guest: scrub(updated) };
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_IN_PARTY') return { ok: false, error: 'NOT_IN_PARTY' };
    throw err;
  }
}