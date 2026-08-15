import { useMemo, useState } from 'react';
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from 'date-fns';
import { enUS, fr } from 'date-fns/locale';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { AgendaStatus, AgendaTask, Language } from '../../types';
import { Translations } from '../../translations';
import { formatTime12h } from '../../lib/dateUtils';

interface AgendaCalendarProps {
  tasks: AgendaTask[];
  t: Translations;
  language: Language;
  onAddTask: (preseedDate: string) => void;
  onOpenTask: (task: AgendaTask) => void;
}

const STATUS_DOT: Record<AgendaStatus, string> = {
  todo: 'bg-sky-400',
  in_progress: 'bg-amber-400',
  done: 'bg-emerald-400',
};

const localeFor = (lang: Language) => (lang === 'FR' ? fr : enUS);

export const AgendaCalendar: React.FC<AgendaCalendarProps> = ({ tasks, t, language, onAddTask, onOpenTask }) => {
  const [month, setMonth] = useState(() => {
    const today = new Date();
    return startOfMonth(today);
  });

  const days = useMemo(() => {
    return eachDayOfInterval({
      start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
      end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
    });
  }, [month]);

  const tasksByDay = useMemo(() => {
    const map = new Map<string, AgendaTask[]>();
    for (const task of tasks) {
      if (!task.due_date) continue;
      const list = map.get(task.due_date) ?? [];
      list.push(task);
      map.set(task.due_date, list);
    }
    return map;
  }, [tasks]);

  const weekdays = days.slice(0, 7);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setMonth(subMonths(month, 1))}
          className="p-2 rounded-xl border-2 border-[#CBAE94]/60 text-[#5D5449] hover:bg-[#EFE6DC] transition-colors cursor-pointer"
          aria-label="Previous month"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-3">
          <h4 className="font-sans text-lg font-bold text-[#8B735B] capitalize">
            {format(month, 'MMMM yyyy', { locale: localeFor(language) })}
          </h4>
          <button
            type="button"
            onClick={() => setMonth(startOfMonth(new Date()))}
            className="px-3 py-1.5 rounded-xl border-2 border-[#CBAE94]/60 text-[#8B735B] text-[11px] font-mono font-bold hover:bg-[#EFE6DC] transition-colors cursor-pointer"
          >
            {t.agendaTodayBtn}
          </button>
        </div>
        <button
          type="button"
          onClick={() => setMonth(addMonths(month, 1))}
          className="p-2 rounded-xl border-2 border-[#CBAE94]/60 text-[#5D5449] hover:bg-[#EFE6DC] transition-colors cursor-pointer"
          aria-label="Next month"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1.5">
        {weekdays.map((day) => (
          <div key={day.toISOString()} className="text-center text-[10px] font-mono font-bold uppercase text-[#A09080] py-1">
            {format(day, 'EEE', { locale: localeFor(language) })}
          </div>
        ))}
        {days.map((day) => {
          const ymd = format(day, 'yyyy-MM-dd');
          const dayTasks = tasksByDay.get(ymd) ?? [];
          const inMonth = isSameMonth(day, month);
          const today = isToday(day);
          return (
            <button
              key={ymd}
              type="button"
              onClick={() => onAddTask(ymd)}
              className={`min-h-20 sm:min-h-24 rounded-2xl border-2 p-1.5 text-left transition-colors cursor-pointer flex flex-col gap-1 ${
                today
                  ? 'border-[#8B735B] bg-[#EFE6DC]/70'
                  : inMonth
                    ? 'border-[#CBAE94]/40 bg-white hover:border-[#8B735B]/60'
                    : 'border-transparent bg-[#F8F5F0]/50 opacity-50'
              }`}
            >
              <span className={`text-[11px] font-mono font-bold ${today ? 'text-[#8B735B]' : 'text-[#5D5449]'}`}>
                {format(day, 'd')}
              </span>
              <div className="space-y-0.5 overflow-hidden flex-1">
                {dayTasks.slice(0, 3).map((task) => (
                  <span
                    key={task.id}
                    role="button"
                    tabIndex={-1}
                    onClick={(e) => { e.stopPropagation(); onOpenTask(task); }}
                    className={`flex items-center gap-1 rounded-lg px-1.5 py-0.5 bg-white border border-[#CBAE94]/50 text-[10px] font-bold text-[#4A3F35] truncate hover:border-[#8B735B] transition-colors`}
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[task.status]}`} />
                    <span className="truncate">{task.title}</span>
                    {task.due_time && (
                      <span className="text-[9px] font-mono text-[#A09080] shrink-0">{formatTime12h(task.due_time)}</span>
                    )}
                  </span>
                ))}
                {dayTasks.length > 3 && (
                  <span className="text-[10px] font-mono font-bold text-[#8B735B]">+{dayTasks.length - 3}</span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
