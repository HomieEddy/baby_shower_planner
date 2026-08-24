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
import { motion, AnimatePresence } from 'motion/react';
import { Modal } from '../shared/Modal';
import { useSettingsStore } from '../../stores/settingsStore';
import {
  Stage,
  Layer,
  Rect,
  Circle,
  Text,
  Group,
  Line,
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
import { getGuestPartySize, getTableOccupiedSeats, getTableSeatedPersonNames, getSeatOccupantInfo, getTableStatus } from './floorPlanHelpers';
import { renderCustomLandmarkShape } from './renderCustomLandmarkShape';
import { renderTableBody } from './venueShapes';
import { useAppStore } from '../../stores/appStore';

const FloorPlan3D = lazy(() => import('./FloorPlan3D').then((m) => ({ default: m.FloorPlan3D })));
import { useT } from '../shared/i18n';

export const FloorPlanPage = () => {
  const language = useAppStore((s) => s.language);
  const settings = useSettingsStore((s) => s.settings);
  const t = useT();

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

  const handleUndo = async () => {
    if (historyIndex <= 0) return;
    const targetIndex = historyIndex - 1;
    const snapshot = seatingHistory[targetIndex];
    if (!snapshot) return;

    const mapClone = JSON.parse(JSON.stringify(snapshot.floorMap));
    const guestsClone = JSON.parse(JSON.stringify(snapshot.guests));

    setFloorMap(mapClone);
    setGuests(guestsClone);
    setHistoryIndex(targetIndex);

    try {
      await saveFloorMap(mapClone);
      for (const g of guestsClone) {
        await adminFetch('/api/floorplan/assign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ guestId: g.id, tableId: g.table_id || null }),
        });
      }
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

    const mapClone = JSON.parse(JSON.stringify(snapshot.floorMap));
    const guestsClone = JSON.parse(JSON.stringify(snapshot.guests));

    setFloorMap(mapClone);
    setGuests(guestsClone);
    setHistoryIndex(targetIndex);

    try {
      await saveFloorMap(mapClone);
      for (const g of guestsClone) {
        await adminFetch('/api/floorplan/assign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ guestId: g.id, tableId: g.table_id || null }),
        });
      }
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
  interface SmartSuggestion {
    id: string;
    guest: Guest;
    table: TableElement;
    partySize: number;
    freeSeats: number;
    matchBadge: 'Exact Fit' | 'Optimal Capacity' | 'Party Grouping';
    reason: string;
  }

  const [isSmartSuggestOpen, setIsSmartSuggestOpen] = useState(false);
  const [smartSuggestions, setSmartSuggestions] = useState<SmartSuggestion[]>([]);
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState<Set<string>>(new Set());

  const handleGenerateSmartSuggestions = () => {
    if (!floorMap) return;

    // Filter attending guests not seated at any table
    const unassigned = guests.filter((g) => {
      if (g.rsvp_status !== 'Attending') return false;
      return !floorMap.tables.some((t) => t.assignedGuestIds.includes(g.id));
    });

    if (unassigned.length === 0) {
      setNotification(t.fpAllSeatedToast);
      setTimeout(() => setNotification(null), 3000);
      return;
    }

    // Sort by party size descending so larger groups get optimal placement first
    const sortedGuests = [...unassigned].sort(
      (a, b) => getGuestPartySize(b) - getGuestPartySize(a)
    );

    // Track capacity per table
    const tableCapacities: Record<string, number> = {};
    floorMap.tables.forEach((t) => {
      tableCapacities[t.id] = t.capacity - getTableOccupiedSeats(t, guests);
    });

    const generated: SmartSuggestion[] = [];

    for (const g of sortedGuests) {
      const partySize = getGuestPartySize(g);

      // Find tables that can fit partySize
      const candidates = floorMap.tables.filter(
        (t) => (tableCapacities[t.id] || 0) >= partySize
      );

      if (candidates.length === 0) continue;

      // Pick table with smallest remaining seats delta (closest fit)
      candidates.sort((a, b) => {
        const freeA = tableCapacities[a.id] || 0;
        const freeB = tableCapacities[b.id] || 0;
        return (freeA - partySize) - (freeB - partySize);
      });

      const chosenTable = candidates[0];
      const freeSeats = tableCapacities[chosenTable.id];
      const fitDelta = freeSeats - partySize;

      const matchBadge: 'Exact Fit' | 'Optimal Capacity' | 'Party Grouping' =
        fitDelta === 0 ? 'Exact Fit' : fitDelta <= 2 ? 'Optimal Capacity' : 'Party Grouping';
      const reason =
        fitDelta === 0
          ? `Perfect match! Fills all ${partySize} open seats with zero wasted space`
          : fitDelta <= 2
            ? `Great fit for party of ${partySize} leaving only ${fitDelta} free seat(s)`
            : `Keeps entire party of ${partySize} together comfortably`;

      generated.push({
        id: `sug-${g.id}-${chosenTable.id}`,
        guest: g,
        table: chosenTable,
        partySize,
        freeSeats,
        matchBadge,
        reason,
      });

      tableCapacities[chosenTable.id] -= partySize;
    }

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

    const updatedTables = floorMap.tables.map((tbl) => ({
      ...tbl,
      assignedGuestIds: [...tbl.assignedGuestIds],
    }));
    const updatedGuests = [...guests];

    for (const sug of toApply) {
      const targetTbl = updatedTables.find((t) => t.id === sug.table.id);
      if (targetTbl) {
        if (!targetTbl.assignedGuestIds.includes(sug.guest.id)) {
          targetTbl.assignedGuestIds.push(sug.guest.id);
        }
      }
      const gIdx = updatedGuests.findIndex((g) => g.id === sug.guest.id);
      if (gIdx !== -1) {
        updatedGuests[gIdx] = { ...updatedGuests[gIdx], table_id: sug.table.id };
      }
    }

    const updatedMap = { ...floorMap, tables: updatedTables };

    // Push snapshot to history stack
    pushSeatingHistory(updatedMap, updatedGuests);

    setFloorMap(updatedMap);
    setGuests(updatedGuests);

    try {
      for (const sug of toApply) {
        await adminFetch('/api/floorplan/assign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ guestId: sug.guest.id, tableId: sug.table.id }),
        });
      }
      await saveFloorMap(updatedMap);
    } catch (err) {
      console.error('Failed to persist smart suggestions:', err);
    }

    setIsSmartSuggestOpen(false);
    setNotification(t.fpAutoSeatedToast.replace('{{count}}', String(toApply.length)));
    setTimeout(() => setNotification(null), 3500);
  };

  // Main Page Direct Seating Assignment Handler
  const handleMainAssignGuest = async (guestId: string, tableId: string | null): Promise<boolean> => {
    if (!floorMap) return false;

    const guest = guests.find((g) => g.id === guestId);
    if (!guest) return false;

    const partySize = getGuestPartySize(guest);

    if (tableId) {
      const targetTable = floorMap.tables.find((t) => t.id === tableId);
      if (targetTable) {
        const occupiedWithoutThisGuest = targetTable.assignedGuestIds
          .filter((id) => id !== guestId)
          .reduce((sum, id) => {
            const g = guests.find((x) => x.id === id);
            return sum + (g ? getGuestPartySize(g) : 1);
          }, 0);

        const available = targetTable.capacity - occupiedWithoutThisGuest;

        if (partySize > available) {
          setNotification(
            t.fpCannotSeatToast.replace('{{guest}}', guest.name).replace('{{size}}', String(partySize)).replace('{{table}}', targetTable.name).replace('{{available}}', String(available))
          );
          setTimeout(() => setNotification(null), 4000);
          return false;
        }
      }
    }

    // Remove guest from all tables
    const updatedTables = floorMap.tables.map((tbl) => ({
      ...tbl,
      assignedGuestIds: tbl.assignedGuestIds.filter((id) => id !== guestId),
    }));

    if (tableId) {
      const targetTbl = updatedTables.find((tbl) => tbl.id === tableId);
      if (targetTbl) {
        targetTbl.assignedGuestIds.push(guestId);
      }
    }

    const updatedGuests = guests.map((g) =>
      g.id === guestId ? { ...g, table_id: tableId || undefined } : g
    );

    const updatedMap = { ...floorMap, tables: updatedTables };

    // Record history snapshot
    pushSeatingHistory(updatedMap, updatedGuests);

    setFloorMap(updatedMap);
    setGuests(updatedGuests);

    try {
      await adminFetch('/api/floorplan/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guestId, tableId }),
      });
      await saveFloorMap(updatedMap);
    } catch (err) {
      console.error('Failed to persist guest assignment:', err);
    }

    if (tableId) {
      const targetTbl = floorMap.tables.find((t) => t.id === tableId);
      setNotification(t.fpSeatedToast.replace('{{guest}}', guest.name).replace('{{size}}', String(partySize)).replace('{{table}}', targetTbl?.name || ''));
      setTimeout(() => setNotification(null), 3000);
    } else {
      setNotification(t.fpUnseatedToast.replace('{{guest}}', guest.name));
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

    setHoverTooltip({
      title: table.name,
      subtitle: `${table.shape === 'circle' ? 'Round Table' : 'Rectangle Table'} • ${occupiedSeats}/${table.capacity} Seats`,
      details: [
        `Seated (${seatedPersonNames.length}): ${seatedPersonNames.length > 0 ? seatedPersonNames.join(', ') : 'No guests assigned yet'}`,
        `Capacity: ${table.capacity} seats (${Math.max(0, table.capacity - occupiedSeats)} available)`,
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
      subtitle: `Venue Feature / Landmark`,
      details: [
        `Type: ${landmark.type.toUpperCase()}`,
        `Dimensions: ${landmark.width} × ${landmark.height} px`,
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
    fetchData();
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
    await saveFloorMap(map);
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

  // Save Floor Map to Backend
  const saveFloorMap = async (newMapData: FloorMapData) => {
    try {
      setSaving(true);
      const res = await adminFetch('/api/floorplan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newMapData),
      });
      const data = await res.json();
      if (data.floorMap) {
        setFloorMap(data.floorMap);
      }
    } catch (err) {
      console.error('Error saving floor map:', err);
    } finally {
      setSaving(false);
    }
  };

  // Add Table Helper

  // Handle Share Seating Plan Email
  const handleShareEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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
          ? t.fpEmailsSentToast.replace('{{count}}', String(data.count))
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
  const handleExportImage = () => {
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
      const isSeated = floorMap?.tables.some((t) => t.assignedGuestIds.includes(g.id));
      if (isSeated) return false;

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
          <div className="lg:col-span-4 space-y-4">
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
                  <span className="px-2 py-0.5 rounded-full bg-white/20 text-[10px] font-mono font-bold text-amber-100">
                    Auto-Fit
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
                  className="w-full inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-2xl border-2 border-[#CBAE94] text-xs font-bold text-[#5D5449] bg-white hover:bg-[#EFE6DC] transition-colors"
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
          <div className="lg:col-span-8 space-y-4">
            {/* Seating Progress Bar Banner */}
            <div className="bg-[#FFFDF9] rounded-2xl p-4 border-2 border-[#CBAE94] shadow-md space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-[#8B735B]/10 text-[#8B735B] flex items-center justify-center font-bold">
                    <Users className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-gaegu text-2xl font-bold text-[#4A3F35] leading-none">
                      Overall Seating Progress
                    </h4>
                    <p className="text-xs text-[#5D5449] font-medium mt-0.5">
                      {totalSeatedGuests} of {totalConfirmedGuests} confirmed guests assigned to tables
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
                <span className="text-[10px] font-mono uppercase font-bold text-[#8B735B]">{t.confirmedGuestsLabel}</span>
                <p className="text-base font-bold text-[#4A3F35]">
                  {totalConfirmedGuests} <span className="text-[11px] font-normal text-[#5D5449]">{t.attendingWord}</span>
                </p>
              </div>
              <div className="p-2 rounded-xl bg-[#EFE6DC]/40 border border-[#CBAE94]/40">
                <span className="text-[10px] font-mono uppercase font-bold text-[#8B735B]">{t.seatsAssignedLabel}</span>
                <p className="text-base font-bold text-[#4A3F35]">
                  {totalSeatedGuests} <span className="text-[11px] font-normal text-[#5D5449]">{t.seatedWord}</span>
                </p>
              </div>
              <div className="p-2 rounded-xl bg-[#EFE6DC]/40 border border-[#CBAE94]/40">
                <span className="text-[10px] font-mono uppercase font-bold text-[#8B735B]">{t.unseatedConfirmedLabel}</span>
                <p className="text-base font-bold text-[#8B735B]">
                  {Math.max(0, totalConfirmedGuests - totalSeatedGuests)} <span className="text-[11px] font-normal text-[#5D5449]">{t.guestsWord}</span>
                </p>
              </div>
              <div className="p-2 rounded-xl bg-[#EFE6DC]/40 border border-[#CBAE94]/40">
                <span className="text-[10px] font-mono uppercase font-bold text-[#8B735B]">{t.venueCapacityLabel}</span>
                <p className="text-base font-bold text-[#4A3F35]">
                  {floorMap ? floorMap.tables.reduce((s, tbl) => s + tbl.capacity, 0) : 0} <span className="text-[11px] font-normal text-[#5D5449]">{t.totalSeatsWord}</span>
                </p>
              </div>
            </div>

            {/* Read-Only Floor Plan Canvas Stage */}
            <div
              ref={containerRef}
              className="bg-[#FFFDF9] rounded-3xl p-5 shadow-xl border-2 border-[#CBAE94] overflow-hidden relative space-y-3"
            >
              <div className="flex items-center justify-between px-1 border-b border-[#CBAE94]/30 pb-3">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-[#8B735B]/10 text-[#8B735B] flex items-center justify-center">
                    <Layers className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-gaegu text-xl font-bold text-[#4A3F35]">
                      Venue Floor Plan View
                    </h3>
                    <p className="text-[11px] text-[#8B735B] font-medium">
                      {selectedUnassignedGuest
                        ? `Click any green highlighted table to seat ${selectedUnassignedGuest.name} (Party of ${getGuestPartySize(selectedUnassignedGuest)})`
                        : 'Layout overview • Click Unassigned Guests on left sidebar to seat parties'}
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
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setTableStatusFilter('all')}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition-all ${
                      tableStatusFilter === 'all'
                        ? 'bg-[#8B735B] text-white shadow-sm'
                        : 'bg-white hover:bg-[#EFE6DC] text-[#5D5449] border border-[#CBAE94]/60'
                    }`}
                  >
                    {t.allTablesFilterLabel.replace('{{count}}', String(floorMap ? floorMap.tables.length : 0))}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTableStatusFilter('empty')}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                      tableStatusFilter === 'empty'
                        ? 'bg-emerald-600 text-white shadow-sm'
                        : 'bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-300'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    {t.emptyTablesFilterLabel.replace('{{count}}', String(emptyTablesCount))}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTableStatusFilter('partial')}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                      tableStatusFilter === 'partial'
                        ? 'bg-amber-600 text-white shadow-sm'
                        : 'bg-white hover:bg-amber-50 text-amber-800 border border-amber-300'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-amber-500" />
                    {t.partialTablesFilterLabel.replace('{{count}}', String(partialTablesCount))}
                  </button>
                  <button
                    type="button"
                    onClick={() => setTableStatusFilter('full')}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                      tableStatusFilter === 'full'
                        ? 'bg-rose-600 text-white shadow-sm'
                        : 'bg-white hover:bg-rose-50 text-rose-800 border border-rose-300'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                    {t.fullTablesFilterLabel.replace('{{count}}', String(fullTablesCount))}
                  </button>
                </div>
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
                        onTableHover={(table, x, y) => handleTableHover(table, guests, x, y)}
                        onSeatHover={(table, idx, x, y) => handleSeatHover(table, idx, guests, x, y)}
                        onLandmarkHover={(lm, x, y) => handleLandmarkHover(lm, x, y)}
                        onTableClick={(table) => {
                          if (!selectedUnassignedGuest) return;
                          const partyNeeded = getGuestPartySize(selectedUnassignedGuest);
                          const freeSeats = table.capacity - getTableOccupiedSeats(table, guests);
                          if (freeSeats >= partyNeeded) {
                            void handleMainAssignGuest(selectedUnassignedGuest.id, table.id).then(
                              (ok) => {
                                if (ok) setSelectedUnassignedGuest(null);
                              }
                            );
                          } else {
                            setNotification(
                              t.fpNoFitTableToast
                                .replace('{{table}}', table.name)
                                .replace('{{free}}', String(freeSeats))
                                .replace('{{guest}}', selectedUnassignedGuest.name)
                                .replace('{{needed}}', String(partyNeeded))
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
                    {/* Layer 1: Grid Lines */}
                    <Layer>
                      {/* Outer boundary border */}
                      <Rect
                        x={10}
                        y={10}
                        width={floorMap.canvasWidth - 20}
                        height={floorMap.canvasHeight - 20}
                        stroke="#CBAE94"
                        strokeWidth={2}
                        dash={[8, 8]}
                        cornerRadius={20}
                      />

                      {/* Grid background lines */}
                      {Array.from({ length: Math.ceil(floorMap.canvasWidth / 55) }).map((_, i) => (
                        <Line
                          key={`vgrid-${i}`}
                          points={[(i + 1) * 55, 20, (i + 1) * 55, floorMap.canvasHeight - 20]}
                          stroke="#EFE6DC"
                          strokeWidth={1}
                          dash={[2, 4]}
                        />
                      ))}
                      {Array.from({ length: Math.ceil(floorMap.canvasHeight / 55) }).map((_, i) => (
                        <Line
                          key={`hgrid-${i}`}
                          points={[20, (i + 1) * 55, floorMap.canvasWidth - 20, (i + 1) * 55]}
                          stroke="#EFE6DC"
                          strokeWidth={1}
                          dash={[2, 4]}
                        />
                      ))}
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
                          {renderCustomLandmarkShape(landmark, false)}
                        </Group>
                      ))}
                    </Layer>

                    {/* Layer 3: Tables & Seats */}
                    <Layer>
                      {floorMap.tables.map((table) => {
                        const occupiedSeats = getTableOccupiedSeats(table, guests);
                        const color = table.color || '#8B735B';

                        const status = getTableStatus(table, guests);
                        const matchesFilter =
                          tableStatusFilter === 'all' || status === tableStatusFilter;
                        const tableOpacity = matchesFilter ? 1 : 0.25;

                        // Unassigned guest seating highlighting
                        const partyNeeded = selectedUnassignedGuest
                          ? getGuestPartySize(selectedUnassignedGuest)
                          : 0;
                        const freeSeats = table.capacity - occupiedSeats;
                        const isUnassignedActive = selectedUnassignedGuest !== null;
                        const canFitSelected = isUnassignedActive && freeSeats >= partyNeeded;

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
                                    t.fpNoFitTableToast.replace('{{table}}', table.name).replace('{{free}}', String(freeSeats)).replace('{{guest}}', selectedUnassignedGuest.name).replace('{{needed}}', String(partyNeeded))
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
                                    ? `Fits (${freeSeats} Free)`
                                    : `Need ${partyNeeded}`
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
                            {Array.from({ length: table.capacity }).map((_, idx) => {
                              const angle = (idx / table.capacity) * 2 * Math.PI;
                              const radiusX = table.width / 2 + 18;
                              const radiusY = table.height / 2 + 18;
                              const seatX = table.width / 2 + radiusX * Math.cos(angle);
                              const seatY = table.height / 2 + radiusY * Math.sin(angle);
                              const isOccupied = idx < occupiedSeats;

                              let seatFill = isOccupied ? '#8B735B' : '#FFFDF9';
                              let seatStroke = '#CBAE94';

                              if (isUnassignedActive && !isOccupied && canFitSelected) {
                                seatFill = '#A7F3D0';
                                seatStroke = '#059669';
                              }



  return (
                                <Circle
                                  key={`seat-${table.id}-${idx}`}
                                  x={seatX}
                                  y={seatY}
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
                            })}

                            {/* Table Body Shape */}
                            {renderTableBody({ table, isSelected: false })}

                            {/* Table Title */}
                            <Text
                              text={table.name}
                              width={table.width}
                              height={table.height * 0.6}
                              align="center"
                              verticalAlign="middle"
                              fontSize={11}
                              fontStyle="bold"
                              fill="#4A3F35"
                              padding={4}
                            />

                            {/* Capacity Counter pill */}
                            <Text
                              text={`${occupiedSeats}/${table.capacity} Seats`}
                              y={table.height * 0.58}
                              width={table.width}
                              align="center"
                              fontSize={9}
                              fontStyle="bold"
                              fill={occupiedSeats > table.capacity ? '#C53030' : '#8B735B'}
                            />
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
              disabled={sendingEmail}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-2xl bg-[#8B735B] hover:bg-[#705C47] text-white text-xs font-bold shadow-md transition-all"
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
          language={language}
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
