import { AttendeeInfo, Guest } from '../types';

// Primary-guest handling for the RSVP form: the primary guest is implicit
// (stored at index 0), the form only edits additional party members.

// The one attendance predicate: seating, catering, invites and stats all ask
// this question, so they must all ask it in the same place.
export function isAttending(guest: { rsvp_status?: string } | null | undefined): boolean {
  return guest?.rsvp_status === 'Attending';
}

// All party member names (primary guest first), deduped and trimmed.
// Prefers the detailed attendee list, falls back to the names array, then to
// the primary guest alone when the party was never broken out into names.
export function getPartyMembers(guest: Guest): string[] {
  const out: string[] = [];
  const push = (n: string) => {
    const name = (n || '').trim();
    if (name && !out.some((existing) => existing.toLowerCase() === name.toLowerCase())) {
      out.push(name);
    }
  };
  if (guest.attendee_details && guest.attendee_details.length > 0) {
    for (const d of guest.attendee_details) push(d.name);
    return out;
  }
  if (guest.attendee_names && guest.attendee_names.length > 0) {
    for (const n of guest.attendee_names) push(n);
    return out;
  }
  push(guest.name);
  return out;
}

// A party's names: [primary, ...extras], trimmed, case-insensitively deduped,
// capped at `max` (the primary is always included). One implementation for
// host-add and party-edit.
export function dedupePartyNames(
  primary: string,
  extras: Iterable<string | undefined | null>,
  max: number
): string[] {
  const names = [primary];
  const seen = new Set([primary.toLowerCase()]);
  for (const raw of extras) {
    if (names.length >= max) break;
    const n = typeof raw === 'string' ? raw.trim() : '';
    if (!n || seen.has(n.toLowerCase())) continue;
    seen.add(n.toLowerCase());
    names.push(n);
  }
  return names;
}

// Dietary restrictions are stored per party member inside `attendee_details`.
// Legacy records carry one party-level string; it applies to the lead and is
// still read as a fallback so old data keeps showing up.
export function getAttendeeDietary(guest: Guest, index: number): string {
  const own = (guest.attendee_details?.[index]?.dietary || '').trim();
  if (own) return own;
  if (index === 0) return (guest.dietary_restrictions || '').trim();
  return '';
}

export function hasDietaryRestriction(text: string): boolean {
  const r = (text || '').trim().toLowerCase();
  return r.length > 0 && r !== 'none';
}

// Per-member dietary, aligned index-for-index with getPartyMembers.
export function getPartyDietary(guest: Guest): { name: string; dietary: string }[] {
  return getPartyMembers(guest).map((name, i) => ({ name, dietary: getAttendeeDietary(guest, i) }));
}

// Compact "Name: restriction, Name: restriction" string for lists and CSVs.
export function getPartyDietarySummary(guest: Guest): string {
  return getPartyDietary(guest)
    .filter((m) => hasDietaryRestriction(m.dietary))
    .map((m) => `${m.name}: ${m.dietary}`)
    .join(' · ');
}

// Primary guest check-in is tracked by `checked_in`; other party members by
// `checked_in_names`. Matching is case-insensitive.
export function isMemberCheckedIn(guest: Guest, name: string): boolean {
  const target = name.trim().toLowerCase();
  if (!target) return false;
  const inNames = (guest.checked_in_names || []).some((n) => n.trim().toLowerCase() === target);
  if (inNames) return true;
  return (guest.name || '').trim().toLowerCase() === target && !!guest.checked_in;
}

export function isPartyLead(guest: Guest, name: string): boolean {
  return name.trim().toLowerCase() === (guest.name || '').trim().toLowerCase();
}

export function stripPrimaryAttendees(
  attendeeDetails?: AttendeeInfo[],
  attendeeNames?: string[]
): { name: string; contact: string; dietary: string }[] {
  if (attendeeDetails && attendeeDetails.length > 0) {
    return attendeeDetails.slice(1).map((d) => ({ name: d.name || '', contact: d.contact || '', dietary: d.dietary || '' }));
  }
  if (attendeeNames && attendeeNames.length > 0) {
    return attendeeNames.slice(1).map((n) => ({ name: n, contact: '', dietary: '' }));
  }
  return [{ name: '', contact: '', dietary: '' }];
}

export interface AdditionalAttendee {
  name: string;
  contact?: string;
  dietary?: string;
}

export function buildAttendeePayload(
  primaryName: string,
  additional: AdditionalAttendee[],
  rsvpStatus: 'Attending' | 'Declined',
  primaryDietary = ''
): { attendee_details: AttendeeInfo[]; attendee_names: string[] } {
  if (rsvpStatus === 'Declined') {
    return { attendee_details: [], attendee_names: [] };
  }
  const details: AttendeeInfo[] = [
    { name: primaryName, contact: '', dietary: primaryDietary.trim() },
    ...additional.map((a) => ({ name: a.name, contact: a.contact || '', dietary: (a.dietary || '').trim() })),
  ];
  return {
    attendee_details: details,
    attendee_names: details.map((a) => a.name),
  };
}
