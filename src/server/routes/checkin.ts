// Check-in: admin (by guest id) and public self-service (token or code+name).

import type { RouteCtx } from '../http';
import { parseJson, sendJson } from '../http';
import { checkInGuest, getCheckInStats, selfCheckIn, undoCheckIn } from '../../db/service';

export async function handleCheckInRoutes(ctx: RouteCtx): Promise<boolean> {
  const { req, res, url, requireAdmin } = ctx;
  const method = req.method || 'GET';
  const pathname = url.pathname;

  if (pathname === '/api/check-in' && method === 'POST') {
    requireAdmin();
    const body = await parseJson(req);
    if (!body.guestId) return sendJson(res, 400, { error: 'guestId is required' });
    // body.name: check in one party member; omitted = whole party
    try {
      const guest = await checkInGuest(body.guestId, body.name);
      return sendJson(res, 200, { guest });
    } catch (err) {
      const msg = err instanceof Error ? err.message : '';
      if (msg === 'GUEST_DECLINED') return sendJson(res, 400, { error: msg, message: 'This guest declined the invitation.' });
      if (msg === 'NOT_IN_PARTY') return sendJson(res, 400, { error: msg, message: 'Name is not part of this party.' });
      throw err;
    }
  }

  if (pathname === '/api/check-in/undo' && method === 'POST') {
    requireAdmin();
    const body = await parseJson(req);
    if (!body.guestId) return sendJson(res, 400, { error: 'guestId is required' });
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
      const status = result.error === 'ONLY_LEAD' ? 403 : result.error === 'NOT_IN_PARTY' || result.error === 'DECLINED' ? 400 : 404;
      return sendJson(res, status, { error: result.error });
    }
    return sendJson(res, 200, { guest: result.guest });
  }

  return false;
}