// Host agenda (task planner): CRUD, kanban reorder and the reminder sweep.

import type { AgendaTask, AgendaStatus, EventSettings } from '../types';
import { isInReminderWindow, taskDueAt, REMINDER_ADVANCE_MS } from '../lib/dateUtils';
import { fromRecord, pb } from './client';
import { getSettings } from './settings';

export async function getAgendaTasks(): Promise<AgendaTask[]> {
  const records = await pb.collection('agenda_tasks').getFullList({ sort: 'status,position,created_at' });
  return records.map(r => fromRecord<AgendaTask>(r));
}

export async function addAgendaTask(payload: Omit<AgendaTask, 'id' | 'created_at' | 'reminder_sent' | 'position'>): Promise<AgendaTask> {
  const column = await pb.collection('agenda_tasks').getFullList({ filter: `status="${payload.status}"` });
  const r = await pb.collection('agenda_tasks').create({
    title: payload.title, description: payload.description || '',
    due_date: payload.due_date || '', due_time: payload.due_time || '',
    status: payload.status, position: column.length,
    reminder_sent: false, created_at: new Date().toISOString(),
  });
  return fromRecord<AgendaTask>(r);
}

export async function updateAgendaTask(id: string, updates: Partial<AgendaTask>): Promise<AgendaTask> {
  const patch: Record<string, unknown> = {
    title: updates.title,
    description: updates.description ?? '',
    due_date: updates.due_date || '',
    due_time: updates.due_time || '',
    status: updates.status,
  };
  // A rescheduled task may be due again — allow its reminder to fire once more.
  if ('due_date' in updates || 'due_time' in updates) {
    patch.reminder_sent = false;
  }
  const r = await pb.collection('agenda_tasks').update(id, patch);
  return fromRecord<AgendaTask>(r);
}

export async function deleteAgendaTask(id: string): Promise<void> {
  await pb.collection('agenda_tasks').delete(id);
}

// Kanban drag outcome: the moved task plus every task whose position shifted
// in the target column. One request, applied per-item (list is small).
export async function reorderAgendaTasks(items: Array<{ id: string; status: AgendaStatus; position: number }>): Promise<void> {
  for (const item of items) {
    await pb.collection('agenda_tasks').update(item.id, { status: item.status, position: item.position });
  }
}

// Dated, unfinished tasks whose reminder window is open right now.
export async function getTasksDueForReminder(now: number, advanceMs: number): Promise<AgendaTask[]> {
  const records = await pb.collection('agenda_tasks').getFullList({
    filter: 'status!="done" && reminder_sent=false && due_date!=""',
  });
  return records
    .map(r => fromRecord<AgendaTask>(r))
    .filter(t => t.due_date && isInReminderWindow(taskDueAt(t.due_date, t.due_time), advanceMs, now));
}

export async function markAgendaTaskReminded(id: string): Promise<void> {
  await pb.collection('agenda_tasks').update(id, { reminder_sent: true });
}

// One sweep: every dated, unfinished, unsent task inside the reminder window
// gets delivered on the host's enabled channels. Skipped entirely when no
// channel is configured or no contact exists.
export async function runAgendaReminderSweep(now: Date = new Date()): Promise<{ reminded: number; failed: number }> {
  let settings: EventSettings;
  try {
    settings = await getSettings();
  } catch {
    return { reminded: 0, failed: 0 }; // no settings — nothing to send to
  }
  const channels = settings.reminderChannels ?? { email: false, sms: false };
  if ((!channels.email && !channels.sms) || (channels.email && !settings.hostEmail) || (channels.sms && !settings.hostPhone)) {
    return { reminded: 0, failed: 0 };
  }
  const advanceMs = REMINDER_ADVANCE_MS[settings.reminderAdvance || '1d'];
  const due = await getTasksDueForReminder(now.getTime(), advanceMs);
  let reminded = 0, failed = 0;
  for (const task of due) {
    let ok = true;
    if (channels.email && settings.hostEmail) {
      const { sendAgendaReminderEmail } = await import('../lib/email');
      ok = await sendAgendaReminderEmail(settings.hostEmail, task, settings) && ok;
    }
    if (channels.sms && settings.hostPhone) {
      const { sendAgendaReminderSms } = await import('../lib/sms');
      ok = await sendAgendaReminderSms(settings.hostPhone, task, settings) && ok;
    }
    if (ok) {
      await markAgendaTaskReminded(task.id);
      reminded++;
    } else {
      failed++;
    }
  }
  return { reminded, failed };
}