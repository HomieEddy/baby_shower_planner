// Event settings read (public get / admin update).

import type { RouteCtx } from '../http';
import { parseJson, sendError, sendJson } from '../http';
import { ReminderSettingsSchema } from '../../lib/validation';
import { SettingsSchema } from '../../lib/domain';
import type { EventSettings } from '../../types';
import { getSettings, updateSettings } from '../../db/service';

export async function handleSettingsRoutes(ctx: RouteCtx): Promise<boolean> {
  const { req, res, url } = ctx;
  const method = req.method || 'GET';
  const pathname = url.pathname;

  if (pathname === '/api/settings') {
    if (method === 'GET') {
      const settings = await getSettings();
      // Host contact details are admin-only; guests need event info + footer names.
      if (!ctx.adminOnly()) {
        delete (settings as Partial<EventSettings>).hostEmail;
        delete (settings as Partial<EventSettings>).hostPhone;
      }
      return sendJson(res, 200, { settings });
    }
    if (method === 'POST') {
      ctx.requireAdmin();
      const body = await parseJson(req);
      // Only the domain's own keys may reach PocketBase: the raw body used to
      // be spread straight into the update.
      const settingsKeys = new Set(Object.keys(SettingsSchema.shape));
      const unknown = Object.keys(body || {}).filter((key) => !settingsKeys.has(key));
      if (unknown.length > 0) {
        return sendError(res, 'INVALID_PAYLOAD', `Unknown setting: ${unknown[0]}`);
      }
      const reminder = ReminderSettingsSchema.partial().safeParse(body);
      if (!reminder.success) {
        return sendError(res, 'INVALID_PAYLOAD', reminder.error.issues[0]?.message);
      }
      const settings = await updateSettings({ ...body, ...reminder.data });
      return sendJson(res, 200, { success: true, settings });
    }
  }

  return false;
}