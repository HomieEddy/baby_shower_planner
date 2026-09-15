// Floor plan admin editing/assignment plus the public day-of seating roster.

import { sendJson } from '../http';
import type { RouteCtx } from '../http';
import { handleRoutes, type Route } from '../route';
import {
  getFloorMap,
  getSeatingRoster,
  shareFloorPlanEmail,
  updateFloorMap,
} from '../../db/service';

const ROUTES: Route[] = [
  {
    method: 'GET',
    path: '/api/floorplan',
    handler: async (_req, { res }) => sendJson(res, 200, { floorMap: await getFloorMap() }),
  },

  {
    method: 'POST',
    path: '/api/floorplan',
    admin: true,
    body: true,
    handler: async ({ body }, { res }) => {
      // Seat-validation failures surface as DomainError (400) via server.ts.
      const floorMap = await updateFloorMap(body);
      return sendJson(res, 200, { success: true, floorMap });
    },
  },

  {
    method: 'GET',
    path: '/api/floorplan/roster',
    handler: async ({ query }, { res }) => {
      const guestToken = query.get('guest') || undefined;
      const code = query.get('code') || undefined;
      return sendJson(res, 200, await getSeatingRoster(guestToken, code));
    },
  },

  {
    method: 'POST',
    path: '/api/floorplan/share-email',
    admin: true,
    body: true,
    handler: async ({ body }, { res }) => {
      const result = await shareFloorPlanEmail(body.guestIds, body.customMessage);
      return sendJson(res, 200, { success: true, count: result.count });
    },
  },
];

export const handleFloorPlanRoutes = (ctx: RouteCtx): Promise<boolean> => handleRoutes(ROUTES, ctx);
