import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'motion/react';
import {
  MapPin,
  Search,
  ChevronRight,
  Info,
  Sparkles,
  RotateCcw,
  UserCheck,
} from 'lucide-react';
import { Guest, FloorMapData } from '../../types';
import { useT, useTf, useApiErrorMessage } from '../shared/i18n';
import { useToast } from '../shared/ToastContext';
import { useActionConfirm } from '../shared/ConfirmDialog';
import { getPartyMembers, isMemberCheckedIn, isPartyLead } from '../../lib/guestAttendees';
import { getGuestPartySize } from '../../lib/tableAssignment';
import { decodeApiError } from '../../lib/errors';
import { isValidCode } from '../../lib/validation';
import { VenueModal } from './VenueModal';
import { GuestPageHeader } from '../shared/GuestPageHeader';

// A searchable person: the primary guest or one of their party attendees.
export interface AttendeeHit {
  guest: Guest;
  attendeeName: string | null; // null = the primary guest
  displayName: string;
}

export interface FinderSelection extends AttendeeHit {
  id: string; // stable key: `${guest.id}:${attendeeName ?? 'PRIMARY'}`
}

interface FinderData {
  floorMap: FloorMapData | null;
  seats: Guest[];
  guests: Guest[];
  preselected: Guest | null;
}

const fetchFinderData = async (token: string | undefined): Promise<FinderData> => {
  const query = token ? `?guest=${encodeURIComponent(token)}` : '';
  const [mapRes, rosterRes] = await Promise.all([
    fetch('/api/floorplan'),
    fetch(`/api/floorplan/roster${query}`),
  ]);
  const mapData = await mapRes.json();
  const rosterData = await rosterRes.json();
  return {
    floorMap: mapData.floorMap ?? null,
    seats: rosterData.seats ?? [],
    guests: rosterData.guests ?? [],
    preselected: rosterData.guest ?? null,
  };
};

const container = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.12, delayChildren: 0.05 } },
};

const item = {
  hidden: { opacity: 0, y: 22 },
  show: { opacity: 1, y: 0, transition: { type: 'spring' as const, stiffness: 260, damping: 22 } },
};

