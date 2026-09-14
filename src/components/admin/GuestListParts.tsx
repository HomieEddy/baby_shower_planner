import { useEffect, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  Download,
  Upload,
  CheckSquare,
  Square,
  Send,
  Trash2,
  X,
  BellRing,
  MoreVertical,
  LayoutGrid,
  List,
} from 'lucide-react';
import { Guest } from '../../types';
import { useT, useTf } from '../shared/i18n';
import { adminCardVariants } from '../shared/motionPresets';
import { SearchInput } from '../shared/ui';
import { getGuestPartySize } from '../../lib/tableAssignment';

export const GuestMetricCard = ({
  label,
  value,
  icon,
  footer,
  iconClass = 'text-[#8B735B]',
  onClick,
}: {
  label: string;
  value: React.ReactNode;
  icon: React.ReactNode;
  footer: string;
  iconClass?: string;
  onClick?: () => void;
}) => {
  const cardClass = `card-paper-sm p-4 sm:p-5 min-w-0 overflow-hidden text-left ${
    onClick ? 'cursor-pointer hover:-translate-y-0.5 transition-transform w-full' : ''
  }`;
  const inner = (
    <>
      <div className="flex items-start justify-between gap-2 min-w-0">
        <span className="label-mono min-w-0 break-words">{label}</span>
        <span className={`shrink-0 ${iconClass}`}>{icon}</span>
      </div>
      <div className="mt-3">
        <span className="text-2xl sm:text-3xl font-sans font-bold text-[#8B735B]">{value}</span>
      </div>
      <div className="mt-2 text-xs text-[#8B735B] font-mono font-bold break-words">{footer}</div>
    </>
  );
  return onClick ? (
    <motion.button type="button" variants={adminCardVariants} onClick={onClick} className={cardClass}>
      {inner}
    </motion.button>
  ) : (
    <motion.div variants={adminCardVariants} className={cardClass}>
      {inner}
    </motion.div>
  );
};

export const GuestMetricToggle = ({
  metricMode,
  onSwitch,
}: {
  metricMode: 'invites' | 'party';
  onSwitch: (m: 'invites' | 'party') => void;
}) => {
  const t = useT();
  return (
    <div className="flex items-center space-x-1 bg-white p-1 rounded-full text-xs font-bold font-mono border border-[#CBAE94] shadow-2xs">
      <button onClick={() => onSwitch('invites')}
        className={`px-3 py-1 rounded-full transition-colors ${metricMode === 'invites' ? 'bg-[#8B735B] text-white shadow-xs' : 'text-[#5D5449] hover:text-[#8B735B]'}`}>{t.metricInvitesLabel}</button>
      <button onClick={() => onSwitch('party')}
        className={`px-3 py-1 rounded-full transition-colors ${metricMode === 'party' ? 'bg-[#8B735B] text-white shadow-xs' : 'text-[#5D5449] hover:text-[#8B735B]'}`}>{t.colPartySize}</button>
    </div>
  );
};

const selectPillClass =
  'shrink-0 px-3 py-1.5 rounded-full border border-[#CBAE94] bg-white text-xs font-bold text-[#5D5449] focus:outline-none focus:ring-2 focus:ring-[#8B735B]';

// ponytail: local overflow menu; extract to shared if a second consumer appears.
const ActionsMenu = ({
  onExportCsv,
  onOpenImport,
  onSendReminders,
}: {
  onExportCsv: () => void;
  onOpenImport: () => void;
  onSendReminders: () => void;
}) => {
  const t = useT();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const itemClass =
    'w-full text-left px-3 py-2 rounded-xl text-xs font-bold text-[#5D5449] hover:bg-[#EFE6DC] transition-colors flex items-center gap-2 cursor-pointer';
  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)}
        aria-label={t.actionsLabel} aria-expanded={open} aria-haspopup="menu"
        className="p-2 rounded-full border border-[#CBAE94] bg-white text-[#8B735B] hover:bg-[#EFE6DC] transition-colors cursor-pointer shrink-0">
        <MoreVertical className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 w-48 p-1.5 rounded-2xl border border-[#CBAE94] bg-white shadow-lg">
          <button type="button" role="menuitem" className={itemClass}
            onClick={() => { setOpen(false); onOpenImport(); }}>
            <Upload className="w-3.5 h-3.5 shrink-0" />{t.importCsvBtn}
          </button>
          <button type="button" role="menuitem" className={itemClass}
            onClick={() => { setOpen(false); onExportCsv(); }}>
            <Download className="w-3.5 h-3.5 shrink-0" />{t.exportCsvBtn}
          </button>
          <button type="button" role="menuitem" className={itemClass}
            onClick={() => { setOpen(false); onSendReminders(); }}>
            <BellRing className="w-3.5 h-3.5 shrink-0" />{t.remindBtn}
          </button>
        </div>
      )}
    </div>
  );
};

