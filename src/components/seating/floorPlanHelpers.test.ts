import { describe, it, expect } from 'vitest';
import { FloorMapData } from '../../types';
import { clampToRoundRoom } from './floorPlanHelpers';

const map = (over: Partial<FloorMapData> = {}): FloorMapData => ({
  id: 'map',
  canvasWidth: 1000,
  canvasHeight: 600,
  tables: [],
  landmarks: [],
  updatedAt: '',
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
