import { describe, it, expect } from 'vitest';
import { FloorMapData, Guest, TableElement } from '../../types';
import {
  clampToRoundRoom,
  getTableSeats,
  getTableOccupiedSeats,
  getAttendeeSeatIndex,
  getAttendeeSeatLocation,
  findNearestSeat,
  validateTables,
} from './floorPlanHelpers';

const map = (over: Partial<FloorMapData> = {}): FloorMapData => ({
  id: 'map',
  canvasWidth: 1000,
  canvasHeight: 600,
  tables: [],
  landmarks: [],
  updatedAt: '',
  ...over,
});

const guest = (over: Partial<Guest> = {}): Guest => ({
  id: 'g1',
  name: 'Alice',
  email: '',
  code: '1111',
  max_party_size: 5,
  rsvp_status: 'Attending',
  attending_party_size: 3,
  attendee_names: ['Alice', 'Bob', 'Cara'],
  dietary_restrictions: '',
  language_pref: 'EN',
  magic_token: '',
  token_used: false,
  created_at: '',
  ...over,
});

const table = (over: Partial<TableElement> = {}): TableElement => ({
  id: 't1',
  name: 'Table 1',
  shape: 'circle',
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  capacity: 4,
  assignedGuestIds: [],
  ...over,
});

describe('clampToRoundRoom', () => {
  it('leaves rectangle rooms untouched', () => {
    const p = clampToRoundRoom(10, 10, 100, 100, map({ roomShape: 'rectangle' }));
    expect(p).toEqual({ x: 10, y: 10 });
  });

  it('clamps an out-of-bounds element back inside an ellipse', () => {
    // 1000x600 ellipse centered at (500,300); a table pushed to a far corner is outside.
    const p = clampToRoundRoom(900, 500, 100, 100, map({ roomShape: 'ellipse' }));
    const { x, y } = p;
    const cx = 500;
    const cy = 300;
    const ax = 500 - 10 - (Math.hypot(100, 100) / 2 + 18); // inner ellipse semi-x
    const ay = 300 - 10 - (Math.hypot(100, 100) / 2 + 18); // inner ellipse semi-y
    const norm = Math.hypot((x + 50 - cx) / ax, (y + 50 - cy) / ay);
    expect(norm).toBeLessThanOrEqual(1.001);
  });

  it('keeps an inside element unchanged', () => {
    const p = clampToRoundRoom(400, 200, 100, 100, map({ roomShape: 'ellipse' }));
    expect(p).toEqual({ x: 400, y: 200 });
  });

  it('projects a circle outward onto its radius', () => {
    const p = clampToRoundRoom(900, 290, 100, 100, map({ roomShape: 'circle', canvasWidth: 1000, canvasHeight: 1000 }));
    const { x, y } = p;
    const cx = 500;
    const cy = 500;
    const rad = 500 - 10 - (Math.hypot(100, 100) / 2 + 18);
    expect(Math.hypot(x + 50 - cx, y + 50 - cy)).toBeLessThanOrEqual(rad + 0.5);
  });

  it('lets a landmark sit flush against the wall (no seat margin, thin half-extent)', () => {
    const p = clampToRoundRoom(950, 290, 150, 60, map({ roomShape: 'circle', canvasWidth: 1000, canvasHeight: 1000 }), true);
    const cx = 500;
    const cy = 500;
    const rad = 500 - 10 - Math.min(150, 60) / 2;
    expect(Math.hypot(p.x + 75 - cx, p.y + 30 - cy)).toBeLessThanOrEqual(rad + 0.5);
  });
});

