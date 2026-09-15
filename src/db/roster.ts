// Public day-of seating roster with sensitive fields scrubbed.

import type { Guest } from '../types';
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
      .filter((r: any) => r.code === code)
      .map((r: any) => scrubForGuestLookup(fromRecord<Guest>(r)));
  }

  let guest: Guest | null = null;
  if (guestToken) {
    const found = records.find((r: any) => r.magic_token === guestToken);
    if (found) guest = scrubForGuestLookup(fromRecord<Guest>(found));
  }
  return { seats, guests, guest };
}