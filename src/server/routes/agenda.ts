// Host agenda/planner: task CRUD, kanban reorder, test-reminder.

import { sendError, sendJson } from '../http';
import type { RouteCtx } from '../http';
import { handleRoutes, parseOrFail, type Route } from '../route';
import { AgendaReorderSchema, AgendaTaskSchema } from '../../lib/validation';
import { composeAgenda } from '../../lib/compose';
import type { AgendaTask } from '../../types';
import {
  addAgendaTask,
  deleteAgendaTask,
  getAgendaTasks,
  getSettings,
  providerAvailability,
  requireProvider,
  reorderAgendaTasks,
  updateAgendaTask,
} from '../../db/service';

const ROUTES: Route[] = [
  {
    method: 'GET',
    path: '/api/agenda',
    admin: true,
    handler: async (_req, { res }) => sendJson(res, 200, { tasks: await getAgendaTasks() }),
  },

  {
    method: 'POST',
    path: '/api/agenda',
    admin: true,
    body: true,
    handler: async ({ body }, { res }) => {
      const data = parseOrFail(AgendaTaskSchema, body, res);
      if (!data) return true;
      return sendJson(res, 200, { success: true, task: await addAgendaTask(data) });
    },
  },

  {
    method: 'POST',
    path: '/api/agenda/reorder',
    admin: true,
    body: true,
    handler: async ({ body }, { res }) => {
      const validation = AgendaReorderSchema.safeParse(body.items);
      if (!validation.success) {
        return sendError(res, 'INVALID_PAYLOAD', 'Invalid reorder payload');
      }
      await reorderAgendaTasks(validation.data);
      return sendJson(res, 200, { success: true });
    },
  },

  {
    method: 'POST',
    path: '/api/agenda/test-reminder',
    admin: true,
    handler: async (_req, { res }) => {
      const settings = await getSettings();
      const channels = settings.reminderChannels ?? { email: false, sms: false };
      const sampleTask: AgendaTask = {
        id: 'test', title: settings.language === 'FR' ? 'Rappel test' : 'Test reminder',
        due_date: settings.date || '', due_time: undefined,
        status: 'todo', position: 0, reminder_sent: false, created_at: '',
      };
      const providers = providerAvailability();
      // Block the test when a requested channel has no provider configured.
      const requested: Array<'email' | 'text'> = [];
      if (channels.email && settings.hostEmail) requested.push('email');
      if (channels.sms && settings.hostPhone) requested.push('text');
      if (requested.length > 0) requireProvider(requested);

      const results: Record<string, boolean> = {};
      const content = composeAgenda(settings, sampleTask);
      if (channels.email && providers.email && settings.hostEmail) {
        const { sendEmail } = await import('../../lib/email');
        results.email = await sendEmail(settings.hostEmail, content);
      }
      if (channels.sms && providers.sms && settings.hostPhone) {
        const { sendSms } = await import('../../lib/sms');
        results.sms = await sendSms(settings.hostPhone, content);
      }
      return sendJson(res, 200, { success: true, results });
    },
  },

  {
    method: 'PATCH',
    path: /^\/api\/agenda\/([^/]+)$/,
    admin: true,
    body: true,
    handler: async ({ body, params }, { res }) => {
      const data = parseOrFail(AgendaTaskSchema.partial(), body, res);
      if (!data) return true;
      return sendJson(res, 200, { success: true, task: await updateAgendaTask(params[0], data) });
    },
  },

  {
    method: 'DELETE',
    path: /^\/api\/agenda\/([^/]+)$/,
    admin: true,
    handler: async ({ params }, { res }) => {
      await deleteAgendaTask(params[0]);
      return sendJson(res, 200, { success: true });
    },
  },
];

export const handleAgendaRoutes = (ctx: RouteCtx): Promise<boolean> => handleRoutes(ROUTES, ctx);
