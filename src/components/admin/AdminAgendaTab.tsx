import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'motion/react';
import {
  Plus,
  CalendarDays,
  SquareKanban,
  Bell,
  Mail,
  MessageSquare,
  Send,
} from 'lucide-react';
import { AgendaStatus, AgendaTask, EventSettings, Language } from '../../types';
import { Translations } from '../../translations';
import { adminFetch } from '../../lib/api';
import { useToast } from '../shared/ToastContext';
import { useConfirm } from '../shared/ConfirmDialog';
import { adminContainerVariants, adminCardVariants } from '../shared/motionPresets';
import { AgendaCalendar } from './AgendaCalendar';
import { AgendaKanban } from './AgendaKanban';
import { AgendaTaskModal } from './AgendaTaskModal';

interface AdminAgendaTabProps {
  language: Language;
  t: Translations;
  settings?: EventSettings | null;
  onSaveSettings: (data: Partial<EventSettings>) => Promise<EventSettings>;
}

type ModalState = { mode: 'create'; preseedDate?: string } | { mode: 'edit'; task: AgendaTask } | null;

const ADVANCE_OPTIONS = ['1h', '6h', '1d', '2d', '1w'] as const;

const advanceLabel = (t: Translations, advance: string): string => {
  switch (advance) {
    case '1h': return t.agendaAdvance1h;
    case '6h': return t.agendaAdvance6h;
    case '1d': return t.agendaAdvance1d;
    case '2d': return t.agendaAdvance2d;
    case '1w': return t.agendaAdvance1w;
    default: return t.agendaAdvance1d;
  }
};

