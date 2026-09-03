import { FloorMapData, TableElement } from '../../types';
import { getSeatLocalPosition } from './floorPlanHelpers';

// The 2D floor plan uses pixel coordinates; 3D world units are a fixed fraction
// of a pixel so an entire 2500px room still fits on screen.
export const WORLD_SCALE = 0.01;

export interface WorldPoint {
  x: number;
  y: number;
  z: number;
}

// Konva px (x right, y down) -> three world units centered on the room origin.
// Konva's down (+y) maps to three's forward (+z); height (y) stays 0 = floor.
export const toWorld = (floorMap: FloorMapData, px: number, py: number): WorldPoint => ({
  x: (px - floorMap.canvasWidth / 2) * WORLD_SCALE,
  y: 0,
  z: (py - floorMap.canvasHeight / 2) * WORLD_SCALE,
});

export const roomWorldSize = (floorMap: FloorMapData): { width: number; height: number } => ({
  width: floorMap.canvasWidth * WORLD_SCALE,
  height: floorMap.canvasHeight * WORLD_SCALE,
});

export const isRoomCircle = (floorMap: FloorMapData): boolean =>
  floorMap.roomShape === 'circle';

export const isRoomEllipse = (floorMap: FloorMapData): boolean =>
  floorMap.roomShape === 'ellipse';

export const roomRadiusWorld = (floorMap: FloorMapData): number =>
  Math.min(floorMap.canvasWidth, floorMap.canvasHeight) * WORLD_SCALE / 2;

export const tableCenterWorld = (floorMap: FloorMapData, table: TableElement): WorldPoint =>
  toWorld(floorMap, table.x + table.width / 2, table.y + table.height / 2);

// Konva rotates clockwise; three rotation.y is counter-clockwise viewed from +y.
export const tableRotationY = (table: TableElement): number =>
  -(table.rotation || 0) * (Math.PI / 180);

// Chair position + facing, in the table group's LOCAL frame (table center at
// origin, before the group's own rotation is applied). Seats reuse the exact
// 2D ellipse layout (floorPlanHelpers.getSeatLocalPosition) so 2D and 3D agree.
export const seatLocalWorld = (
  table: TableElement,
  seatIndex: number
): { x: number; z: number; yaw: number } => {
  const local = getSeatLocalPosition(table, seatIndex);
  const cx = (local.x - table.width / 2) * WORLD_SCALE;
  const cz = (local.y - table.height / 2) * WORLD_SCALE;
  const len = Math.hypot(cx, cz) || 1;
  // Yaw so the chair's front (-z) points back toward the table center.
  return { x: cx, z: cz, yaw: Math.atan2(cx / len, cz / len) };
};

export const SEAT_DISTANCE_PX = 18;
