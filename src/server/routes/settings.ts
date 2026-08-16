// Event settings read (public get / admin update).

import type { RouteCtx } from '../http';
import { parseJson, sendJson } from '../http';
import { ReminderSettingsSchema } from '../../lib/validation';
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
      const reminder = ReminderSettingsSchema.partial().safeParse(body);
      if (!reminder.success) {
        return sendJson(res, 400, { error: reminder.error.issues[0]?.message || 'Invalid settings payload' });
      }
      const settings = await updateSettings({ ...body, ...reminder.data });
      return sendJson(res, 200, { success: true, settings });
    }
  }

  return false;
}