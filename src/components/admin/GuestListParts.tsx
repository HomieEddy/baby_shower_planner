import { motion } from 'motion/react';
import {
  Search,
  Download,
  Upload,
  CheckSquare,
  Square,
  Send,
  Trash2,
  X,
  BellRing,
} from 'lucide-react';
import { useT } from '../shared/i18n';
import { adminCardVariants } from '../shared/motionPresets';

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
}) => (
  <motion.div
    variants={adminCardVariants}
    onClick={onClick}
    className={`card-paper-sm p-4 sm:p-5 ${onClick ? 'cursor-pointer hover:-translate-y-0.5 transition-transform' : ''}`}
  >
    <div className="flex items-center justify-between">
      <span className="label-mono">{label}</span>
      <span className={iconClass}>{icon}</span>
    </div>
    <div className="mt-3">
      <span className="text-2xl sm:text-3xl font-sans font-bold text-[#8B735B]">{value}</span>
    </div>
    <div className="mt-2 text-[11px] text-[#8B735B] font-mono font-bold">{footer}</div>
  </motion.div>
);

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

export const GuestFiltersBar = ({
  searchTerm,
  onSearchChange,
  statusFilter,
  onStatusFilter,
  sourceFilter,
  onSourceFilter,
  onExportCsv,
  onOpenImport,
  onSendReminders,
  allSelected,
  onToggleSelectAll,
}: {
  searchTerm: string;
  onSearchChange: (v: string) => void;
  statusFilter: string;
  onStatusFilter: (v: 'All' | 'Attending' | 'Pending' | 'Declined') => void;
  sourceFilter: string;
  onSourceFilter: (v: 'All' | 'Host' | 'Guest-invited') => void;
  onExportCsv: () => void;
  onOpenImport: () => void;
  onSendReminders: () => void;
  allSelected: boolean;
  onToggleSelectAll: () => void;
}) => {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
      <div className="relative">
        <Search className="w-4 h-4 text-[#CBAE94] absolute left-3 top-2.5" />
        <input type="text" value={searchTerm} onChange={(e) => onSearchChange(e.target.value)}
          placeholder={t.searchGuestsPh}
          className="pl-9 pr-3 py-1.5 rounded-full border-2 border-[#CBAE94] text-xs font-bold text-[#5D5449] focus:outline-none focus:ring-2 focus:ring-[#8B735B] w-36 sm:w-44 bg-white" />
      </div>

      <div className="flex items-center gap-1.5">
        <button type="button" onClick={onExportCsv}
          className="px-3 py-1.5 rounded-full bg-white border border-[#CBAE94] text-[#8B735B] font-bold text-xs hover:bg-[#EFE6DC] transition-all flex items-center gap-1 shadow-2xs" title={t.exportCsvTitle}>
          <Download className="w-3.5 h-3.5" /><span className="hidden md:inline">{t.exportCsvBtn}</span>
        </button>
        <button type="button" onClick={onOpenImport}
          className="px-3 py-1.5 rounded-full bg-white border border-[#CBAE94] text-[#8B735B] font-bold text-xs hover:bg-[#EFE6DC] transition-all flex items-center gap-1 shadow-2xs" title={t.importCsvTitle}>
          <Upload className="w-3.5 h-3.5" /><span className="hidden md:inline">{t.importCsvBtn}</span>
        </button>
        <button type="button" onClick={onSendReminders}
          className="px-3 py-1.5 rounded-full bg-white border border-[#CBAE94] text-[#8B735B] font-bold text-xs hover:bg-[#EFE6DC] transition-all flex items-center gap-1 shadow-2xs" title={t.remindTitle}>
          <BellRing className="w-3.5 h-3.5" /><span className="hidden md:inline">{t.remindBtn}</span>
        </button>
      </div>

      <div className="flex items-center space-x-1 bg-[#EFE6DC] p-1 rounded-full text-xs font-bold font-mono border border-[#CBAE94]">
        {(['All', 'Attending', 'Pending', 'Declined'] as const).map((st) => (
          <button key={st} onClick={() => onStatusFilter(st)}
            className={`px-2.5 py-1 rounded-full transition-colors ${statusFilter === st ? 'bg-[#8B735B] text-white shadow-xs font-bold' : 'text-[#5D5449] hover:text-[#8B735B]'}`}>{st}</button>
        ))}
      </div>

      <div className="flex items-center space-x-1 bg-white p-1 rounded-full text-xs font-bold font-mono border border-[#CBAE94]" title={t.sourceFilterTitle}>
        {(['All', 'Host', 'Guest-invited'] as const).map((st) => (
          <button key={st} onClick={() => onSourceFilter(st)}
            className={`px-2.5 py-1 rounded-full transition-colors ${sourceFilter === st ? 'bg-[#D4A373] text-white shadow-xs font-bold' : 'text-[#5D5449] hover:text-[#8B735B]'}`}>{st}</button>
        ))}
      </div>

      <button type="button" onClick={onToggleSelectAll}
        className={`px-3 py-1.5 rounded-full font-bold text-xs transition-all flex items-center gap-1 shadow-2xs ${allSelected ? 'bg-[#8B735B] text-white border border-[#8B735B]' : 'bg-white border border-[#CBAE94] text-[#8B735B] hover:bg-[#EFE6DC]'}`} title={t.selectAllBtn}>
        {allSelected ? <CheckSquare className="w-3.5 h-3.5" /> : <Square className="w-3.5 h-3.5" />}
        <span className="hidden md:inline">{t.selectAllBtn}</span>
      </button>
    </div>
  );
};

export const BulkActionsBar = ({
  count,
  onResend,
  onExport,
  onDelete,
  onClear,
}: {
  count: number;
  onResend: () => void;
  onExport: () => void;
  onDelete: () => void;
  onClear: () => void;
}) => {
  const t = useT();
  return (
    <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
      className="flex flex-wrap items-center gap-2 bg-[#EFE6DC] border-2 border-[#8B735B] rounded-2xl px-4 py-2.5 mb-3">
      <span className="text-xs font-bold font-mono text-[#8B735B] mr-1">{t.bulkSelectedLabel.replace('{{count}}', String(count))}</span>
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
        className="ml-auto p-1.5 rounded-full text-[#5D5449]/70 hover:text-[#5D5449] hover:bg-white transition-colors" title={t.deselectAllBtn}>
        <X className="w-4 h-4" />
      </button>
    </motion.div>
  );
};
