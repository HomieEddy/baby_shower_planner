import { useState, useEffect, useCallback } from 'react';
import { Guest } from '../../types';
import { adminFetch } from '../../lib/api';
import { getPartyMembers, isMemberCheckedIn } from '../../lib/guestAttendees';
import { useToast } from '../shared/ToastContext';
import { Search, CheckCircle2, RotateCcw, Users, UserCheck, UserX, ChevronDown, ChevronRight } from 'lucide-react';
import { useT } from '../shared/i18n';

export const GuestCheckIn = () => {
  const t = useT();
  const { toast } = useToast();
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
    fetchData(() => !cancelled);
    return () => { cancelled = true; };
  }, [fetchData]);

  const runAction = async (
    guestId: string,
    body: Record<string, unknown>,
    successMsg: string,
    undo = false
  ) => {
    setBusy(guestId);
    try {
      const res = await adminFetch(undo ? '/api/check-in/undo' : '/api/check-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guestId, ...body }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error || 'Check-in failed');
        return;
      }
      toast.success(successMsg);
      await fetchData();
    } finally {
      setBusy(null);
    }
  };

  const handleCheckIn = (id: string) => runAction(id, {}, `${t.checkInBtn} ✓`);
  const handleUndo = (id: string) => runAction(id, {}, `${t.undoCheckinBtn} ✓`, true);
  const handleMemberCheckIn = (id: string, name: string) =>
    runAction(id, { name }, `${name} ✓`);
  const handleMemberUndo = (id: string, name: string) =>
    runAction(id, { name }, `${name} — ${t.undoCheckinBtn} ✓`, true);

  const filtered = guests.filter(g =>
    g.name.toLowerCase().includes(search.toLowerCase()) ||
    (g.email || '').toLowerCase().includes(search.toLowerCase())
  );

  const notYet = Math.max(0, stats.expected - stats.checkedIn);

  return (
    <div className="space-y-6">
      {/* Stats bar — individuals: expected vs checked in */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-2xl border border-[#CBAE94]/30 p-4 text-center">
          <Users className="w-5 h-5 text-[#8B735B] mx-auto mb-1" />
          <div className="text-2xl font-bold text-[#4A3F35]">{stats.total}</div>
          <div className="text-[11px] text-[#A09080] font-mono">{t.totalGuestsLabel}</div>
        </div>
        <div className="bg-white rounded-2xl border border-[#CBAE94]/30 p-4 text-center">
          <UserCheck className="w-5 h-5 text-green-600 mx-auto mb-1" />
          <div className="text-2xl font-bold text-green-700">{stats.checkedIn}</div>
          <div className="text-[11px] text-[#A09080] font-mono">{t.checkedInLabel}</div>
        </div>
        <div className="bg-white rounded-2xl border border-[#CBAE94]/30 p-4 text-center">
          <UserX className="w-5 h-5 text-amber-600 mx-auto mb-1" />
          <div className="text-2xl font-bold text-amber-700">{notYet}</div>
          <div className="text-[11px] text-[#A09080] font-mono">{t.notYetLabel}</div>
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#A09080]" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder={t.searchCheckinPh}
          className="w-full pl-10 pr-4 py-3 rounded-2xl border-2 border-[#CBAE94] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#8B735B]"
          autoFocus
        />
      </div>

      {/* Guest list */}
      {loading ? (
        <div className="text-center py-8 text-[#A09080]">{t.loadingLabel}</div>
      ) : (
        <div className="space-y-2">
          {filtered.map(guest => {
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
                <div
                  className="flex items-center justify-between gap-3 p-4 cursor-pointer"
                  onClick={() => setExpandedId(isExpanded ? null : guest.id)}
                >
                  <div className="flex items-center gap-2 min-w-0">
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
                          <span className={`ml-2 text-[10px] font-mono px-2 py-0.5 rounded-full ${
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
                      <div className="text-[11px] text-[#A09080] font-mono">
                        {guest.email || guest.phone || 'No contact'} &middot; Party of {guest.attending_party_size || guest.max_party_size}
                        {guest.checked_in_at && ` · ${new Date(guest.checked_in_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0" onClick={e => e.stopPropagation()}>
                    {anyChecked && (
                      <button
                        onClick={() => handleUndo(guest.id)}
                        disabled={isBusy}
                        className="px-3 py-1.5 rounded-full text-xs font-bold border border-green-300 text-green-700 bg-white hover:bg-green-50 transition-colors flex items-center space-x-1 disabled:opacity-50"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>{t.undoCheckinBtn}</span>
                      </button>
                    )}
                    {!allChecked && (
                      <button
                        onClick={() => handleCheckIn(guest.id)}
                        disabled={isBusy}
                        className={`px-4 py-1.5 rounded-full text-xs font-bold text-white transition-colors flex items-center space-x-1 disabled:opacity-50 ${
                          checkedCount === 0 ? 'bg-[#8B735B] hover:bg-[#4A3F35]' : 'bg-[#C9A227] hover:bg-[#A8861C]'
                        }`}
                      >
                        <CheckCircle2 className="w-3 h-3" />
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
                                <span className="ml-1.5 text-[9px] font-mono uppercase text-[#8B735B]">
                                  {t.finderPartyLead}
                                </span>
                              )}
                            </span>
                          </div>
                          {checked ? (
                            <button
                              onClick={() => handleMemberUndo(guest.id, member)}
                              disabled={isBusy}
                              className="flex items-center gap-1 text-[10px] font-bold text-green-700 hover:text-green-900 disabled:opacity-50"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              <span>{t.checkedInLabel}</span>
                              <RotateCcw className="w-2.5 h-2.5 ml-0.5" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleMemberCheckIn(guest.id, member)}
                              disabled={isBusy}
                              className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-[#8B735B] text-white hover:bg-[#4A3F35] transition-colors disabled:opacity-50"
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
    </div>
  );
};
