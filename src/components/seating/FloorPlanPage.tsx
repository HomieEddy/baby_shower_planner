import React, { useState, useEffect, useMemo, useRef, lazy, Suspense } from 'react';
import {
  Guest,
  FloorMapData,
  TableElement,
  LandmarkElement,
} from '../../types';
import { adminFetch } from '../../lib/api';
import { DayOfQrModal } from './DayOfQrModal';
import { UnassignedGuestsSidebar } from './UnassignedGuestsSidebar';
import { SmartSuggestionsModal } from './SmartSuggestionsModal';
import { HoverTooltip } from './HoverTooltip';
import { FloorPlanEditor } from './FloorPlanEditor';
import { ViewModeToggle, ViewMode } from '../shared/ViewModeToggle';
import { Segmented } from '../shared/Segmented';
import { motion, AnimatePresence } from 'motion/react';
import { Modal } from '../shared/Modal';
import { useActionConfirm } from '../shared/ConfirmDialog';
import { useToast } from '../shared/ToastContext';
import { useSettings } from '../../lib/settingsQuery';
import {
  Stage,
  Layer,
  Circle,
  Text,
  Group,
} from 'react-konva';
import {
  Layout,
  Users,
  Printer,
  Download,
  Sparkles,
  X,
  Mail,
  Info,
  Layers,
  Maximize2,
  CheckCircle2,
  Undo2,
  Redo2,
  Wand2,
  PieChart,
} from 'lucide-react';
import {
  getGuestPartySize,
  getTableOccupiedSeats,
  getTableSeats,
  getTableSeatedPersonNames,
  getTableStatus,
  getGuestSeatedCount,
  getAvailableSeats,
  getUnseatedPartySize,
  canSeatParty,
  seatParty,
} from '../../lib/tableAssignment';
import { getSeatOccupantInfo } from './floorPlanHelpers';
import { suggestSeating, unseatedParties } from '../../lib/seatingSuggestions';
import type { SmartSuggestion } from '../../lib/seatingSuggestions';
import { renderTableBody, renderLandmark, SeatRing, TableLabel, renderRoomBoundary } from './venueShapes';
import { useAppStore } from '../../stores/appStore';
import { useCapabilities, noProviders } from '../../lib/capabilities';

const FloorPlan3D = lazy(() => import('./FloorPlan3D').then((m) => ({ default: m.FloorPlan3D })));
import { useT, useTf } from '../shared/i18n';

