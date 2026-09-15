import { describe, it, expect } from 'vitest';
import { FloorMapData, TableElement } from '../../types';
import { applyRoomClamp, clampToRoundRoom, findNearestSeat, getSeatLocalPosition, seatRingPositions } from './floorPlanHelpers';

const map = (over: Partial<FloorMapData> = {}): FloorMapData => ({
  id: 'map',
  canvasWidth: 1000,
  canvasHeight: 600,
  tables: [],
  landmarks: [],
  updatedAt: '',
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

describe('applyRoomClamp', () => {
  it('returns the same map outside a round room', () => {
    const fm = map({ roomShape: 'rectangle', tables: [table({ x: 900, y: 500 })] });
    expect(applyRoomClamp(fm)).toBe(fm);
  });

  it('pulls tables and landmarks back inside a circle and leaves inside ones identical by reference', () => {
    const inside = table({ id: 'in', x: 400, y: 400 });
    const outside = table({ id: 'out', x: 950, y: 500, width: 100, height: 100 });
    const fm = map({
      roomShape: 'circle',
      canvasWidth: 1000,
      canvasHeight: 1000,
      tables: [inside, outside],
      landmarks: [{ id: 'l1', type: 'entrance', name: 'Entrance', x: 950, y: 500, width: 150, height: 60 }],
    });

    const clamped = applyRoomClamp(fm);
    expect(clamped.tables[0]).toBe(inside);
    expect(clamped.tables[1]).not.toBe(outside);
    expect(clamped.tables[1].x).toBeLessThan(outside.x);
    expect(clamped.tables[1].x).toBe(Math.round(clamped.tables[1].x));
    expect(clamped.landmarks[0].x).toBeLessThan(950);
    expect(clamped.roomShape).toBe('circle');
  });
});

describe('findNearestSeat', () => {
  it('snaps to the closest chair', () => {
    const fm = map({ tables: [table({ capacity: 4 })] });
    // seat 0 local center: (50 + (50+18), 50) = (118, 50)
    expect(findNearestSeat(fm, 118, 50)).toEqual({ tableId: 't1', seatIndex: 0 });
    expect(findNearestSeat(fm, 1000, 1000)).toBeNull();
  });
});

describe('getSeatLocalPosition', () => {
  it('starts at 3 o\'clock and goes clockwise on the seat ring', () => {
    const t = table({ width: 100, height: 100, capacity: 4 });
    // seat 0 = 3 o'clock: center + (w/2 + 18) on x
    expect(getSeatLocalPosition(t, 0)).toEqual({ x: 118, y: 50 });
    // seat 1 = bottom (clockwise in canvas coords)
    expect(getSeatLocalPosition(t, 1).x).toBeCloseTo(50);
    expect(getSeatLocalPosition(t, 1).y).toBeCloseTo(118);
  });

  it('scales the ring with an elliptical table', () => {
    const t = table({ width: 200, height: 100, capacity: 4 });
    // radiusX = 100 + 18, radiusY = 50 + 18
    expect(getSeatLocalPosition(t, 0)).toEqual({ x: 218, y: 50 });
    expect(getSeatLocalPosition(t, 1).y).toBeCloseTo(50 + 68);
  });
});

describe('seatRingPositions', () => {
  it('returns exactly capacity positions in seat order', () => {
    const t = table({ width: 100, height: 100, capacity: 6 });
    const positions = seatRingPositions(t);
    expect(positions).toHaveLength(6);
    expect(positions[0]).toEqual(getSeatLocalPosition(t, 0));
    expect(positions[5]).toEqual(getSeatLocalPosition(t, 5));
  });
});