const ViewToggle = ({
  viewMode,
  onViewMode,
}: {
  viewMode: 'cards' | 'table';
  onViewMode: (m: 'cards' | 'table') => void;
}) => {
  const t = useT();
  const btnClass = (active: boolean) =>
    `px-2.5 py-1 rounded-full transition-colors inline-flex items-center gap-1 ${
      active ? 'bg-[#8B735B] text-white shadow-xs' : 'text-[#5D5449] hover:text-[#8B735B]'
    }`;
  return (
    <div role="group" className="flex items-center p-1 rounded-full bg-white border border-[#CBAE94] text-xs font-bold font-mono shrink-0">
      <button type="button" onClick={() => onViewMode('cards')} aria-pressed={viewMode === 'cards'} className={btnClass(viewMode === 'cards')}>
        <LayoutGrid className="w-3.5 h-3.5" /><span className="hidden md:inline">{t.viewCardsBtn}</span>
      </button>
      <button type="button" onClick={() => onViewMode('table')} aria-pressed={viewMode === 'table'} className={btnClass(viewMode === 'table')}>
        <List className="w-3.5 h-3.5" /><span className="hidden md:inline">{t.viewTableBtn}</span>
      </button>
    </div>
  );
};

export const GuestToolbar = ({
  searchTerm,
  onSearchChange,
  statusFilter,
  onStatusFilter,
  sourceFilter,
  onSourceFilter,
  viewMode,
  onViewMode,
  onExportCsv,
  onOpenImport,
  onSendReminders,
}: {
  searchTerm: string;
  onSearchChange: (v: string) => void;
  statusFilter: 'All' | 'Attending' | 'Pending' | 'Declined';
  onStatusFilter: (v: 'All' | 'Attending' | 'Pending' | 'Declined') => void;
  sourceFilter: 'All' | 'Host' | 'Guest-invited';
  onSourceFilter: (v: 'All' | 'Host' | 'Guest-invited') => void;
  viewMode: 'cards' | 'table';
  onViewMode: (m: 'cards' | 'table') => void;
  onExportCsv: () => void;
  onOpenImport: () => void;
  onSendReminders: () => void;
}) => {
  const t = useT();
  // Single row at every width: search flexes, everything else stays fixed.
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <SearchInput
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t.searchGuestsPh}
          aria-label={t.searchGuestsPh}
          className="w-full"
        />
      </div>

      <select value={statusFilter} onChange={(e) => onStatusFilter(e.target.value as typeof statusFilter)}
        aria-label={t.rsvpStatusLabel} className={selectPillClass}>
        <option value="All">{t.filterStatusAll}</option>
        <option value="Attending">{t.statusAttendingWord}</option>
        <option value="Pending">{t.statusPendingWord}</option>
        <option value="Declined">{t.statusDeclinedWord}</option>
      </select>

      <select value={sourceFilter} onChange={(e) => onSourceFilter(e.target.value as typeof sourceFilter)}
        aria-label={t.sourceFilterTitle} title={t.sourceFilterTitle} className={selectPillClass}>
        <option value="All">{t.filterAllOption}</option>
        <option value="Host">{t.sourceHostOption}</option>
        <option value="Guest-invited">{t.sourceGuestOption}</option>
      </select>

      <ViewToggle viewMode={viewMode} onViewMode={onViewMode} />
      <ActionsMenu onExportCsv={onExportCsv} onOpenImport={onOpenImport} onSendReminders={onSendReminders} />
    </div>
  );
};

