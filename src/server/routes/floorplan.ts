// Floor plan admin editing/assignment plus the public day-of seating roster.

import type { RouteCtx } from '../http';
import { HttpError, parseJson, sendJson } from '../http';
import {
  getFloorMap,
  getSeatingRoster,
  shareFloorPlanEmail,
  updateFloorMap,
} from '../../db/service';

// Seat-validation failures are client errors (400), everything else is a 500.
const SEAT_ERRORS = new Set([
  'SEAT_UNKNOWN_GUEST',
  'SEAT_GUEST_NOT_ATTENDING',
  'SEAT_INDEX_OUT_OF_RANGE',
  'SEAT_DUPLICATE_ATTENDEE',
  'TABLE_OVER_CAPACITY',
]);

function toHttpError(err: unknown): never {
  const message = err instanceof Error ? err.message : 'INVALID_SEATING';
  if (SEAT_ERRORS.has(message)) {
    throw new HttpError(400, message);
  }
  throw err;
}

export async function handleFloorPlanRoutes(ctx: RouteCtx): Promise<boolean> {
  const { req, res, url } = ctx;
  const method = req.method || 'GET';
  const pathname = url.pathname;

  if (pathname === '/api/floorplan') {
    if (method === 'GET') {
      const floorMap = await getFloorMap();
      return sendJson(res, 200, { floorMap });
    }
    if (method === 'POST') {
      ctx.requireAdmin();
      const body = await parseJson(req);
      try {
        const floorMap = await updateFloorMap(body);
        return sendJson(res, 200, { success: true, floorMap });
      } catch (err) {
        toHttpError(err);
      }
    }
  }

  if (pathname === '/api/floorplan/roster' && method === 'GET') {
    const guestToken = url.searchParams.get('guest') || undefined;
    const code = url.searchParams.get('code') || undefined;
    const result = await getSeatingRoster(guestToken, code);
    return sendJson(res, 200, result);
  }

  if (pathname === '/api/floorplan/share-email' && method === 'POST') {
    ctx.requireAdmin();
    const body = await parseJson(req);
    const result = await shareFloorPlanEmail(body.guestIds, body.customMessage);
    return sendJson(res, 200, { success: true, count: result.count });
  }

  return false;
}