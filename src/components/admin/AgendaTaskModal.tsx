import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { AgendaTaskSchema } from '../../lib/validation';
import { AgendaStatus, AgendaTask } from '../../types';
import { Translations } from '../../translations';
import { Modal } from '../shared/Modal';

type TaskFormValues = z.infer<typeof AgendaTaskSchema>;

interface AgendaTaskModalProps {
  open: boolean;
  /** null/undefined = create mode */
  task?: AgendaTask | null;
  /** YYYY-MM-DD prefill (calendar day click) */
  preseedDate?: string;
  t: Translations;
  onClose: () => void;
  onSave: (payload: {
    title: string;
    description?: string;
    due_date?: string;
    due_time?: string;
    status: AgendaStatus;
  }) => Promise<void>;
  onDelete: (task: AgendaTask) => void;
}

const statusLabel = (t: Translations, status: AgendaStatus): string => {
  switch (status) {
    case 'todo': return t.agendaColumnTodo;
    case 'in_progress': return t.agendaColumnInProgress;
    default: return t.agendaColumnDone;
  }
};

export const AgendaTaskModal: React.FC<AgendaTaskModalProps> = ({ open, task, preseedDate, t, onClose, onSave, onDelete }) => {
  const { register, handleSubmit, reset, formState: { errors, isSubmitting } } = useForm<TaskFormValues>({
    resolver: zodResolver(AgendaTaskSchema),
    defaultValues: { title: '', description: '', due_date: '', due_time: '', status: 'todo' },
  });

  useEffect(() => {
    if (open) {
      reset({
        title: task?.title ?? '',
        description: task?.description ?? '',
        due_date: task?.due_date ?? preseedDate ?? '',
        due_time: task?.due_time ?? '',
        status: task?.status ?? 'todo',
      });
    }
  }, [open, task, preseedDate, reset]);

  const inputCls = 'w-full px-4 py-2.5 rounded-2xl border-2 border-[#CBAE94] text-xs font-bold text-[#5D5449] focus:outline-none focus:ring-2 focus:ring-[#8B735B] bg-white';
  const labelCls = 'label-mono block mb-1';

  return (
    <Modal
      open={open}
      onClose={onClose}
      maxWidth="md"
      title={
        <div className="flex items-center gap-2">
          <h3 className="font-sans text-xl font-bold text-[#8B735B]">
            {task ? t.agendaEditTaskTitle : t.agendaNewTaskTitle}
          </h3>
        </div>
      }
      footer={
        <div className="flex items-center justify-between gap-3">
          {task ? (
            <button
              type="button"
              onClick={() => onDelete(task)}
              className="px-4 py-2.5 rounded-2xl border-2 border-rose-300 text-rose-700 text-xs font-bold hover:bg-rose-50 transition-colors cursor-pointer"
            >
              {t.agendaDeleteBtn}
            </button>
          ) : <span />}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-2xl border-2 border-[#CBAE94] text-[#5D5449] text-xs font-bold hover:bg-[#EFE6DC] transition-colors cursor-pointer"
            >
              {t.cancelBtn}
            </button>
            <button
              type="submit"
              form="agenda-task-form"
              disabled={isSubmitting}
              className="btn-accent px-6 py-2.5 text-xs disabled:opacity-50"
            >
              {t.agendaTaskModalSave}
            </button>
          </div>
        </div>
      }
    >
      <form id="agenda-task-form" onSubmit={handleSubmit(async (values) => {
        await onSave({
          title: values.title,
          description: values.description || undefined,
          due_date: values.due_date || undefined,
          due_time: values.due_time || undefined,
          status: values.status,
        });
      })} className="space-y-4">
        <div>
          <label className={labelCls}>{t.agendaTaskTitleLabel}</label>
          <input
            type="text"
            {...register('title')}
            placeholder={t.agendaTitlePh}
            className={inputCls}
          />
          {errors.title && <p className="text-[11px] text-rose-600 mt-1">{errors.title.message}</p>}
        </div>

        <div>
          <label className={labelCls}>{t.agendaTaskDescLabel}</label>
          <textarea
            rows={3}
            {...register('description')}
            placeholder={t.agendaDescPh}
            className={`${inputCls} resize-none`}
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>{t.agendaTaskDueDateLabel}</label>
            <input type="date" {...register('due_date')} className={inputCls} />
            {errors.due_date && <p className="text-[11px] text-rose-600 mt-1">{errors.due_date.message}</p>}
          </div>
          <div>
            <label className={labelCls}>{t.agendaTaskDueTimeLabel}</label>
            <input type="time" {...register('due_time')} className={inputCls} />
            {errors.due_time && <p className="text-[11px] text-rose-600 mt-1">{errors.due_time.message}</p>}
          </div>
        </div>

        <div>
          <label className={labelCls}>{t.agendaTaskStatusLabel}</label>
          <select {...register('status')} className={inputCls}>
            <option value="todo">{statusLabel(t, 'todo')}</option>
            <option value="in_progress">{statusLabel(t, 'in_progress')}</option>
            <option value="done">{statusLabel(t, 'done')}</option>
          </select>
        </div>
      </form>
    </Modal>
  );
};
