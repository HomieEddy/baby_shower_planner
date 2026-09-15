// Check-in: admin (by guest id) and public self-service (token or code+name).

import type { RouteCtx } from '../http';
import { parseJson, sendError, sendJson } from '../http';
import { checkInGuest, getCheckInStats, selfCheckIn, undoCheckIn } from '../../db/service';

export async function handleCheckInRoutes(ctx: RouteCtx): Promise<boolean> {
  const { req, res, url, requireAdmin } = ctx;
  const method = req.method || 'GET';
  const pathname = url.pathname;

  if (pathname === '/api/check-in' && method === 'POST') {
    requireAdmin();
    const body = await parseJson(req);
    if (!body.guestId) return sendError(res, 'GUEST_ID_REQUIRED');
    // body.name: check in one party member; omitted = whole party
    // GUEST_DECLINED / NOT_IN_PARTY propagate as DomainError.
    const guest = await checkInGuest(body.guestId, body.name);
    return sendJson(res, 200, { guest });
  }

  if (pathname === '/api/check-in/undo' && method === 'POST') {
    requireAdmin();
    const body = await parseJson(req);
    if (!body.guestId) return sendError(res, 'GUEST_ID_REQUIRED');
    const guest = await undoCheckIn(body.guestId, body.name);
    return sendJson(res, 200, { guest });
  }

  if (pathname === '/api/check-in/stats' && method === 'GET') {
    requireAdmin();
    const stats = await getCheckInStats();
    return sendJson(res, 200, { stats });
  }

  // The merged day-of page identifies parties via the seating roster
  // endpoint; only the check-in action lives here. Body: { token } |
  // { code, name }, plus optional targetName / all / undo.
  if (pathname === '/api/check-in/self' && method === 'POST') {
    const body = await parseJson(req);
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
  }

  return false;
}