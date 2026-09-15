import { describe, it, expect } from 'vitest';
import { FloorMapData, TableElement } from '../../types';
import {
  clampElementToRoom,
  clampPointToRoom,
  findNearestSeat,
  getSeatLocalPosition,
  seatRingPositions,
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

describe('clampPointToRoom', () => {
  it('clamps a point into the inset rectangle wall', () => {
    expect(clampPointToRoom(-50, 5000, map({ roomShape: 'rectangle' }))).toEqual({ x: 10, y: 590 });
    expect(clampPointToRoom(400, 200, map({ roomShape: 'rectangle' }))).toEqual({ x: 400, y: 200 });
  });

  it('projects a point outside an ellipse back onto the wall', () => {
    // 1000x600 ellipse centred at (500,300); (1000,300) is past the right wall.
    const p = clampPointToRoom(1000, 300, map({ roomShape: 'ellipse' }));
    expect(p.x).toBeCloseTo(990);
    expect(p.y).toBeCloseTo(300);
    expect(p.x).toBeLessThanOrEqual(1000);
  });

  it('leaves an inside point untouched', () => {
    expect(clampPointToRoom(400, 200, map({ roomShape: 'ellipse' }))).toEqual({ x: 400, y: 200 });
  });

  it('projects a point outside a circle back onto the radius', () => {
    const p = clampPointToRoom(1000, 500, map({ roomShape: 'circle', canvasWidth: 1000, canvasHeight: 1000 }));
    expect(Math.hypot(p.x - 500, p.y - 500)).toBeLessThanOrEqual(490 + 0.5);
    expect(p.x).toBeCloseTo(990);
  });
});

describe('clampElementToRoom', () => {
  it('lets an element overhang the wall as long as its center stays inside', () => {
    const p = clampElementToRoom(950, 290, 150, 60, map({ roomShape: 'circle', canvasWidth: 1000, canvasHeight: 1000 }));
    const cx = p.x + 75;
    const cy = p.y + 30;
    expect(Math.hypot(cx - 500, cy - 500)).toBeLessThanOrEqual(490 + 0.5);
    // The body is allowed past the wall now (free-form placement).
    expect(p.x + 150).toBeGreaterThan(990);
  });

  it('keeps the center inside the inset rectangle', () => {
    const p = clampElementToRoom(-500, -500, 100, 100, map({ roomShape: 'rectangle' }));
    expect(p.x + 50).toBe(10);
    expect(p.y + 50).toBe(10);
  });
});

describe('findNearestSeat', () => {
  it('snaps to the closest chair', () => {
    const fm = map({ tables: [table({ capacity: 4 })] });
    // seat 0 local center: (50 + (50+18), 50) = (118, 50)
    expect(findNearestSeat(fm, 118, 50)).toEqual({ tableId: 't1', seatIndex: 0 });
    expect(findNearestSeat(fm, 1000, 1000)).toBeNull();
  });

  it('accounts for table rotation (pivot on the center)', () => {
    const t = table({ capacity: 4, x: 300, y: 300, width: 100, height: 100, rotation: 90 });
    const fm = map({ tables: [t] });
    // seat 0 is centre-relative (68, 0); rotated 90° it lands at (350, 418).
    expect(findNearestSeat(fm, 350, 418)).toEqual({ tableId: 't1', seatIndex: 0 });
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
