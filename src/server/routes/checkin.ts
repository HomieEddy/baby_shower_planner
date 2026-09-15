// Check-in: admin (by guest id) and public self-service (token or code+name).

import { sendError, sendJson } from '../http';
import type { RouteCtx } from '../http';
import { handleRoutes, type Route } from '../route';
import { checkInGuest, getCheckInStats, selfCheckIn, undoCheckIn } from '../../db/service';

const ROUTES: Route[] = [
  {
    method: 'POST',
    path: '/api/check-in',
    admin: true,
    body: true,
    handler: async ({ body }, { res }) => {
      if (!body.guestId) return sendError(res, 'GUEST_ID_REQUIRED');
      // body.name: check in one party member; omitted = whole party
      // GUEST_DECLINED / NOT_IN_PARTY propagate as DomainError.
      const guest = await checkInGuest(body.guestId, body.name);
      return sendJson(res, 200, { guest });
    },
  },

  {
    method: 'POST',
    path: '/api/check-in/undo',
    admin: true,
    body: true,
    handler: async ({ body }, { res }) => {
      if (!body.guestId) return sendError(res, 'GUEST_ID_REQUIRED');
      const guest = await undoCheckIn(body.guestId, body.name);
      return sendJson(res, 200, { guest });
    },
  },

  {
    method: 'GET',
    path: '/api/check-in/stats',
    admin: true,
    handler: async (_req, { res }) => sendJson(res, 200, { stats: await getCheckInStats() }),
  },

  // The merged day-of page identifies parties via the seating roster
  // endpoint; only the check-in action lives here. Body: { token } |
  // { code, name }, plus optional targetName / all / undo.
  {
    method: 'POST',
    path: '/api/check-in/self',
    body: true,
    handler: async ({ body }, { res }) => {
      const result = await selfCheckIn({
        token: body.token,
        code: body.code,
        name: body.name,
        targetName: body.targetName,
        all: !!body.all,
        undo: !!body.undo,
      });
      if (!result.ok) {
        return sendError(res, result.error);
      }
      return sendJson(res, 200, { guest: result.guest });
    },
  },
];

export const handleCheckInRoutes = (ctx: RouteCtx): Promise<boolean> => handleRoutes(ROUTES, ctx);
