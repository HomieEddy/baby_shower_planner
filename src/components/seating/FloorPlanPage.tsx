import React, { useState, useEffect, useRef } from 'react';
import {
  Guest,
  FloorMapData,
  TableElement,
  LandmarkElement,
} from '../../types';
import { adminFetch } from '../../lib/api';
import { DayOfQrModal } from './DayOfQrModal';
import { motion, AnimatePresence } from 'motion/react';
import { useConfirm } from '../shared/ConfirmDialog';
import { Modal } from '../shared/Modal';
import { useSettingsStore } from '../../stores/settingsStore';
import { EmptyState } from '../shared/EmptyState';
import { Field, TextInput, TextArea, Select } from '../shared/ui';
import {
  Stage,
  Layer,
  Rect,
  Circle,
  Text,
  Group,
  Line,
  Transformer,
  Arc,
  Path,
} from 'react-konva';
import {
  Layout,
  Plus,
  Users,
  Share2,
  Printer,
  Download,
  Search,
  MapPin,
  Sparkles,
  Utensils,
  UtensilsCrossed,
  Trash2,
  RotateCw,
  Check,
  X,
  Mail,
  Info,
  Layers,
  ChevronRight,
  Maximize2,
  Award,
  Gift,
  Home,
  Castle,
  Landmark,
  Tent,
  Save,
  Edit3,
  RotateCcw,
  CheckCircle2,
  UserX,
  Undo2,
  Redo2,
  Wand2,
  PieChart,
  Filter,
} from 'lucide-react';
import { getGuestPartySize, getTableOccupiedSeats, getTableSeatedPersonNames, getSeatOccupantInfo, getTableStatus } from './floorPlanHelpers';
import { renderCustomLandmarkShape } from './renderCustomLandmarkShape';
import { renderTableBody } from './venueShapes';
import { useAppStore } from '../../stores/appStore';
import { useT } from '../shared/i18n';

