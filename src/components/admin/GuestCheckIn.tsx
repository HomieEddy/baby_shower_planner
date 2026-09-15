import { useState, useEffect, useCallback } from 'react';
import { motion } from 'motion/react';
import { Guest } from '../../types';
import { adminFetch } from '../../lib/api';
import { getPartyMembers, isMemberCheckedIn } from '../../lib/guestAttendees';
import { useToast } from '../shared/ToastContext';
import { useActionConfirm } from '../shared/ConfirmDialog';
import { CheckCircle2, RotateCcw, Users, UserCheck, UserX, ChevronDown, ChevronRight } from 'lucide-react';
import { useT, useTf, useApiErrorMessage } from '../shared/i18n';
import { decodeApiError } from '../../lib/errors';
import { SearchInput } from '../shared/ui';
import { MetricCard } from '../shared/MetricCard';
import { Pagination } from '../shared/Pagination';
import { usePagination } from '../shared/hooks';
import { adminContainerVariants } from '../shared/motionPresets';

export const GuestCheckIn = () => {
  const t = useT();
  const tf = useTf();
  const apiError = useApiErrorMessage();
  const { toast } = useToast();
  const confirmAction = useActionConfirm();
  const [guests, setGuests] = useState<Guest[]>([]);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [stats, setStats] = useState({ total: 0, checkedIn: 0, expected: 0 });
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

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
      {/* Stats bar — individuals: expected vs checked in */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <MetricCard label={t.totalGuestsLabel} value={stats.total} icon={<Users className="w-5 h-5" />} />
        <MetricCard label={t.checkedInLabel} value={stats.checkedIn} icon={<UserCheck className="w-5 h-5" />} iconClass="text-green-600" />
        <MetricCard label={t.notYetLabel} value={notYet} icon={<UserX className="w-5 h-5" />} iconClass="text-amber-600" />
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
        <div className="text-center py-8 text-[#A09080]">{t.loadingLabel}</div>
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
                    ? 'bg-green-50 border-green-300'
                    : anyChecked
                      ? 'bg-amber-50/60 border-amber-200'
                      : 'bg-white border-[#CBAE94]/30'
                }`}
              >
                {/* Row header — click to expand the party */}
                <div className="flex flex-wrap items-center justify-between gap-3 p-4">
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
                      <div className="font-semibold text-sm text-[#4A3F35] truncate">
                        {guest.name}
                        {members.length > 1 && (
                          <span className={`ml-2 text-xs font-mono px-2 py-0.5 rounded-full ${
                            allChecked
                              ? 'bg-green-100 text-green-800'
                              : anyChecked
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-[#EFE6DC] text-[#8B735B]'
                          }`}>
                            {checkedCount}/{members.length}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-[#A09080] font-mono">
                        {guest.email || guest.phone || t.noContactLabel} · {tf('partyOfLabel', { count: String(guest.attending_party_size || guest.max_party_size) })}
                        {guest.checked_in_at && ` · ${new Date(guest.checked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                      </div>
                    </div>
                  </button>

                  <div className="flex items-center gap-2 shrink-0">
                    {anyChecked && (
                      <button
                        onClick={() => handleUndo(guest.id)}
                        disabled={isBusy}
                        className="px-4 min-h-[44px] rounded-full text-xs font-bold border border-green-300 text-green-700 bg-white hover:bg-green-50 transition-colors flex items-center space-x-1 disabled:opacity-50"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        <span>{t.undoCheckinBtn}</span>
                      </button>
                    )}
                    {!allChecked && (
                      <button
                        onClick={() => handleCheckIn(guest.id)}
                        disabled={isBusy}
                        className={`px-4 min-h-[44px] rounded-full text-xs font-bold text-white transition-colors flex items-center space-x-1 disabled:opacity-50 ${
                          checkedCount === 0 ? 'bg-[#8B735B] hover:bg-[#4A3F35]' : 'bg-[#C9A227] hover:bg-[#A8861C]'
                        }`}
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
                            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${checked ? 'bg-green-500' : 'bg-[#CBAE94]'}`} />
                            <span className="text-xs font-semibold text-[#4A3F35] truncate">
                              {member}
                              {isPrimary && (
                                <span className="ml-1.5 text-xs font-mono uppercase text-[#8B735B]">
                                  {t.finderPartyLead}
                                </span>
                              )}
                            </span>
                          </div>
                          {checked ? (
                            <button
                              onClick={() => handleMemberUndo(guest.id, member)}
                              disabled={isBusy}
                              className="flex items-center gap-1 px-2 min-h-[44px] text-xs font-bold text-green-700 hover:text-green-900 disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              <span>{t.checkedInLabel}</span>
                              <RotateCcw className="w-3 h-3 ml-0.5" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleMemberCheckIn(guest.id, member)}
                              disabled={isBusy}
                              className="px-3 min-h-[44px] rounded-full text-xs font-bold bg-[#8B735B] text-white hover:bg-[#4A3F35] transition-colors disabled:opacity-50"
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
            <div className="text-center py-8 text-[#A09080]">{t.noMatchMsg}</div>
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
    </motion.div>
  );
};
