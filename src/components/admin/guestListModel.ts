// Pure guest-list derivation: filtering, metric counts and the CSV shapes.
// Extracted from AdminGuestsTab/the controller so the behaviour is testable
// without the DOM.

import type { FloorMapData, Guest, Language } from '../../types';
import { getGuestPartySize, getAttendeeLocations } from '../../lib/tableAssignment';
import { getPartyDietary, getAttendeeDietary, isAttending } from '../../lib/guestAttendees';
import { csvCell, parseCsvLine } from '../../lib/csv';

export type StatusFilter = 'All' | 'Attending' | 'Pending' | 'Declined';
export type SourceFilter = 'All' | 'Host' | 'Guest-invited';
export type MetricMode = 'invites' | 'party';

export interface GuestFilters {
  searchTerm: string;
  statusFilter: StatusFilter;
  sourceFilter: SourceFilter;
}

export function filterGuests(guests: Guest[], f: GuestFilters): Guest[] {
  const term = f.searchTerm.toLowerCase();
  return guests.filter((g) => {
    const matchesSearch =
      g.name.toLowerCase().includes(term) || g.email.toLowerCase().includes(term);
    const matchesStatus = f.statusFilter === 'All' || g.rsvp_status === f.statusFilter;
    const matchesSource =
      f.sourceFilter === 'All' ||
      (f.sourceFilter === 'Guest-invited' ? !!g.invited_by_guest_id : !g.invited_by_guest_id);
    return matchesSearch && matchesStatus && matchesSource;
  });
}

export interface GuestMetrics {
  attendingGuests: Guest[];
  pendingGuests: Guest[];
  declinedGuests: Guest[];
  pendingApprovals: Guest[];
  totalPartySize: number;
  totalAttendingPartySize: number;
  pendingPartySize: number;
  declinedPartySize: number;
}

const partySum = (guests: Guest[]) => guests.reduce((acc, g) => acc + getGuestPartySize(g), 0);

export function computeGuestMetrics(guests: Guest[]): GuestMetrics {
  const primary = guests.filter((g) => !g.is_read_only);
  // Self-registrations only count once approved.
  const approved = primary.filter((g) => (g.approval_status || 'approved') === 'approved');
  const attendingGuests = approved.filter(isAttending);
  const pendingGuests = approved.filter((g) => g.rsvp_status === 'Pending');
  const declinedGuests = approved.filter((g) => g.rsvp_status === 'Declined');
  return {
    attendingGuests,
    pendingGuests,
    declinedGuests,
    pendingApprovals: primary.filter((g) => g.approval_status === 'pending'),
    totalAttendingPartySize: partySum(attendingGuests),
    pendingPartySize: partySum(pendingGuests),
    declinedPartySize: partySum(declinedGuests),
    totalPartySize: partySum(guests),
  };
}

// ─── CSV ───────────────────────────────────────────────────────────────────

// The import shape of one CSV guest row (mirrors AddGuestPayload's subset the
// batch-import endpoint reads).
export interface GuestCsvRow {
  name: string;
  email: string;
  phone: string;
  max_party_size: number;
  delivery_channel: string;
  language_pref: Language;
}

// CSV text → guest rows ready for POST /api/guests/batch-import. A header line
// is skipped, blank lines dropped, and the first five columns stay
// import-compatible with buildGuestCsv (name, email, phone, party, channel).
export function parseGuestCsvRows(text: string, language: Language): GuestCsvRow[] {
  const lines = text.trim().split('\n');
  const rows: GuestCsvRow[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    if (i === 0 && (line.toLowerCase().includes('name') || line.toLowerCase().includes('email'))) continue;
    const parts = parseCsvLine(line);
    if (!parts[0]) continue;
    const channel = parts[4]?.toLowerCase() || '';
    rows.push({
      name: parts[0],
      email: parts[1] || '',
      phone: parts[2] || '',
      max_party_size: Number(parts[3]) || 2,
      delivery_channel: ['email', 'text', 'both', 'none'].includes(channel) ? channel : 'email',
      language_pref: language,
    });
  }
  return rows;
}

// One row per individual person, with their party's reservation code and their
// own table/seat resolved from the floor map (split parties included).
export function buildGuestCsv(
  guests: Guest[],
  floorMap: FloorMapData | null,
  origin: string
): { headers: string[]; rows: string[][] } {
  const headers = [
    'Guest Name', 'Email', 'Phone', 'Max Party Size', 'Delivery Channel',
    'Reservation Code', 'Group / Party', 'Table', 'Seat', 'RSVP Status',
    'Attending Party Size', 'Dietary Restrictions', 'Magic RSVP Token', 'Magic RSVP URL', 'Invited By',
  ];
  const esc = csvCell;
  const rows: string[][] = [];

  for (const g of guests) {
    const names = getPartyDietary(g).map((m) => m.name);
    const locations = getAttendeeLocations(g.id, floorMap, guests);
    const url = `${origin}/rsvp/${g.magic_token}`;
    names.forEach((name, i) => {
      const loc = locations.find((l) => l.attendeeIndex === i) ?? null;
      rows.push([
        esc(name),
        esc(g.email),
        esc(g.phone),
        String(g.max_party_size ?? ''),
        esc(g.delivery_channel || 'none'),
        esc(g.code),
        esc(g.name),
        esc(loc?.tableName ?? ''),
        loc ? String(loc.seatIndex + 1) : '',
        esc(g.rsvp_status),
        String(g.attending_party_size ?? ''),
        esc(getAttendeeDietary(g, i)),
        esc(g.magic_token),
        esc(url),
        esc(g.invited_by_guest_name || 'Host'),
      ]);
    });
  }

  return { headers, rows };
}
