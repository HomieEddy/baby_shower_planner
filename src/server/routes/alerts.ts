// Event alerts: list, create (with fan-out), delete.

import { sendError, sendJson } from '../http';
import type { RouteCtx } from '../http';
import { handleRoutes, type Route } from '../route';
import { createAlert, deleteAlert, getAlerts } from '../../db/service';

const ROUTES: Route[] = [
  {
    method: 'GET',
    path: '/api/alerts',
    handler: async (_req, { res }) => sendJson(res, 200, { alerts: await getAlerts() }),
  },

  {
    method: 'POST',
    path: '/api/alerts',
    admin: true,
    body: true,
    handler: async ({ body }, { res }) => {
      const { type, title, message, target_audience } = body;
      if (!title || !message) return sendError(res, 'INVALID_PAYLOAD', 'Title and message are required');
      const result = await createAlert({ type: type || 'CUSTOM', title, message, target_audience });
      return sendJson(res, 200, { success: true, alert: result.alert, notified_count: result.notified_count });
    },
  },

  {
    method: 'DELETE',
    path: /^\/api\/alerts\/([^/]+)$/,
    admin: true,
    handler: async ({ params }, { res }) => {
      const remaining = await deleteAlert(params[0]);
      return sendJson(res, 200, { success: true, alerts: remaining });
    },
  },
];

export const handleAlertRoutes = (ctx: RouteCtx): Promise<boolean> => handleRoutes(ROUTES, ctx);