export const FloorPlanPage = () => {
  const language = useAppStore((s) => s.language);
  const settings = useSettingsStore((s) => s.settings);
  const t = useT();
  const confirm = useConfirm();

  // Active View: admin canvas editor only (guest finder moved to /find-my-table)

  // Floor Map Data State
  const [floorMap, setFloorMap] = useState<FloorMapData | null>(null);
  const [guests, setGuests] = useState<Guest[]>([]);
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);

  // Selection state in Host Mode
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<'table' | 'landmark' | null>(null);

  // Full-Screen Editor Modal State
  const [isEditorModalOpen, setIsEditorModalOpen] = useState(false);
  const [draftFloorMap, setDraftFloorMap] = useState<FloorMapData | null>(null);
  const [draftGuests, setDraftGuests] = useState<Guest[]>([]);
  const [isDirty, setIsDirty] = useState(false);

  // Modal Stage refs & scale
  const modalStageRef = useRef<any>(null);
  const modalTransformerRef = useRef<any>(null);
  const modalContainerRef = useRef<HTMLDivElement>(null);
  const [modalCanvasScale, setModalCanvasScale] = useState(1);

  // Bidirectional Seating Editor State: 'table' (select table then guest) vs 'guest' (select guest then choose valid table)
  const [seatingWorkflowTab, setSeatingWorkflowTab] = useState<'table' | 'guest'>('table');
  const [selectedGuestForSeating, setSelectedGuestForSeating] = useState<Guest | null>(null);
  const [guestFilterQuery, setGuestFilterQuery] = useState('');

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

  const getTableStatus = (table: TableElement, guestsList: Guest[]): 'full' | 'partial' | 'empty' => {
    const occupied = getTableOccupiedSeats(table, guestsList);
    if (occupied >= table.capacity) return 'full';
    if (occupied > 0) return 'partial';
    return 'empty';
  };

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

  const handleTableHover = (e: any, table: TableElement, guestsList: Guest[]) => {
    const occupiedSeats = getTableOccupiedSeats(table, guestsList);
    const seatedPersonNames = getTableSeatedPersonNames(table, guestsList);

    setHoverTooltip({
      title: table.name,
      subtitle: `${table.shape === 'circle' ? 'Round Table' : 'Rectangle Table'} • ${occupiedSeats}/${table.capacity} Seats`,
      details: [
        `Seated (${seatedPersonNames.length}): ${seatedPersonNames.length > 0 ? seatedPersonNames.join(', ') : 'No guests assigned yet'}`,
        `Capacity: ${table.capacity} seats (${Math.max(0, table.capacity - occupiedSeats)} available)`,
      ],
      x: e.evt.clientX,
      y: e.evt.clientY,
    });
  };

  const handleSeatHover = (e: any, table: TableElement, seatIndex: number, guestsList: Guest[]) => {
    e.cancelBubble = true;
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
        x: e.evt.clientX,
        y: e.evt.clientY,
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
        x: e.evt.clientX,
        y: e.evt.clientY,
      });
    }
  };

  const handleLandmarkHover = (e: any, landmark: LandmarkElement) => {
    setHoverTooltip({
      title: landmark.name,
      subtitle: `Venue Feature / Landmark`,
      details: [
        `Type: ${landmark.type.toUpperCase()}`,
        `Dimensions: ${landmark.width} × ${landmark.height} px`,
      ],
      x: e.evt.clientX,
      y: e.evt.clientY,
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

  // Sync Konva Transformer selection
  useEffect(() => {
    if (transformerRef.current) {
      if (selectedId) {
        const stage = stageRef.current;
        const selectedNode = stage.findOne('#' + selectedId);
        if (selectedNode) {
          transformerRef.current.nodes([selectedNode]);
          transformerRef.current.getLayer().batchDraw();
        } else {
          transformerRef.current.nodes([]);
        }
      } else {
        transformerRef.current.nodes([]);
      }
    }
  }, [selectedId]);

  // Adjust Modal Canvas Scale
  useEffect(() => {
    const handleResizeModal = () => {
      if (modalContainerRef.current && draftFloorMap) {
        const w = modalContainerRef.current.clientWidth - 32;
        const h = modalContainerRef.current.clientHeight - 32;
        const scaleX = w / draftFloorMap.canvasWidth;
        const scaleY = h / draftFloorMap.canvasHeight;
        const scale = Math.min(1, scaleX, scaleY);
        setModalCanvasScale(Math.max(0.45, scale));
      }
    };

    if (isEditorModalOpen) {
      handleResizeModal();
      window.addEventListener('resize', handleResizeModal);
      return () => window.removeEventListener('resize', handleResizeModal);
    }
  }, [isEditorModalOpen, draftFloorMap]);

  // Sync Modal Konva Transformer selection
  useEffect(() => {
    if (modalTransformerRef.current && isEditorModalOpen) {
      if (selectedId) {
        const stage = modalStageRef.current;
        if (stage) {
          const selectedNode = stage.findOne('#' + selectedId);
          if (selectedNode) {
            modalTransformerRef.current.nodes([selectedNode]);
            modalTransformerRef.current.getLayer()?.batchDraw();
          } else {
            modalTransformerRef.current.nodes([]);
          }
        }
      } else {
        modalTransformerRef.current.nodes([]);
      }
    }
  }, [selectedId, isEditorModalOpen, draftFloorMap]);

  // Open Full Screen Editor Modal
  const handleOpenEditor = () => {
    if (!floorMap) return;
    setDraftFloorMap(JSON.parse(JSON.stringify(floorMap)));
    setDraftGuests(JSON.parse(JSON.stringify(guests)));
    setIsDirty(false);
    setSelectedId(null);
    setSelectedType(null);
    setIsEditorModalOpen(true);
  };

  // Save Full Screen Editor Draft Changes
  const handleSaveChanges = async () => {
    if (!draftFloorMap) return;
    await saveFloorMap(draftFloorMap);
    setGuests(draftGuests);
    setIsDirty(false);
    setIsEditorModalOpen(false);
    setSelectedId(null);
    setSelectedType(null);
    setNotification(t.fpSavedToast);
    setTimeout(() => setNotification(null), 3000);
  };

  // Cancel Full Screen Editor Changes
  const handleCancelEditor = () => {
    setDraftFloorMap(null);
    setIsEditorModalOpen(false);
    setIsDirty(false);
    setSelectedId(null);
    setSelectedType(null);
    setNotification(t.fpEditCancelledToast);
    setTimeout(() => setNotification(null), 2500);
  };

  // --- ROOM SIZE & DIMENSIONS HANDLERS ---
  const handleUpdateDraftRoomSize = (width: number, height: number) => {
    if (!draftFloorMap) return;
    const clampedW = Math.max(500, Math.min(3000, width));
    const clampedH = Math.max(400, Math.min(2500, height));
    setDraftFloorMap({
      ...draftFloorMap,
      canvasWidth: clampedW,
      canvasHeight: clampedH,
    });
    setIsDirty(true);
  };

  const handleUpdateMainRoomSize = async (width: number, height: number) => {
    if (!floorMap) return;
    const clampedW = Math.max(500, Math.min(3000, width));
    const clampedH = Math.max(400, Math.min(2500, height));
    const updatedMap = {
      ...floorMap,
      canvasWidth: clampedW,
      canvasHeight: clampedH,
    };
    setFloorMap(updatedMap);
    await saveFloorMap(updatedMap);
    setNotification(t.fpRoomSizeToast.replace('{{width}}', String(clampedW)).replace('{{height}}', String(clampedH)));
    setTimeout(() => setNotification(null), 2500);
  };

  // --- DRAFT HANDLERS FOR FULL SCREEN EDITOR MODAL ---
  const handleDraftAddTable = (shape: 'circle' | 'rectangle') => {
    if (!draftFloorMap) return;
    const tableCount = draftFloorMap.tables.length + 1;
    const newTable: TableElement = {
      id: `tbl-${Date.now()}`,
      name: `Table ${tableCount}`,
      shape,
      x: 180 + (tableCount * 25) % 250,
      y: 180 + (tableCount * 25) % 180,
      width: shape === 'circle' ? 120 : 180,
      height: shape === 'circle' ? 120 : 95,
      capacity: 8,
      assignedGuestIds: [],
      color: '#8B735B',
    };
    setDraftFloorMap({
      ...draftFloorMap,
      tables: [...draftFloorMap.tables, newTable],
    });
    setSelectedId(newTable.id);
    setSelectedType('table');
    setIsDirty(true);
  };

  const handleDraftAddLandmark = (
    type: 'entrance' | 'stage' | 'gifts' | 'photobooth' | 'bar' | 'dessert' | 'dj' | 'food',
    name: string
  ) => {
    if (!draftFloorMap) return;
    const newLandmark: LandmarkElement = {
      id: `lm-${Date.now()}`,
      name,
      type,
      x: 120,
      y: 120,
      width: 150,
      height: 60,
    };
    setDraftFloorMap({
      ...draftFloorMap,
      landmarks: [...draftFloorMap.landmarks, newLandmark],
    });
    setSelectedId(newLandmark.id);
    setSelectedType('landmark');
    setIsDirty(true);
  };

  const handleDraftTableDragEnd = (id: string, e: any) => {
    if (!draftFloorMap) return;
    const updatedTables = draftFloorMap.tables.map((t) =>
      t.id === id
        ? { ...t, x: Math.round(e.target.x()), y: Math.round(e.target.y()) }
        : t
    );
    setDraftFloorMap({ ...draftFloorMap, tables: updatedTables });
    setIsDirty(true);
  };

  const handleDraftLandmarkDragEnd = (id: string, e: any) => {
    if (!draftFloorMap) return;
    const updatedLandmarks = draftFloorMap.landmarks.map((l) =>
      l.id === id
        ? { ...l, x: Math.round(e.target.x()), y: Math.round(e.target.y()) }
        : l
    );
    setDraftFloorMap({ ...draftFloorMap, landmarks: updatedLandmarks });
    setIsDirty(true);
  };

  const handleDraftTransformEnd = () => {
    if (!selectedId || !draftFloorMap) return;
    const node = modalStageRef.current?.findOne('#' + selectedId);
    if (!node) return;

    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    const rotation = Math.round(node.rotation());

    node.scaleX(1);
    node.scaleY(1);

    if (selectedType === 'table') {
      const updatedTables = draftFloorMap.tables.map((t) => {
        if (t.id === selectedId) {
          return {
            ...t,
            x: Math.round(node.x()),
            y: Math.round(node.y()),
            width: Math.max(50, Math.round(t.width * scaleX)),
            height: Math.max(50, Math.round(t.height * scaleY)),
            rotation,
          };
        }
        return t;
      });
      setDraftFloorMap({ ...draftFloorMap, tables: updatedTables });
      setIsDirty(true);
    } else if (selectedType === 'landmark') {
      const updatedLandmarks = draftFloorMap.landmarks.map((l) => {
        if (l.id === selectedId) {
          return {
            ...l,
            x: Math.round(node.x()),
            y: Math.round(node.y()),
            width: Math.max(60, Math.round(l.width * scaleX)),
            height: Math.max(30, Math.round(l.height * scaleY)),
            rotation,
          };
        }
        return l;
      });
      setDraftFloorMap({ ...draftFloorMap, landmarks: updatedLandmarks });
      setIsDirty(true);
    }
  };

  const handleDraftDeleteSelected = () => {
    if (!selectedId || !draftFloorMap) return;
    if (selectedType === 'table') {
      const updatedTables = draftFloorMap.tables.filter((t) => t.id !== selectedId);
      setDraftFloorMap({ ...draftFloorMap, tables: updatedTables });
      setIsDirty(true);
    } else if (selectedType === 'landmark') {
      const updatedLandmarks = draftFloorMap.landmarks.filter((l) => l.id !== selectedId);
      setDraftFloorMap({ ...draftFloorMap, landmarks: updatedLandmarks });
      setIsDirty(true);
    }
    setSelectedId(null);
    setSelectedType(null);
  };

  const handleDraftAssignGuest = (guestId: string, tableId: string | null): boolean => {
    if (!draftFloorMap) return false;

    const guest = draftGuests.find((g) => g.id === guestId);
    if (!guest) return false;

    const partySize = getGuestPartySize(guest);

    if (tableId) {
      const targetTable = draftFloorMap.tables.find((t) => t.id === tableId);
      if (targetTable) {
        // Calculate occupied seats excluding this guest if already at this table
        const occupiedWithoutThisGuest = targetTable.assignedGuestIds
          .filter((id) => id !== guestId)
          .reduce((sum, id) => {
            const g = draftGuests.find((x) => x.id === id);
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
    const updatedTables = draftFloorMap.tables.map((tbl) => ({
      ...tbl,
      assignedGuestIds: tbl.assignedGuestIds.filter((id) => id !== guestId),
    }));

    if (tableId) {
      const targetTbl = updatedTables.find((tbl) => tbl.id === tableId);
      if (targetTbl) {
        targetTbl.assignedGuestIds.push(guestId);
      }
    }

    const updatedGuests = draftGuests.map((g) =>
      g.id === guestId ? { ...g, table_id: tableId || undefined } : g
    );

    setDraftFloorMap({ ...draftFloorMap, tables: updatedTables });
    setDraftGuests(updatedGuests);
    setIsDirty(true);

    if (tableId) {
      const targetTbl = draftFloorMap.tables.find((t) => t.id === tableId);
      setNotification(t.fpSeatedToast.replace('{{guest}}', guest.name).replace('{{size}}', String(partySize)).replace('{{table}}', targetTbl?.name || ''));
      setTimeout(() => setNotification(null), 3000);
    } else {
      setNotification(t.fpUnseatedToast.replace('{{guest}}', guest.name));
      setTimeout(() => setNotification(null), 2500);
    }

    return true;
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
  const handleAddTable = (shape: 'circle' | 'rectangle') => {
    if (!floorMap) return;
    const tableCount = floorMap.tables.length + 1;
    const newTable: TableElement = {
      id: `tbl-${Date.now()}`,
      name: `Table ${tableCount}`,
      shape,
      x: 200 + (tableCount * 20) % 200,
      y: 200 + (tableCount * 20) % 150,
      width: shape === 'circle' ? 120 : 180,
      height: shape === 'circle' ? 120 : 95,
      capacity: 8,
      assignedGuestIds: [],
      color: '#8B735B',
    };

    const updated = {
      ...floorMap,
      tables: [...floorMap.tables, newTable],
    };
    setFloorMap(updated);
    setSelectedId(newTable.id);
    setSelectedType('table');
    saveFloorMap(updated);

    setNotification(t.fpTableAddedToast.replace('{{name}}', newTable.name));
    setTimeout(() => setNotification(null), 2500);
  };

  // Add Landmark Helper
  const handleAddLandmark = (
    type: 'entrance' | 'stage' | 'gifts' | 'photobooth' | 'bar' | 'dessert' | 'dj',
    name: string
  ) => {
    if (!floorMap) return;
    const newLandmark: LandmarkElement = {
      id: `lm-${Date.now()}`,
      name,
      type,
      x: 100,
      y: 100,
      width: 150,
      height: 60,
    };

    const updated = {
      ...floorMap,
      landmarks: [...floorMap.landmarks, newLandmark],
    };
    setFloorMap(updated);
    setSelectedId(newLandmark.id);
    setSelectedType('landmark');
    saveFloorMap(updated);

    setNotification(t.fpLandmarkAddedToast.replace('{{name}}', name));
    setTimeout(() => setNotification(null), 2500);
  };

  // Handle Drag End for Table
  const handleTableDragEnd = (id: string, e: any) => {
    if (!floorMap) return;
    const updatedTables = floorMap.tables.map((t) => {
      if (t.id === id) {
        return {
          ...t,
          x: Math.round(e.target.x()),
          y: Math.round(e.target.y()),
        };
      }
      return t;
    });

    const updatedMap = { ...floorMap, tables: updatedTables };
    setFloorMap(updatedMap);
    saveFloorMap(updatedMap);
  };

  // Handle Drag End for Landmark
  const handleLandmarkDragEnd = (id: string, e: any) => {
    if (!floorMap) return;
    const updatedLandmarks = floorMap.landmarks.map((l) => {
      if (l.id === id) {
        return {
          ...l,
          x: Math.round(e.target.x()),
          y: Math.round(e.target.y()),
        };
      }
      return l;
    });

    const updatedMap = { ...floorMap, landmarks: updatedLandmarks };
    setFloorMap(updatedMap);
    saveFloorMap(updatedMap);
  };

  // Handle Transform End (Resize/Rotate)
  const handleTransformEnd = () => {
    if (!selectedId || !floorMap) return;
    const node = stageRef.current?.findOne('#' + selectedId);
    if (!node) return;

    const scaleX = node.scaleX();
    const scaleY = node.scaleY();
    const rotation = Math.round(node.rotation());

    // Reset scale to 1 on node and apply to width/height
    node.scaleX(1);
    node.scaleY(1);

    if (selectedType === 'table') {
      const updatedTables = floorMap.tables.map((t) => {
        if (t.id === selectedId) {
          return {
            ...t,
            x: Math.round(node.x()),
            y: Math.round(node.y()),
            width: Math.max(50, Math.round(t.width * scaleX)),
            height: Math.max(50, Math.round(t.height * scaleY)),
            rotation,
          };
        }
        return t;
      });
      const updatedMap = { ...floorMap, tables: updatedTables };
      setFloorMap(updatedMap);
      saveFloorMap(updatedMap);
    } else if (selectedType === 'landmark') {
      const updatedLandmarks = floorMap.landmarks.map((l) => {
        if (l.id === selectedId) {
          return {
            ...l,
            x: Math.round(node.x()),
            y: Math.round(node.y()),
            width: Math.max(60, Math.round(l.width * scaleX)),
            height: Math.max(30, Math.round(l.height * scaleY)),
            rotation,
          };
        }
        return l;
      });
      const updatedMap = { ...floorMap, landmarks: updatedLandmarks };
      setFloorMap(updatedMap);
      saveFloorMap(updatedMap);
    }
  };

  // Delete Selected Element
  const handleDeleteSelected = async () => {
    if (!selectedId || !floorMap) return;
    const target =
      selectedType === 'table'
        ? floorMap.tables.find((t) => t.id === selectedId)
        : floorMap.landmarks.find((l) => l.id === selectedId);
    const ok = await confirm({
      title: selectedType === 'table' ? `${t.deleteTableBtn}?` : `${t.deleteLandmarkBtn}?`,
      message: selectedType === 'table'
        ? `Remove "${target?.name || 'this table'}" from the floor map? Assigned guests will need to be re-seated.`
        : `Remove "${target?.name || 'this landmark'}" from the floor map?`,
      confirmText: 'Delete',
    });
    if (!ok) return;
    if (selectedType === 'table') {
      const updatedTables = floorMap.tables.filter((t) => t.id !== selectedId);
      const updatedMap = { ...floorMap, tables: updatedTables };
      setFloorMap(updatedMap);
      saveFloorMap(updatedMap);
    } else if (selectedType === 'landmark') {
      const updatedLandmarks = floorMap.landmarks.filter((l) => l.id !== selectedId);
      const updatedMap = { ...floorMap, landmarks: updatedLandmarks };
      setFloorMap(updatedMap);
      saveFloorMap(updatedMap);
    }
    setSelectedId(null);
    setSelectedType(null);
    setNotification(t.fpElementRemovedToast);
    setTimeout(() => setNotification(null), 2500);
  };

  // Assign or Unassign Guest to Table
  const handleAssignGuest = async (guestId: string, tableId: string | null) => {
    const guest = guests.find((g) => g.id === guestId);
    if (!guest) return;

    const partySize = getGuestPartySize(guest);

    if (tableId && floorMap) {
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
          return;
        }
      }
    }

    try {
      const res = await adminFetch('/api/floorplan/assign', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guestId, tableId }),
      });
      const data = await res.json();
      if (data.error) {
        setNotification(`${data.error}`);
        setTimeout(() => setNotification(null), 4000);
        return;
      }
      if (data.floorMap) {
        setFloorMap(data.floorMap);
      }
      // Refresh guests
      const gRes = await adminFetch('/api/guests');
      const gData = await gRes.json();
      if (gData.guests) {
        setGuests(gData.guests);
      }

      if (tableId && floorMap) {
        const targetTbl = floorMap.tables.find((t) => t.id === tableId);
        setNotification(t.fpSeatedToast.replace('{{guest}}', guest.name).replace('{{size}}', String(partySize)).replace('{{table}}', targetTbl?.name || ''));
        setTimeout(() => setNotification(null), 3000);
      } else {
        setNotification(t.fpUnseatedToast.replace('{{guest}}', guest.name));
        setTimeout(() => setNotification(null), 2500);
      }
    } catch (err: any) {
      console.error('Error assigning guest:', err);
      setNotification(`${err.message || t.fpAssignFailedToast}`);
      setTimeout(() => setNotification(null), 4000);
    }
  };

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
        setNotification(t.fpEmailsSentToast.replace('{{count}}', String(data.count)));
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

  // Selected Table helper
  const selectedTable = floorMap?.tables.find((t) => t.id === selectedId);
  const selectedLandmark = floorMap?.landmarks.find((l) => l.id === selectedId);

  const draftSelectedTable = draftFloorMap?.tables.find((t) => t.id === selectedId);
  const draftSelectedLandmark = draftFloorMap?.landmarks.find((l) => l.id === selectedId);

  return (
    <div className="space-y-6 pb-12">
      {/* Top Banner & Mode Switcher */}
      <div className="bg-[#FFFDF9] rounded-3xl p-6 shadow-xl border-2 border-[#CBAE94] flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center gap-1 px-3 py-0.5 rounded-full bg-[#EFE6DC] text-[#8B735B] text-xs font-mono font-bold uppercase">
              <Layout className="w-3.5 h-3.5" /> Interactive Floor Plan
            </span>
            {saving && (
              <span className="text-xs font-mono text-[#8B735B] animate-pulse">
                • Saving changes...
              </span>
            )}
          </div>
          <h2 className="font-gaegu text-3xl sm:text-4xl font-bold text-[#4A3F35]">
            Venue Seating & Floor Canvas
          </h2>
          <p className="text-xs text-[#5D5449] font-medium mt-0.5">
            {t.hostModeSubtitle}
          </p>
        </div>

        {/* Mode Toggle & Undo/Redo Controls */}
        <div className="flex flex-wrap items-center gap-3 self-start md:self-auto">
          {(
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
          )}
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

        return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column: Unassigned Guests Sidebar & Host Actions (lg:col-span-4) */}
          <div className="lg:col-span-4 space-y-4">
            {/* Unassigned Guests Sidebar */}
            <div className="bg-[#FFFDF9] rounded-3xl p-5 shadow-lg border-2 border-[#CBAE94] space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-[#CBAE94]/40">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-[#8B735B]/10 text-[#8B735B] flex items-center justify-center font-bold">
                    <UserX className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-gaegu text-xl font-bold text-[#4A3F35] leading-none">
                      {t.unassignedGuestsLabel}
                    </h3>
                    <p className="text-[11px] text-[#8B735B] font-medium">
                      {t.selectPartyHint}
                    </p>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full bg-[#EFE6DC] text-[#8B735B] text-xs font-mono font-bold border border-[#CBAE94]">
                  {unassignedGuestsList.length} Unseated
                </span>
              </div>

              {/* Search Filter Box */}
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-[#8B735B] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder={t.filterUnassignedPh}
                  value={unassignedFilterQuery}
                  onChange={(e) => setUnassignedFilterQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 rounded-xl border border-[#CBAE94] text-xs font-bold text-[#5D5449] bg-white focus:outline-none focus:ring-2 focus:ring-[#8B735B]/30"
                />
              </div>

              {/* Active Selected Party Highlight Banner */}
              {selectedUnassignedGuest && (
                <div className="p-3.5 rounded-2xl bg-emerald-50 border-2 border-emerald-400 space-y-2.5 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <span className="px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-mono font-bold uppercase">
                        Active Seating Target
                      </span>
                      <h4 className="font-bold text-[#4A3F35] text-sm mt-1">
                        {selectedUnassignedGuest.name}
                      </h4>
                      <p className="text-xs text-emerald-800 font-bold">
                        Party of {getGuestPartySize(selectedUnassignedGuest)} ({getGuestPartySize(selectedUnassignedGuest)} seats needed)
                      </p>
                    </div>
                    <button
                      onClick={() => setSelectedUnassignedGuest(null)}
                      className="p-1 rounded-lg text-emerald-700 hover:bg-emerald-200 transition-colors"
                      title={t.clearSelectionBtn}
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <p className="text-[11px] text-emerald-900 bg-emerald-100/70 p-2 rounded-xl border border-emerald-200 leading-snug">
                    <strong>{t.mapGuidanceLabel}</strong> Available tables with at least {getGuestPartySize(selectedUnassignedGuest)} free seats are highlighted in <strong className="text-emerald-700 font-extrabold">{t.greenLegend}</strong> {t.greenLegendHint}
                  </p>

                  {/* Available Table Direct Seating Buttons */}
                  <div className="space-y-1 pt-1 border-t border-emerald-200">
                    <span className="text-[10px] font-mono font-bold uppercase text-emerald-800 block">
                      Matching Tables with Capacity:
                    </span>
                    <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                      {floorMap?.tables
                        .filter((t) => {
                          const occ = getTableOccupiedSeats(t, guests);
                          return t.capacity - occ >= getGuestPartySize(selectedUnassignedGuest);
                        })
                        .map((t) => {
                          const occ = getTableOccupiedSeats(t, guests);
                          const free = t.capacity - occ;
                          return (
                            <button
                              key={t.id}
                              onClick={async () => {
                                const success = await handleMainAssignGuest(selectedUnassignedGuest.id, t.id);
                                if (success) setSelectedUnassignedGuest(null);
                              }}
                              className="w-full p-2 rounded-xl bg-white hover:bg-emerald-100 border border-emerald-300 text-left transition-all flex items-center justify-between group shadow-sm"
                            >
                              <span className="text-xs font-bold text-[#4A3F35] group-hover:text-emerald-900 flex items-center gap-1">
                                <Utensils className="w-3 h-3" /> {t.name}
                              </span>
                              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                                {free} free seats
                              </span>
                            </button>
                          );
                        })}
                      {floorMap?.tables.filter((t) => t.capacity - getTableOccupiedSeats(t, guests) >= getGuestPartySize(selectedUnassignedGuest)).length === 0 && (
                        <p className="text-xs text-amber-700 italic bg-amber-50 p-2 rounded-xl border border-amber-200">
                          No single table currently has {getGuestPartySize(selectedUnassignedGuest)} free seats.
                        </p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Scrollable Unassigned Guest Cards List */}
              <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                {unassignedGuestsList.length === 0 ? (
                  <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-1">
                    <CheckCircle2 className="w-6 h-6 text-emerald-600 mx-auto" />
                    <p className="text-xs font-bold text-emerald-900">
                      {t.allSeatedTitle}
                    </p>
                    <p className="text-[11px] text-emerald-700">
                      {t.allSeatedMsg}
                    </p>
                  </div>
                ) : (
                  unassignedGuestsList.map((g) => {
                    const pSize = getGuestPartySize(g);
                    const isSelected = selectedUnassignedGuest?.id === g.id;

                    return (
                      <div
                        key={g.id}
                        onClick={() => setSelectedUnassignedGuest(isSelected ? null : g)}
                        className={`p-3 rounded-2xl border-2 transition-all cursor-pointer space-y-2 ${
                          isSelected
                            ? 'bg-emerald-50/80 border-emerald-500 shadow-md ring-2 ring-emerald-300'
                            : 'bg-white hover:bg-[#EFE6DC]/40 border-[#CBAE94]/60'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h4 className="font-bold text-[#4A3F35] text-xs">
                              {g.name}
                            </h4>
                            <p className="text-[11px] text-[#8B735B] font-medium">
                              {g.email}
                            </p>
                          </div>
                          <span className="px-2 py-0.5 rounded-full bg-[#EFE6DC] text-[#8B735B] text-[10px] font-bold border border-[#CBAE94]/60 whitespace-nowrap">
                            Party of {pSize}
                          </span>
                        </div>

                        {g.attendee_names && g.attendee_names.length > 0 && (
                          <div className="flex flex-wrap gap-1 pt-0.5">
                            {g.attendee_names.map((att, aIdx) => (
                              <span
                                key={aIdx}
                                className="px-2 py-0.5 rounded-md bg-[#FAF6F0] border border-[#CBAE94]/40 text-[10px] text-[#5D5449] font-medium"
                              >
                                • {att}
                              </span>
                            ))}
                          </div>
                        )}

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedUnassignedGuest(isSelected ? null : g);
                          }}
                          className={`w-full py-1.5 px-3 rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 ${
                            isSelected
                              ? 'bg-emerald-600 text-white shadow-sm'
                              : 'bg-[#EFE6DC] hover:bg-[#CBAE94]/40 text-[#8B735B]'
                          }`}
                        >
                          {isSelected ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" /> Highlighting Available Tables
                            </>
                          ) : (
                            <>
                              <Users className="w-3.5 h-3.5" /> Select & Highlight Tables
                            </>
                          )}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>

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
                      <CheckCircle2 className="w-3.5 h-3.5" /> Fully Seated!
                    </span>
                  ) : (
                    <span className="px-2.5 py-1 rounded-full bg-[#EFE6DC] text-[#8B735B] text-xs font-bold border border-[#CBAE94]">
                      {Math.max(0, totalConfirmedGuests - totalSeatedGuests)} unseated
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

                <button
                  onClick={handleOpenEditor}
                  className="px-3 py-1.5 rounded-xl bg-[#8B735B] hover:bg-[#705C47] text-white text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm"
                >
                  <Maximize2 className="w-3.5 h-3.5" /> Full-Screen Editor
                </button>
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
                    All Tables ({floorMap ? floorMap.tables.length : 0})
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
                    Empty ({emptyTablesCount})
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
                    Partial ({partialTablesCount})
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
                    Full ({fullTablesCount})
                  </button>
                </div>
              </div>

              {/* Canvas Outer Wrapper */}
              <div className="w-full overflow-x-auto flex justify-center bg-[#FAF6F0] p-4 rounded-2xl border border-[#CBAE94]/40 min-h-[500px]">
                {floorMap && (
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
                          onMouseEnter={(e) => handleLandmarkHover(e, landmark)}
                          onMouseMove={(e) => handleLandmarkHover(e, landmark)}
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
                            onMouseEnter={(e) => handleTableHover(e, table, guests)}
                            onMouseMove={(e) => handleTableHover(e, table, guests)}
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
                                  onMouseEnter={(e) => handleSeatHover(e, table, idx, guests)}
                                  onMouseMove={(e) => handleSeatHover(e, table, idx, guests)}
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
      {/* FULL SCREEN FLOOR PLAN EDITOR MODAL                       */}
      {/* ========================================================= */}
      {isEditorModalOpen && draftFloorMap && (
        <div className="fixed inset-0 z-50 bg-[#FAF6F0] flex flex-col w-screen h-screen overflow-hidden animate-fadeIn">
          {/* Top Navigation Bar */}
          <div className="bg-[#FFFDF9] border-b-2 border-[#CBAE94] px-6 py-3 flex items-center justify-between shadow-md shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-[#8B735B] text-white flex items-center justify-center shadow-md">
                <Maximize2 className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-gaegu text-2xl font-bold text-[#4A3F35]">
                    Full-Screen Floor Plan Editor
                  </h2>
                  {isDirty && (
                    <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 text-[10px] font-mono font-bold uppercase">
                      Unsaved Changes
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-[#8B735B] font-medium">
                  Drag & drop tables, customize venue features, and assign confirmed guests
                </p>
              </div>
            </div>

            {/* Live Draft Stats Tracker */}
            <div className="hidden md:flex items-center gap-4 bg-[#EFE6DC]/60 px-4 py-1.5 rounded-2xl border border-[#CBAE94]">
              <div className="text-center">
                <span className="text-[10px] font-mono font-bold uppercase text-[#8B735B]">{t.draftCapacityLabel}</span>
                <p className="text-xs font-bold text-[#4A3F35]">
                  {draftFloorMap.tables.reduce((s, t) => s + t.capacity, 0)} Seats Total
                </p>
              </div>
              <div className="h-6 w-px bg-[#CBAE94]/40" />
              <div className="text-center">
                <span className="text-[10px] font-mono font-bold uppercase text-[#8B735B]">{t.draftSeatedLabel}</span>
                <p className="text-xs font-bold text-[#4A3F35]">
                  {draftFloorMap.tables.reduce((s, t) => s + getTableOccupiedSeats(t, draftGuests), 0)} Confirmed
                </p>
              </div>
            </div>

            {/* Action Buttons: Cancel and Save Changes */}
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleCancelEditor}
                className="px-4 py-2.5 rounded-xl border-2 border-[#CBAE94] bg-white text-[#5D5449] hover:bg-[#EFE6DC] font-bold text-xs flex items-center gap-1.5 transition-colors shadow-sm"
              >
                <X className="w-4 h-4 text-red-500" /> {t.cancelBtn}
              </button>

              <button
                type="button"
                onClick={handleSaveChanges}
                disabled={saving}
                className="px-6 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-lg flex items-center gap-2 transition-all transform hover:scale-105"
              >
                <Save className="w-4 h-4" />
                {saving ? t.btnSavingChanges : t.btnSaveChanges}
              </button>
            </div>
          </div>

          {/* Modal Main Content (3 Columns) */}
          <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12 gap-4 p-4">
            {/* Left Toolbar Column (col-3) */}
            <div className="lg:col-span-3 overflow-y-auto space-y-4 pr-1">
              {/* Room Dimensions & Size Controls */}
              <div className="bg-[#FFFDF9] rounded-3xl p-4 shadow-md border-2 border-[#CBAE94] space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="label-mono font-bold text-[#8B735B] flex items-center gap-1.5">
                    <Maximize2 className="w-4 h-4" /> Room Dimensions
                  </h3>
                  <span className="text-[11px] font-mono font-bold text-[#4A3F35] bg-[#EFE6DC] px-2 py-0.5 rounded-lg border border-[#CBAE94]/60">
                    {draftFloorMap.canvasWidth} × {draftFloorMap.canvasHeight} px
                  </span>
                </div>

                {/* Size Presets */}
                <div>
                  <label className="text-[10px] font-mono uppercase font-bold text-[#8B735B] block mb-1">
                    Room Presets
                  </label>
                  <div className="grid grid-cols-2 gap-1.5 text-[11px] font-bold">
                    <button
                      type="button"
                      onClick={() => handleUpdateDraftRoomSize(750, 550)}
                      className={`px-2 py-1.5 rounded-xl border transition-all text-left flex items-center gap-1 ${
                        draftFloorMap.canvasWidth === 750 && draftFloorMap.canvasHeight === 550
                          ? 'bg-[#8B735B] text-white border-[#8B735B]'
                          : 'bg-white text-[#5D5449] border-[#CBAE94]/60 hover:bg-[#EFE6DC]'
                      }`}
                    >
                      <Home className="w-3 h-3" /> Small (750×550)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateDraftRoomSize(900, 650)}
                      className={`px-2 py-1.5 rounded-xl border transition-all text-left flex items-center gap-1 ${
                        draftFloorMap.canvasWidth === 900 && draftFloorMap.canvasHeight === 650
                          ? 'bg-[#8B735B] text-white border-[#8B735B]'
                          : 'bg-white text-[#5D5449] border-[#CBAE94]/60 hover:bg-[#EFE6DC]'
                      }`}
                    >
                      <Landmark className="w-3 h-3" /> Standard (900×650)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateDraftRoomSize(1200, 850)}
                      className={`px-2 py-1.5 rounded-xl border transition-all text-left flex items-center gap-1 ${
                        draftFloorMap.canvasWidth === 1200 && draftFloorMap.canvasHeight === 850
                          ? 'bg-[#8B735B] text-white border-[#8B735B]'
                          : 'bg-white text-[#5D5449] border-[#CBAE94]/60 hover:bg-[#EFE6DC]'
                      }`}
                    >
                      <Castle className="w-3 h-3" /> Large (1200×850)
                    </button>
                    <button
                      type="button"
                      onClick={() => handleUpdateDraftRoomSize(1500, 1000)}
                      className={`px-2 py-1.5 rounded-xl border transition-all text-left flex items-center gap-1 ${
                        draftFloorMap.canvasWidth === 1500 && draftFloorMap.canvasHeight === 1000
                          ? 'bg-[#8B735B] text-white border-[#8B735B]'
                          : 'bg-white text-[#5D5449] border-[#CBAE94]/60 hover:bg-[#EFE6DC]'
                      }`}
                    >
                      <Tent className="w-3 h-3" /> Grand (1500×1000)
                    </button>
                  </div>
                </div>

                {/* Room Custom Sliders */}
                <div className="space-y-2 pt-1 border-t border-[#CBAE94]/30 text-xs">
                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-bold text-[#4A3F35]">{t.roomWidthLabel}</span>
                      <div className="flex items-center gap-1 font-mono font-bold text-[#8B735B]">
                        <button
                          type="button"
                          onClick={() => handleUpdateDraftRoomSize(draftFloorMap.canvasWidth - 100, draftFloorMap.canvasHeight)}
                          className="w-5 h-5 rounded bg-[#EFE6DC] hover:bg-[#CBAE94] flex items-center justify-center text-[#4A3F35]"
                        >
                          -
                        </button>
                        <span>{draftFloorMap.canvasWidth}px</span>
                        <button
                          type="button"
                          onClick={() => handleUpdateDraftRoomSize(draftFloorMap.canvasWidth + 100, draftFloorMap.canvasHeight)}
                          className="w-5 h-5 rounded bg-[#EFE6DC] hover:bg-[#CBAE94] flex items-center justify-center text-[#4A3F35]"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <input
                      type="range"
                      min={600}
                      max={2500}
                      step={50}
                      value={draftFloorMap.canvasWidth}
                      onChange={(e) => handleUpdateDraftRoomSize(parseInt(e.target.value, 10), draftFloorMap.canvasHeight)}
                      className="w-full accent-[#8B735B]"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-bold text-[#4A3F35]">{t.roomLengthLabel}</span>
                      <div className="flex items-center gap-1 font-mono font-bold text-[#8B735B]">
                        <button
                          type="button"
                          onClick={() => handleUpdateDraftRoomSize(draftFloorMap.canvasWidth, draftFloorMap.canvasHeight - 100)}
                          className="w-5 h-5 rounded bg-[#EFE6DC] hover:bg-[#CBAE94] flex items-center justify-center text-[#4A3F35]"
                        >
                          -
                        </button>
                        <span>{draftFloorMap.canvasHeight}px</span>
                        <button
                          type="button"
                          onClick={() => handleUpdateDraftRoomSize(draftFloorMap.canvasWidth, draftFloorMap.canvasHeight + 100)}
                          className="w-5 h-5 rounded bg-[#EFE6DC] hover:bg-[#CBAE94] flex items-center justify-center text-[#4A3F35]"
                        >
                          +
                        </button>
                      </div>
                    </div>
                    <input
                      type="range"
                      min={400}
                      max={2000}
                      step={50}
                      value={draftFloorMap.canvasHeight}
                      onChange={(e) => handleUpdateDraftRoomSize(draftFloorMap.canvasWidth, parseInt(e.target.value, 10))}
                      className="w-full accent-[#8B735B]"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() => handleUpdateDraftRoomSize(draftFloorMap.canvasWidth + 200, draftFloorMap.canvasHeight + 150)}
                    className="w-full py-2 px-3 rounded-xl bg-[#EFE6DC] hover:bg-[#CBAE94] text-[#4A3F35] font-bold text-[11px] transition-colors flex items-center justify-center gap-1"
                  >
                    <Maximize2 className="w-3.5 h-3.5 text-[#8B735B]" /> + Expand Room (+200×150px)
                  </button>
                </div>
              </div>

              {/* Add Table Controls */}
              <div className="bg-[#FFFDF9] rounded-3xl p-4 shadow-md border-2 border-[#CBAE94] space-y-3">
                <h3 className="label-mono font-bold text-[#8B735B] flex items-center gap-1">
                  <Plus className="w-4 h-4" /> Add Tables
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => handleDraftAddTable('circle')}
                    className="p-3 rounded-2xl border-2 border-[#CBAE94] bg-[#EFE6DC]/40 hover:bg-[#EFE6DC] text-center space-y-1 transition-all group"
                  >
                    <div className="w-8 h-8 rounded-full border-2 border-[#8B735B] bg-white mx-auto flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Plus className="w-4 h-4 text-[#8B735B]" />
                    </div>
                    <span className="text-[11px] font-bold text-[#4A3F35] block">
                      Round Table
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDraftAddTable('rectangle')}
                    className="p-3 rounded-2xl border-2 border-[#CBAE94] bg-[#EFE6DC]/40 hover:bg-[#EFE6DC] text-center space-y-1 transition-all group"
                  >
                    <div className="w-12 h-7 rounded-lg border-2 border-[#8B735B] bg-white mx-auto flex items-center justify-center group-hover:scale-110 transition-transform">
                      <Plus className="w-4 h-4 text-[#8B735B]" />
                    </div>
                    <span className="text-[11px] font-bold text-[#4A3F35] block">
                      Rect Table
                    </span>
                  </button>
                </div>
              </div>

              {/* Add Venue Features */}
              <div className="bg-[#FFFDF9] rounded-3xl p-4 shadow-md border-2 border-[#CBAE94] space-y-3">
                <h3 className="label-mono font-bold text-[#8B735B] flex items-center gap-1">
                  <MapPin className="w-4 h-4" /> Add Venue Features
                </h3>
                <div className="grid grid-cols-2 gap-2 text-xs font-bold text-[#5D5449]">
                  <button
                    type="button"
                    onClick={() => handleDraftAddLandmark('entrance', 'Main Entrance')}
                    className="p-2 rounded-xl border border-[#CBAE94]/60 bg-white hover:bg-[#EFE6DC] text-left transition-colors flex items-center gap-1.5"
                  >
                    <MapPin className="w-3.5 h-3.5 text-[#8B735B]" /> Entrance
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDraftAddLandmark('stage', 'Parents Throne & Stage')}
                    className="p-2 rounded-xl border border-[#CBAE94]/60 bg-white hover:bg-[#EFE6DC] text-left transition-colors flex items-center gap-1.5"
                  >
                    <Award className="w-3.5 h-3.5 text-[#8B735B]" /> Parents Stage
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDraftAddLandmark('gifts', 'Gift & Baby Table')}
                    className="p-2 rounded-xl border border-[#CBAE94]/60 bg-white hover:bg-[#EFE6DC] text-left transition-colors flex items-center gap-1.5"
                  >
                    <Gift className="w-3.5 h-3.5 text-[#8B735B]" /> Gift Table
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDraftAddLandmark('photobooth', 'Bear Photo Backdrop')}
                    className="p-2 rounded-xl border border-[#CBAE94]/60 bg-white hover:bg-[#EFE6DC] text-left transition-colors flex items-center gap-1.5"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-[#8B735B]" /> Photo Booth
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDraftAddLandmark('dessert', 'Dessert & Cake Bar')}
                    className="p-2 rounded-xl border border-[#CBAE94]/60 bg-white hover:bg-[#EFE6DC] text-left transition-colors flex items-center gap-1.5"
                  >
                    <Utensils className="w-3.5 h-3.5 text-[#8B735B]" /> Cake Station
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDraftAddLandmark('bar', 'Mocktail & Drinks Bar')}
                    className="p-2 rounded-xl border border-[#CBAE94]/60 bg-white hover:bg-[#EFE6DC] text-left transition-colors flex items-center gap-1.5"
                  >
                    <Utensils className="w-3.5 h-3.5 text-[#8B735B]" /> Drinks Bar
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDraftAddLandmark('food', 'Food Station')}
                    className="p-2 rounded-xl border border-[#CBAE94]/60 bg-white hover:bg-[#EFE6DC] text-left transition-colors flex items-center gap-1.5"
                  >
                    <UtensilsCrossed className="w-3.5 h-3.5 text-[#8B735B]" /> Food Station
                  </button>
                </div>
              </div>

              {/* Instructions Tip Box */}
              <div className="bg-[#EFE6DC]/50 rounded-2xl p-3 border border-[#CBAE94] text-xs text-[#5D5449] space-y-1">
                <p className="font-bold flex items-center gap-1 text-[#8B735B]">
                  <Info className="w-3.5 h-3.5" /> Quick Guide
                </p>
                <p className="text-[11px] leading-relaxed">
                  • Click elements on the canvas stage to select them.
                  <br />
                  • Drag elements to position them around the venue floor.
                  <br />
                  • Click <strong>{t.btnSaveChanges}</strong> at top right when done!
                </p>
              </div>
            </div>

            {/* Center Canvas Column (col-6) */}
            <div
              ref={modalContainerRef}
              className="lg:col-span-6 bg-[#FFFDF9] rounded-3xl p-4 shadow-xl border-2 border-[#CBAE94] flex flex-col h-full overflow-hidden"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-[#8B735B] flex items-center gap-1">
                  <Layers className="w-3.5 h-3.5" /> Full-Screen Interactive Canvas
                </span>
                <span className="text-[11px] font-mono text-[#5D5449]">
                  Live Draft Stage
                </span>
              </div>

              <div className="flex-1 w-full overflow-auto flex justify-center items-center bg-[#FAF6F0] p-3 rounded-2xl border border-[#CBAE94]/40">
                <Stage
                  ref={modalStageRef}
                  width={draftFloorMap.canvasWidth * modalCanvasScale}
                  height={draftFloorMap.canvasHeight * modalCanvasScale}
                  scaleX={modalCanvasScale}
                  scaleY={modalCanvasScale}
                  onMouseDown={(e) => {
                    if (e.target === e.target.getStage()) {
                      setSelectedId(null);
                      setSelectedType(null);
                    }
                  }}
                >
                  {/* Layer 1: Grid */}
                  <Layer>
                    <Rect
                      x={10}
                      y={10}
                      width={draftFloorMap.canvasWidth - 20}
                      height={draftFloorMap.canvasHeight - 20}
                      stroke="#CBAE94"
                      strokeWidth={2}
                      dash={[8, 8]}
                      cornerRadius={20}
                    />
                    {Array.from({ length: Math.ceil(draftFloorMap.canvasWidth / 55) }).map((_, i) => (
                      <Line
                        key={`mvgrid-${i}`}
                        points={[(i + 1) * 55, 20, (i + 1) * 55, draftFloorMap.canvasHeight - 20]}
                        stroke="#EFE6DC"
                        strokeWidth={1}
                        dash={[2, 4]}
                      />
                    ))}
                    {Array.from({ length: Math.ceil(draftFloorMap.canvasHeight / 55) }).map((_, i) => (
                      <Line
                        key={`mhgrid-${i}`}
                        points={[20, (i + 1) * 55, draftFloorMap.canvasWidth - 20, (i + 1) * 55]}
                        stroke="#EFE6DC"
                        strokeWidth={1}
                        dash={[2, 4]}
                      />
                    ))}
                  </Layer>

                  {/* Layer 2: Landmarks */}
                  <Layer>
                    {draftFloorMap.landmarks.map((landmark) => {
                      const isSelected = selectedId === landmark.id;
                      return (
                        <Group
                          key={landmark.id}
                          id={landmark.id}
                          x={landmark.x}
                          y={landmark.y}
                          width={landmark.width}
                          height={landmark.height}
                          rotation={landmark.rotation || 0}
                          draggable
                          onDragEnd={(e) => handleDraftLandmarkDragEnd(landmark.id, e)}
                          onClick={() => {
                            setSelectedId(landmark.id);
                            setSelectedType('landmark');
                          }}
                          onMouseEnter={(e) => handleLandmarkHover(e, landmark)}
                          onMouseMove={(e) => handleLandmarkHover(e, landmark)}
                          onMouseLeave={() => setHoverTooltip(null)}
                        >
                          {renderCustomLandmarkShape(landmark, isSelected)}
                        </Group>
                      );
                    })}
                  </Layer>

                  {/* Layer 3: Tables */}
                  <Layer>
                    {draftFloorMap.tables.map((table) => {
                      const isSelected = selectedId === table.id;
                      const occupiedCount = getTableOccupiedSeats(table, draftGuests);
                      const isFull = occupiedCount >= table.capacity;

                      // Guest-first seating highlights
                      const selectedGuestPartySize = selectedGuestForSeating ? getGuestPartySize(selectedGuestForSeating) : 0;
                      const isAssignedToThisGuest = selectedGuestForSeating ? table.assignedGuestIds.includes(selectedGuestForSeating.id) : false;
                      const occupiedOther = isAssignedToThisGuest ? occupiedCount - selectedGuestPartySize : occupiedCount;
                      const freeSeatsForGuest = table.capacity - occupiedOther;
                      const canFitGuest = selectedGuestForSeating ? freeSeatsForGuest >= selectedGuestPartySize : false;

                      // Dynamic stroke styling
                      let strokeColor = isSelected ? '#4A3F35' : isFull ? '#10B981' : '#CBAE94';
                      let strokeWidth = isSelected ? 4 : 2;
                      let dashPattern: number[] | undefined = undefined;

                      if (selectedGuestForSeating) {
                        if (canFitGuest) {
                          strokeColor = '#10B981';
                          strokeWidth = 5;
                        } else {
                          strokeColor = '#EF4444';
                          strokeWidth = 2;
                          dashPattern = [4, 4];
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
                          draggable
                          onDragEnd={(e) => handleDraftTableDragEnd(table.id, e)}
                          onClick={() => {
                            if (selectedGuestForSeating) {
                              handleDraftAssignGuest(selectedGuestForSeating.id, table.id);
                            } else {
                              setSelectedId(table.id);
                              setSelectedType('table');
                            }
                          }}
                          onMouseEnter={(e) => handleTableHover(e, table, draftGuests)}
                          onMouseMove={(e) => handleTableHover(e, table, draftGuests)}
                          onMouseLeave={() => setHoverTooltip(null)}
                        >
                          {/* Seat Circles around Table */}
                          {Array.from({ length: table.capacity }).map((_, idx) => {
                            const angle = (idx / table.capacity) * 2 * Math.PI;
                            const radiusX = table.width / 2 + 18;
                            const radiusY = table.height / 2 + 18;
                            const seatX = table.width / 2 + radiusX * Math.cos(angle);
                            const seatY = table.height / 2 + radiusY * Math.sin(angle);
                            const isOccupied = idx < occupiedCount;

                            return (
                              <Circle
                                key={`dseat-${table.id}-${idx}`}
                                x={seatX}
                                y={seatY}
                                radius={8}
                                fill={isOccupied ? '#8B735B' : '#FFFDF9'}
                                stroke="#CBAE94"
                                strokeWidth={2}
                                onMouseEnter={(e) => handleSeatHover(e, table, idx, draftGuests)}
                                onMouseMove={(e) => handleSeatHover(e, table, idx, draftGuests)}
                                onMouseLeave={() => setHoverTooltip(null)}
                              />
                            );
                          })}
                          {/* Table Base Shape */}
                          {table.shape === 'circle' ? (
                            <Circle
                              x={table.width / 2}
                              y={table.height / 2}
                              radius={table.width / 2}
                              fill={table.color || '#8B735B'}
                              stroke={strokeColor}
                              strokeWidth={strokeWidth}
                              dash={dashPattern}
                              shadowBlur={isSelected || (selectedGuestForSeating && canFitGuest) ? 12 : 4}
                              shadowColor={selectedGuestForSeating && canFitGuest ? '#10B981' : '#8B735B'}
                              shadowOpacity={0.4}
                            />
                          ) : (
                            <Rect
                              width={table.width}
                              height={table.height}
                              fill={table.color || '#8B735B'}
                              stroke={strokeColor}
                              strokeWidth={strokeWidth}
                              dash={dashPattern}
                              cornerRadius={14}
                              shadowBlur={isSelected || (selectedGuestForSeating && canFitGuest) ? 12 : 4}
                              shadowColor={selectedGuestForSeating && canFitGuest ? '#10B981' : '#8B735B'}
                              shadowOpacity={0.4}
                            />
                          )}

                          {/* Table Title */}
                          <Text
                            text={table.name}
                            width={table.width}
                            height={table.height / 2}
                            align="center"
                            verticalAlign="middle"
                            fontSize={12}
                            fontStyle="bold"
                            fill="#FFFFFF"
                            padding={4}
                          />

                          {/* Capacity Badge */}
                          <Text
                            text={
                              selectedGuestForSeating
                                ? canFitGuest
                                  ? `Fits (${selectedGuestPartySize} Seats)`
                                  : `Need ${selectedGuestPartySize} Seats`
                                : `${occupiedCount}/${table.capacity} Seats`
                            }
                            y={table.height / 2 - 4}
                            width={table.width}
                            height={table.height / 2}
                            align="center"
                            verticalAlign="middle"
                            fontSize={10}
                            fill={selectedGuestForSeating ? (canFitGuest ? '#A7F3D0' : '#FECACA') : '#FFE6D5'}
                          />
                        </Group>
                      );
                    })}

                    {/* Transformer for selected item in modal */}
                    <Transformer
                      ref={modalTransformerRef}
                      boundBoxFunc={(oldBox, newBox) => {
                        if (newBox.width < 40 || newBox.height < 30) {
                          return oldBox;
                        }
                        return newBox;
                      }}
                      onTransformEnd={handleDraftTransformEnd}
                    />
                  </Layer>
                </Stage>
              </div>
            </div>

            {/* Right Inspector Column (col-3) */}
            <div className="lg:col-span-3 overflow-y-auto space-y-4 pr-1">
              {/* Seating Workflow Mode Switcher */}
              <div className="bg-[#FFFDF9] rounded-2xl p-1.5 shadow-md border-2 border-[#CBAE94] flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setSeatingWorkflowTab('table');
                  }}
                  className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                    seatingWorkflowTab === 'table'
                      ? 'bg-[#8B735B] text-white shadow-sm'
                      : 'text-[#8B735B] hover:bg-[#EFE6DC]/50'
                  }`}
                >
                  <Layout className="w-3.5 h-3.5" /> {t.byTable}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSeatingWorkflowTab('guest');
                  }}
                  className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                    seatingWorkflowTab === 'guest'
                      ? 'bg-[#8B735B] text-white shadow-sm'
                      : 'text-[#8B735B] hover:bg-[#EFE6DC]/50'
                  }`}
                >
                  <Users className="w-3.5 h-3.5" /> {t.byGuest}
                </button>
              </div>

              {/* WORKFLOW 1: BY TABLE INSPECTOR */}
              {seatingWorkflowTab === 'table' && (
                <>
                  {draftSelectedTable ? (
                    <div className="bg-[#FFFDF9] rounded-3xl p-4 shadow-md border-2 border-[#CBAE94] space-y-4">
                      <div className="flex items-center justify-between border-b border-[#CBAE94]/40 pb-2">
                        <div>
                          <span className="text-[10px] font-mono font-bold uppercase text-[#8B735B]">
                            Draft Table Inspector
                          </span>
                          <h3 className="font-gaegu text-2xl font-bold text-[#4A3F35]">
                            {draftSelectedTable.name}
                          </h3>
                        </div>
                        <button
                          type="button"
                          onClick={handleDraftDeleteSelected}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                          title={t.deleteTableBtn}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>

                      {/* Properties form */}
                      <div className="space-y-3 text-xs">
                        <div>
                          <label className="label-mono block mb-1">{t.tableNameLabel}</label>
                          <TextInput
                            variant="soft"
                            type="text"
                            value={draftSelectedTable.name}
                            onChange={(e) => {
                              const newName = e.target.value;
                              const updatedTables = draftFloorMap.tables.map((t) =>
                                t.id === draftSelectedTable.id ? { ...t, name: newName } : t
                              );
                              setDraftFloorMap({ ...draftFloorMap, tables: updatedTables });
                              setIsDirty(true);
                            }}
                          />
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="label-mono block mb-1">{t.capacityLabel}</label>
                            <TextInput
                              variant="soft"
                              type="number"
                              min={1}
                              max={20}
                              value={draftSelectedTable.capacity}
                              onChange={(e) => {
                                const cap = parseInt(e.target.value, 10) || 1;
                                const updatedTables = draftFloorMap.tables.map((t) =>
                                  t.id === draftSelectedTable.id ? { ...t, capacity: cap } : t
                                );
                                setDraftFloorMap({ ...draftFloorMap, tables: updatedTables });
                                setIsDirty(true);
                              }}
                            />
                          </div>

                          <div>
                            <label className="label-mono block mb-1">{t.shapeLabel}</label>
                            <Select
                              variant="soft"
                              value={draftSelectedTable.shape}
                              onChange={(e) => {
                                const shape = e.target.value as 'circle' | 'rectangle';
                                const updatedTables = draftFloorMap.tables.map((t) =>
                                  t.id === draftSelectedTable.id ? { ...t, shape } : t
                                );
                                setDraftFloorMap({ ...draftFloorMap, tables: updatedTables });
                                setIsDirty(true);
                              }}
                            >
                              <option value="circle">{t.roundShape}</option>
                              <option value="rectangle">{t.rectangleShape}</option>
                            </Select>
                          </div>
                        </div>
                      </div>

                      {/* Capacity usage bar */}
                      {(() => {
                        const occ = getTableOccupiedSeats(draftSelectedTable, draftGuests);
                        const free = draftSelectedTable.capacity - occ;
                        return (
                          <div className="p-2.5 rounded-2xl bg-[#EFE6DC]/50 border border-[#CBAE94]/40 space-y-1 text-xs">
                            <div className="flex justify-between font-bold text-[#4A3F35]">
                              <span>{t.capacityUsageLabel}</span>
                              <span>{occ} / {draftSelectedTable.capacity} Seats ({free} Free)</span>
                            </div>
                            <div className="w-full bg-white h-2 rounded-full overflow-hidden border border-[#CBAE94]/40">
                              <div
                                className={`h-full transition-all ${
                                  free < 0
                                    ? 'bg-red-500'
                                    : free === 0
                                    ? 'bg-amber-500'
                                    : 'bg-[#10B981]'
                                }`}
                                style={{
                                  width: `${Math.min(100, (occ / draftSelectedTable.capacity) * 100)}%`,
                                }}
                              />
                            </div>
                          </div>
                        );
                      })()}

                      {/* Assigned Guests List in Draft */}
                      <div className="space-y-2 pt-2 border-t border-[#CBAE94]/40">
                        <div className="flex items-center justify-between text-xs font-bold text-[#4A3F35]">
                          <span>{t.seatedGuestsPartiesLabel}</span>
                        </div>

                        {draftSelectedTable.assignedGuestIds.length === 0 ? (
                          <p className="text-xs text-[#5D5449]/70 italic py-2">
                            No guests assigned to this table in draft.
                          </p>
                        ) : (
                          <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                            {draftSelectedTable.assignedGuestIds.map((gId) => {
                              const guest = draftGuests.find((g) => g.id === gId);
                              if (!guest) return null;
                              const pSize = getGuestPartySize(guest);
                              const hasAttendees = guest.attendee_names && guest.attendee_names.length > 0;

                              return (
                                <div
                                  key={gId}
                                  className="p-2.5 rounded-xl bg-[#EFE6DC]/50 border border-[#CBAE94]/40 text-xs space-y-1"
                                >
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <p className="font-bold text-[#4A3F35]">{guest.name}</p>
                                      <span className="text-[10px] text-[#8B735B] font-medium">
                                        Party of {pSize} ({pSize} seat{pSize > 1 ? 's' : ''})
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => handleDraftAssignGuest(guest.id, null)}
                                      className="text-red-500 hover:text-red-700 p-1 rounded-lg hover:bg-red-50"
                                      title={t.unassignPartyBtn}
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>

                                  {hasAttendees && (
                                    <div className="pt-1 border-t border-[#CBAE94]/30 space-y-0.5">
                                      <span className="text-[9px] font-mono font-bold uppercase text-[#8B735B]">
                                        Attending Names:
                                      </span>
                                      <div className="flex flex-wrap gap-1 pt-0.5">
                                        {guest.attendee_names!.map((attName, aIdx) => (
                                          <span
                                            key={aIdx}
                                            className="px-2 py-0.5 rounded-md bg-white border border-[#CBAE94]/60 text-[10px] font-medium text-[#4A3F35]"
                                          >
                                            • {attName}
                                          </span>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Assign Confirmed Guest Selector with Capacity Gate */}
                      <div className="space-y-2 pt-2 border-t border-[#CBAE94]/40">
                        <label className="label-mono block">{t.seatPartyHereBtn}</label>
                        <select
                          onChange={(e) => {
                            if (e.target.value) {
                              handleDraftAssignGuest(e.target.value, draftSelectedTable.id);
                              e.target.value = '';
                            }
                          }}
                          defaultValue=""
                          className="w-full px-3 py-2 rounded-xl border border-[#CBAE94] text-xs font-bold text-[#5D5449] bg-white focus:outline-none"
                        >
                          <option value="" disabled>
                            + Choose guest / party to seat...
                          </option>
                          {draftGuests
                            .filter(
                              (g) =>
                                g.rsvp_status === 'Attending' &&
                                (!g.table_id || g.table_id !== draftSelectedTable.id)
                            )
                            .map((g) => {
                              const pSize = getGuestPartySize(g);
                              const occCurrent = getTableOccupiedSeats(draftSelectedTable, draftGuests);
                              const isAlreadyHere = draftSelectedTable.assignedGuestIds.includes(g.id);
                              const occWithoutG = isAlreadyHere ? occCurrent - pSize : occCurrent;
                              const freeSeats = draftSelectedTable.capacity - occWithoutG;
                              const fits = pSize <= freeSeats;

                              return (
                                <option
                                  key={g.id}
                                  value={g.id}
                                  disabled={!fits}
                                >
                                  {g.name} (Party of {pSize}) — {fits ? `Fits (${pSize} seats needed)` : `Over capacity (${pSize} needed, ${freeSeats} free)`}
                                </option>
                              );
                            })}
                        </select>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-[#FFFDF9] rounded-3xl p-5 shadow-md border-2 border-[#CBAE94] text-center space-y-3">
                      <Layout className="w-8 h-8 text-[#8B735B]/50 mx-auto" />
                      <h4 className="font-gaegu text-xl font-bold text-[#4A3F35]">
                        No Table Selected
                      </h4>
                      <p className="text-xs text-[#5D5449]">
                        Click on any table on the interactive canvas to edit its capacity, view seated guests, or assign new parties.
                      </p>
                      <button
                        type="button"
                        onClick={() => setSeatingWorkflowTab('guest')}
                        className="w-full mt-2 py-2 px-3 rounded-xl bg-[#EFE6DC] hover:bg-[#CBAE94]/30 text-[#8B735B] text-xs font-bold transition-all flex items-center justify-center gap-1"
                      >
                        Switch to "By Guest & Party" Mode <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </>
              )}

              {/* WORKFLOW 2: BY GUEST & PARTY INSPECTOR */}
              {seatingWorkflowTab === 'guest' && (
                <div className="bg-[#FFFDF9] rounded-3xl p-4 shadow-md border-2 border-[#CBAE94] space-y-4">
                  <div>
                    <span className="text-[10px] font-mono font-bold uppercase text-[#8B735B]">
                      Guest-First Seating Mode
                    </span>
                    <h3 className="font-gaegu text-2xl font-bold text-[#4A3F35]">
                      Select Guest & Seat Party
                    </h3>
                  </div>

                  {/* Filter Input */}
                  <div>
                    <input
                      type="text"
                      placeholder={t.filterGuestPh}
                      value={guestFilterQuery}
                      onChange={(e) => setGuestFilterQuery(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-[#CBAE94] text-xs font-bold text-[#5D5449] bg-white focus:outline-none"
                    />
                  </div>

                  {/* Confirmed Attending Guests Selector */}
                  <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                    <span className="text-[10px] font-mono font-bold uppercase text-[#8B735B] block mb-1">
                      Confirmed Attending Guests
                    </span>
                    {draftGuests
                      .filter((g) => g.rsvp_status === 'Attending')
                      .filter((g) =>
                        !guestFilterQuery.trim() ||
                        g.name.toLowerCase().includes(guestFilterQuery.toLowerCase()) ||
                        (g.attendee_names && g.attendee_names.some((n) => n.toLowerCase().includes(guestFilterQuery.toLowerCase())))
                      )
                      .map((g) => {
                        const isSelected = selectedGuestForSeating?.id === g.id;
                        const pSize = getGuestPartySize(g);
                        const assignedTable = draftFloorMap.tables.find((t) => t.assignedGuestIds.includes(g.id));

                        return (
                          <div
                            key={g.id}
                            onClick={() => {
                              setSelectedGuestForSeating(g);
                            }}
                            className={`p-2.5 rounded-2xl border text-xs cursor-pointer transition-all ${
                              isSelected
                                ? 'bg-[#8B735B] text-white border-[#8B735B] shadow-md'
                                : 'bg-white hover:bg-[#EFE6DC]/50 border-[#CBAE94]/60 text-[#4A3F35]'
                            }`}
                          >
                            <div className="flex items-center justify-between font-bold">
                              <span>{g.name}</span>
                              <span
                                className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${
                                  isSelected
                                    ? 'bg-white/20 text-white'
                                    : 'bg-[#EFE6DC] text-[#8B735B]'
                                }`}
                              >
                                Party of {pSize} ({pSize} seat{pSize > 1 ? 's' : ''})
                              </span>
                            </div>
                            <div className="flex items-center justify-between text-[11px] mt-1 opacity-90">
                              <span>
                                {g.attendee_names && g.attendee_names.length > 0
                                  ? g.attendee_names.join(', ')
                                  : 'Primary Guest'}
                              </span>
                              <span className="font-semibold">
                                {assignedTable ? assignedTable.name : 'Unseated'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                  </div>

                  {/* Selected Guest Details & Table Gating Selector */}
                  {selectedGuestForSeating ? (
                    <div className="p-3 bg-[#EFE6DC]/50 rounded-2xl border-2 border-[#CBAE94] space-y-3 pt-3">
                      <div className="flex items-center justify-between border-b border-[#CBAE94]/40 pb-2">
                        <div>
                          <span className="text-[10px] font-mono font-bold uppercase text-[#8B735B]">
                            Selected Party
                          </span>
                          <h4 className="font-bold text-[#4A3F35] text-sm">
                            {selectedGuestForSeating.name}
                          </h4>
                        </div>
                        <span className="px-2.5 py-1 bg-[#8B735B] text-white rounded-full text-xs font-bold font-mono">
                          Requires {getGuestPartySize(selectedGuestForSeating)} Seat(s)
                        </span>
                      </div>

                      {selectedGuestForSeating.attendee_names && selectedGuestForSeating.attendee_names.length > 0 && (
                        <div>
                          <span className="text-[10px] font-mono font-bold uppercase text-[#8B735B] block mb-1">
                            Included Attendees ({selectedGuestForSeating.attendee_names.length}):
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {selectedGuestForSeating.attendee_names.map((name, nIdx) => (
                              <span key={nIdx} className="px-2 py-0.5 bg-white rounded-md border border-[#CBAE94]/60 text-[10px] font-medium text-[#4A3F35]">
                                • {name}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Live Compatible Tables Grid */}
                      <div className="space-y-2 pt-1">
                        <span className="text-[10px] font-mono font-bold uppercase text-[#8B735B] block">
                          Choose Venue Table:
                        </span>
                        <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                          {draftFloorMap.tables.map((table) => {
                            const pSize = getGuestPartySize(selectedGuestForSeating);
                            const occCount = getTableOccupiedSeats(table, draftGuests);
                            const isCurrentlyAssigned = table.assignedGuestIds.includes(selectedGuestForSeating.id);
                            const occOther = isCurrentlyAssigned ? occCount - pSize : occCount;
                            const availableSeats = table.capacity - occOther;
                            const fits = availableSeats >= pSize;

                            return (
                              <div
                                key={table.id}
                                className={`p-2.5 rounded-xl border text-xs space-y-1.5 transition-all ${
                                  isCurrentlyAssigned
                                    ? 'bg-[#EFE6DC] border-[#8B735B]'
                                    : fits
                                    ? 'bg-white border-[#10B981]/60 hover:border-[#10B981]'
                                    : 'bg-red-50/40 border-red-200 opacity-70'
                                }`}
                              >
                                <div className="flex items-center justify-between">
                                  <span className="font-bold text-[#4A3F35]">
                                    {table.name}
                                  </span>
                                  <span className="text-[10px] font-mono text-[#5D5449]">
                                    {occCount} / {table.capacity} Seats ({availableSeats} Free)
                                  </span>
                                </div>

                                {isCurrentlyAssigned ? (
                                  <div className="flex items-center justify-between pt-1">
                                    <span className="text-xs font-bold text-[#8B735B]">
                                      {language === 'FR' ? 'Placé à cette table' : 'Currently Seated Here'}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleDraftAssignGuest(selectedGuestForSeating.id, null)}
                                      className="px-2 py-1 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 text-[10px] font-bold"
                                    >
                                      {t.unassignParty}
                                    </button>
                                  </div>
                                ) : fits ? (
                                  <button
                                    type="button"
                                    onClick={() => handleDraftAssignGuest(selectedGuestForSeating.id, table.id)}
                                    className="w-full py-1.5 px-2 rounded-lg bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold shadow-md transition-all flex items-center justify-center gap-1"
                                  >
                                    <Check className="w-3.5 h-3.5" /> {t.seatPartyHere} ({pSize} {language === 'FR' ? 'siège(s)' : 'seats'})
                                  </button>
                                ) : (
                                  <div className="py-1 px-2 rounded-lg bg-red-100 text-red-700 text-[10px] font-bold text-center">
                                    {t.insufficientSeats} ({language === 'FR' ? `Requis : ${pSize}, Libres : ${availableSeats}` : `Needs ${pSize}, only ${availableSeats} free`})
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-[#5D5449]/70 italic text-center py-4 border-2 border-dashed border-[#CBAE94]/40 rounded-2xl">
                      Select a confirmed guest above to view compatible tables and seat their party.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Smart Seating Suggestion Modal */}
      <Modal open={isSmartSuggestOpen} onClose={() => setIsSmartSuggestOpen(false)} maxWidth="xl"
        panelClassName="flex flex-col max-h-[90vh]"
        contentClassName="overflow-y-auto max-h-none flex-1"
        title={
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-600 to-[#8B735B] text-white flex items-center justify-center shadow-md">
              <Wand2 className="w-5 h-5 text-amber-200" />
            </div>
            <div>
              <h3 className="font-gaegu text-2xl font-bold text-[#4A3F35] leading-none">
                Smart Seating Suggestions
              </h3>
              <p className="text-xs text-[#8B735B] font-medium mt-1">
                Auto-matches unassigned guest parties to available venue tables by optimal capacity fit.
              </p>
            </div>
          </div>
        }>
        {/* Suggestions Count & Actions */}
        <div className="flex items-center justify-between text-xs bg-[#EFE6DC]/60 p-3 rounded-2xl border border-[#CBAE94]/40">
          <span className="font-bold text-[#4A3F35]">
            {t.seatingProposalsCount.replace('{{count}}', String(smartSuggestions.length))}
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setSelectedSuggestionIds(
                  selectedSuggestionIds.size === smartSuggestions.length
                    ? new Set()
                    : new Set(smartSuggestions.map((s) => s.id))
                )
              }
              className="px-2.5 py-1 rounded-lg bg-white border border-[#CBAE94] text-[11px] font-bold text-[#8B735B] hover:bg-[#EFE6DC]"
            >
              {selectedSuggestionIds.size === smartSuggestions.length
                ? t.deselectAllBtn
                : t.selectAllBtn}
                </button>
              </div>
            </div>

            {/* Suggestions List */}
            <div className="flex-1 overflow-y-auto space-y-3 pr-1">
              {smartSuggestions.map((sug) => {
                const isChecked = selectedSuggestionIds.has(sug.id);

                return (
                  <div
                    key={sug.id}
                    onClick={() => {
                      const next = new Set(selectedSuggestionIds);
                      if (next.has(sug.id)) next.delete(sug.id);
                      else next.add(sug.id);
                      setSelectedSuggestionIds(next);
                    }}
                    className={`p-4 rounded-2xl border-2 transition-all cursor-pointer space-y-2 ${
                      isChecked
                        ? 'bg-amber-50/60 border-amber-500 shadow-sm ring-1 ring-amber-300'
                        : 'bg-white border-[#CBAE94]/40 opacity-75 hover:opacity-100'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}}
                          className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-[#CBAE94]"
                        />
                        <div>
                          <h4 className="font-bold text-[#4A3F35] text-sm flex items-center gap-2">
                            <span>{sug.guest.name}</span>
                            <span className="text-xs font-normal text-[#8B735B]">
                              ({sug.guest.email})
                            </span>
                          </h4>
                          <p className="text-xs text-[#5D5449] mt-0.5">
                            Party Size: <strong className="text-[#4A3F35]">{sug.partySize} guest(s)</strong>
                          </p>
                        </div>
                      </div>

                      <div className="text-right">
                        <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-mono font-bold uppercase tracking-wider bg-amber-100 text-amber-900 border border-amber-300">
                          {sug.matchBadge}
                        </span>
                        <div className="text-xs font-bold text-[#8B735B] mt-1">
                          Assign to <span className="text-[#4A3F35] underline">{sug.table.name}</span>
                        </div>
                      </div>
                    </div>

                    <div className="text-[11px] text-[#8B735B] bg-[#FAF6F0] p-2 rounded-xl border border-[#CBAE94]/30 font-medium">
                      {sug.reason}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Modal Footer Controls */}
            <div className="flex items-center justify-between border-t border-[#CBAE94]/40 pt-4">
              <button
                type="button"
                onClick={() => setIsSmartSuggestOpen(false)}
                className="px-4 py-2.5 rounded-xl border-2 border-[#CBAE94] text-xs font-bold text-[#5D5449] hover:bg-[#EFE6DC]"
              >
                {t.cancelBtn}
              </button>
              <button
                type="button"
                onClick={handleApplySmartSuggestions}
                disabled={selectedSuggestionIds.size === 0}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-700 to-emerald-700 hover:brightness-110 text-white text-xs font-bold shadow-md transition-all flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Sparkles className="w-4 h-4 text-amber-200" />
                {t.applySeatingBtn.replace('{{count}}', String(selectedSuggestionIds.size))}
              </button>
            </div>
      </Modal>

      {/* Floating Hover Details Tooltip */}
      {hoverTooltip && (
        <div
          className="fixed z-50 pointer-events-none bg-[#4A3F35] text-[#FAF6F0] p-3 rounded-2xl shadow-2xl border-2 border-[#CBAE94] text-xs space-y-1 transform -translate-x-1/2 -translate-y-full mb-3 min-w-[220px] max-w-xs animate-fadeIn"
          style={{ left: hoverTooltip.x, top: hoverTooltip.y - 12 }}
        >
          <div className="font-bold text-sm text-amber-200">
            {hoverTooltip.title}
          </div>
          {hoverTooltip.subtitle && (
            <div className="text-[10px] font-mono text-[#CBAE94] font-bold uppercase tracking-wider">
              {hoverTooltip.subtitle}
            </div>
          )}
          <div className="pt-1.5 border-t border-[#CBAE94]/30 space-y-1">
            {hoverTooltip.details.map((d, i) => (
              <p key={i} className="text-[11px] leading-relaxed text-[#F8F5F0]">
                {d}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
