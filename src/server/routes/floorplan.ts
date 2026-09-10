// Floor plan admin editing/assignment plus the public day-of seating roster.

import type { RouteCtx } from '../http';
import { parseJson, sendJson } from '../http';
import {
  getFloorMap,
  getSeatingRoster,
  shareFloorPlanEmail,
  updateFloorMap,
} from '../../db/service';

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
      // Seat-validation failures surface as DomainError (400) via server.ts.
      const floorMap = await updateFloorMap(body);
      return sendJson(res, 200, { success: true, floorMap });
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
