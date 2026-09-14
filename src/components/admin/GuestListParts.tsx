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
  LayoutGrid,
  List,
} from 'lucide-react';
import { Guest } from '../../types';
import { useT, useTf } from '../shared/i18n';
import { SearchInput } from '../shared/ui';
import { ActionsMenu } from '../shared/ActionsMenu';
import { Segmented } from '../shared/Segmented';
import { AdminToolbar } from './AdminToolbar';
import { getGuestPartySize } from '../../lib/tableAssignment';

export const GuestToolbar = ({
  className = '',
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
  className?: string;
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
  return (
    <AdminToolbar
      className={className}
      primary={
        <>
          <div className="min-w-0 flex-1">
            <SearchInput
              value={searchTerm}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={t.searchGuestsPh}
              aria-label={t.searchGuestsPh}
              className="w-full"
            />
          </div>
          <Segmented
            ariaLabel={`${t.viewCardsBtn} / ${t.viewTableBtn}`}
            value={viewMode}
            onChange={onViewMode}
            options={[
              { value: 'cards', icon: <LayoutGrid className="w-3.5 h-3.5" />, ariaLabel: t.viewCardsBtn },
              { value: 'table', icon: <List className="w-3.5 h-3.5" />, ariaLabel: t.viewTableBtn },
            ]}
          />
          <ActionsMenu
            label={t.actionsLabel}
            items={[
              { label: t.importCsvBtn, icon: <Upload className="w-3.5 h-3.5 shrink-0" />, onClick: onOpenImport },
              { label: t.exportCsvBtn, icon: <Download className="w-3.5 h-3.5 shrink-0" />, onClick: onExportCsv },
              { label: t.remindBtn, icon: <BellRing className="w-3.5 h-3.5 shrink-0" />, onClick: onSendReminders },
            ]}
          />
        </>
      }
      secondary={
        <>
          <Segmented
            ariaLabel={t.rsvpStatusLabel}
            value={statusFilter}
            onChange={onStatusFilter}
            options={[
              { value: 'All', label: t.filterStatusAll },
              { value: 'Attending', label: t.statusAttendingWord },
              { value: 'Pending', label: t.statusPendingWord },
              { value: 'Declined', label: t.statusDeclinedWord },
            ]}
          />
          <Segmented
            ariaLabel={t.sourceFilterTitle}
            value={sourceFilter}
            onChange={onSourceFilter}
            options={[
              { value: 'All', label: t.filterAllOption },
              { value: 'Host', label: t.sourceHostOption },
              { value: 'Guest-invited', label: t.sourceGuestOption },
            ]}
          />
        </>
      }
    />
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
