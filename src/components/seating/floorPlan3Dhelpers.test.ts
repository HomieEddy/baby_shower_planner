import { describe, it, expect } from 'vitest';
import { FloorMapData, TableElement } from '../../types';
import {
  WORLD_SCALE,
  toWorld,
  roomWorldSize,
  tableCenterWorld,
  tableRotationY,
  seatLocalWorld,
} from './floorPlan3Dhelpers';

const floorMap: FloorMapData = {
  id: 'map',
  canvasWidth: 1000,
  canvasHeight: 800,
  tables: [],
  landmarks: [],
  updatedAt: '',
};

const table = (over: Partial<TableElement> = {}): TableElement => ({
  id: 't1',
  name: 'T1',
  shape: 'circle',
  x: 100,
  y: 100,
  width: 200,
  height: 200,
  rotation: 0,
  capacity: 8,
  assignedGuestIds: [],
  ...over,
});

describe('toWorld', () => {
  it('centers the room origin at (0, 0)', () => {
    expect(toWorld(floorMap, 500, 400)).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('maps top-left to negative x/z and bottom-right to positive x/z', () => {
    expect(toWorld(floorMap, 0, 0)).toEqual({ x: -5, y: 0, z: -4 });
    expect(toWorld(floorMap, 1000, 800)).toEqual({ x: 5, y: 0, z: 4 });
  });

  it('applies the world scale constant', () => {
    // 100px off-center in x -> 100 * WORLD_SCALE world units
    expect(toWorld(floorMap, 600, 500).x).toBeCloseTo(100 * WORLD_SCALE);
  });
});

describe('roomWorldSize', () => {
  it('scales both dimensions', () => {
    expect(roomWorldSize(floorMap)).toEqual({ width: 10, height: 8 });
  });
});

describe('tableCenterWorld', () => {
  it('uses the table center', () => {
    const t = table({ x: 100, y: 100, width: 200, height: 200 });
    // center at (200, 200)
    expect(tableCenterWorld(floorMap, t).x).toBeCloseTo((200 - 500) * WORLD_SCALE);
    expect(tableCenterWorld(floorMap, t).z).toBeCloseTo((200 - 400) * WORLD_SCALE);
  });
});

describe('tableRotationY', () => {
  it('negates and converts degrees to radians', () => {
    expect(tableRotationY(table({ rotation: 90 }))).toBeCloseTo(-Math.PI / 2);
    expect(tableRotationY(table({ rotation: 0 }))).toBeCloseTo(0);
    expect(tableRotationY(table({ rotation: -45 }))).toBeCloseTo(Math.PI / 4);
  });
});

describe('seatLocalWorld', () => {
  it('places the first seat at 3 o\'clock (12 px right of the table edge)', () => {
    const t = table({ x: 0, y: 0, width: 200, height: 200, capacity: 8 });
    const seat = seatLocalWorld(t, 0);
    // angle 0 -> right of center by (w/2 + 18)
    expect(seat.x).toBeCloseTo((100 + 18) * WORLD_SCALE);
    expect(seat.z).toBeCloseTo(0);
  });

  it('yaw faces the chair front toward the table center', () => {
    // First seat is due right of center -> chair must face left (-x), i.e. yaw = +PI/2.
    const t = table({ width: 200, height: 200, capacity: 8 });
    const seat = seatLocalWorld(t, 0);
    expect(seat.yaw).toBeCloseTo(Math.PI / 2);
  });

  it('yaw for a seat due +z is 0 (chair faces -z toward center)', () => {
    // 2nd of 8 seats -> angle = PI/2 -> bottom of table (center is up/-z from it)
    const t = table({ width: 200, height: 200, capacity: 8 });
    const seat = seatLocalWorld(t, 2);
    expect(seat.z).toBeGreaterThan(0);
    expect(seat.yaw).toBeCloseTo(0);
  });

  it('is invariant to the room size (uses table-local coords only)', () => {
    const small = seatLocalWorld(table({ width: 200, height: 200, capacity: 8 }), 1);
    const big = seatLocalWorld(table({ width: 200, height: 200, capacity: 8 }), 1);
    expect(small).toEqual(big);
  });
});