export const FloorPlanPage = () => {
  const language = useAppStore((s) => s.language);
  const settings = useSettings();
  const t = useT();
  const tf = useTf();
  const confirmAction = useActionConfirm();
  const { toast } = useToast();
  const { data: caps } = useCapabilities();
  const sendsBlocked = noProviders(caps);

  // Floor Map Data State
  const [floorMap, setFloorMap] = useState<FloorMapData | null>(null);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  // Full-Screen Editor Modal State
  const [isEditorModalOpen, setIsEditorModalOpen] = useState(false);

  // 2D / 3D rendering toggle
  const [viewMode, setViewMode] = useState<ViewMode>('2d');

  // Unassigned Guests Sidebar State
  const [selectedUnassignedGuest, setSelectedUnassignedGuest] = useState<Guest | null>(null);
  const [unassignedFilterQuery, setUnassignedFilterQuery] = useState('');

  // ---------------------------------------------------------
  // FEATURE 1: UNDO / REDO SEATING HISTORY STACK
  // ---------------------------------------------------------
  const [seatingHistory, setSeatingHistory] = useState<
    { floorMap: FloorMapData; guests: Guest[] }[]
  >([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  const pushSeatingHistory = (newMap: FloorMapData, newGuests: Guest[]) => {
    setSeatingHistory((prev) => {
      const nextHistory = prev.slice(0, historyIndex + 1);
      const mapClone = JSON.parse(JSON.stringify(newMap));
      const guestsClone = JSON.parse(JSON.stringify(newGuests));
      const updated = [...nextHistory, { floorMap: mapClone, guests: guestsClone }];
      setHistoryIndex(updated.length - 1);
      return updated;
    });
  };

  // Save Floor Map to Backend
  const saveFloorMap = async (newMapData: FloorMapData) => {
    setSaving(true);
    try {
      const res = await adminFetch('/api/floorplan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMapData),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.message || data.error || `Save failed (${res.status})`);
      }
      if (data.floorMap) {
        setFloorMap(data.floorMap);
      }
    } finally {
      setSaving(false);
    }
  };

  const handleUndo = async () => {
    if (historyIndex <= 0) return;
    const targetIndex = historyIndex - 1;
    const snapshot = seatingHistory[targetIndex];
    if (!snapshot) return;
    if (!(await confirmAction(t.undoBtn))) return;

    const mapClone = JSON.parse(JSON.stringify(snapshot.floorMap));
    const guestsClone = JSON.parse(JSON.stringify(snapshot.guests));

    setFloorMap(mapClone);
    setGuests(guestsClone);
    setHistoryIndex(targetIndex);

    try {
      // Seats are the source of truth; the bulk save re-syncs guest.table_id.
      await saveFloorMap(mapClone);
    } catch (err) {
      console.error('Failed to persist undo state:', err);
    }

    setNotification(t.fpUndidToast);
    setTimeout(() => setNotification(null), 2500);
  };

  const handleRedo = async () => {
    if (historyIndex >= seatingHistory.length - 1) return;
    const targetIndex = historyIndex + 1;
    const snapshot = seatingHistory[targetIndex];
    if (!snapshot) return;
    if (!(await confirmAction(t.redoBtn))) return;

    const mapClone = JSON.parse(JSON.stringify(snapshot.floorMap));
    const guestsClone = JSON.parse(JSON.stringify(snapshot.guests));

    setFloorMap(mapClone);
    setGuests(guestsClone);
    setHistoryIndex(targetIndex);

    try {
      await saveFloorMap(mapClone);
    } catch (err) {
      console.error('Failed to persist redo state:', err);
    }

    setNotification(t.fpRedidToast);
    setTimeout(() => setNotification(null), 2500);
  };

  // Keyboard shortcut for Undo/Redo (Ctrl+Z, Cmd+Z, Ctrl+Y)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (e.target as HTMLElement)?.tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag)) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          e.preventDefault();
          handleRedo();
        } else {
          e.preventDefault();
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [historyIndex, seatingHistory]);

  // ---------------------------------------------------------
  // FEATURE 2: TABLE STATUS VISUALIZATION
  // ---------------------------------------------------------
  const [tableStatusFilter, setTableStatusFilter] = useState<
    'all' | 'full' | 'partial' | 'empty'
  >('all');

  // ---------------------------------------------------------
  // FEATURE 3: SMART SEATING SUGGESTION
  // ---------------------------------------------------------
  const [isSmartSuggestOpen, setIsSmartSuggestOpen] = useState(false);
  const [smartSuggestions, setSmartSuggestions] = useState<SmartSuggestion[]>([]);
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState<Set<string>>(new Set());

  const handleGenerateSmartSuggestions = () => {
    if (!floorMap) return;

    if (unseatedParties(floorMap, guests).length === 0) {
      setNotification(t.fpAllSeatedToast);
      setTimeout(() => setNotification(null), 3000);
      return;
    }

    const generated = suggestSeating(floorMap, guests);
    if (generated.length === 0) {
      setNotification(t.fpNoFitToast);
      setTimeout(() => setNotification(null), 4000);
      return;
    }

    setSmartSuggestions(generated);
    setSelectedSuggestionIds(new Set(generated.map((s) => s.id)));
    setIsSmartSuggestOpen(true);
  };

  const handleApplySmartSuggestions = async () => {
    if (!floorMap || smartSuggestions.length === 0) return;

    const toApply = smartSuggestions.filter((s) => selectedSuggestionIds.has(s.id));
    if (toApply.length === 0) {
      setNotification(t.fpSelectSuggestionToast);
      setTimeout(() => setNotification(null), 2500);
      return;
    }
    if (!(await confirmAction(tf('applySeatingBtn', { count: toApply.length })))) return;

    let updatedMap = floorMap;
    let updatedGuests = guests;
    for (const sug of toApply) {
      const outcome = seatParty(updatedMap, updatedGuests, sug.guest.id, sug.table.id);
      updatedMap = outcome.map;
      updatedGuests = outcome.guests;
    }

    // Push snapshot to history stack
    pushSeatingHistory(updatedMap, updatedGuests);

    setFloorMap(updatedMap);
    setGuests(updatedGuests);

    try {
      await saveFloorMap(updatedMap);
    } catch (err) {
      console.error('Failed to persist smart suggestions:', err);
    }

    setIsSmartSuggestOpen(false);
    setNotification(tf('fpAutoSeatedToast', { count: toApply.length }));
    setTimeout(() => setNotification(null), 3500);
  };

  // Main Page Direct Seating Assignment Handler. Clicking a table fills the
  // party's not-yet-seated members into free chairs — partial filling a table
  // is the split. Clicking null unseats the whole party.
  const handleMainAssignGuest = async (guestId: string, tableId: string | null): Promise<boolean> => {
    if (!floorMap) return false;

    const guest = guests.find((g) => g.id === guestId);
    if (!guest) return false;

    const targetTable = tableId ? floorMap.tables.find((t) => t.id === tableId) : undefined;
    if (tableId && !targetTable) return false;
    if (!(await confirmAction(tableId ? t.seatPartyHereBtn : t.unassignParty))) return false;

    const outcome = seatParty(floorMap, guests, guestId, tableId);
    const updatedMap = outcome.map;
    const updatedGuests = outcome.guests;

    // Record history snapshot
    pushSeatingHistory(updatedMap, updatedGuests);

    setFloorMap(updatedMap);
    setGuests(updatedGuests);

    try {
      await saveFloorMap(updatedMap);
    } catch (err) {
      console.error('Failed to persist guest assignment:', err);
    }

    if (tableId && targetTable) {
      const seatedHere = updatedMap.tables.find((tbl) => tbl.id === tableId)?.assignedGuestIds.includes(guestId) ?? false;
      if (seatedHere) {
        setNotification(tf('fpSeatedToast', { guest: guest.name, size: String(Math.min(getGuestPartySize(guest), targetTable.capacity)), table: targetTable.name }));
        setTimeout(() => setNotification(null), 3000);
      } else if (outcome.unplaced > 0) {
        setNotification(
          tf('fpNoFitTableToast', { table: targetTable.name, free: '0', guest: guest.name, needed: String(outcome.unplaced) })
        );
        setTimeout(() => setNotification(null), 4000);
      }
    } else {
      setNotification(tf('fpUnseatedToast', { guest: guest.name }));
      setTimeout(() => setNotification(null), 2500);
    }

    return true;
  };

  // Day-Of QR Modal
  const [isQrModalOpen, setIsQrModalOpen] = useState(false);

  // Email Share Modal
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [shareCustomMsg, setShareCustomMsg] = useState('');
  const [sendingEmail, setSendingEmail] = useState(false);

  // Hover Tooltip Details State
  const [hoverTooltip, setHoverTooltip] = useState<{
    title: string;
    subtitle?: string;
    details: string[];
    x: number;
    y: number;
  } | null>(null);

  const handleTableHover = (table: TableElement, guestsList: Guest[], clientX: number, clientY: number) => {
    const occupiedSeats = getTableOccupiedSeats(table, guestsList);
    const seatedPersonNames = getTableSeatedPersonNames(table, guestsList);
    const shapeLabel = table.shape === 'circle' ? t.roundTableBtn : t.rectTableBtn;
    const names =
      seatedPersonNames.length > 0 ? seatedPersonNames.join(', ') : t.fpTooltipNoGuests;

    setHoverTooltip({
      title: table.name,
      subtitle: `${shapeLabel} • ${occupiedSeats}/${table.capacity} ${t.seatsLabel}`,
      details: [
        tf('fpTooltipSeated', { count: seatedPersonNames.length, names }),
        tf('fpTooltipCapacity', {
          capacity: table.capacity,
          available: Math.max(0, table.capacity - occupiedSeats),
        }),
      ],
      x: clientX,
      y: clientY,
    });
  };

  const handleSeatHover = (table: TableElement, seatIndex: number, guestsList: Guest[], clientX: number, clientY: number) => {
    const info = getSeatOccupantInfo(table, seatIndex, guestsList);

    if (info.isOccupied) {
      const details: string[] = [
        language === 'FR'
          ? `Table & Siège : Siège n°${seatIndex + 1} (${table.name})`
          : `Table & Seat: Seat #${seatIndex + 1} at ${table.name}`,
      ];

      if (info.mainGuestName && info.attendeeName !== info.mainGuestName) {
        details.push(
          language === 'FR'
            ? `Hôte principal : ${info.mainGuestName}`
            : `Primary Host: ${info.mainGuestName}`
        );
      }

      if (info.guestCode) {
        details.push(
          language === 'FR'
            ? `Code de réservation : ${info.guestCode}`
            : `Reservation Code: ${info.guestCode}`
        );
      }

      details.push(
        language === 'FR'
          ? `Taille du groupe : ${info.partySize} invité(s)`
          : `Party Size: ${info.partySize} guest(s)`
      );

      setHoverTooltip({
        title: info.attendeeName || (language === 'FR' ? 'Invité' : 'Assigned Guest'),
        subtitle: language === 'FR'
          ? `Groupe : ${info.partyName}`
          : `Party: ${info.partyName}`,
        details,
        x: clientX,
        y: clientY,
      });
    } else {
      setHoverTooltip({
        title: language === 'FR'
          ? `Siège n°${seatIndex + 1} (${table.name})`
          : `Seat #${seatIndex + 1} (${table.name})`,
        subtitle: language === 'FR' ? 'Siège disponible' : 'Available Seat',
        details: [
          language === 'FR'
            ? `Table : ${table.name} (${table.capacity} sièges au total)`
            : `Table: ${table.name} (${table.capacity} Seats Total)`,
          language === 'FR'
            ? `Statut : Libre / Non assigné`
            : `Status: Unassigned / Available Chair`,
        ],
        x: clientX,
        y: clientY,
      });
    }
  };

  const handleLandmarkHover = (landmark: LandmarkElement, clientX: number, clientY: number) => {
    setHoverTooltip({
      title: landmark.name,
      subtitle: t.fpTooltipVenueFeature,
      details: [
        tf('fpTooltipType', { type: landmark.type.toUpperCase() }),
        tf('fpTooltipDimensions', { width: landmark.width, height: landmark.height }),
      ],
      x: clientX,
      y: clientY,
    });
  };

  // Konva Stage & Transformer refs
  const stageRef = useRef<any>(null);
  const transformerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [canvasScale, setCanvasScale] = useState(1);

  // Fetch Floor Map & Guests (admins get the full roster; guests get a scrubbed one)
  const fetchData = async () => {
    try {
      const [mapRes, guestRes] = await Promise.all([
        fetch('/api/floorplan'),
        adminFetch('/api/guests'),
      ]);
      const mapData = await mapRes.json();
      const guestData = await guestRes.json();

      if (mapData.floorMap) {
        setFloorMap(mapData.floorMap);
      }
      if (guestData.guests) {
        setGuests(guestData.guests);
      }

      if (mapData.floorMap && guestData.guests) {
        setSeatingHistory([
          {
            floorMap: JSON.parse(JSON.stringify(mapData.floorMap)),
            guests: JSON.parse(JSON.stringify(guestData.guests)),
          },
        ]);
        setHistoryIndex(0);
      }
    } catch (err) {
      console.error('Error fetching floor plan data:', err);
    }
  };

  useEffect(() => {
    // async IIFE keeps the loader's setState out of the effect's synchronous
    // body (react-hooks/set-state-in-effect).
    (async () => {
      await fetchData();
    })();
  }, []);

  // Adjust Canvas Scale based on container width
  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current && floorMap) {
        const containerWidth = containerRef.current.clientWidth - 32; // padding
        const scale = Math.min(1, containerWidth / floorMap.canvasWidth);
        setCanvasScale(Math.max(0.45, scale));
      }
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [floorMap]);

  // Open Full Screen Editor Modal
  const handleOpenEditor = () => {
    if (!floorMap) return;
    setIsEditorModalOpen(true);
  };

  // Save Full Screen Editor Draft Changes
  const handleSaveEditorChanges = async (map: FloorMapData, editedGuests: Guest[]) => {
    if (!(await confirmAction(t.btnSaveChanges))) return;
    try {
      await saveFloorMap(map);
    } catch (err) {
      // Keep the editor + draft open: a failed save must not look successful.
      // The in-page notification sits under the full-screen editor, so use the
      // global toast (z-[9999]) that stays visible above it.
      console.error('Error saving floor map:', err);
      toast.error(t.fpSaveFailedToast);
      return;
    }
    setGuests(editedGuests);
    setIsEditorModalOpen(false);
    setNotification(t.fpSavedToast);
    setTimeout(() => setNotification(null), 3000);
  };

  // Cancel Full Screen Editor Changes
  const handleCancelEditor = () => {
    setIsEditorModalOpen(false);
    setNotification(t.fpEditCancelledToast);
    setTimeout(() => setNotification(null), 2500);
  };

  // Add Table Helper

  // Handle Share Seating Plan Email
  const handleShareEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!(await confirmAction(t.sendSeatingEmailsBtn))) return;
    try {
      setSendingEmail(true);
      const res = await adminFetch('/api/floorplan/share-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customMessage: shareCustomMsg }),
      });
      const data = await res.json();
      if (data.success) {
        setIsEmailModalOpen(false);
        setNotification(data.count > 0
          ? tf('fpEmailsSentToast', { count: data.count })
          : t.fpNoEmailsToast);
        setTimeout(() => setNotification(null), 4000);
      }
    } catch (err) {
      console.error('Error sharing floor plan:', err);
    } finally {
      setSendingEmail(false);
    }
  };

  // Export Floor Map Image
  const handleExportImage = async () => {
    if (!(await confirmAction(t.btnExportImage))) return;
    if (!stageRef.current) return;
    const dataUrl = stageRef.current.toDataURL({ pixelRatio: 2 });
    const link = document.createElement('a');
    link.download = `bebe-${settings?.babyName || 'shower'}-floor-map.png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };


  // Host-view statistics, recomputed only when guests/map/filter change.
  const hostStats = useMemo(() => {
    const totalConfirmedGuests = guests
      .filter((g) => g.rsvp_status === 'Attending')
      .reduce((sum, g) => sum + getGuestPartySize(g), 0);

    const totalSeatedGuests = floorMap
      ? floorMap.tables.reduce((sum, tbl) => sum + getTableOccupiedSeats(tbl, guests), 0)
      : 0;

    const seatingProgressPercent = totalConfirmedGuests > 0
      ? Math.min(100, Math.round((totalSeatedGuests / totalConfirmedGuests) * 100))
      : 0;

    const emptyTablesCount = floorMap
      ? floorMap.tables.filter((t) => getTableStatus(t, guests) === 'empty').length
      : 0;

    const partialTablesCount = floorMap
      ? floorMap.tables.filter((t) => getTableStatus(t, guests) === 'partial').length
      : 0;

    const fullTablesCount = floorMap
      ? floorMap.tables.filter((t) => getTableStatus(t, guests) === 'full').length
      : 0;

    const unassignedGuestsList = guests.filter((g) => {
      if (g.rsvp_status !== 'Attending') return false;
      const fullySeated = floorMap ? getGuestSeatedCount(g.id, floorMap, guests) >= getGuestPartySize(g) : false;
      if (fullySeated) return false;

      if (unassignedFilterQuery.trim()) {
        const q = unassignedFilterQuery.toLowerCase();
        const matchName = g.name.toLowerCase().includes(q);
        const matchEmail = g.email.toLowerCase().includes(q);
        const matchCode = g.code ? g.code.toLowerCase().includes(q) : false;
        const matchAttendees = g.attendee_names?.some((a) => a.toLowerCase().includes(q));
        return matchName || matchEmail || matchCode || matchAttendees;
      }
      return true;
    });

    return {
      totalConfirmedGuests,
      totalSeatedGuests,
      seatingProgressPercent,
      emptyTablesCount,
      partialTablesCount,
      fullTablesCount,
      unassignedGuestsList,
    };
  }, [guests, floorMap, unassignedFilterQuery]);

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner & Mode Switcher */}
      <div className="bg-[#FFFDF9] rounded-3xl p-4 sm:p-6 shadow-xl border-2 border-[#CBAE94] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1 px-3 py-0.5 rounded-full bg-[#EFE6DC] text-[#8B735B] text-xs font-mono font-bold uppercase">
              <Layout className="w-3.5 h-3.5" /> {t.floorPlanBadge}
            </span>
            {saving && (
              <span className="text-xs font-mono text-[#8B735B] animate-pulse">
                • {t.savingChangesLabel}
              </span>
            )}
          </div>
          <h2 className="font-gaegu text-3xl sm:text-4xl font-bold text-[#4A3F35]">
            {t.floorPlanTitle}
          </h2>
          <p className="text-xs text-[#5D5449] font-medium mt-0.5">
            {t.hostModeSubtitle}
          </p>
        </div>

        {/* Undo/Redo Controls */}
        <div className="flex flex-wrap items-center gap-3 self-start md:self-auto">
          <div className="flex items-center gap-1 bg-[#EFE6DC]/80 p-1 rounded-2xl border border-[#CBAE94]/60">
              <button
                type="button"
                onClick={handleUndo}
                disabled={historyIndex <= 0}
                title={t.undoSeatingTitle}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed text-[#4A3F35] hover:bg-white/80 active:scale-95"
              >
                <Undo2 className="w-3.5 h-3.5 text-[#8B735B]" />
                <span className="hidden sm:inline">{t.undoBtn}</span>
              </button>
              <div className="w-[1px] h-4 bg-[#CBAE94]/50" />
              <button
                type="button"
                onClick={handleRedo}
                disabled={historyIndex >= seatingHistory.length - 1}
                title={t.redoSeatingTitle}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed text-[#4A3F35] hover:bg-white/80 active:scale-95"
              >
                <Redo2 className="w-3.5 h-3.5 text-[#8B735B]" />
                <span className="hidden sm:inline">{t.redoBtn}</span>
              </button>
            </div>
        </div>
      </div>

      {/* Floating Notification toast */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="p-3 bg-[#4A3F35] text-white text-xs font-bold rounded-2xl shadow-lg border border-[#CBAE94] flex items-center justify-between"
          >
            <span>{notification}</span>
            <button
              onClick={() => setNotification(null)}
              className="p-1 text-white/80 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>


      {/* ========================================================= */}
      {/* HOST CANVAS VIEW & QUICK ACTIONS                          */}
      {/* ========================================================= */}
      {(() => {
        const {
          totalConfirmedGuests,
          totalSeatedGuests,
          seatingProgressPercent,
          emptyTablesCount,
          partialTablesCount,
          fullTablesCount,
          unassignedGuestsList,
        } = hostStats;

        return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Unassigned Guests Sidebar & Host Actions (lg:col-span-4) */}
          <div className="lg:col-span-4 space-y-4 order-2 lg:order-1">
            <UnassignedGuestsSidebar
              unassignedGuests={unassignedGuestsList}
              floorMap={floorMap}
              guests={guests}
              selectedGuest={selectedUnassignedGuest}
              filterQuery={unassignedFilterQuery}
              onFilterQueryChange={setUnassignedFilterQuery}
              onSelectGuest={setSelectedUnassignedGuest}
              onAssign={handleMainAssignGuest}
            />

            {/* Quick Actions Panel */}
            <div className="bg-[#FFFDF9] rounded-3xl p-5 shadow-lg border-2 border-[#CBAE94] space-y-3">
              <h3 className="label-mono font-bold text-[#8B735B] flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-[#8B735B]" /> {t.hostActionsTitle}
              </h3>

              <div className="grid grid-cols-1 gap-2">
                <button
                  type="button"
                  onClick={handleGenerateSmartSuggestions}
                  className="w-full inline-flex items-center justify-between px-3.5 py-3 rounded-2xl bg-gradient-to-r from-amber-700 via-[#8B735B] to-emerald-700 hover:brightness-110 text-white text-xs font-bold shadow-md transition-all transform hover:-translate-y-0.5 border border-amber-300/40 group"
                >
                  <div className="flex items-center gap-2">
                    <Wand2 className="w-4 h-4 text-amber-200 animate-pulse group-hover:rotate-12 transition-transform" />
                    <span>{t.smartSuggestBtn}</span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full bg-white/20 text-xs font-mono font-bold text-amber-100">
                    {t.autoFitBadge}
                  </span>
                </button>

                <button
                  onClick={handleOpenEditor}
                  className="w-full inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-2xl bg-[#8B735B] hover:bg-[#705C47] text-white text-xs font-bold shadow-sm transition-all border border-[#CBAE94]"
                >
                  <Maximize2 className="w-4 h-4 text-white" /> {t.btnFullscreenEditor}
                </button>

                <button
                  onClick={() => setIsEmailModalOpen(true)}
                  disabled={sendsBlocked}
                  title={sendsBlocked ? t.providerNotConfigured : undefined}
                  className="w-full inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-2xl border-2 border-[#CBAE94] text-xs font-bold text-[#5D5449] bg-white hover:bg-[#EFE6DC] transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-white"
                >
                  <Mail className="w-4 h-4 text-[#8B735B]" /> {t.btnShareEmail}
                </button>

                <button
                  onClick={() => setIsQrModalOpen(true)}
                  className="w-full inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-2xl border-2 border-[#CBAE94] text-xs font-bold text-[#5D5449] bg-white hover:bg-[#EFE6DC] transition-colors"
                >
                  <Printer className="w-4 h-4 text-[#8B735B]" /> {t.btnPrintQr}
                </button>

                <button
                  onClick={handleExportImage}
                  className="w-full inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-2xl border-2 border-[#CBAE94] text-xs font-bold text-[#5D5449] bg-white hover:bg-[#EFE6DC] transition-colors"
                >
                  <Download className="w-4 h-4 text-[#8B735B]" /> {t.btnExportImage}
                </button>
              </div>
            </div>

            {/* Info Box */}
            <div className="bg-[#EFE6DC]/50 rounded-2xl p-4 border border-[#CBAE94] space-y-2 text-xs text-[#5D5449]">
              <div className="flex items-center gap-1.5 font-bold text-[#8B735B]">
                <Info className="w-4 h-4" />
                <span>{t.floorPlanInfoTitle}</span>
              </div>
              <p className="leading-relaxed">
                {t.floorPlanInfoDesc}
              </p>
            </div>
          </div>

          {/* Right Column: Stats, Progress Bar & Read-Only Floor Canvas (lg:col-span-8) */}
          <div className="lg:col-span-8 space-y-4 order-1 lg:order-2">
            {/* Seating Progress Bar Banner */}
            <div className="bg-[#FFFDF9] rounded-2xl p-4 border-2 border-[#CBAE94] shadow-md space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-[#8B735B]/10 text-[#8B735B] flex items-center justify-center font-bold">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-gaegu text-2xl font-bold text-[#4A3F35] leading-none">
                      {t.overallSeatingProgress}
                    </h4>
                    <p className="text-xs text-[#5D5449] font-medium mt-0.5">
                      {tf('seatingProgressDetail', { seated: totalSeatedGuests, total: totalConfirmedGuests })}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold font-mono text-[#8B735B]">
                    {seatingProgressPercent}%
                  </span>
                  {seatingProgressPercent === 100 ? (
                    <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold flex items-center gap-1 border border-emerald-300">
                      <CheckCircle2 className="w-3.5 h-3.5" /> {t.fullySeatedBadge}
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-full bg-[#EFE6DC] text-[#8B735B] text-xs font-bold border border-[#CBAE94]">
                      {Math.max(0, totalConfirmedGuests - totalSeatedGuests)} {t.unseatedWord}
                    </span>
                  )}
                </div>
              </div>

              {/* Visual Progress Bar */}
              <div className="w-full bg-[#EFE6DC] h-3.5 rounded-full overflow-hidden border border-[#CBAE94]/60 p-0.5">
                <div
                  className="h-full bg-gradient-to-r from-[#8B735B] to-emerald-600 rounded-full transition-all duration-500 ease-out shadow-sm"
                  style={{ width: `${seatingProgressPercent}%` }}
                />
              </div>
            </div>

            {/* Quick Stats Summary Bar */}
            <div className="bg-[#FFFDF9] rounded-2xl p-3 border-2 border-[#CBAE94] grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
              <div className="p-2 rounded-xl bg-[#EFE6DC]/40 border border-[#CBAE94]/40">
                <span className="text-xs font-mono uppercase font-bold text-[#8B735B]">{t.confirmedGuestsLabel}</span>
                <p className="text-base font-bold text-[#4A3F35]">
                  {totalConfirmedGuests} <span className="text-xs font-normal text-[#5D5449]">{t.attendingWord}</span>
                </p>
              </div>
              <div className="p-2 rounded-xl bg-[#EFE6DC]/40 border border-[#CBAE94]/40">
                <span className="text-xs font-mono uppercase font-bold text-[#8B735B]">{t.seatsAssignedLabel}</span>
                <p className="text-base font-bold text-[#4A3F35]">
                  {totalSeatedGuests} <span className="text-xs font-normal text-[#5D5449]">{t.seatedWord}</span>
                </p>
              </div>
              <div className="p-2 rounded-xl bg-[#EFE6DC]/40 border border-[#CBAE94]/40">
                <span className="text-xs font-mono uppercase font-bold text-[#8B735B]">{t.unseatedConfirmedLabel}</span>
                <p className="text-base font-bold text-[#8B735B]">
                  {Math.max(0, totalConfirmedGuests - totalSeatedGuests)} <span className="text-xs font-normal text-[#5D5449]">{t.guestsWord}</span>
                </p>
              </div>
              <div className="p-2 rounded-xl bg-[#EFE6DC]/40 border border-[#CBAE94]/40">
                <span className="text-xs font-mono uppercase font-bold text-[#8B735B]">{t.venueCapacityLabel}</span>
                <p className="text-base font-bold text-[#4A3F35]">
                  {floorMap ? floorMap.tables.reduce((s, tbl) => s + tbl.capacity, 0) : 0} <span className="text-xs font-normal text-[#5D5449]">{t.totalSeatsWord}</span>
                </p>
              </div>
            </div>

            {/* Read-Only Floor Plan Canvas Stage */}
            <div
              ref={containerRef}
              className="bg-[#FFFDF9] rounded-3xl p-5 shadow-xl border-2 border-[#CBAE94] overflow-hidden relative space-y-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 px-1 border-b border-[#CBAE94]/30 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-[#8B735B]/10 text-[#8B735B] flex items-center justify-center">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-gaegu text-xl font-bold text-[#4A3F35]">
                      {t.venueFloorPlanView}
                    </h3>
                    <p className="text-xs text-[#8B735B] font-medium">
                      {selectedUnassignedGuest
                        ? tf('seatHighlightHint', { name: selectedUnassignedGuest.name, count: getGuestPartySize(selectedUnassignedGuest) })
                        : t.layoutOverviewHint}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <ViewModeToggle value={viewMode} onChange={setViewMode} />
                  <button
                    onClick={handleOpenEditor}
                    className="px-3 py-1.5 rounded-xl bg-[#8B735B] hover:bg-[#705C47] text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm shrink-0"
                    title={t.btnFullscreenEditor}
                  >
                    <Maximize2 className="w-3.5 h-3.5" /> <span className="hidden sm:inline">{t.btnFullscreenEditor}</span>
                  </button>
                </div>
              </div>

              {/* Table Status Visualization Filter Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-2.5 rounded-2xl bg-[#EFE6DC]/50 border border-[#CBAE94]/60">
                <div className="flex items-center gap-1.5 text-xs font-bold text-[#8B735B]">
                  <PieChart className="w-4 h-4 text-[#8B735B]" />
                  <span>{t.tableStatusFilterLabel}</span>
                </div>
                <Segmented
                  ariaLabel={t.tableStatusFilterLabel}
                  value={tableStatusFilter}
                  onChange={setTableStatusFilter}
                  options={[
                    { value: 'all', label: tf('allTablesFilterLabel', { count: String(floorMap ? floorMap.tables.length : 0) }) },
                    { value: 'empty', icon: <span className="w-2 h-2 rounded-full bg-emerald-500" />, label: tf('emptyTablesFilterLabel', { count: String(emptyTablesCount) }) },
                    { value: 'partial', icon: <span className="w-2 h-2 rounded-full bg-amber-500" />, label: tf('partialTablesFilterLabel', { count: String(partialTablesCount) }) },
                    { value: 'full', icon: <span className="w-2 h-2 rounded-full bg-rose-500" />, label: tf('fullTablesFilterLabel', { count: String(fullTablesCount) }) },
                  ]}
                />
              </div>

              {/* Canvas Outer Wrapper */}
              <div className="w-full bg-[#FAF6F0] p-3 sm:p-4 rounded-2xl border border-[#CBAE94]/40 min-h-[420px] sm:min-h-[500px]">
                {floorMap &&
                  (viewMode === '3d' ? (
                    <Suspense
                      fallback={
                        <div className="w-full h-[420px] sm:h-[500px] flex items-center justify-center text-xs font-mono font-bold text-[#8B735B]">
                          3D…
                        </div>
                      }
                    >
                      <FloorPlan3D
                        className="w-full h-[420px] sm:h-[500px]"
                        floorMap={floorMap}
                        guests={guests}
                        selectedGuest={selectedUnassignedGuest}
                        tableStatusFilter={tableStatusFilter}
                        onTableHover={(table, x, y) => handleTableHover(table, guests, x, y)}
                        onSeatHover={(table, idx, x, y) => handleSeatHover(table, idx, guests, x, y)}
                        onLandmarkHover={(lm, x, y) => handleLandmarkHover(lm, x, y)}
                        onTableClick={(table) => {
                          if (!selectedUnassignedGuest) return;
                          const partyNeeded = getUnseatedPartySize(selectedUnassignedGuest.id, floorMap, guests);
                          const freeSeats = getAvailableSeats(table, guests);
                          if (canSeatParty(table, floorMap, guests, selectedUnassignedGuest.id)) {
                            void handleMainAssignGuest(selectedUnassignedGuest.id, table.id).then(
                              (ok) => {
                                if (ok) setSelectedUnassignedGuest(null);
                              }
                            );
                          } else {
                            setNotification(
                              tf('fpNoFitTableToast', { table: table.name, free: String(freeSeats), guest: selectedUnassignedGuest.name, needed: String(partyNeeded) })
                            );
                            setTimeout(() => setNotification(null), 4000);
                          }
                        }}
                        onLeave={() => setHoverTooltip(null)}
                      />
                    </Suspense>
                  ) : (
                    <div className="w-full overflow-x-auto flex justify-center">
                  <Stage
                    ref={stageRef}
                    width={floorMap.canvasWidth * canvasScale}
                    height={floorMap.canvasHeight * canvasScale}
                    scaleX={canvasScale}
                    scaleY={canvasScale}
                  >
                    {/* Layer 1: Grid Lines + Room Boundary */}
                    <Layer>
                      {renderRoomBoundary(floorMap)}
                    </Layer>

                    {/* Layer 2: Venue Landmarks */}
                    <Layer>
                      {floorMap.landmarks.map((landmark) => (
                        <Group
                          key={landmark.id}
                          id={landmark.id}
                          x={landmark.x}
                          y={landmark.y}
                          width={landmark.width}
                          height={landmark.height}
                          rotation={landmark.rotation || 0}
                          draggable={false}
                          onMouseEnter={(e) => handleLandmarkHover(landmark, e.evt.clientX, e.evt.clientY)}
                          onMouseMove={(e) => handleLandmarkHover(landmark, e.evt.clientX, e.evt.clientY)}
                          onMouseLeave={() => setHoverTooltip(null)}
                        >
                          {renderLandmark(landmark, false)}
                        </Group>
                      ))}
                    </Layer>

                    {/* Layer 3: Tables & Seats */}
                    <Layer>
                      {floorMap.tables.map((table) => {
                        const occupiedSeats = getTableOccupiedSeats(table, guests);
                        const tableSeats = getTableSeats(table, guests);
                        const color = table.color || '#8B735B';

                        const status = getTableStatus(table, guests);
                        const matchesFilter =
                          tableStatusFilter === 'all' || status === tableStatusFilter;
                        const tableOpacity = matchesFilter ? 1 : 0.25;

                        // Unassigned guest seating highlighting (any free chair is usable — partial split allowed)
                        const partyNeeded = selectedUnassignedGuest
                          ? getUnseatedPartySize(selectedUnassignedGuest.id, floorMap, guests)
                          : 0;
                        const freeSeats = getAvailableSeats(table, guests);
                        const isUnassignedActive = selectedUnassignedGuest !== null;
                        const canFitSelected = isUnassignedActive && canSeatParty(table, floorMap, guests, selectedUnassignedGuest.id);

                        let tableStroke = color;
                        let tableStrokeWidth = 2.5;
                        let tableShadowColor = 'rgba(74, 63, 53, 0.15)';
                        let tableShadowBlur = 8;
                        let tableDash: number[] | undefined = undefined;

                        if (isUnassignedActive) {
                          if (canFitSelected) {
                            tableStroke = '#10B981';
                            tableStrokeWidth = 5;
                            tableShadowColor = '#10B981';
                            tableShadowBlur = 16;
                          } else {
                            tableStroke = '#EF4444';
                            tableStrokeWidth = 2;
                            tableDash = [4, 4];
                          }
                        } else if (tableStatusFilter !== 'all' && matchesFilter) {
                          if (status === 'empty') {
                            tableStroke = '#10B981';
                            tableStrokeWidth = 4.5;
                            tableShadowColor = '#10B981';
                            tableShadowBlur = 14;
                          } else if (status === 'partial') {
                            tableStroke = '#F59E0B';
                            tableStrokeWidth = 4.5;
                            tableShadowColor = '#F59E0B';
                            tableShadowBlur = 14;
                          } else if (status === 'full') {
                            tableStroke = '#EF4444';
                            tableStrokeWidth = 4.5;
                            tableShadowColor = '#EF4444';
                            tableShadowBlur = 14;
                          }
                        }

                        return (
                          <Group
                            key={table.id}
                            id={table.id}
                            x={table.x}
                            y={table.y}
                            width={table.width}
                            height={table.height}
                            rotation={table.rotation || 0}
                            opacity={tableOpacity}
                            draggable={false}
                            onClick={async () => {
                              if (selectedUnassignedGuest) {
                                if (canFitSelected) {
                                  const success = await handleMainAssignGuest(
                                    selectedUnassignedGuest.id,
                                    table.id
                                  );
                                  if (success) setSelectedUnassignedGuest(null);
                                } else {
                                  setNotification(
                                    tf('fpNoFitTableToast', { table: table.name, free: String(freeSeats), guest: selectedUnassignedGuest.name, needed: String(partyNeeded) })
                                  );
                                  setTimeout(() => setNotification(null), 4000);
                                }
                              }
                            }}
                            onMouseEnter={(e) => handleTableHover(table, guests, e.evt.clientX, e.evt.clientY)}
                            onMouseMove={(e) => handleTableHover(table, guests, e.evt.clientX, e.evt.clientY)}
                            onMouseLeave={() => setHoverTooltip(null)}
                          >
                            {/* Fit Badge Label or Status Pill above table */}
                            {isUnassignedActive ? (
                              <Text
                                text={
                                  canFitSelected
                                    ? tf('fitsFreeSeats', { count: freeSeats })
                                    : `FULL`
                                }
                                x={-15}
                                y={-18}
                                width={table.width + 30}
                                align="center"
                                fontSize={10}
                                fontStyle="bold"
                                fill={canFitSelected ? '#059669' : '#DC2626'}
                              />
                            ) : (
                              <Text
                                text={
                                  status === 'full'
                                    ? 'FULL'
                                    : status === 'partial'
                                    ? `PARTIAL (${occupiedSeats}/${table.capacity})`
                                    : 'EMPTY'
                                }
                                x={-15}
                                y={-18}
                                width={table.width + 30}
                                align="center"
                                fontSize={9}
                                fontStyle="bold"
                                fill={
                                  status === 'full'
                                    ? '#DC2626'
                                    : status === 'partial'
                                    ? '#D97706'
                                    : '#059669'
                                }
                              />
                            )}

                            {/* Outer Seat Dots around Table */}
                            <SeatRing
                              table={table}
                              renderSeat={(pos, idx) => {
                                const isOccupied = !!tableSeats[idx];
                                let seatFill = isOccupied ? '#8B735B' : '#FFFDF9';
                                let seatStroke = '#CBAE94';
                                if (isUnassignedActive && !isOccupied && canFitSelected) {
                                  seatFill = '#A7F3D0';
                                  seatStroke = '#059669';
                                }
                                return (
                                  <Circle
                                    key={`seat-${table.id}-${idx}`}
                                    x={pos.x}
                                    y={pos.y}
                                    radius={8}
                                    fill={seatFill}
                                    stroke={seatStroke}
                                    strokeWidth={2}
                                    onMouseEnter={(e) => {
                                      e.cancelBubble = true;
                                      handleSeatHover(table, idx, guests, e.evt.clientX, e.evt.clientY);
                                    }}
                                    onMouseMove={(e) => {
                                      e.cancelBubble = true;
                                      handleSeatHover(table, idx, guests, e.evt.clientX, e.evt.clientY);
                                    }}
                                    onMouseLeave={() => setHoverTooltip(null)}
                                  />
                                );
                              }}
                            />

                            {/* Table Body Shape */}
                            {renderTableBody({ table, isSelected: false })}

                            {/* Table Title + Capacity */}
                            <TableLabel table={table} occupied={occupiedSeats} seatsLabel={t.seatsLabel} />
                          </Group>
                        );
                      })}
                    </Layer>
                  </Stage>
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      {/* ========================================================= */}

      {/* Day-Of QR Modal */}
      <DayOfQrModal
        isOpen={isQrModalOpen}
        onClose={() => setIsQrModalOpen(false)}
        language={language}
        settings={settings}
      />

      {/* Share Email Modal */}
      <Modal open={isEmailModalOpen} onClose={() => setIsEmailModalOpen(false)} maxWidth="md"
        title={
          <div className="flex items-center gap-2">
            <Mail className="w-5 h-5 text-[#8B735B]" />
            <h3 className="font-gaegu text-2xl font-bold text-[#4A3F35]">
              {t.shareEmailModalTitle}
            </h3>
          </div>
        }>
        <form onSubmit={handleShareEmailSubmit} className="space-y-4">
          <p className="text-xs text-[#5D5449]">
            {t.shareEmailModalDesc}
          </p>

          <div>
            <label className="label-mono block mb-1">{t.customMsgLabel}</label>
            <textarea
              rows={3}
              value={shareCustomMsg}
              onChange={(e) => setShareCustomMsg(e.target.value)}
              placeholder={language === 'FR' ? "ex : Chers amis, le plan de salle est prêt ! Découvrez votre table..." : "e.g. Dear friends, our baby shower floor plan and table seating is ready! Check where you are seated..."}
              className="w-full p-3 rounded-2xl border-2 border-[#CBAE94] text-xs font-bold text-[#5D5449] bg-white focus:outline-none focus:ring-2 focus:ring-[#8B735B]"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setIsEmailModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-bold text-[#8B735B]"
            >
              {t.cancelBtn}
            </button>
            <button
              type="submit"
              disabled={sendingEmail || sendsBlocked}
              title={sendsBlocked ? t.providerNotConfigured : undefined}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-[#8B735B] hover:bg-[#705C47] text-white text-xs font-bold shadow-md transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              {sendingEmail ? t.sendingSeatingEmailsBtn : t.sendSeatingEmailsBtn}
            </button>
          </div>
        </form>
      </Modal>

      {/* ========================================================= */}
      {isEditorModalOpen && floorMap && (
        <FloorPlanEditor
          key={`editor-${isEditorModalOpen}`}
          floorMap={floorMap}
          guests={guests}
          saving={saving}
          notify={setNotification}
          onSave={handleSaveEditorChanges}
          onCancel={handleCancelEditor}
          hoverTooltip={hoverTooltip}
          setHoverTooltip={setHoverTooltip}
          handleTableHover={handleTableHover}
          handleSeatHover={handleSeatHover}
          handleLandmarkHover={handleLandmarkHover}
        />
      )}

      <SmartSuggestionsModal
        open={isSmartSuggestOpen}
        suggestions={smartSuggestions}
        selectedIds={selectedSuggestionIds}
        onToggleSelectAll={() =>
          setSelectedSuggestionIds(
            selectedSuggestionIds.size === smartSuggestions.length
              ? new Set()
              : new Set(smartSuggestions.map((s) => s.id))
          )
        }
        onToggleSuggestion={(id) => {
          const next = new Set(selectedSuggestionIds);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          setSelectedSuggestionIds(next);
        }}
        onApply={handleApplySmartSuggestions}
        onClose={() => setIsSmartSuggestOpen(false)}
      />

      {/* Floating Hover Details Tooltip */}
      {hoverTooltip && <HoverTooltip tooltip={hoverTooltip} />}
    </div>
  );
};
