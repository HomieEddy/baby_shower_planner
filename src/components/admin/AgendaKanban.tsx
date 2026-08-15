import { useMemo, useState } from 'react';
import {
  DndContext,
  DragOverlay,
  DragStartEvent,
  DragEndEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  useDroppable,
} from '@dnd-kit/core';
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { format, parse } from 'date-fns';
import { enUS, fr } from 'date-fns/locale';
import { GripVertical, Clock } from 'lucide-react';
import { AgendaStatus, AgendaTask, Language } from '../../types';
import { Translations } from '../../translations';
import { formatTime12h } from '../../lib/dateUtils';

interface AgendaKanbanProps {
  tasks: AgendaTask[];
  t: Translations;
  language: Language;
  onOpenTask: (task: AgendaTask) => void;
  /** Items whose status/position changed after a drag (optimistic + persisted by parent) */
  onReorder: (items: Array<{ id: string; status: AgendaStatus; position: number }>) => void;
}

const COLUMNS: Array<{ id: AgendaStatus; headerCls: string; chipCls: string }> = [
  { id: 'todo', headerCls: 'text-sky-800 bg-sky-50 border-sky-200', chipCls: 'border-l-sky-400' },
  { id: 'in_progress', headerCls: 'text-amber-800 bg-amber-50 border-amber-200', chipCls: 'border-l-amber-400' },
  { id: 'done', headerCls: 'text-emerald-800 bg-emerald-50 border-emerald-200', chipCls: 'border-l-emerald-400' },
];

const statusLabel = (t: Translations, status: AgendaStatus): string => {
  switch (status) {
    case 'todo': return t.agendaColumnTodo;
    case 'in_progress': return t.agendaColumnInProgress;
    default: return t.agendaColumnDone;
  }
};

function shortDueDate(ymd: string, lang: Language): string {
  const d = parse(ymd, 'yyyy-MM-dd', new Date());
  if (Number.isNaN(d.getTime())) return ymd;
  return format(d, lang === 'FR' ? 'd MMM' : 'MMM d', { locale: lang === 'FR' ? fr : enUS });
}

const TaskCard: React.FC<{ task: AgendaTask; language: Language; onOpenTask: (task: AgendaTask) => void }> = ({ task, language, onOpenTask }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });
  const chipCls = COLUMNS.find(c => c.id === task.status)?.chipCls ?? 'border-l-sky-400';
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      {...attributes}
      onClick={() => onOpenTask(task)}
      className={`group bg-white rounded-xl border-2 border-[#CBAE94]/60 border-l-4 ${chipCls} p-3 shadow-xs cursor-pointer hover:border-[#8B735B] transition-colors ${isDragging ? 'opacity-40' : ''}`}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          {...listeners}
          onClick={(e) => e.stopPropagation()}
          className="p-1 rounded-md text-[#A09080] hover:bg-[#EFE6DC] cursor-grab active:cursor-grabbing shrink-0"
          aria-label="Drag task"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-xs font-bold text-[#4A3F35] leading-snug break-words">{task.title}</p>
          {task.description && (
            <p className="text-[11px] text-[#A09080] line-clamp-2 break-words">{task.description}</p>
          )}
          {task.due_date && (
            <p className="text-[10px] font-mono font-bold text-[#8B735B] flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {shortDueDate(task.due_date, language)}
              {task.due_time ? ` · ${formatTime12h(task.due_time)}` : ''}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

// The whole column body is droppable, so a task can be dropped anywhere
// in a column (header, between cards, empty space).
const KanbanColumn: React.FC<{
  id: AgendaStatus;
  headerCls: string;
  tasks: AgendaTask[];
  t: Translations;
  language: Language;
  onOpenTask: (task: AgendaTask) => void;
}> = ({ id, headerCls, tasks, t, language, onOpenTask }) => {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`rounded-2xl border-2 p-3 space-y-2 transition-colors ${headerCls} ${isOver ? 'ring-2 ring-[#8B735B]/50' : ''}`}
    >
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-bold font-mono uppercase tracking-wide">{statusLabel(t, id)}</span>
        <span className="px-2 py-0.5 rounded-full bg-white/70 border border-current text-[10px] font-mono font-bold">
          {tasks.length}
        </span>
      </div>
      <SortableContext items={tasks.map(task => task.id)} strategy={verticalListSortingStrategy}>
        <div className="space-y-2">
          {tasks.map(task => (
            <TaskCard key={task.id} task={task} language={language} onOpenTask={onOpenTask} />
          ))}
        </div>
      </SortableContext>
      {tasks.length === 0 && (
        <p className="text-[11px] text-[#A09080] italic text-center py-4">{t.agendaEmptyColumnMsg}</p>
      )}
    </div>
  );
};

export const AgendaKanban: React.FC<AgendaKanbanProps> = ({ tasks, t, language, onOpenTask, onReorder }) => {
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const byStatus = useMemo(() => {
    const map: Record<AgendaStatus, AgendaTask[]> = { todo: [], in_progress: [], done: [] };
    for (const task of tasks) {
      if (task.id === activeId) continue; // dragged card lives in the DragOverlay
      map[task.status]?.push(task);
    }
    return map;
  }, [tasks, activeId]);

  const activeTask = tasks.find(t => t.id === activeId) ?? null;

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    const activeIdStr = String(active.id);
    const overId = over ? String(over.id) : null;
    if (!overId || activeIdStr === overId) return;
    const moved = tasks.find(t => t.id === activeIdStr);
    if (!moved) return;

    const isOverTask = tasks.some(t => t.id === overId);
    const overStatus: AgendaStatus = isOverTask
      ? tasks.find(t => t.id === overId)!.status
      : (overId as AgendaStatus);

    // Optimistic list: remove the moved task, then reinsert at the drop point.
    const list = tasks.filter(t => t.id !== activeIdStr).map(t => ({ ...t }));
    const updated = { ...moved, status: overStatus };
    const insertAt = isOverTask
      ? list.findIndex(t => t.id === overId)
      : list.length;
    list.splice(insertAt < 0 ? list.length : insertAt, 0, updated);

    // Renumber positions per column; report everything that changed.
    const counters: Record<AgendaStatus, number> = { todo: 0, in_progress: 0, done: 0 };
    const changed: Array<{ id: string; status: AgendaStatus; position: number }> = [];
    for (const task of list) {
      const position = counters[task.status]++;
      const original = tasks.find(t => t.id === task.id)!;
      if (task.status !== original.status || position !== original.position) {
        changed.push({ id: task.id, status: task.status, position });
      }
    }
    if (changed.length > 0) onReorder(changed);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={({ active }: DragStartEvent) => setActiveId(String(active.id))}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {COLUMNS.map(col => (
          <KanbanColumn
            key={col.id}
            id={col.id}
            headerCls={col.headerCls}
            tasks={byStatus[col.id]}
            t={t}
            language={language}
            onOpenTask={onOpenTask}
          />
        ))}
      </div>
      <DragOverlay>
        {activeTask ? (
          <div className="bg-white rounded-xl border-2 border-[#8B735B] p-3 shadow-lg opacity-90">
            <p className="text-xs font-bold text-[#4A3F35]">{activeTask.title}</p>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
};
