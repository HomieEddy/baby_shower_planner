// One-liner system endpoints: health, delivery capabilities, invitation
// broadcasting and the admin data wipe.

import { sendJson } from '../http';
import type { RouteCtx } from '../http';
import { handleRoutes, type Route } from '../route';
import {
  getRehearsalStatus,
  providerAvailability,
  sendInvitations,
  sendReminders,
  startRehearsal,
  stopRehearsal,
  wipeDatabaseData,
} from '../../db/service';

const ROUTES: Route[] = [
  {
    method: 'GET',
    path: '/api/health',
    handler: (_req, { res }) =>
      sendJson(res, 200, { status: 'ok', engine: 'Native Node HTTP + PocketBase SDK', time: new Date().toISOString() }),
  },

  // Delivery provider availability — the UI hides channels that can't send.
  {
    method: 'GET',
    path: '/api/capabilities',
    handler: (_req, { res }) => sendJson(res, 200, providerAvailability()),
  },

  {
    method: 'POST',
    path: '/api/send-invitations',
    admin: true,
    body: true,
    handler: async ({ body }, { res }) => {
      const result = await sendInvitations(Array.isArray(body.guestIds) ? body.guestIds : undefined);
      return sendJson(res, 200, result);
    },
  },

  {
    method: 'POST',
    path: '/api/send-reminders',
    admin: true,
    handler: async (_req, { res }) => sendJson(res, 200, await sendReminders()),
  },

  {
    method: 'POST',
    path: '/api/wipe-data',
    admin: true,
    handler: async (_req, { res }) => sendJson(res, 200, { success: true, data: await wipeDatabaseData() }),
  },

  // Rehearsal mode: seed disposable demo data, then remove only what it created.
  {
    method: 'GET',
    path: '/api/rehearsal',
    handler: (_req, { res }) => sendJson(res, 200, getRehearsalStatus()),
  },
  {
    method: 'POST',
    path: '/api/rehearsal/start',
    admin: true,
    handler: async (_req, { res }) => sendJson(res, 200, await startRehearsal()),
  },
  {
    method: 'POST',
    path: '/api/rehearsal/stop',
    admin: true,
    handler: async (_req, { res }) => sendJson(res, 200, await stopRehearsal()),
  },
];

export const handleSystemRoutes = (ctx: RouteCtx): Promise<boolean> => handleRoutes(ROUTES, ctx);
