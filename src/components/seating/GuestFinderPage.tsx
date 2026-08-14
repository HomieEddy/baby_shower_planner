import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'motion/react';
import { Stage, Layer, Group, Circle, Text } from 'react-konva';
import { renderTableBody, renderLandmark } from './venueShapes';
import {
  MapPin,
  Search,
  ChevronRight,
  Users,
  Utensils,
  Info,
  DoorOpen,
  Sparkles,
  CheckCircle2,
  RotateCcw,
  UserCheck,
  X,
} from 'lucide-react';
import { Guest, FloorMapData } from '../../types';
import { useT } from '../shared/i18n';
import { useToast } from '../shared/ToastContext';
import { getPartyMembers, isMemberCheckedIn, isPartyLead } from '../../lib/guestAttendees';
import {
  getGuestPartySize,
  getAttendeeSeatIndex,
  getSeatLocalPosition,
  getTableOccupiedSeats,
} from './floorPlanHelpers';

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
  roster: Guest[];
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
    roster: rosterData.roster ?? [],
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
  const [mapWidth, setMapWidth] = useState(440);
  const mapWrapRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['guest-finder', initialToken],
    queryFn: () => fetchFinderData(initialToken),
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

  // Full-width venue map: measure the card, cap at 900px (rAF so the lint rule
  // for sync setState-in-effect is not triggered). Re-measures when the venue
  // modal opens — the ref only exists while the modal is mounted.
  useEffect(() => {
    const measure = () => {
      requestAnimationFrame(() => {
        if (mapWrapRef.current) {
          setMapWidth(Math.min(mapWrapRef.current.clientWidth, 900));
        }
      });
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [selected, floorMap, venueOpen]);

  // Escape closes the full-screen venue modal
  useEffect(() => {
    if (!venueOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setVenueOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [venueOpen]);

  // Attendee-level search: one hit per person (primary guest + each attendee),
  // so a shared reservation code surfaces every member of the party.
  const hits = useMemo<AttendeeHit[]>(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const out: AttendeeHit[] = [];
    for (const g of data?.roster ?? []) {
      const code = g.code.toLowerCase();
      const names = g.attendee_names && g.attendee_names.length > 0 ? g.attendee_names : [];
      const primary = { guest: g, attendeeName: null, displayName: g.name };
      const personMatches =
        primary.displayName.toLowerCase().includes(q) || code.includes(q);
      if (personMatches) out.push(primary);
      names.forEach((n) => {
        // The primary guest is often repeated as attendee_names[0] — already
        // represented by the primary hit, so skip the duplicate row.
        if (n.trim().toLowerCase() === g.name.trim().toLowerCase()) return;
        const hit = { guest: g, attendeeName: n, displayName: n };
        if (n.toLowerCase().includes(q) || code.includes(q)) {
          out.push(hit);
        }
      });
    }
    return out;
  }, [searchQuery, data]);

  const guestAssignedTable = useMemo(() => {
    if (!selected || !floorMap) return null;
    return (
      floorMap.tables.find((tbl) => tbl.assignedGuestIds.includes(selected.guest.id)) ?? null
    );
  }, [selected, floorMap]);

  // Seat index of the selected attendee within their assigned table
  const seatIndex = useMemo(() => {
    if (!selected || !guestAssignedTable) return null;
    return getAttendeeSeatIndex(
      guestAssignedTable,
      selected.guest.id,
      selected.attendeeName,
      data?.roster ?? []
    );
  }, [selected, guestAssignedTable, data]);

  const scale = floorMap ? mapWidth / floorMap.canvasWidth : 1;
  const mapHeight = floorMap ? Math.round(floorMap.canvasHeight * scale) : 280;

  const entrance = useMemo(
    () => floorMap?.landmarks.find((l) => l.type === 'entrance') ?? null,
    [floorMap]
  );

  const targetTableCenter = guestAssignedTable
    ? {
        x: (guestAssignedTable.x + guestAssignedTable.width / 2) * scale,
        y: (guestAssignedTable.y + guestAssignedTable.height / 2) * scale,
      }
    : null;

  // Canvas position of the selected attendee's seat (for the green pulse)
  const seatCenter = useMemo(() => {
    if (!guestAssignedTable || seatIndex === null) return null;
    const local = getSeatLocalPosition(guestAssignedTable, seatIndex);
    return {
      x: (guestAssignedTable.x + local.x) * scale,
      y: (guestAssignedTable.y + local.y) * scale,
    };
  }, [guestAssignedTable, seatIndex, scale]);

  const entranceCenter = entrance
    ? {
        x: (entrance.x + entrance.width / 2) * scale,
        y: (entrance.y + entrance.height / 2) * scale,
      }
    : null;

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
        toast.error(data.error || 'Check-in failed');
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
                roster: old.roster.map((g) => (g.id === updated.id ? updated : g)),
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
                  {hits.length === 0 ? (
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

              {createPortal(
                <AnimatePresence>
                  {venueOpen && selected && (
                    <motion.div
                      className="fixed inset-0 z-50 bg-[#3A2F27]/90 backdrop-blur-md flex items-center justify-center p-4 sm:p-8 overflow-y-auto"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      onClick={() => setVenueOpen(false)}
                    >
                      <motion.div
                        initial={{ opacity: 0, scale: 0.92, y: 24 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95, y: -12 }}
                        transition={{ type: 'spring', stiffness: 240, damping: 22 }}
                        onClick={(e) => e.stopPropagation()}
                        className="relative w-full max-w-4xl bg-[#FFFDF9] rounded-3xl shadow-2xl border-2 border-[#CBAE94] p-5 sm:p-8 max-h-[92vh] overflow-y-auto"
                      >
                        {/* Header */}
                        <div className="flex items-center justify-between gap-3 border-b border-[#CBAE94]/40 pb-4 mb-5">
                          <div className="flex items-center gap-3 min-w-0">
                            <motion.div
                              className="w-11 h-11 rounded-2xl bg-[#8B735B] text-white flex items-center justify-center shadow-md shrink-0"
                              animate={{ rotate: [0, -6, 6, 0] }}
                              transition={{ duration: 0.8, delay: 0.3 }}
                            >
                              <MapPin className="w-5 h-5" />
                            </motion.div>
                            <div className="min-w-0">
                              <h3 className="font-gaegu text-2xl font-bold text-[#4A3F35] truncate">
                                {t.venueTitle}
                              </h3>
                              <p className="text-[11px] font-mono font-bold text-[#8B735B] truncate">
                                {selected.displayName} · {t.finderCodeParty
                                  .replace('{{code}}', selected.guest.code)
                                  .replace('{{count}}', String(getGuestPartySize(selected.guest)))}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setVenueOpen(false)}
                            className="p-2 rounded-full hover:bg-[#EFE6DC] text-[#5D5449] transition-colors shrink-0"
                            title={t.closeModal}
                          >
                            <X className="w-5 h-5" />
                          </button>
                        </div>

                        {guestAssignedTable ? (
                <div className="space-y-5">
                  {/* Assigned table card — full width, above the map */}
                  <motion.div
                    initial={{ opacity: 0, x: -18 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.15, type: 'spring', stiffness: 260, damping: 22 }}
                    className="p-5 rounded-2xl bg-[#EFE6DC]/60 border-2 border-[#CBAE94]"
                  >
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                      <div className="flex items-center gap-4">
                        <motion.span
                          className="shrink-0 inline-block px-3 py-1 rounded-full bg-[#8B735B] text-white text-[11px] font-mono font-bold uppercase"
                          initial={{ opacity: 0, y: -6 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.25 }}
                        >
                          {t.finderAssignedTable}
                        </motion.span>
                        <motion.h4
                          className="font-gaegu text-3xl font-bold text-[#4A3F35]"
                          initial={{ scale: 0.8 }}
                          animate={{ scale: 1 }}
                          transition={{ delay: 0.3, type: 'spring', stiffness: 320, damping: 16 }}
                        >
                          {guestAssignedTable.name}
                        </motion.h4>
                      </div>

                      <div className="space-y-1.5 text-xs text-[#5D5449]">
                      <p className="flex items-center gap-2 font-bold">
                        <Users className="w-4 h-4 text-[#8B735B]" />
                        {t.finderSeatedWithParty.replace(
                          '{{count}}',
                          String(getGuestPartySize(selected.guest))
                        )}
                      </p>
                      <p className="flex items-center gap-2 font-bold">
                        <MapPin className="w-4 h-4 text-[#8B735B]" />
                        {t.finderNearEntrance}
                      </p>
                      {selected.guest.dietary_restrictions && (
                        <motion.p
                          className="flex items-center gap-2 font-bold text-[#8B735B]"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.5 }}
                        >
                          <Utensils className="w-4 h-4" />
                          {t.finderDietaryNote.replace(
                            '{{dietary}}',
                            selected.guest.dietary_restrictions
                          )}
                        </motion.p>
                      )}
                    </div>

                    <motion.div
                      className="flex items-center gap-2 pt-1 text-[11px] font-mono text-[#4A3F35] font-bold"
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.55 }}
                    >
                      <motion.span
                        animate={{ scale: [1, 1.25, 1] }}
                        transition={{ duration: 1.4, repeat: Infinity }}
                      >
                        <CheckCircle2 className="w-4 h-4 text-green-600" />
                      </motion.span>
                      {t.finderAllSet}
                    </motion.div>
                    </div>
                  </motion.div>

                  {/* Venue map — full width of the page card */}
                  <motion.div
                    initial={{ opacity: 0, scale: 0.94, y: 18 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    transition={{ delay: 0.2, type: 'spring', stiffness: 220, damping: 24 }}
                    className="bg-[#FAF6F0] p-4 rounded-2xl border-2 border-[#CBAE94]"
                  >
                    <p className="text-xs font-bold text-[#8B735B] text-center">
                      {t.finderTableHighlight}
                    </p>
                    <p className="text-[10px] font-mono text-[#CBAE94] text-center mb-2">
                      {t.finderMapHint}
                    </p>

                    <div ref={mapWrapRef} className="relative w-full overflow-x-auto flex justify-center">
                      {floorMap && (
                        <div
                          className="relative shrink-0"
                          style={{ width: mapWidth, height: mapHeight }}
                        >
                          <Stage width={mapWidth} height={mapHeight} scaleX={scale} scaleY={scale}>
                            <Layer>
                              {/* Landmarks — same premium rendering as the host editor */}
                              {floorMap.landmarks.map((l) => (
                                <Group key={`gmap-${l.id}`} x={l.x} y={l.y}>
                                  {renderLandmark(l, false)}
                                </Group>
                              ))}

                              {/* Tables — same markup as the host editor: seat dots,
                                  premium body, title, capacity pill */}
                              {floorMap.tables.map((tbl) => {
                                const isTarget = tbl.id === guestAssignedTable.id;
                                const capacity = tbl.capacity || 8;
                                const occupied = getTableOccupiedSeats(tbl, data?.roster ?? []);
                                return (
                                  <Group key={`gtbl-${tbl.id}`} x={tbl.x} y={tbl.y}>
                                    {/* Outer seat dots around the table (editor geometry) */}
                                    {Array.from({ length: capacity }).map((_, i) => {
                                      const pos = getSeatLocalPosition(tbl, i);
                                      const isMine = isTarget && seatIndex === i;
                                      return (
                                        <Circle
                                          key={`seat-${i}`}
                                          x={pos.x}
                                          y={pos.y}
                                          radius={8}
                                          fill={isMine ? '#2E9E5B' : i < occupied ? '#8B735B' : '#FFFDF9'}
                                          stroke={isMine ? '#1B7A43' : '#CBAE94'}
                                          strokeWidth={2}
                                        />
                                      );
                                    })}

                                    {/* Premium table body */}
                                    {renderTableBody({ table: tbl, isSelected: false })}

                                    {/* Table title */}
                                    <Text
                                      text={tbl.name}
                                      width={tbl.width}
                                      height={tbl.height * 0.6}
                                      align="center"
                                      verticalAlign="middle"
                                      fontSize={11}
                                      fontStyle="bold"
                                      fill="#4A3F35"
                                      padding={4}
                                    />

                                    {/* Capacity pill */}
                                    <Text
                                      text={`${occupied}/${capacity} Seats`}
                                      y={tbl.height * 0.58}
                                      width={tbl.width}
                                      align="center"
                                      fontSize={9}
                                      fontStyle="bold"
                                      fill={occupied > capacity ? '#C53030' : '#8B735B'}
                                    />
                                  </Group>
                                );
                              })}
                            </Layer>
                          </Stage>

                          {/* Pulsing ring on the guest's table */}
                          {targetTableCenter && (
                            <div
                              className="absolute pointer-events-none"
                              style={{
                                left: targetTableCenter.x,
                                top: targetTableCenter.y,
                                transform: 'translate(-50%, -50%)',
                              }}
                            >
                              <motion.span
                                aria-hidden
                                className="absolute inset-0 rounded-full border-[3px] border-[#C9A227]"
                                initial={{ scale: 0.6, opacity: 0.9 }}
                                animate={{ scale: [0.7, 1.9], opacity: [0.85, 0] }}
                                transition={{ duration: 1.4, repeat: Infinity, ease: 'easeOut' }}
                              />
                              <motion.span
                                aria-hidden
                                className="absolute inset-0 rounded-full border-2 border-[#C9A227]"
                                animate={{ scale: [1, 1.25], opacity: [0.9, 0.25] }}
                                transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                              />
                              <span className="absolute inset-0 rounded-full bg-[#C9A227]/20 blur-[2px]" />
                            </div>
                          )}

                          {/* Pulsing green seat — the attendee's exact seat */}
                          {seatCenter && (
                            <div
                              className="absolute pointer-events-none"
                              style={{
                                left: seatCenter.x,
                                top: seatCenter.y,
                                transform: 'translate(-50%, -50%)',
                              }}
                            >
                              <motion.span
                                aria-hidden
                                className="absolute inset-0 rounded-full border-[3px] border-[#2E9E5B]"
                                initial={{ scale: 0.5, opacity: 0.9 }}
                                animate={{ scale: [0.6, 2.2], opacity: [0.9, 0] }}
                                transition={{ duration: 1.2, repeat: Infinity, ease: 'easeOut' }}
                              />
                              <span className="absolute inset-0 rounded-full bg-[#2E9E5B]/30 blur-[1px]" />
                            </div>
                          )}

                          {/* Bobbing entrance pin */}
                          {entranceCenter && (
                            <div
                              className="absolute pointer-events-none"
                              style={{
                                left: entranceCenter.x,
                                top: entranceCenter.y - 10 * scale,
                                transform: 'translate(-50%, -50%)',
                              }}
                            >
                              <motion.span
                                aria-hidden
                                className="absolute inset-0 rounded-full bg-[#4A9D6E]/30"
                                animate={{ scale: [1, 2], opacity: [0.6, 0] }}
                                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
                              />
                              <motion.div
                                className="relative w-8 h-8 rounded-full bg-[#4A9D6E] text-white flex items-center justify-center shadow-lg"
                                animate={{ y: [0, -5, 0] }}
                                transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                              >
                                <DoorOpen className="w-4 h-4" />
                              </motion.div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Legend */}
                    <div className="flex flex-wrap items-center justify-center gap-4 mt-3 text-[10px] font-mono font-bold text-[#5D5449]">
                      <span className="flex items-center gap-1.5">
                        <motion.span
                          className="w-2.5 h-2.5 rounded-full bg-[#C9A227]"
                          animate={{ opacity: [1, 0.35, 1] }}
                          transition={{ duration: 1.4, repeat: Infinity }}
                        />
                        {t.finderLegendYourTable}
                      </span>
                      {seatCenter && (
                        <span className="flex items-center gap-1.5">
                          <motion.span
                            className="w-2.5 h-2.5 rounded-full bg-[#2E9E5B]"
                            animate={{ scale: [1, 1.6, 1], opacity: [1, 0.4, 1] }}
                            transition={{ duration: 1.2, repeat: Infinity }}
                          />
                          {t.finderLegendYourSeat}
                        </span>
                      )}
                      {entrance && (
                        <span className="flex items-center gap-1.5">
                          <motion.span
                            className="w-2.5 h-2.5 rounded-full bg-[#4A9D6E]"
                            animate={{ scale: [1, 1.5, 1], opacity: [1, 0.5, 1] }}
                            transition={{ duration: 1.8, repeat: Infinity }}
                          />
                          {t.finderLegendEntrance}
                        </span>
                      )}
                      <span className="flex items-center gap-1.5 text-[#CBAE94]">
                        <Sparkles className="w-3 h-3" />
                        {t.finderMapLive}
                      </span>
                    </div>
                  </motion.div>
                </div>
              ) : (
                <motion.div
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.15 }}
                  className="p-6 rounded-2xl bg-amber-50 border-2 border-amber-200 text-center space-y-2"
                >
                  <motion.div
                    animate={{ y: [0, -5, 0] }}
                    transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                    className="w-fit mx-auto"
                  >
                    <Info className="w-6 h-6 text-amber-600" />
                  </motion.div>
                  <p className="font-bold text-sm text-amber-900">
                    {t.finderOpenSeatingTitle}
                  </p>
                  <p className="text-xs text-amber-700">{t.finderOpenSeatingMsg}</p>
                </motion.div>
              )}
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>,
                document.body
              )}

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