// Dense rows for scanning a long guest list; clicking a row opens details.
export const GuestTableView = ({
  guests,
  onView,
}: {
  guests: Guest[];
  onView: (guest: Guest) => void;
}) => {
  const t = useT();
  const statusWord = (g: Guest) =>
    g.rsvp_status === 'Attending' ? t.statusAttendingWord
      : g.rsvp_status === 'Pending' ? t.statusPendingWord
      : t.statusDeclinedWord;

  return (
    <div className="overflow-x-auto rounded-2xl border border-[#CBAE94]/60">
      <table className="w-full text-left text-sm">
        <thead className="bg-[#EFE6DC]">
          <tr className="text-xs font-mono font-bold text-[#8B735B] uppercase tracking-wider">
            <th className="px-3 py-2">{t.colName}</th>
            <th className="px-3 py-2">{t.emailLabel}</th>
            <th className="px-3 py-2 text-right">{t.colPartySize}</th>
            <th className="px-3 py-2">{t.rsvpStatusLabel}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[#CBAE94]/30 bg-white">
          {guests.map((g) => (
            <tr key={g.id}
              onClick={() => onView(g)}
              tabIndex={0}
              role="button"
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onView(g); }
              }}
              className="cursor-pointer hover:bg-[#EFE6DC]/40 transition-colors text-[#5D5449] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[#8B735B]">
              <td className="px-3 py-2 font-bold">{g.name}</td>
              <td className="px-3 py-2 font-mono text-xs text-[#5D5449]/70">
                {[g.email, g.phone].filter(Boolean).join(' · ') || '\u2014'}
              </td>
              <td className="px-3 py-2 text-right font-bold">{getGuestPartySize(g)}</td>
              <td className="px-3 py-2 text-xs font-bold">{statusWord(g)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export const BulkActionsBar = ({
  count,
  allSelected,
  onToggleSelectAll,
  onResend,
  onExport,
  onDelete,
  onClear,
}: {
  count: number;
  allSelected: boolean;
  onToggleSelectAll: () => void;
  onResend: () => void;
  onExport: () => void;
  onDelete: () => void;
  onClear: () => void;
}) => {
  const t = useT();
  const tf = useTf();
  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
      className="sticky top-2 z-20 flex flex-wrap items-center gap-2 bg-[#EFE6DC] border-2 border-[#8B735B] rounded-2xl px-4 py-2.5 mb-3 shadow-md">
      <span className="text-xs font-bold font-mono text-[#8B735B] mr-1">{tf('bulkSelectedLabel', { count: String(count) })}</span>
      <button onClick={onToggleSelectAll} title={allSelected ? t.deselectAllBtn : t.selectAllBtn}
        className="px-3 py-1.5 rounded-full bg-white border border-[#CBAE94] text-[#8B735B] font-bold text-xs hover:bg-white/70 transition-all flex items-center gap-1">
        {allSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
        <span className="hidden md:inline">{allSelected ? t.deselectAllBtn : t.selectAllBtn}</span>
      </button>
      <button onClick={onResend}
        className="px-3 py-1.5 rounded-full bg-[#8B735B] text-white font-bold text-xs hover:bg-[#4A3F35] transition-all flex items-center gap-1 shadow-2xs">
        <Send className="w-3.5 h-3.5" /><span className="hidden md:inline">{t.bulkResendBtn}</span>
      </button>
      <button onClick={onExport}
        className="px-3 py-1.5 rounded-full bg-white border border-[#CBAE94] text-[#8B735B] font-bold text-xs hover:bg-[#EFE6DC] transition-all flex items-center gap-1 shadow-2xs">
        <Download className="w-3.5 h-3.5" /><span className="hidden md:inline">{t.exportCsvBtn}</span>
      </button>
      <button onClick={onDelete}
        className="px-3 py-1.5 rounded-full bg-rose-100 border border-rose-300 text-rose-700 font-bold text-xs hover:bg-rose-200 transition-all flex items-center gap-1 shadow-2xs">
        <Trash2 className="w-3.5 h-3.5" /><span className="hidden md:inline">{t.bulkDeleteBtn}</span>
      </button>
      <button onClick={onClear}
        className="ml-auto p-1.5 rounded-full text-[#5D5449]/70 hover:text-[#5D5449] hover:bg-white transition-colors cursor-pointer" title={t.deselectAllBtn} aria-label={t.deselectAllBtn}>
        <X className="w-4 h-4" />
      </button>
    </motion.div>
  );
};
