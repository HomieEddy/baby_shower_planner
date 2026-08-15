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
  CheckCircle2,
  RotateCcw,
  UserCheck,
} from 'lucide-react';
import { Guest, FloorMapData } from '../../types';
import { useT } from '../shared/i18n';
import { useToast } from '../shared/ToastContext';
import { getPartyMembers, isMemberCheckedIn, isPartyLead } from '../../lib/guestAttendees';
import { getGuestPartySize } from './floorPlanHelpers';
import { VenueModal } from './VenueModal';

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
  const { toast } = useToast();
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
    enabled: /^\d{4}$/.test(searchCode),
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
  const isLead = selected ? isPartyLead(selected.guest, identifiedName) : false;
  const members = selected ? getPartyMembers(selected.guest) : [];
  const checkedCount = selected
    ? members.filter((m) => isMemberCheckedIn(selected.guest, m)).length
    : 0;
  const allChecked = selected && members.length > 0 && checkedCount === members.length;

  const act = async (targetName?: string, all = false, undo = false) => {
    if (!selected) return;
    const key = targetName ?? 'all';
    setBusy(key);
    try {
      const body = initialToken
        ? { token: initialToken, targetName, all, undo }
        : { code: selected.guest.code, name: identifiedName, targetName, all, undo };
      const res = await fetch('/api/check-in/self', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error === 'DECLINED' ? t.checkinDeclinedError : data.error || 'Check-in failed');
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
      toast.success(t.checkinDoneToast.replace('{{name}}', targetName ?? identifiedName));
      // The arrival moment: show the venue full-screen after checking in.
      if (!undo) setVenueOpen(true);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#F3EBE1] via-[#FAF6F0] to-[#F3EBE1] py-8 sm:py-14 px-4">
      <div className="max-w-4xl mx-auto space-y-6 relative">
        {/* Hero — staggered entrance */}
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="relative rounded-3xl bg-[#FFFDF9] shadow-xl border-2 border-[#CBAE94] px-6 py-10 sm:px-10 text-center"
        >
          {/* drifting decorative orbs — clipped to the card without clipping the dropdown */}
          <div aria-hidden className="absolute inset-0 overflow-hidden rounded-3xl pointer-events-none">
            <motion.div
              className="absolute -top-16 -left-16 w-48 h-48 rounded-full bg-[#EFE6DC] blur-3xl opacity-70"
              animate={{ x: [0, 18, 0], y: [0, 10, 0] }}
              transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
            />
            <motion.div
              className="absolute -bottom-20 -right-14 w-56 h-56 rounded-full bg-[#E7D5BE] blur-3xl opacity-50"
              animate={{ x: [0, -16, 0], y: [0, -12, 0] }}
              transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
            />
          </div>

          <motion.div variants={item} className="relative">
            <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-[#EFE6DC] text-[#8B735B] text-xs font-mono font-bold uppercase tracking-wider">
              <motion.span
                animate={{ rotate: [0, -10, 10, 0] }}
                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
              >
                <MapPin className="w-3.5 h-3.5" />
              </motion.span>
              {t.dayOfBadge}
            </span>
          </motion.div>

          <motion.h1
            variants={item}
            className="relative mt-4 font-gaegu text-4xl sm:text-5xl font-bold text-[#4A3F35]"
          >
            {t.dayOfTitle}
          </motion.h1>

          <motion.p
            variants={item}
            className="relative mt-3 text-sm text-[#5D5449] font-medium max-w-lg mx-auto"
          >
            {t.dayOfSubtitle}
          </motion.p>

          {/* Search — the only thing guests need */}
          <motion.div variants={item} className="relative max-w-md mx-auto mt-7">
            <Search className="w-5 h-5 text-[#CBAE94] absolute left-4 top-3.5 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t.checkinSearchPh}
              aria-label={t.checkinSearchPh}
              className="w-full pl-12 pr-4 py-3 rounded-2xl border-2 border-[#CBAE94] text-sm font-bold text-[#5D5449] focus:outline-none focus:ring-2 focus:ring-[#8B735B] bg-white shadow-inner transition-all focus:scale-[1.01]"
            />

            {/* Animated dropdown results */}
            <AnimatePresence>
              {searchQuery.trim() && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.98 }}
                  transition={{ duration: 0.18 }}
                  className="absolute z-20 left-0 right-0 mt-2 bg-white rounded-2xl border-2 border-[#CBAE94] shadow-xl overflow-hidden"
                >
                  {searching ? (
                    <div className="p-4 flex items-center gap-2 text-xs text-[#5D5449]/70 italic">
                      <Info className="w-4 h-4 shrink-0 text-[#CBAE94]" />
                      {t.finderSearching}
                    </div>
                  ) : hits.length === 0 ? (
                    <div className="p-4 flex items-center gap-2 text-xs text-[#5D5449]/70 italic">
                      <Info className="w-4 h-4 shrink-0 text-[#CBAE94]" />
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
                        className="w-full p-3 text-left hover:bg-[#EFE6DC]/50 transition-colors flex items-center justify-between border-b border-[#EFE6DC] last:border-b-0"
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-[#4A3F35] truncate">
                            {hit.displayName}
                            {hit.attendeeName === null && (
                              <span className="ml-1.5 text-[9px] font-mono uppercase text-[#8B735B]">
                                {t.finderPartyLead}
                              </span>
                            )}
                          </p>
                          <span className="text-[10px] text-[#8B735B] font-mono">
                            {hit.guest.code}
                            {hit.attendeeName !== null && (
                              <span className="ml-1.5 text-[#CBAE94]">
                                • {hit.guest.name}'s party
                              </span>
                            )}
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
              className="relative mt-6 text-xs font-mono text-[#8B735B]"
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
              className="bg-[#FFFDF9] rounded-3xl p-6 sm:p-8 shadow-xl border-2 border-[#CBAE94] space-y-6"
            >
              {/* Welcome header */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-[#CBAE94]/40 pb-5">
                <motion.div
                  className="flex items-center gap-3"
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1, type: 'spring', stiffness: 300, damping: 20 }}
                >
                  <motion.div
                    className="w-12 h-12 rounded-2xl bg-[#8B735B] text-white flex items-center justify-center shadow-md"
                    animate={{ rotate: [0, -6, 6, 0] }}
                    transition={{ duration: 0.8, delay: 0.45 }}
                  >
                    <MapPin className="w-6 h-6" />
                  </motion.div>
                  <div>
                    <h3 className="font-gaegu text-3xl font-bold text-[#4A3F35]">
                      {t.finderWelcome.replace('{{name}}', selected.displayName)}
                    </h3>
                    <p className="text-xs text-[#8B735B] font-bold font-mono">
                      {t.finderCodeParty
                        .replace('{{code}}', selected.guest.code)
                        .replace('{{count}}', String(getGuestPartySize(selected.guest)))}
                    </p>
                  </div>
                </motion.div>

                <button
                  onClick={() => {
                    setDismissedId(selected.id);
                    setSearchPick(null);
                  }}
                  className="text-xs font-bold text-[#8B735B] hover:text-[#4A3F35] bg-[#EFE6DC] px-3 py-2 rounded-xl transition-colors active:scale-95"
                >
                  {t.clearSelectionBtn}
                </button>
              </div>

              {/* Check-in — each guest checks in themselves; the lead can check in the whole party */}
              <div className="space-y-2">
                <p className="text-[11px] font-mono uppercase tracking-wider font-bold text-[#8B735B] flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5" />
                  {t.checkinPartyLabel}
                </p>

                {allChecked ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-3 p-4 rounded-2xl bg-green-50 border-2 border-green-300 text-green-800"
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
                  members.map((member) => {
                    const checked = isMemberCheckedIn(selected.guest, member);
                    const isSelf =
                      member.trim().toLowerCase() === identifiedName.toLowerCase();
                    const canAct = isLead || isSelf;
                    const isBusy = busy === member;
                    return (
                      <motion.div
                        key={member}
                        initial={{ opacity: 0, x: -14 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ type: 'spring', stiffness: 280, damping: 22 }}
                        className={`flex items-center justify-between gap-3 p-3.5 rounded-2xl border-2 transition-colors ${
                          checked
                            ? 'bg-green-50 border-green-200'
                            : isSelf
                              ? 'bg-amber-50/70 border-amber-200'
                              : 'bg-white border-[#CBAE94]/30'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className={`w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-bold shrink-0 ${
                              checked
                                ? 'bg-green-600 text-white'
                                : 'bg-[#EFE6DC] text-[#8B735B]'
                            }`}
                          >
                            {member.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-[#4A3F35] truncate">
                              {member}
                              {isSelf && (
                                <span className="ml-1.5 text-[9px] font-mono uppercase text-[#8B735B]">
                                  {t.checkinYouLabel}
                                </span>
                              )}
                              {!isSelf && isPartyLead(selected.guest, member) && (
                                <span className="ml-1.5 text-[9px] font-mono uppercase text-[#8B735B]">
                                  {t.finderPartyLead}
                                </span>
                              )}
                            </p>
                            <p className={`text-[10px] font-mono font-bold ${checked ? 'text-green-700' : 'text-[#A09080]'}`}>
                              {checked ? t.checkedInLabel : t.notYetLabel}
                            </p>
                          </div>
                        </div>

                        {checked ? (
                          <button
                            onClick={() => void act(member, false, true)}
                            disabled={isBusy || !canAct}
                            className="flex items-center gap-1 text-[11px] font-bold text-green-700 hover:text-green-900 disabled:opacity-40 transition-colors"
                            title={t.undoCheckinBtn}
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <RotateCcw className="w-3 h-3" />
                          </button>
                        ) : canAct ? (
                          <button
                            onClick={() => void act(member)}
                            disabled={isBusy}
                            className="px-4 py-2 rounded-full text-xs font-bold bg-[#8B735B] text-white hover:bg-[#4A3F35] transition-colors flex items-center gap-1.5 disabled:opacity-50 active:scale-95"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            {isSelf ? t.checkinMeBtn : t.checkInBtn}
                          </button>
                        ) : (
                          <span className="text-[10px] font-mono text-[#A09080] italic">
                            {t.notYetLabel}
                          </span>
                        )}
                      </motion.div>
                    );
                  })
                )}

                {isLead && !allChecked && members.length > 1 && (
                  <motion.button
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.15 }}
                    onClick={() => void act(undefined, true)}
                    disabled={busy === 'all'}
                    className="w-full py-3.5 rounded-2xl text-sm font-bold bg-[#C9A227] text-white hover:bg-[#A8861C] transition-colors flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.99] shadow-md"
                  >
                    <UserCheck className="w-4 h-4" />
                    {t.checkinAllBtn}
                  </motion.button>
                )}
              </div>

              <VenueModal
                open={venueOpen}
                selected={selected}
                floorMap={floorMap}
                roster={mapRoster}
                onClose={() => setVenueOpen(false)}
              />

              {/* Venue — full-screen modal, auto-opens after checking in */}
              <motion.button
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.15 }}
                onClick={() => setVenueOpen(true)}
                className="w-full py-3.5 rounded-2xl text-sm font-bold bg-[#8B735B] text-white hover:bg-[#4A3F35] transition-colors flex items-center justify-center gap-2 active:scale-[0.99] shadow-md"
              >
                <MapPin className="w-4 h-4" />
                {t.venueBtn}
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
