import { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import { Guest } from '../../types';
import { adminFetch } from '../../lib/api';
import { getPartyMembers, isMemberCheckedIn } from '../../lib/guestAttendees';
import { getGuestPartySize } from '../../lib/tableAssignment';
import { useToast } from '../shared/ToastContext';
import { useActionConfirm } from '../shared/ConfirmDialog';
import { CheckCircle2, RotateCcw, Users, UserCheck, UserX, ChevronDown, ChevronRight, QrCode } from 'lucide-react';
import { useT, useTf, useApiErrorMessage } from '../shared/i18n';
import { useAppStore } from '../../stores/appStore';
import { formatClockTime } from '../../lib/dateUtils';
import { useSettings } from '../../lib/settingsQuery';
import { DayOfQrModal } from '../seating/DayOfQrModal';
import { decodeApiError } from '../../lib/errors';
import { SearchInput } from '../shared/ui';
import { MetricCard } from '../shared/MetricCard';
import { Pagination } from '../shared/Pagination';
import { usePagination } from '../shared/hooks';
import { adminContainerVariants } from '../shared/motionPresets';
import { AdminPageHeader } from './AdminPageHeader';

export const GuestCheckIn = () => {
  const t = useT();
  const tf = useTf();
  const apiError = useApiErrorMessage();
  const language = useAppStore((s) => s.language);
  const settings = useSettings();
  const { toast } = useToast();
  const confirmAction = useActionConfirm();
  const [guests, setGuests] = useState<Guest[]>([]);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [stats, setStats] = useState({ total: 0, checkedIn: 0, expected: 0 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [qrOpen, setQrOpen] = useState(false);

  const fetchData = useCallback(async (isActive: () => boolean = () => true) => {
    const [gRes, sRes] = await Promise.all([
      adminFetch('/api/guests'),
      adminFetch('/api/check-in/stats'),
    ]);
    const gData = await gRes.json();
    const sData = await sRes.json();
    if (!isActive()) return;
    setGuests(gData.guests || []);
    setStats(sData.stats || { total: 0, checkedIn: 0, expected: 0 });
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    // async IIFE keeps the loader's setState out of the effect's synchronous
    // body (react-hooks/set-state-in-effect).
    (async () => {
      await fetchData(() => !cancelled);
    })();
    return () => { cancelled = true; };
  }, [fetchData]);

  const runAction = async (
    guestId: string,
    body: Record<string, unknown>,
    successMsg: string,
    confirmLabel: string,
    undo = false
  ) => {
    if (!(await confirmAction(confirmLabel))) return;
    setBusy(guestId);
    try {
      const res = await adminFetch(undo ? '/api/check-in/undo' : '/api/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guestId, ...body }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        const { code, message } = decodeApiError(data, res.status);
        toast.error(apiError(code, message || t.checkinFailedToast));
        return;
      }
      toast.success(successMsg);
      await fetchData();
    } finally {
      setBusy(null);
    }
  };

  const handleCheckIn = (id: string) => runAction(id, {}, `${t.checkInBtn} ✓`, t.checkInBtn);
  const handleUndo = (id: string) => runAction(id, {}, `${t.undoCheckinBtn} ✓`, t.undoCheckinBtn, true);
  const handleMemberCheckIn = (id: string, name: string) =>
    runAction(id, { name }, `${name} ✓`, t.checkInBtn);
  const handleMemberUndo = (id: string, name: string) =>
    runAction(id, { name }, `${name} — ${t.undoCheckinBtn} ✓`, t.undoCheckinBtn, true);

  const filtered = guests.filter(g =>
    g.name.toLowerCase().includes(search.toLowerCase()) ||
    (g.email || '').toLowerCase().includes(search.toLowerCase())
  );

  const pager = usePagination(filtered);

  const notYet = Math.max(0, stats.expected - stats.checkedIn);

  return (
    <motion.div variants={adminContainerVariants} initial="hidden" animate="show" className="space-y-6">
      <AdminPageHeader
        icon={UserCheck}
        eyebrow={t.checkinHeaderEyebrow}
        title={t.tabCheckIn}
        subtitle={t.checkinHeaderSubtitle}
        actions={
          <button
            type="button"
            onClick={() => setQrOpen(true)}
            className="btn-accent text-xs sm:text-sm py-2.5 px-4 gap-2 cursor-pointer"
          >
            <QrCode className="w-4 h-4" />
            <span>{t.printFindTableQrBtn}</span>
          </button>
        }
      />

      {/* Stats bar — individuals: expected vs checked in */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <MetricCard label={t.checkinExpectedLabel} value={stats.expected} icon={<Users />} footer={t.checkinExpectedFooter} />
        <MetricCard label={t.checkedInLabel} value={stats.checkedIn} icon={<UserCheck />} iconClass="text-ok" />
        <MetricCard label={t.notYetLabel} value={notYet} icon={<UserX />} iconClass="text-amber-700" />
      </div>

      {/* Search */}
      <SearchInput
        variant="lg"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t.searchCheckinPh}
        autoFocus
      />

      {/* Guest list */}
      {loading ? (
        <div className="text-center py-8 text-[#5D5449]">{t.loadingLabel}</div>
      ) : (
        <div className="space-y-2">
          {pager.pageItems.map(guest => {
            const members = getPartyMembers(guest);
            const checkedCount = members.filter(m => isMemberCheckedIn(guest, m)).length;
            const anyChecked = checkedCount > 0;
            const allChecked = members.length > 0 && checkedCount === members.length;
            const isExpanded = expandedId === guest.id;
            const isBusy = busy === guest.id;

            return (
              <div
                key={guest.id}
                className={`rounded-2xl border transition-colors overflow-hidden ${
                  allChecked
                    ? 'bg-[#FFFDF9] border-green-300'
                    : anyChecked
                      ? 'bg-[#FFFDF9] border-amber-300'
                      : 'bg-white border-[#CBAE94]/50'
                }`}
              >
                {/* Row header — click to expand the party */}
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : guest.id)}
                    aria-expanded={isExpanded}
                    className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer"
                  >
                    {members.length > 1 ? (
                      isExpanded ? (
                        <ChevronDown className="w-4 h-4 text-[#8B735B] shrink-0" />
                      ) : (
                        <ChevronRight className="w-4 h-4 text-[#8B735B] shrink-0" />
                      )
                    ) : (
                      <span className="w-4 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <div className="font-semibold text-sm text-[#4A3F35] break-words">
                        {guest.name}
                        {members.length > 1 && (
                          <span className={`ml-2 text-xs font-semibold px-2 py-0.5 rounded-full border ${
                            allChecked
                              ? 'status-ok'
                              : anyChecked
                                ? 'bg-amber-50 text-amber-800 border-amber-200'
                                : 'bg-[#EFE6DC] text-[#5D5449] border-transparent'
                          }`}>
                            {checkedCount}/{members.length}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-[#5D5449] break-words">
                        {guest.email || guest.phone || t.noContactLabel} · {tf('partyOfLabel', { count: String(getGuestPartySize(guest)) })}
                        {guest.checked_in_at && ` · ${formatClockTime(guest.checked_in_at, language)}`}
                      </div>
                    </div>
                  </button>

                  <div className="flex items-center gap-2 shrink-0">
                    {anyChecked && (
                      <button
                        onClick={() => handleUndo(guest.id)}
                        disabled={isBusy}
                        aria-label={t.undoCheckinBtn}
                        title={t.undoCheckinBtn}
                        className="px-3 sm:px-4 min-h-[44px] rounded-full text-xs font-semibold border border-[#CBAE94] text-[#5D5449] bg-white hover:bg-[#EFE6DC] transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">{t.undoCheckinBtn}</span>
                      </button>
                    )}
                    {!allChecked && (
                      <button
                        onClick={() => handleCheckIn(guest.id)}
                        disabled={isBusy}
                        className="btn-accent min-h-[44px] px-4 text-xs gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{checkedCount === 0 ? t.checkInBtn : t.checkinAllBtn}</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Party members */}
                {isExpanded && members.length > 1 && (
                  <div className="border-t border-[#CBAE94]/30 bg-white/70 px-4 py-2 space-y-1">
                    {members.map(member => {
                      const checked = isMemberCheckedIn(guest, member);
                      const isPrimary = member.trim().toLowerCase() === (guest.name || '').trim().toLowerCase();
                      return (
                        <div
                          key={member}
                          className="flex items-center justify-between gap-3 py-1.5 px-2 rounded-xl hover:bg-[#EFE6DC]/40"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${checked ? 'bg-green-600' : 'bg-[#CBAE94]'}`} />
                            <span className="text-sm font-medium text-[#4A3F35] truncate">
                              {member}
                              {isPrimary && (
                                <span className="ml-1.5 text-xs font-medium text-[#5D5449]">
                                  {t.finderPartyLead}
                                </span>
                              )}
                            </span>
                          </div>
                          {checked ? (
                            <button
                              onClick={() => handleMemberUndo(guest.id, member)}
                              disabled={isBusy}
                              className="flex items-center gap-1 px-2 min-h-[44px] text-xs font-semibold text-ok cursor-pointer disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>{t.checkedInLabel}</span>
                              <RotateCcw className="w-3 h-3 ml-0.5" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleMemberCheckIn(guest.id, member)}
                              disabled={isBusy}
                              className="btn-accent min-h-[44px] px-3 text-xs cursor-pointer disabled:opacity-50"
                            >
                              {t.checkInBtn}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="text-center py-8 text-[#5D5449]">{t.noMatchMsg}</div>
          )}
        </div>
      )}

      <Pagination
        page={pager.page}
        totalPages={pager.totalPages}
        rangeStart={pager.rangeStart}
        rangeEnd={pager.rangeEnd}
        total={pager.total}
        onPageChange={pager.setPage}
      />

      <DayOfQrModal
        isOpen={qrOpen}
        onClose={() => setQrOpen(false)}
        language={language}
        settings={settings}
      />
    </motion.div>
  );
};
