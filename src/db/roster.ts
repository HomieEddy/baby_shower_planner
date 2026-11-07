// Public day-of seating roster with sensitive fields scrubbed.

import type { Guest } from '../types';
import { fromRecord, pb } from './client';
import { isValidCode } from '../lib/validation';
import { getPartyMembers, isAttending } from '../lib/guestAttendees';
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

// Name search result: the party is identified by name, so the reservation
// code is withheld here. The guest must type their code before checking in,
// which keeps a name alone from being enough to check someone in.
export function scrubForNameSearch(g: Guest): Guest {
  return { ...scrubForGuestLookup(g), code: '' };
}

// Case- and accent-insensitive form used for name matching.
export function normalizeName(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
}

export const NAME_SEARCH_MIN = 2;
export const NAME_SEARCH_MAX_RESULTS = 10;

export async function getSeatingRoster(
  guestToken?: string,
  code?: string,
  name?: string,
): Promise<{ seats: Guest[]; guests: Guest[]; guest: Guest | null }> {
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
      .filter((r: any) => r.code === code)
      .map((r: any) => scrubForGuestLookup(fromRecord<Guest>(r)));
  }

  // Name lookup: attending parties with a member whose name contains the query.
  // Declined guests are not listed, and results are capped so a short query
  // cannot be used to dump the guest list.
  if (name) {
    const needle = normalizeName(name);
    if (needle.length >= NAME_SEARCH_MIN) {
      guests = records
        .map((r: any) => fromRecord<Guest>(r))
        .filter((g) => isAttending(g))
        .filter((g) => getPartyMembers(g).some((m) => normalizeName(m).includes(needle)))
        .slice(0, NAME_SEARCH_MAX_RESULTS)
        .map(scrubForNameSearch);
    }
  }

  let guest: Guest | null = null;
  if (guestToken) {
    const found = records.find((r: any) => r.magic_token === guestToken);
    if (found) guest = scrubForGuestLookup(fromRecord<Guest>(found));
  }
  return { seats, guests, guest };
}