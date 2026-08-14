import { AttendeeInfo, Guest } from '../types';

// Primary-guest handling for the RSVP form: the primary guest is implicit
// (stored at index 0), the form only edits additional party members.

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
): { name: string; contact: string }[] {
  if (attendeeDetails && attendeeDetails.length > 0) {
    return attendeeDetails.slice(1).map((d) => ({ name: d.name || '', contact: d.contact || '' }));
  }
  if (attendeeNames && attendeeNames.length > 0) {
    return attendeeNames.slice(1).map((n) => ({ name: n, contact: '' }));
  }
  return [{ name: '', contact: '' }];
}

export interface AdditionalAttendee {
  name: string;
  contact?: string;
}

export function buildAttendeePayload(
  primaryName: string,
  additional: AdditionalAttendee[],
  rsvpStatus: 'Attending' | 'Declined'
): { attendee_details: AttendeeInfo[]; attendee_names: string[] } {
  if (rsvpStatus === 'Declined') {
    return { attendee_details: [], attendee_names: [] };
  }
  const details: AttendeeInfo[] = [{ name: primaryName, contact: '' }, ...additional];
  return {
    attendee_details: details,
    attendee_names: details.map((a) => a.name),
  };
}
