// Event alerts CRUD (public read, admin create/delete).

import type { RouteCtx } from '../http';
import { parseJson, sendJson } from '../http';
import { createAlert, deleteAlert, getAlerts } from '../../db/service';

export async function handleAlertRoutes(ctx: RouteCtx): Promise<boolean> {
  const { req, res, url } = ctx;
  const method = req.method || 'GET';
  const pathname = url.pathname;

  if (pathname === '/api/alerts') {
    if (method === 'GET') {
      const alerts = await getAlerts();
      return sendJson(res, 200, { alerts });
    }
    if (method === 'POST') {
      ctx.requireAdmin();
      const body = await parseJson(req);
      const { type, title, message, target_audience } = body;
      if (!title || !message) return sendJson(res, 400, { error: 'Title and message are required' });
      const result = await createAlert({ type: type || 'CUSTOM', title, message, target_audience });
      return sendJson(res, 200, { success: true, alert: result.alert, notified_count: result.notified_count });
    }
  }

  if (pathname.startsWith('/api/alerts/') && method === 'DELETE') {
    ctx.requireAdmin();
    const id = pathname.replace('/api/alerts/', '');
    const remaining = await deleteAlert(id);
    return sendJson(res, 200, { success: true, alerts: remaining });
  }

  return false;
}