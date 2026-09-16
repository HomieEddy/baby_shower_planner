// Public day-of seating roster with sensitive fields scrubbed.

import type { FloorMapData, Guest } from '../types';
import { fromRecord, pb } from './client';
import { isValidCode } from '../lib/validation';
import { isAttending } from '../lib/guestAttendees';
import { getGuestPartySize } from '../lib/tableAssignment';

// Public endpoint data for the seating page: full Guest shape with
// sensitive fields (email, phone, code, magic_token, dietary info) scrubbed.
export function scrubForRoster(g: Guest): Guest {
  return {
    ...g,
    email: '',
    phone: '',
    // code kept: it is the guest's own day-of lookup key (printed on invites)
    magic_token: '',
    token_used: false,
    dietary_restrictions: '',
    attendee_details: undefined,
    delivery_channel: undefined,
  };
}

// Token-matched guest: they hold the invite link, so their own reservation
// code and dietary notes are returned (email/phone/token stay scrubbed, and
// member contacts are dropped — only name + dietary survive).
export function scrubForGuestLookup(g: Guest): Guest {
  return {
    ...g,
    email: '',
    phone: '',
    magic_token: '',
    token_used: false,
    attendee_details: Array.isArray(g.attendee_details)
      ? g.attendee_details.map((d) => ({ name: d.name, dietary: d.dietary }))
      : undefined,
    delivery_channel: undefined,
  };
}

// The identity predicate the guest surfaces share (ADR 0001): a magic token or
// a reservation code, matched exactly as the roster matches them, so the map and
// the roster cannot drift on who "the requester" is.
const matchesIdentity = (record: any, guestToken?: string, code?: string): boolean =>
  (!!guestToken && record.magic_token === guestToken) ||
  (!!code && isValidCode(code) && record.code === code);

// The guest projection of the floor plan (ADR 0001): geometry, capacity, table
// and landmark names and per-chair occupancy survive; every guest identity is
// blanked except the requester's own party. Occupancy is kept by blanking
// `seats[].guestId` rather than dropping `seats` — getTableSeats prefers
// table.seats, so stripping them would blank the whole map.
export function projectFloorMapForGuest(map: FloorMapData, requesterGuestIds: readonly string[]): FloorMapData {
  const keep = new Set(requesterGuestIds);
  return {
    ...map,
    tables: map.tables.map((table) => ({
      ...table,
      seats: table.seats?.map((seat) =>
        seat && !keep.has(seat.guestId) ? { ...seat, guestId: '' } : seat
      ),
      assignedGuestIds: (table.assignedGuestIds || []).filter((id) => keep.has(id)),
    })),
  };
}

// The requester's own guest id(s), from the same magic token / reservation code
// identity the roster accepts. Unknown identity resolves to none — the
// all-blanked projection.
export async function getGuestIdsForIdentity(guestToken?: string, code?: string): Promise<string[]> {
  const records = await pb.collection('guests').getFullList();
  const ids = records.filter((r: any) => matchesIdentity(r, guestToken, code)).map((r: any) => r.id);
  return [...new Set<string>(ids)];
}

export async function getSeatingRoster(guestToken?: string, code?: string): Promise<{ seats: Guest[]; guests: Guest[]; guest: Guest | null }> {
  const records = await pb.collection('guests').getFullList();

  // Anonymized seat math: the venue map needs each attending party's size and
  // table, but never another guest's name, code, or contact details.
  const seats = records
    .filter((r: any) => isAttending(fromRecord<Guest>(r)))
    .map((r: any) => {
      const g = fromRecord<Guest>(r);
      // Canonical party size: the venue map needs the same number the seating
      // model uses, not a second formula that can drift from it.
      const partySize = getGuestPartySize(g);
      return {
        ...g,
        name: '',
        code: '',
        email: '',
        phone: '',
        magic_token: '',
        dietary_restrictions: '',
        attendee_names: [],
        attendee_details: undefined,
        attending_party_size: partySize,
      } as Guest;
    });

  // Code lookup: only the matching party is returned (exact 4-digit match) —
  // the full roster is never exposed.
  let guests: Guest[] = [];
  if (code && isValidCode(code)) {
    guests = records
      .filter((r: any) => matchesIdentity(r, undefined, code))
      .map((r: any) => scrubForGuestLookup(fromRecord<Guest>(r)));
  }

  let guest: Guest | null = null;
  if (guestToken) {
    const found = records.find((r: any) => matchesIdentity(r, guestToken));
    if (found) guest = scrubForGuestLookup(fromRecord<Guest>(found));
  }
  return { seats, guests, guest };
}