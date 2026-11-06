// Event alerts: list, create (with fan-out), test send, delete.

import { sendError, sendJson } from '../http';
import type { RouteCtx } from '../http';
import { handleRoutes, type Route } from '../route';
import { createAlert, deleteAlert, getAlerts, sendTestAlert } from '../../db/service';
import { isValidEmail } from '../../lib/validation';
import { toE164 } from '../../lib/sms';

const CHANNELS = ['email', 'text', 'both'] as const;
const AUDIENCES = ['ALL', 'PENDING', 'ATTENDING', 'SELECTED'] as const;

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
      const { type, title, message, target_audience, channel, guest_ids } = body;
      if (!title || !message) return sendError(res, 'INVALID_PAYLOAD', 'Title and message are required');
      if (channel !== undefined && !CHANNELS.includes(channel)) return sendError(res, 'INVALID_CHANNEL');
      if (target_audience !== undefined && !AUDIENCES.includes(target_audience)) {
        return sendError(res, 'INVALID_PAYLOAD', 'Invalid audience');
      }
      const ids = guest_ids ?? [];
      if (!Array.isArray(ids) || !ids.every((id) => typeof id === 'string')) {
        return sendError(res, 'INVALID_PAYLOAD', 'guest_ids must be a list of ids');
      }
      if (target_audience === 'SELECTED' && ids.length === 0) {
        return sendError(res, 'INVALID_PAYLOAD', 'Select at least one guest');
      }
      const result = await createAlert({
        type: type || 'CUSTOM', title, message,
        target_audience, channel, guest_ids: ids,
      });
      return sendJson(res, 200, { success: true, alert: result.alert, notified_count: result.notified_count });
    },
  },

  {
    method: 'POST',
    path: '/api/alerts/test',
    admin: true,
    body: true,
    handler: async ({ body }, { res }) => {
      const { channel, to, title, message, language } = body;
      if (channel !== 'email' && channel !== 'text') return sendError(res, 'INVALID_CHANNEL');
      if (!title || !message) return sendError(res, 'INVALID_PAYLOAD', 'Title and message are required');
      const address = typeof to === 'string' ? to.trim() : '';
      if (channel === 'email' && !isValidEmail(address)) return sendError(res, 'INVALID_EMAIL');
      if (channel === 'text' && !toE164(address)) return sendError(res, 'INVALID_PHONE');
      const sent = await sendTestAlert({ channel, to: address, title, message, language });
      if (!sent) return sendError(res, 'TEST_SEND_FAILED');
      return sendJson(res, 200, { success: true, sent: true });
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