export const AdminAgendaTab: React.FC<AdminAgendaTabProps> = ({ language, t, settings, onSaveSettings }) => {
  const { toast } = useToast();
  const confirm = useConfirm();
  const queryClient = useQueryClient();

  const [view, setView] = useState<'calendar' | 'kanban'>('kanban');
  const [modal, setModal] = useState<ModalState>(null);
  const [caps, setCaps] = useState<{ email: boolean; sms: boolean } | null>(null);

  useEffect(() => {
    fetch('/api/capabilities')
      .then((r) => r.json())
      .then((data) => setCaps(data))
      .catch(() => setCaps({ email: false, sms: false }));
  }, []);

  const tasksQuery = useQuery({
    queryKey: ['agenda-tasks'],
    queryFn: async () => {
      const res = await adminFetch('/api/agenda');
      const data = await res.json();
      return (data.tasks ?? []) as AgendaTask[];
    },
  });
  const tasks = tasksQuery.data ?? [];

  const refreshTasks = async () => {
    await queryClient.invalidateQueries({ queryKey: ['agenda-tasks'] });
  };

  // ─── Reminder settings form ────────────────────────────────────
  // Form state is derived from settings; when the saved settings change
  // (another tab or this panel), re-sync during render (React's documented
  // pattern for adjusting state when props change — avoids an effect).
  const fromSettings = (s?: EventSettings | null) => ({
    emailOn: s?.reminderChannels?.email ?? false,
    smsOn: s?.reminderChannels?.sms ?? false,
    advance: s?.reminderAdvance ?? '1d',
    hostEmail: s?.hostEmail ?? '',
    hostPhone: s?.hostPhone ?? '',
    hostLang: s?.language ?? ('EN' as Language),
  });
  const [reminderForm, setReminderForm] = useState(fromSettings(settings));
  const [lastSettings, setLastSettings] = useState(settings);
  if (settings !== lastSettings) {
    setLastSettings(settings);
    setReminderForm(fromSettings(settings));
  }
  const { emailOn, smsOn, advance, hostEmail, hostPhone, hostLang } = reminderForm;
  const [savingReminders, setSavingReminders] = useState(false);
  const [testingReminder, setTestingReminder] = useState(false);

  const channelConfigured = (emailOn && hostEmail.trim()) || (smsOn && hostPhone.trim());

  const handleSaveReminders = async () => {
    try {
      setSavingReminders(true);
      await onSaveSettings({
        hostEmail: hostEmail.trim(),
        hostPhone: hostPhone.trim(),
        reminderChannels: { email: emailOn, sms: smsOn },
        reminderAdvance: advance,
        language: hostLang,
      });
      toast.success(t.agendaReminderSavedToast);
    } catch {
      toast.error(t.agendaReminderTestFail);
    } finally {
      setSavingReminders(false);
    }
  };

  const handleTestReminder = async () => {
    try {
      setTestingReminder(true);
      const res = await adminFetch('/api/agenda/test-reminder', { method: 'POST' });
      const data = await res.json();
      if (data.success) toast.success(t.agendaReminderTestSent);
      else toast.error(t.agendaReminderTestFail);
    } catch {
      toast.error(t.agendaReminderTestFail);
    } finally {
      setTestingReminder(false);
    }
  };

  // ─── Task mutations ────────────────────────────────────────────
  const handleSaveTask = async (payload: {
    title: string;
    description?: string;
    due_date?: string;
    due_time?: string;
    status: AgendaStatus;
  }) => {
    const isEdit = modal?.mode === 'edit';
    const url = isEdit ? `/api/agenda/${modal!.task.id}` : '/api/agenda';
    const res = await adminFetch(url, {
      method: isEdit ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || !data.success) {
      throw new Error(data.error || 'Failed to save task');
    }
    setModal(null);
    toast.success(t.agendaTaskSavedToast);
    await refreshTasks();
  };

  const handleDeleteTask = async (task: AgendaTask) => {
    const ok = await confirm({
      title: t.agendaDeleteConfirmTitle,
      message: t.agendaDeleteConfirmMsg,
      confirmText: t.agendaDeleteBtn,
    });
    if (!ok) return;
    await adminFetch(`/api/agenda/${task.id}`, { method: 'DELETE' });
    setModal(null);
    toast.success(t.agendaTaskDeletedToast);
    await refreshTasks();
  };

  // Optimistic kanban reorder: apply locally, persist, refetch on failure.
  const handleReorder = async (items: Array<{ id: string; status: AgendaStatus; position: number }>) => {
    queryClient.setQueryData<AgendaTask[]>(['agenda-tasks'], (prev) =>
      (prev ?? []).map((task) => {
        const change = items.find((i) => i.id === task.id);
        return change ? { ...task, status: change.status, position: change.position } : task;
      })
    );
    try {
      const res = await adminFetch('/api/agenda/reorder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      if (!res.ok) throw new Error('reorder failed');
      await refreshTasks();
    } catch {
      await refreshTasks();
    }
  };

  const inputCls = 'w-full px-4 py-2.5 rounded-2xl border-2 border-[#CBAE94] text-xs font-bold text-[#5D5449] focus:outline-none focus:ring-2 focus:ring-[#8B735B] bg-white';
  const toggleCls = (on: boolean) =>
    `px-4 py-2.5 rounded-2xl border-2 text-xs font-bold transition-colors cursor-pointer flex items-center gap-2 ${
      on ? 'border-[#8B735B] bg-[#EFE6DC] text-[#8B735B]' : 'border-[#CBAE94]/50 bg-white text-[#5D5449] hover:bg-[#EFE6DC]/40'
    }`;

  const mock = caps && ((!caps.email && emailOn) || (!caps.sms && smsOn));

  return (
    <motion.div key="agenda" variants={adminContainerVariants} initial="hidden" animate="show" className="space-y-8">
      {/* Header + view switcher */}
      <motion.div variants={adminCardVariants} className="card-paper p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="label-mono mb-1">{t.tabAgenda}</div>
          <h3 className="font-sans text-2xl font-bold text-[#8B735B] flex items-center gap-2">
            <CalendarDays className="w-6 h-6" />
            {t.tabAgenda}
          </h3>
          <p className="text-xs text-[#5D5449] mt-1">{t.agendaReminderPanelDesc}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex rounded-2xl border-2 border-[#CBAE94]/60 p-1 bg-white">
            <button
              type="button"
              onClick={() => setView('kanban')}
              className={`px-4 py-2 rounded-xl text-xs font-bold font-mono transition-colors cursor-pointer flex items-center gap-1.5 ${
                view === 'kanban' ? 'bg-[#8B735B] text-white' : 'text-[#5D5449] hover:bg-[#EFE6DC]'
              }`}
            >
              <SquareKanban className="w-3.5 h-3.5" />
              {t.agendaKanbanView}
            </button>
            <button
              type="button"
              onClick={() => setView('calendar')}
              className={`px-4 py-2 rounded-xl text-xs font-bold font-mono transition-colors cursor-pointer flex items-center gap-1.5 ${
                view === 'calendar' ? 'bg-[#8B735B] text-white' : 'text-[#5D5449] hover:bg-[#EFE6DC]'
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5" />
              {t.agendaCalendarView}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setModal({ mode: 'create' })}
            className="btn-accent px-5 py-2.5 text-xs flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            {t.agendaAddTaskBtn}
          </button>
        </div>
      </motion.div>

      {/* Board / calendar */}
      <motion.div variants={adminCardVariants} className="card-paper p-4 sm:p-6">
        {view === 'kanban' ? (
          <AgendaKanban tasks={tasks} t={t} language={language} onOpenTask={(task) => setModal({ mode: 'edit', task })} onReorder={handleReorder} />
        ) : (
          <AgendaCalendar
            tasks={tasks}
            t={t}
            language={language}
            onAddTask={(preseedDate) => setModal({ mode: 'create', preseedDate })}
            onOpenTask={(task) => setModal({ mode: 'edit', task })}
          />
        )}
      </motion.div>

      {/* Reminder settings */}
      <motion.div variants={adminCardVariants} className="card-paper p-6 sm:p-8 space-y-5">
        <div className="flex items-center gap-3 border-b border-[#CBAE94]/40 pb-4">
          <div className="p-3 bg-[#EFE6DC] text-[#8B735B] rounded-2xl border border-[#CBAE94]/50">
            <Bell className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-sans text-xl font-bold text-[#8B735B]">{t.agendaReminderPanelTitle}</h3>
            <p className="text-xs text-[#5D5449]">{t.agendaReminderPanelDesc}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button type="button" onClick={() => setReminderForm((f) => ({ ...f, emailOn: !f.emailOn }))} className={toggleCls(emailOn)}>
            <Mail className="w-4 h-4" />
            {t.agendaReminderEmailLabel}
            {caps?.email ? null : <span className="ml-auto text-[9px] font-mono text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">MOCK</span>}
          </button>
          <button type="button" onClick={() => setReminderForm((f) => ({ ...f, smsOn: !f.smsOn }))} className={toggleCls(smsOn)}>
            <MessageSquare className="w-4 h-4" />
            {t.agendaReminderSmsLabel}
            {caps?.sms ? null : <span className="ml-auto text-[9px] font-mono text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">MOCK</span>}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label-mono block mb-1">{t.agendaReminderHostEmailLabel}</label>
            <input type="email" value={hostEmail} onChange={(e) => setReminderForm((f) => ({ ...f, hostEmail: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className="label-mono block mb-1">{t.agendaReminderHostPhoneLabel}</label>
            <input type="tel" value={hostPhone} onChange={(e) => setReminderForm((f) => ({ ...f, hostPhone: e.target.value }))} className={inputCls} />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label-mono block mb-1">{t.agendaReminderAdvanceLabel}</label>
            <select value={advance} onChange={(e) => setReminderForm((f) => ({ ...f, advance: e.target.value }))} className={inputCls}>
              {ADVANCE_OPTIONS.map((opt) => (
                <option key={opt} value={opt}>{advanceLabel(t, opt)}</option>
              ))}
            </select>
            <p className="text-[11px] text-[#8B735B] font-mono mt-1">{t.agendaReminderWindowLabel}</p>
          </div>
          <div>
            <label className="label-mono block mb-1">{t.agendaReminderLangLabel}</label>
            <select value={hostLang} onChange={(e) => setReminderForm((f) => ({ ...f, hostLang: e.target.value as Language }))} className={inputCls}>
              <option value="EN">English</option>
              <option value="FR">Français</option>
            </select>
          </div>
        </div>

        {mock && <p className="text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 font-mono">{t.agendaMockHint}</p>}

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 pt-1 border-t border-[#CBAE94]/30">
          <button
            type="button"
            onClick={handleSaveReminders}
            disabled={savingReminders}
            className="btn-accent px-6 py-2.5 text-xs disabled:opacity-50"
          >
            {t.agendaReminderSaveBtn}
          </button>
          <button
            type="button"
            onClick={handleTestReminder}
            disabled={testingReminder || !channelConfigured}
            title={channelConfigured ? undefined : t.agendaReminderTestUnconfigured}
            className="btn-outline-accent px-6 py-2.5 text-xs disabled:opacity-40 flex items-center gap-2"
          >
            <Send className="w-3.5 h-3.5" />
            {t.agendaReminderTestBtn}
          </button>
          {!channelConfigured && (
            <span className="text-[11px] text-[#A09080] font-mono">{t.agendaReminderTestUnconfigured}</span>
          )}
        </div>
      </motion.div>

      <AgendaTaskModal
        open={!!modal}
        task={modal?.mode === 'edit' ? modal.task : null}
        preseedDate={modal?.mode === 'create' ? modal.preseedDate : undefined}
        t={t}
        onClose={() => setModal(null)}
        onSave={handleSaveTask}
        onDelete={handleDeleteTask}
      />
    </motion.div>
  );
};