export const GuestFinderPage: React.FC = () => {
  const t = useT();
  const tf = useTf();
  const apiError = useApiErrorMessage();
  const { toast } = useToast();
  const confirmAction = useActionConfirm();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const initialToken = searchParams.get('guest') || undefined;

  const [searchQuery, setSearchQuery] = useState('');
  const [searchPick, setSearchPick] = useState<FinderSelection | null>(null);
  const [dismissedId, setDismissedId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // member name or 'all'
  const [venueOpen, setVenueOpen] = useState(false); // full-screen venue modal

  const { data, isLoading } = useQuery({
    queryKey: ['guest-finder', initialToken],
    queryFn: () => fetchFinderData(initialToken),
  });

  // Code lookup runs server-side: only the matching party is ever returned
  // (the full roster is not exposed on this page).
  const searchCode = searchQuery.trim();
  const { data: searchGuests, isFetching: searching } = useQuery({
    queryKey: ['finder-search', searchCode],
    queryFn: async (): Promise<Guest[]> => {
      const res = await fetch(`/api/floorplan/roster?code=${encodeURIComponent(searchCode)}`);
      const data = await res.json();
      return data.guests ?? [];
    },
    enabled: isValidCode(searchCode),
  });

  const floorMap = data?.floorMap ?? null;

  // Pre-select when arriving via a QR code / invite link; stays dismissed once cleared
  const preselected = data?.preselected ?? null;
  const selected: FinderSelection | null = useMemo(
    () =>
      searchPick ??
      (dismissedId
        ? null
        : preselected
          ? {
              guest: preselected,
              attendeeName: null,
              displayName: preselected.name,
              id: `${preselected.id}:PRIMARY`,
            }
          : null),
    [searchPick, dismissedId, preselected]
  );

  // Venue map needs anonymized seat math for everyone plus the selected
  // party's own details (names for the seat index, dietary note).
  const mapRoster = useMemo<Guest[]>(() => {
    const base = data?.seats ?? [];
    if (!selected) return base;
    return [...base.filter((s) => s.id !== selected.guest.id), selected.guest];
  }, [data, selected]);

  // Attendee-level search: one hit per person (primary guest + each attendee),
  // so a shared reservation code surfaces every member of the party.
  const hits = useMemo<AttendeeHit[]>(() => {
    if (!searchGuests || searchGuests.length === 0) return [];
    const out: AttendeeHit[] = [];
    for (const g of searchGuests) {
      const names = g.attendee_names && g.attendee_names.length > 0 ? g.attendee_names : [];
      const primary = { guest: g, attendeeName: null, displayName: g.name };
      out.push(primary);
      names.forEach((n) => {
        // The primary guest is often repeated as attendee_names[0] — already
        // represented by the primary hit, so skip the duplicate row.
        if (n.trim().toLowerCase() === g.name.trim().toLowerCase()) return;
        out.push({ guest: g, attendeeName: n, displayName: n });
      });
    }
    return out;
  }, [searchGuests]);

  const pickPerson = (hit: AttendeeHit) => {
    setSearchPick({
      ...hit,
      id: `${hit.guest.id}:${hit.attendeeName ?? 'PRIMARY'}`,
    });
    setDismissedId(null);
    setSearchQuery('');
  };

  // ─── Check-in ─────────────────────────────────────────────────
  // The person who identified themselves; only they (or the party lead, via
  // their own name or the magic-token link) can trigger check-in actions.
  const identifiedName = selected?.attendeeName ?? selected?.guest.name ?? '';
  const members = selected ? getPartyMembers(selected.guest) : [];
  const checkedCount = selected
    ? members.filter((m) => isMemberCheckedIn(selected.guest, m)).length
    : 0;
  const allChecked = selected && members.length > 0 && checkedCount === members.length;

  // The party is one unit: any identified member checks in (or undoes) everyone.
  const act = async (undo = false) => {
    if (!selected) return;
    if (!(await confirmAction(undo ? t.undoCheckinBtn : t.checkinAllBtn))) return;
    setBusy('all');
    try {
      const body = initialToken
        ? { token: initialToken, all: true, undo }
        : { code: selected.guest.code, name: identifiedName, all: true, undo };
      const res = await fetch('/api/check-in/self', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const { code, message } = decodeApiError(data, res.status);
        toast.error(code === 'GUEST_DECLINED' ? t.checkinDeclinedError : apiError(code, message || t.checkinFailedToast));
        return;
      }
      const updated: Guest | undefined = data.guest;
      if (updated) {
        // Keep the roster + preselected + current pick live so the party card
        // reflects the new check-in state without a refetch.
        queryClient.setQueryData<FinderData>(['guest-finder', initialToken], (old) =>
          old
            ? {
                ...old,
                seats: old.seats.map((g) => (g.id === updated.id ? { ...g, checked_in: updated.checked_in, checked_in_names: updated.checked_in_names } : g)),
                guests: old.guests.map((g) => (g.id === updated.id ? updated : g)),
                preselected: old.preselected?.id === updated.id ? updated : old.preselected,
              }
            : old
        );
        setSearchPick((prev) =>
          prev && prev.guest.id === updated.id ? { ...prev, guest: updated } : prev
        );
      }
      if (!undo) {
        toast.success(t.checkinAllDone);
        // The arrival moment: show the venue full-screen after checking in.
        setVenueOpen(true);
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="py-8 sm:py-14 px-4">
      <div className="max-w-2xl mx-auto space-y-6 relative">
        {/* Hero — staggered entrance */}
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="card-soft relative px-6 py-8 sm:px-10 sm:py-10"
        >
          <motion.div variants={item}>
            <GuestPageHeader
              icon={MapPin}
              eyebrow={t.dayOfBadge}
              title={t.dayOfTitle}
              subtitle={t.dayOfSubtitle}
            />
          </motion.div>

          {/* Search — the only thing guests need */}
          <motion.div variants={item} className="relative max-w-sm mx-auto mt-6">
            <Search className="w-5 h-5 text-[#8B735B] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden />
            <input
              type="text"
              inputMode="numeric"
              maxLength={4}
              autoComplete="off"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.checkinSearchPh}
              aria-label={t.checkinSearchPh}
              className="guest-input pl-12 font-mono font-bold tracking-[0.3em] placeholder:tracking-normal placeholder:font-sans placeholder:font-normal"
            />

            {/* Animated dropdown results */}
            <AnimatePresence>
              {searchQuery.trim() && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.98 }}
                  transition={{ duration: 0.18 }}
                  className="absolute z-20 left-0 right-0 mt-2 bg-white rounded-xl border border-[#CBAE94] shadow-lg overflow-hidden text-left"
                >
                  {searching ? (
                    <div className="p-4 flex items-center gap-2 text-xs text-[#5D5449]">
                      <Info className="w-4 h-4 shrink-0 text-[#8B735B]" />
                      {t.finderSearching}
                    </div>
                  ) : hits.length === 0 ? (
                    <div className="p-4 flex items-center gap-2 text-xs text-[#5D5449]">
                      <Info className="w-4 h-4 shrink-0 text-[#8B735B]" />
                      {t.finderNoMatch}
                    </div>
                  ) : (
                    hits.map((hit, idx) => (
                      <motion.button
                        key={`${hit.guest.id}:${hit.attendeeName ?? 'PRIMARY'}`}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: idx * 0.04 }}
                        onClick={() => pickPerson(hit)}
                        className="w-full min-h-[52px] px-4 py-3 text-left hover:bg-[#EFE6DC]/50 transition-colors flex items-center justify-between gap-3 border-b border-[#CBAE94]/30 last:border-b-0"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-[#4A3F35] break-words">{hit.displayName}</p>
                          <span className="text-xs text-[#5D5449]">
                            {hit.attendeeName === null
                              ? t.finderPartyLead
                              : tf('finderPartyOf', { name: hit.guest.name })}
                          </span>
                        </div>
                        <ChevronRight className="w-4 h-4 text-[#8B735B] shrink-0" />
                      </motion.button>
                    ))
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          {isLoading && !selected && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: [0.4, 1, 0.4] }}
              transition={{ duration: 1.4, repeat: Infinity }}
              className="relative mt-6 text-xs font-mono text-[#8B735B] text-center"
            >
              {t.finderSearching}
            </motion.p>
          )}
        </motion.div>

        {/* Selected guest result */}
        <AnimatePresence mode="wait">
          {selected && (
            <motion.div
              key={selected.id}
              initial={{ opacity: 0, scale: 0.92, y: 24 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -12 }}
              transition={{ type: 'spring', stiffness: 240, damping: 22 }}
              className="card-soft p-6 sm:p-8 space-y-6"
            >
              {/* Welcome header */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[#CBAE94]/40 pb-5">
                <motion.div
                  className="flex items-center gap-3 min-w-0"
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1, type: 'spring', stiffness: 300, damping: 20 }}
                >
                  <motion.div
                    className="w-12 h-12 shrink-0 rounded-2xl bg-[#EFE6DC] border border-[#CBAE94]/60 text-[#8B735B] flex items-center justify-center"
                    animate={{ rotate: [0, -6, 6, 0] }}
                    transition={{ duration: 0.8, delay: 0.45 }}
                  >
                    <MapPin className="w-6 h-6" />
                  </motion.div>
                  <div className="min-w-0">
                    <h2 className="font-gaegu text-3xl font-bold text-[#4A3F35] leading-tight break-words">
                      {tf('finderWelcome', { name: selected.displayName })}
                    </h2>
                    <p className="text-xs text-[#5D5449] font-bold font-mono mt-0.5">
                      {tf('finderCodeParty', { code: selected.guest.code, count: String(getGuestPartySize(selected.guest)) })}
                    </p>
                  </div>
                </motion.div>

                <button
                  onClick={() => {
                    setDismissedId(selected.id);
                    setSearchPick(null);
                  }}
                  className="min-h-[44px] text-xs font-bold text-[#4A3F35] border border-[#CBAE94] px-4 rounded-full transition-transform hover:-translate-y-0.5 active:scale-95 shrink-0"
                >
                  {t.clearSelectionBtn}
                </button>
              </div>

              {/* Check-in — the party is one unit: any member checks everyone in at once */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="guest-label">
                    <UserCheck aria-hidden />
                    {t.checkinPartyLabel}
                  </p>
                  <span className={`text-xs font-mono font-bold ${allChecked ? 'text-ok' : 'text-[#5D5449]'}`}>
                    {tf('partyProgressLabel', { done: String(checkedCount), total: String(members.length) })}
                  </span>
                </div>

                <ul className="rounded-xl border border-[#CBAE94]/50 bg-white divide-y divide-[#CBAE94]/30 overflow-hidden">
                  {members.map((member) => {
                    const checked = isMemberCheckedIn(selected.guest, member);
                    const isSelf = member.trim().toLowerCase() === identifiedName.toLowerCase();
                    const isLeader = isPartyLead(selected.guest, member);
                    return (
                      <motion.li
                        key={member}
                        initial={{ opacity: 0, x: -14 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ type: 'spring', stiffness: 280, damping: 22 }}
                        className={`flex items-center gap-3 px-4 py-3 transition-colors ${
                          isLeader ? 'bg-[#EFE6DC]/70 border-l-4 border-l-[#8B735B]' : ''
                        }`}
                      >
                        <span
                          className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                            checked ? 'bg-green-800 text-white' : 'bg-[#EFE6DC] text-[#8B735B]'
                          }`}
                        >
                          {member.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-[#4A3F35] break-words">
                            {member}
                            {isSelf && (
                              <span className="ml-1.5 text-xs font-mono uppercase text-[#8B735B]">
                                {t.checkinYouLabel}
                              </span>
                            )}
                            {isLeader && (
                              <span className="ml-1.5 text-xs font-mono uppercase font-bold text-[#8B735B]">
                                {t.finderPartyLead}
                              </span>
                            )}
                          </p>
                        </div>
                        <span className={`text-xs font-mono font-bold shrink-0 ${checked ? 'text-ok' : 'text-[#5D5449]'}`}>
                          {checked ? t.checkedInLabel : t.notYetLabel}
                        </span>
                      </motion.li>
                    );
                  })}
                </ul>

                {allChecked ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    role="status"
                    className="status-ok flex items-center gap-3 p-4 rounded-xl border"
                  >
                    <motion.span
                      animate={{ rotate: [0, -10, 10, 0] }}
                      transition={{ duration: 2, repeat: Infinity }}
                    >
                      <Sparkles className="w-5 h-5 shrink-0" />
                    </motion.span>
                    <p className="text-sm font-bold">{t.checkinAllDone}</p>
                  </motion.div>
                ) : (
                  <motion.button
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    onClick={() => void act(false)}
                    disabled={busy === 'all'}
                    className="btn-accent w-full py-3.5 min-h-[52px] text-sm font-bold gap-2 disabled:opacity-50"
                  >
                    <UserCheck className="w-4 h-4" />
                    {t.checkinAllBtn}
                  </motion.button>
                )}

                {checkedCount > 0 && (
                  <div className="flex justify-end">
                    <button
                      onClick={() => void act(true)}
                      disabled={busy === 'all'}
                      className="min-h-[44px] flex items-center gap-1.5 text-xs font-bold text-[#5D5449] hover:text-[#4A3F35] disabled:opacity-40 transition-colors"
                    >
                      <RotateCcw className="w-3 h-3" />
                      {t.undoCheckinBtn}
                    </button>
                  </div>
                )}
              </div>

              <VenueModal
                open={venueOpen}
                selected={selected}
                floorMap={floorMap}
                roster={mapRoster}
                onClose={() => setVenueOpen(false)}
              />

              {/* Venue — full-screen modal, auto-opens after checking in.
                  The entry point only appears once someone has checked in. */}
              {checkedCount > 0 && (
                <motion.button
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  onClick={() => setVenueOpen(true)}
                  className="btn-accent w-full py-3.5 min-h-[52px] text-sm font-bold gap-2"
                >
                  <MapPin className="w-4 h-4" />
                  {t.venueBtn}
                </motion.button>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