describe('seat model', () => {
  it('expands legacy assignedGuestIds into contiguous chairs', () => {
    const seats = getTableSeats(table({ assignedGuestIds: ['g1'] }), [guest()]);
    expect(seats.filter(Boolean)).toEqual([
      { guestId: 'g1', attendeeIndex: 0 },
      { guestId: 'g1', attendeeIndex: 1 },
      { guestId: 'g1', attendeeIndex: 2 },
    ]);
    expect(seats).toHaveLength(4);
    expect(getTableOccupiedSeats(table({ assignedGuestIds: ['g1'] }), [guest()])).toBe(3);
  });

  it('counts only non-null explicit seats', () => {
    const t = table({
      seats: [{ guestId: 'g1', attendeeIndex: 0 }, null, { guestId: 'g1', attendeeIndex: 1 }, null],
    });
    expect(getTableOccupiedSeats(t, [guest()])).toBe(2);
  });

  it('resolves a split attendee to the right table and chair', () => {
    const g = guest();
    const t1 = table({ assignedGuestIds: ['g1'], seats: [{ guestId: 'g1', attendeeIndex: 0 }, null, null, null] });
    const t2 = table({
      id: 't2',
      assignedGuestIds: ['g1'],
      seats: [null, null, { guestId: 'g1', attendeeIndex: 1 }, null],
    });
    expect(getAttendeeSeatIndex(t1, 'g1', 'Alice', [g])).toBe(0);
    expect(getAttendeeSeatIndex(t2, 'g1', 'Bob', [g])).toBe(2);
    expect(getAttendeeSeatIndex(t2, 'g1', 'Alice', [g])).toBeNull();
    // null attendeeName -> the party lead's chair
    expect(getAttendeeSeatIndex(t1, 'g1', null, [g])).toBe(0);
  });

  it('getAttendeeSeatLocation finds each split member on their own table', () => {
    const g = guest();
    const t1 = table({ assignedGuestIds: ['g1'], seats: [{ guestId: 'g1', attendeeIndex: 0 }, null, null, null] });
    const t2 = table({ id: 't2', assignedGuestIds: ['g1'], seats: [{ guestId: 'g1', attendeeIndex: 1 }, null, null, null] });
    const fm = map({ tables: [t1, t2] });
    expect(getAttendeeSeatLocation('g1', 0, fm, [g])).toEqual({ table: t1, seatIndex: 0 });
    expect(getAttendeeSeatLocation('g1', 1, fm, [g])).toEqual({ table: t2, seatIndex: 0 });
    expect(getAttendeeSeatLocation('g1', 2, fm, [g])).toBeNull();
  });

  it('findNearestSeat snaps to the closest chair', () => {
    const fm = map({ tables: [table({ capacity: 4 })] });
    // seat 0 local center: (50 + (50+18), 50) = (118, 50)
    expect(findNearestSeat(fm, 118, 50)).toEqual({ tableId: 't1', seatIndex: 0 });
    expect(findNearestSeat(fm, 1000, 1000)).toBeNull();
  });
});

describe('validateTables', () => {
  it('rejects an over-capacity table', () => {
    const t = table({
      capacity: 1,
      seats: [{ guestId: 'g1', attendeeIndex: 0 }, { guestId: 'g1', attendeeIndex: 1 }],
    });
    expect(() => validateTables([t], [guest()])).toThrow('TABLE_OVER_CAPACITY');
  });

  it('rejects an out-of-range attendee index', () => {
    const t = table({ seats: [null, null, null, { guestId: 'g1', attendeeIndex: 7 }] });
    expect(() => validateTables([t], [guest()])).toThrow('SEAT_INDEX_OUT_OF_RANGE');
  });

  it('rejects an attendee seated twice', () => {
    const t1 = table({ seats: [{ guestId: 'g1', attendeeIndex: 0 }, null, null, null] });
    const t2 = table({ id: 't2', seats: [{ guestId: 'g1', attendeeIndex: 0 }, null, null, null] });
    expect(() => validateTables([t1, t2], [guest()])).toThrow('SEAT_DUPLICATE_ATTENDEE');
  });

  it('accepts a legally split party', () => {
    const t1 = table({ seats: [{ guestId: 'g1', attendeeIndex: 0 }, { guestId: 'g1', attendeeIndex: 1 }, null, null] });
    const t2 = table({ id: 't2', seats: [{ guestId: 'g1', attendeeIndex: 2 }, null, null, null] });
    expect(() => validateTables([t1, t2], [guest()])).not.toThrow();
  });
});
