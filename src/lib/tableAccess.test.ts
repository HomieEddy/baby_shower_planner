import { describe, it, expect } from 'vitest';
import type { FloorMapData, Guest, TableElement } from '../types';
import { checkTableAccess, isPartyCheckedIn } from './tableAccess';

// The table QR portal: a party may use a table's guestbook / photo upload only
// once checked in and only at the table it is seated at.
const guest = (over: Partial<Guest> = {}): Guest => ({
  id: 'g1',
  name: 'Alice',
  email: '',
  phone: '',
  code: '1234',
  magic_token: 'tok',
  rsvp_status: 'Attending',
  attending_party_size: 2,
  max_party_size: 2,
  attendee_names: ['Alice', 'Bob'],
  checked_in: true,
  checked_in_names: ['Bob'],
  language_pref: 'EN',
  ...over,
} as Guest);

const table = (id: string, name: string, guestIds: string[] = []): TableElement => ({
  id,
  name,
  capacity: 8,
  seats: [
    ...guestIds.flatMap((gid) => [{ guestId: gid, attendeeIndex: 0 }, { guestId: gid, attendeeIndex: 1 }]),
  ],
} as unknown as TableElement);

const map = (tables: TableElement[]): FloorMapData => ({ tables, landmarks: [] } as unknown as FloorMapData);

describe('checkTableAccess', () => {
  const seatedAtA = map([table('A', 'Table 1', ['g1']), table('B', 'Table 2')]);

  it('lets a checked-in party into its own table', () => {
    const g = guest();
    const res = checkTableAccess(g, 'A', seatedAtA, [g]);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.table?.name).toBe('Table 1');
  });

  it('refuses a party that has not checked in, before looking at tables', () => {
    const g = guest({ checked_in: false, checked_in_names: [] });
    expect(checkTableAccess(g, 'B', seatedAtA, [g])).toEqual({ ok: false, reason: 'NOT_CHECKED_IN' });
  });

  it('counts any checked-in member as the party being in', () => {
    expect(isPartyCheckedIn({ checked_in: false, checked_in_names: ['Bob'] })).toBe(true);
    expect(isPartyCheckedIn({ checked_in: false, checked_in_names: [] })).toBe(false);
  });

  it('points a party at the wrong table to its own', () => {
    const g = guest();
    expect(checkTableAccess(g, 'B', seatedAtA, [g])).toEqual({
      ok: false,
      reason: 'WRONG_TABLE',
      assignedTable: { id: 'A', name: 'Table 1' },
    });
  });

  it('refuses a party with no table yet', () => {
    const g = guest();
    const res = checkTableAccess(g, 'B', map([table('B', 'Table 2')]), [g]);
    expect(res).toEqual({ ok: false, reason: 'TABLE_NOT_ASSIGNED' });
  });

  it('refuses a QR code for a table that was removed', () => {
    const g = guest();
    expect(checkTableAccess(g, 'gone', seatedAtA, [g])).toEqual({ ok: false, reason: 'TABLE_NOT_FOUND' });
  });

  it('refuses declined, unanswered and unapproved reservations', () => {
    for (const over of [
      { rsvp_status: 'Declined' as const },
      { rsvp_status: 'Pending' as const },
      { approval_status: 'pending' as const },
      { approval_status: 'rejected' as const },
    ]) {
      const g = guest(over);
      expect(checkTableAccess(g, 'A', seatedAtA, [g])).toEqual({ ok: false, reason: 'NOT_ATTENDING' });
    }
  });

  it('only checks attendance and check-in on the generic portal (no table)', () => {
    const g = guest();
    expect(checkTableAccess(g, '', null, [g])).toEqual({ ok: true, table: null });
  });
});
