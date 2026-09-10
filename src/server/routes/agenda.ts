// Host agenda/planner: task CRUD, kanban reorder, test-reminder.

import type { RouteCtx } from '../http';
import { parseJson, sendJson } from '../http';
import { AgendaReorderSchema, AgendaTaskSchema } from '../../lib/validation';
import { composeAgenda } from '../../lib/compose';
import type { AgendaTask } from '../../types';
import {
  addAgendaTask,
  deleteAgendaTask,
  getAgendaTasks,
  getSettings,
  reorderAgendaTasks,
  updateAgendaTask,
} from '../../db/service';

export async function handleAgendaRoutes(ctx: RouteCtx): Promise<boolean> {
  const { req, res, url, requireAdmin } = ctx;
  const method = req.method || 'GET';
  const pathname = url.pathname;

  if (pathname === '/api/agenda') {
    requireAdmin();
    if (method === 'GET') {
      const tasks = await getAgendaTasks();
      return sendJson(res, 200, { tasks });
    }
    if (method === 'POST') {
      const body = await parseJson(req);
      const validation = AgendaTaskSchema.safeParse(body);
      if (!validation.success) {
        return sendJson(res, 400, { error: validation.error.issues[0]?.message || 'Invalid task payload' });
      }
      const task = await addAgendaTask(validation.data);
      return sendJson(res, 200, { success: true, task });
    }
  }

  if (pathname === '/api/agenda/reorder' && method === 'POST') {
    requireAdmin();
    const body = await parseJson(req);
    const validation = AgendaReorderSchema.safeParse(body.items);
    if (!validation.success) {
      return sendJson(res, 400, { error: 'Invalid reorder payload' });
    }
    await reorderAgendaTasks(validation.data);
    return sendJson(res, 200, { success: true });
  }

  if (pathname === '/api/agenda/test-reminder' && method === 'POST') {
    requireAdmin();
    const settings = await getSettings();
    const channels = settings.reminderChannels ?? { email: false, sms: false };
    const sampleTask: AgendaTask = {
      id: 'test', title: settings.language === 'FR' ? 'Rappel test' : 'Test reminder',
      due_date: settings.date || '', due_time: undefined,
      status: 'todo', position: 0, reminder_sent: false, created_at: '',
    };
    const results: Record<string, boolean> = {};
    const content = composeAgenda(settings, sampleTask);
    if (channels.email && settings.hostEmail) {
      const { sendEmail } = await import('../../lib/email');
      results.email = await sendEmail(settings.hostEmail, content);
    }
    if (channels.sms && settings.hostPhone) {
      const { sendSms } = await import('../../lib/sms');
      results.sms = await sendSms(settings.hostPhone, content);
    }
    return sendJson(res, 200, { success: true, results });
  }

  if (pathname.startsWith('/api/agenda/')) {
    requireAdmin();
    const id = pathname.replace('/api/agenda/', '');
    if (method === 'PATCH') {
      const body = await parseJson(req);
      const validation = AgendaTaskSchema.partial().safeParse(body);
      if (!validation.success) {
        return sendJson(res, 400, { error: validation.error.issues[0]?.message || 'Invalid task payload' });
      }
      const task = await updateAgendaTask(id, validation.data);
      return sendJson(res, 200, { success: true, task });
    }
    if (method === 'DELETE') {
      await deleteAgendaTask(id);
      return sendJson(res, 200, { success: true });
    }
  }

  return false;
}