// One-liner system endpoints: health, delivery capabilities, invitation
// broadcasting and the admin data wipe.

import type { RouteCtx } from '../http';
import { parseJson, sendJson } from '../http';
import {
  getRehearsalStatus,
  providerAvailability,
  sendInvitations,
  sendReminders,
  startRehearsal,
  stopRehearsal,
  wipeDatabaseData,
} from '../../db/service';

export async function handleSystemRoutes(ctx: RouteCtx): Promise<boolean> {
  const { req, res, url, requireAdmin } = ctx;
  const method = req.method || 'GET';
  const pathname = url.pathname;

  if (pathname === '/api/health' && method === 'GET') {
    return sendJson(res, 200, { status: 'ok', engine: 'Native Node HTTP + PocketBase SDK', time: new Date().toISOString() });
  }

  // Delivery provider availability — the UI hides channels that can't send.
  if (pathname === '/api/capabilities' && method === 'GET') {
    return sendJson(res, 200, providerAvailability());
  }

  if (pathname === '/api/send-invitations' && method === 'POST') {
    requireAdmin();
    const body = await parseJson(req).catch(() => ({}));
    const result = await sendInvitations(Array.isArray(body.guestIds) ? body.guestIds : undefined);
    return sendJson(res, 200, result);
  }

  if (pathname === '/api/send-reminders' && method === 'POST') {
    requireAdmin();
    const result = await sendReminders();
    return sendJson(res, 200, result);
  }

  if (pathname === '/api/wipe-data' && method === 'POST') {
    requireAdmin();
    const data = await wipeDatabaseData();
    return sendJson(res, 200, { success: true, data });
  }

  // Rehearsal mode: seed disposable demo data, then remove only what it created.
  if (pathname === '/api/rehearsal' && method === 'GET') {
    return sendJson(res, 200, getRehearsalStatus());
  }

  if (pathname === '/api/rehearsal/start' && method === 'POST') {
    requireAdmin();
    const result = await startRehearsal();
    return sendJson(res, 200, result);
  }

  if (pathname === '/api/rehearsal/stop' && method === 'POST') {
    requireAdmin();
    const result = await stopRehearsal();
    return sendJson(res, 200, result);
  }

  return false;
}