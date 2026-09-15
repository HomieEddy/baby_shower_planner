import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Guest, FloorMapData, LandmarkElement, TableElement } from '../../types';
import { applyRoomClamp, clampElementToRoom, clampPointToRoom } from './floorPlanHelpers';
import { getGuestPartySize, seatAttendee, seatParty, unseatAttendee, unassignParty } from '../../lib/tableAssignment';
import { useTf } from '../shared/i18n';
import { applySeatOutcome, createSeatingDraft, editMap, markSaved, type SeatingDraft } from './seatingDraft';

export interface FloorPlanEditorDeps {
  floorMap: FloorMapData;
  guests: Guest[];
  notify: (msg: string | null) => void;
  onSave: (map: FloorMapData, guests: Guest[]) => Promise<void>;
  onCancel: () => void;
}

// Full-screen floor plan editor state: the draft (map + guests + dirty flag, one
// value, see seatingDraft.ts) and all draft mutation handlers. The editor is
// mounted fresh on every open (parent keys it), so drafts initialize from the
// current floor map without effects.
export function useFloorPlanEditor({ floorMap, guests, notify, onSave, onCancel }: FloorPlanEditorDeps) {
  const tf = useTf();
  const [draft, setDraft] = useState<SeatingDraft>(() => createSeatingDraft(floorMap, guests));
  const draftFloorMap = draft.map;
  const draftGuests = draft.guests;
  const isDirty = draft.dirty;

  // Every draft edit goes through one of these two: a map-only change, or a
  // seat mutation that lands both halves at once.
  const setDraftFloorMap = useCallback(
    (map: FloorMapData) => setDraft((current) => editMap(current, map)),
    []
  );
  const applyOutcome = useCallback(
    (outcome: { map: FloorMapData; guests: Guest[] }) =>
      setDraft((current) => applySeatOutcome(current, outcome)),
    []
  );

  // Selection state (tables/landmarks on the draft canvas)
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<'table' | 'landmark' | null>(null);

  // Modal Stage refs & scale
  const modalStageRef = useRef<any>(null);
  const modalTransformerRef = useRef<any>(null);
  const modalContainerRef = useRef<HTMLDivElement>(null);
  const [modalCanvasScale, setModalCanvasScale] = useState(1);

  // Bidirectional Seating Editor State: 'table' (select table then guest) vs 'guest' (select guest then choose valid table)
  const [seatingWorkflowTab, setSeatingWorkflowTab] = useState<'table' | 'guest'>('table');
  const [selectedGuestForSeating, setSelectedGuestForSeating] = useState<Guest | null>(null);
  const [guestFilterQuery, setGuestFilterQuery] = useState('');

  // Adjust Modal Canvas Scale
  useEffect(() => {
    const handleResizeModal = () => {
      if (modalContainerRef.current) {
        const w = modalContainerRef.current.clientWidth - 32;
        const h = modalContainerRef.current.clientHeight - 32;
        const scaleX = w / draftFloorMap.canvasWidth;
        const scaleY = h / draftFloorMap.canvasHeight;
        const scale = Math.min(1, scaleX, scaleY);
        setModalCanvasScale(Math.max(0.45, scale));
      }
    };

    handleResizeModal();
    window.addEventListener('resize', handleResizeModal);
    return () => window.removeEventListener('resize', handleResizeModal);
  }, [draftFloorMap]);

  // Sync Modal Konva Transformer selection
  useEffect(() => {
    if (modalTransformerRef.current) {
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
  }, [selectedId, draftFloorMap]);

  const handleUpdateDraftRoomSize = (width: number, height: number) => {
    const clampedW = Math.max(500, Math.min(3000, width));
    const clampedH = Math.max(400, Math.min(2500, height));
    setDraftFloorMap({
      ...draftFloorMap,
      canvasWidth: clampedW,
      canvasHeight: clampedH,
    });
  };

  const handleUpdateRoomShape = (shape: 'rectangle' | 'circle' | 'ellipse') => {
    if (shape === 'circle') {
      const d = Math.min(draftFloorMap.canvasWidth, draftFloorMap.canvasHeight);
      const next: FloorMapData = { ...draftFloorMap, roomShape: 'circle', canvasWidth: d, canvasHeight: d };
      setDraftFloorMap(applyRoomClamp(next));
    } else if (shape === 'ellipse') {
      setDraftFloorMap(applyRoomClamp({ ...draftFloorMap, roomShape: 'ellipse' }));
    } else {
      setDraftFloorMap({ ...draftFloorMap, roomShape: 'rectangle' });
    }
  };

  const handleUpdateDiameter = (diameter: number) => {
    const d = Math.max(500, Math.min(3000, diameter));
    const next: FloorMapData = { ...draftFloorMap, roomShape: 'circle', canvasWidth: d, canvasHeight: d };
    setDraftFloorMap(applyRoomClamp(next));
  };

  const handleDraftAddTable = (shape: 'circle' | 'rectangle') => {
    const tableCount = draftFloorMap.tables.length + 1;
    const rawX = 180 + (tableCount * 25) % 250;
    const rawY = 180 + (tableCount * 25) % 180;
    const w = shape === 'circle' ? 120 : 180;
    const h = shape === 'circle' ? 120 : 95;
    const clamped = clampElementToRoom(rawX, rawY, w, h, draftFloorMap);
    // If circular room is small and table would still be outside center, place near center
    const finalX = Math.round(clamped.x);
    const finalY = Math.round(clamped.y);
    const newTable: TableElement = {
      id: `tbl-${Date.now()}`,
      name: `Table ${tableCount}`,
      shape,
      x: finalX,
      y: finalY,
      width: w,
      height: h,
      capacity: 8,
      // Explicit empty seats: new tables carry the same shape as saved ones
      // instead of the legacy assignedGuestIds-only form.
      seats: new Array(8).fill(null),
      assignedGuestIds: [],
      color: '#8B735B',
    };
    setDraftFloorMap({
      ...draftFloorMap,
      tables: [...draftFloorMap.tables, newTable],
    });
    setSelectedId(newTable.id);
    setSelectedType('table');
  };

  const handleDraftAddLandmark = (
    type: 'entrance' | 'stage' | 'gifts' | 'bar' | 'dessert' | 'dj' | 'restroom' | 'food',
    name: string
  ) => {
    const w = 150;
    const h = 60;
    const p = clampElementToRoom(120, 120, w, h, draftFloorMap);
    const newLandmark: LandmarkElement = {
      id: `lm-${Date.now()}`,
      name,
      type,
      x: Math.round(p.x),
      y: Math.round(p.y),
      width: w,
      height: h,
    };
    setDraftFloorMap({
      ...draftFloorMap,
      landmarks: [...draftFloorMap.landmarks, newLandmark],
    });
    setSelectedId(newLandmark.id);
    setSelectedType('landmark');
  };

  // The canvas group renders with its origin at the element CENTER (offsetX/Y =
  // half-size), so e.target.x()/y() is the center — clamp that, then store the
  // top-left the data model uses.
  const handleDraftTableDragEnd = (id: string, e: any) => {
    const rawCx = Math.round(e.target.x());
    const rawCy = Math.round(e.target.y());
    const t = draftFloorMap.tables.find((x) => x.id === id);
    const c = t ? clampPointToRoom(rawCx, rawCy, draftFloorMap) : { x: rawCx, y: rawCy };
    if (t && (c.x !== rawCx || c.y !== rawCy)) {
      e.target.x(c.x);
      e.target.y(c.y);
    }
    const updatedTables = draftFloorMap.tables.map((tbl) =>
      tbl.id === id ? { ...tbl, x: Math.round(c.x - tbl.width / 2), y: Math.round(c.y - tbl.height / 2) } : tbl
    );
    setDraftFloorMap({ ...draftFloorMap, tables: updatedTables });
  };

  const handleDraftLandmarkDragEnd = (id: string, e: any) => {
    const rawCx = Math.round(e.target.x());
    const rawCy = Math.round(e.target.y());
    const l = draftFloorMap.landmarks.find((x) => x.id === id);
    const c = l ? clampPointToRoom(rawCx, rawCy, draftFloorMap) : { x: rawCx, y: rawCy };
    if (l && (c.x !== rawCx || c.y !== rawCy)) {
      e.target.x(c.x);
      e.target.y(c.y);
    }
    const updatedLandmarks = draftFloorMap.landmarks.map((lm) =>
      lm.id === id ? { ...lm, x: Math.round(c.x - lm.width / 2), y: Math.round(c.y - lm.height / 2) } : lm
    );
    setDraftFloorMap({ ...draftFloorMap, landmarks: updatedLandmarks });
  };

  const handleDraftTransformEnd = () => {
    if (!selectedId) return;
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
          const newW = Math.max(50, Math.round(t.width * scaleX));
          const newH = Math.max(50, Math.round(t.height * scaleY));
          // Node origin is the element center (offset = half-size): keep it inside.
          const c = clampPointToRoom(node.x(), node.y(), draftFloorMap);
          node.x(c.x);
          node.y(c.y);
          return {
            ...t,
            x: Math.round(c.x - newW / 2),
            y: Math.round(c.y - newH / 2),
            width: newW,
            height: newH,
            rotation,
          };
        }
        return t;
      });
      setDraftFloorMap({ ...draftFloorMap, tables: updatedTables });
    } else if (selectedType === 'landmark') {
      const updatedLandmarks = draftFloorMap.landmarks.map((l) => {
        if (l.id === selectedId) {
          const newW = Math.max(60, Math.round(l.width * scaleX));
          const newH = Math.max(30, Math.round(l.height * scaleY));
          const c = clampPointToRoom(node.x(), node.y(), draftFloorMap);
          node.x(c.x);
          node.y(c.y);
          return {
            ...l,
            x: Math.round(c.x - newW / 2),
            y: Math.round(c.y - newH / 2),
            width: newW,
            height: newH,
            rotation,
          };
        }
        return l;
      });
      setDraftFloorMap({ ...draftFloorMap, landmarks: updatedLandmarks });
    }
  };

  const handleDraftDeleteSelected = useCallback(() => {
    if (!selectedId) return;
    if (selectedType === 'table') {
      const updatedTables = draftFloorMap.tables.filter((t) => t.id !== selectedId);
      setDraftFloorMap({ ...draftFloorMap, tables: updatedTables });
    } else if (selectedType === 'landmark') {
      const updatedLandmarks = draftFloorMap.landmarks.filter((l) => l.id !== selectedId);
      setDraftFloorMap({ ...draftFloorMap, landmarks: updatedLandmarks });
    }
    setSelectedId(null);
    setSelectedType(null);
  }, [selectedId, selectedType, draftFloorMap]);

  // Delete / Backspace removes the selected table or landmark (ignored while typing).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId) {
        const tag = (e.target as HTMLElement | null)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        e.preventDefault();
        handleDraftDeleteSelected();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId, handleDraftDeleteSelected]);

  // Place one named attendee in a chair. Moves the person out of any current
  // chair first; if the target chair is taken, the two swap seats.
  const handleSeatAttendee = (
    guestId: string,
    attendeeIndex: number,
    tableId: string,
    seatIndex: number | null
  ): boolean => {
    const targetTable = draftFloorMap.tables.find((t) => t.id === tableId);
    const guest = draftGuests.find((g) => g.id === guestId);
    if (!targetTable || !guest) return false;

    const outcome = seatAttendee(draftFloorMap, draftGuests, guestId, attendeeIndex, tableId, seatIndex);
    if (outcome.placed === 0) {
      notify(tf('fpCannotSeatToast', { guest: guest.name, size: '1', table: targetTable.name, available: '0' }));
      return false;
    }

    applyOutcome(outcome);
    notify(tf('fpSeatedToast', { guest: guest.name, size: '1', table: targetTable.name }));
    return true;
  };

  const handleUnseatAttendee = (tableId: string, seatIndex: number): void => {
    applyOutcome(unseatAttendee(draftFloorMap, draftGuests, tableId, seatIndex));
  };

  // Fill a table's free chairs with the party's not-yet-seated members. Any
  // member who doesn't fit stays unseated â€” the split.
  const handleAutoSeatParty = (guestId: string, tableId: string): boolean => {
    const guest = draftGuests.find((g) => g.id === guestId);
    const target = draftFloorMap.tables.find((t) => t.id === tableId);
    if (!guest || !target) return false;

    applyOutcome(seatParty(draftFloorMap, draftGuests, guestId, tableId));
    notify(tf('fpSeatedToast', { guest: guest.name, size: String(getGuestPartySize(guest)), table: target.name }));
    return true;
  };

  const handleUnassignParty = (guestId: string): void => {
    const guest = draftGuests.find((g) => g.id === guestId);
    applyOutcome(unassignParty(draftFloorMap, draftGuests, guestId));
    if (guest) notify(tf('fpUnseatedToast', { guest: guest.name }));
  };

  const handleSaveChanges = async () => {
    // On success the parent closes the editor (draft unmounts), so there is
    // nothing to mark clean here. On a cancelled or failed save the draft must
    // stay dirty so the discard guard still fires.
    await onSave(draftFloorMap, draftGuests);
  };

  const handleCancelEditor = () => {
    setDraft(markSaved);
    onCancel();
  };

  const draftSelectedTable = useMemo(
    () => draftFloorMap.tables.find((t) => t.id === selectedId),
    [draftFloorMap, selectedId]
  );

  const draftSelectedLandmark = useMemo(
    () => draftFloorMap.landmarks.find((l) => l.id === selectedId),
    [draftFloorMap, selectedId]
  );

  return {
    draftFloorMap,
    setDraftFloorMap,
    draftGuests,
    isDirty,
    selectedId,
    selectedType,
    setSelectedId,
    setSelectedType,
    modalStageRef,
    modalTransformerRef,
    modalContainerRef,
    modalCanvasScale,
    seatingWorkflowTab,
    setSeatingWorkflowTab,
    selectedGuestForSeating,
    setSelectedGuestForSeating,
    guestFilterQuery,
    setGuestFilterQuery,
    draftSelectedTable,
    draftSelectedLandmark,
    handleUpdateDraftRoomSize,
    handleUpdateRoomShape,
    handleUpdateDiameter,
    handleDraftAddTable,
    handleDraftAddLandmark,
    handleDraftTableDragEnd,
    handleDraftLandmarkDragEnd,
    handleDraftTransformEnd,
    handleDraftDeleteSelected,
    handleSeatAttendee,
    handleUnseatAttendee,
    handleAutoSeatParty,
    handleUnassignParty,
    handleSaveChanges,
    handleCancelEditor,
  };
}
