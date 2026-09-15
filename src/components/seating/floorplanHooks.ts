import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Guest, FloorMapData, LandmarkElement, TableElement } from '../../types';
import { clampToRoundRoom } from './floorPlanHelpers';
import { getGuestPartySize, seatAttendee, seatParty, unseatAttendee, unassignParty } from '../../lib/tableAssignment';
import { useTf } from '../shared/i18n';

export interface FloorPlanEditorDeps {
  floorMap: FloorMapData;
  guests: Guest[];
  notify: (msg: string | null) => void;
  onSave: (map: FloorMapData, guests: Guest[]) => Promise<void>;
  onCancel: () => void;
}

// Full-screen floor plan editor state: the draft map + all draft mutation
// handlers. The editor is mounted fresh on every open (parent keys it), so
// drafts initialize from the current floor map without effects.
export function useFloorPlanEditor({ floorMap, guests, notify, onSave, onCancel }: FloorPlanEditorDeps) {
  const tf = useTf();
  const [draftFloorMap, setDraftFloorMap] = useState<FloorMapData>(() =>
    JSON.parse(JSON.stringify(floorMap))
  );
  const [draftGuests, setDraftGuests] = useState<Guest[]>(() =>
    JSON.parse(JSON.stringify(guests))
  );
  const [isDirty, setIsDirty] = useState(false);

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
    setIsDirty(true);
  };

  // ponytail: wall-clamp — keeps whole element inside round(circle/ellipse) wall.
  // Math lives in clampToRoundRoom (floorPlanHelpers) so it stays unit-testable.
  const clampAllToCircle = (map: FloorMapData): FloorMapData => {
    if ((map.roomShape ?? 'rectangle') !== 'circle' && map.roomShape !== 'ellipse') return map;
    return {
      ...map,
      tables: map.tables.map((t) => {
        const p = clampToRoundRoom(t.x, t.y, t.width, t.height, map);
        return p.x === t.x && p.y === t.y ? t : { ...t, x: Math.round(p.x), y: Math.round(p.y) };
      }),
      landmarks: map.landmarks.map((l) => {
        const p = clampToRoundRoom(l.x, l.y, l.width, l.height, map, true);
        return p.x === l.x && p.y === l.y ? l : { ...l, x: Math.round(p.x), y: Math.round(p.y) };
      }),
    };
  };

  const handleUpdateRoomShape = (shape: 'rectangle' | 'circle' | 'ellipse') => {
    if (shape === 'circle') {
      const d = Math.min(draftFloorMap.canvasWidth, draftFloorMap.canvasHeight);
      const next: FloorMapData = { ...draftFloorMap, roomShape: 'circle', canvasWidth: d, canvasHeight: d };
      setDraftFloorMap(clampAllToCircle(next));
    } else if (shape === 'ellipse') {
      setDraftFloorMap(clampAllToCircle({ ...draftFloorMap, roomShape: 'ellipse' }));
    } else {
      setDraftFloorMap({ ...draftFloorMap, roomShape: 'rectangle' });
    }
    setIsDirty(true);
  };

  const handleUpdateDiameter = (diameter: number) => {
    const d = Math.max(500, Math.min(3000, diameter));
    const next: FloorMapData = { ...draftFloorMap, roomShape: 'circle', canvasWidth: d, canvasHeight: d };
    setDraftFloorMap(clampAllToCircle(next));
    setIsDirty(true);
  };

  const handleDraftAddTable = (shape: 'circle' | 'rectangle') => {
    const tableCount = draftFloorMap.tables.length + 1;
    const rawX = 180 + (tableCount * 25) % 250;
    const rawY = 180 + (tableCount * 25) % 180;
    const w = shape === 'circle' ? 120 : 180;
    const h = shape === 'circle' ? 120 : 95;
    const clamped = clampToRoundRoom(rawX, rawY, w, h, draftFloorMap);
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
    type: 'entrance' | 'stage' | 'gifts' | 'bar' | 'dessert' | 'dj' | 'restroom' | 'food',
    name: string
  ) => {
    const w = 150;
    const h = 60;
    const p = clampToRoundRoom(120, 120, w, h, draftFloorMap, true);
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
    setIsDirty(true);
  };

  const handleDraftTableDragEnd = (id: string, e: any) => {
    const rawX = Math.round(e.target.x());
    const rawY = Math.round(e.target.y());
    const t = draftFloorMap.tables.find((x) => x.id === id);
    const clamped = t ? clampToRoundRoom(rawX, rawY, t.width, t.height, draftFloorMap) : { x: rawX, y: rawY };
    if (t && (clamped.x !== rawX || clamped.y !== rawY)) {
      e.target.x(clamped.x);
      e.target.y(clamped.y);
    }
    const updatedTables = draftFloorMap.tables.map((tbl) =>
      tbl.id === id ? { ...tbl, x: Math.round(clamped.x), y: Math.round(clamped.y) } : tbl
    );
    setDraftFloorMap({ ...draftFloorMap, tables: updatedTables });
    setIsDirty(true);
  };

  const handleDraftLandmarkDragEnd = (id: string, e: any) => {
    const rawX = Math.round(e.target.x());
    const rawY = Math.round(e.target.y());
    const l = draftFloorMap.landmarks.find((x) => x.id === id);
    const clamped = l ? clampToRoundRoom(rawX, rawY, l.width, l.height, draftFloorMap, true) : { x: rawX, y: rawY };
    if (l && (clamped.x !== rawX || clamped.y !== rawY)) {
      e.target.x(clamped.x);
      e.target.y(clamped.y);
    }
    const updatedLandmarks = draftFloorMap.landmarks.map((lm) =>
      lm.id === id ? { ...lm, x: Math.round(clamped.x), y: Math.round(clamped.y) } : lm
    );
    setDraftFloorMap({ ...draftFloorMap, landmarks: updatedLandmarks });
    setIsDirty(true);
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
          const rawX = Math.round(node.x());
          const rawY = Math.round(node.y());
          const p = clampToRoundRoom(rawX, rawY, newW, newH, draftFloorMap);
          if (p.x !== rawX || p.y !== rawY) {
            node.x(p.x);
            node.y(p.y);
          }
          return {
            ...t,
            x: Math.round(p.x),
            y: Math.round(p.y),
            width: newW,
            height: newH,
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
          const newW = Math.max(60, Math.round(l.width * scaleX));
          const newH = Math.max(30, Math.round(l.height * scaleY));
          const rawX = Math.round(node.x());
          const rawY = Math.round(node.y());
          const p = clampToRoundRoom(rawX, rawY, newW, newH, draftFloorMap, true);
          if (p.x !== rawX || p.y !== rawY) {
            node.x(p.x);
            node.y(p.y);
          }
          return {
            ...l,
            x: Math.round(p.x),
            y: Math.round(p.y),
            width: newW,
            height: newH,
            rotation,
          };
        }
        return l;
      });
      setDraftFloorMap({ ...draftFloorMap, landmarks: updatedLandmarks });
      setIsDirty(true);
    }
  };

  const handleDraftDeleteSelected = useCallback(() => {
    if (!selectedId) return;
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

    setDraftFloorMap(outcome.map);
    setDraftGuests(outcome.guests);
    setIsDirty(true);
    notify(tf('fpSeatedToast', { guest: guest.name, size: '1', table: targetTable.name }));
    return true;
  };

  const handleUnseatAttendee = (tableId: string, seatIndex: number): void => {
    const outcome = unseatAttendee(draftFloorMap, draftGuests, tableId, seatIndex);
    setDraftFloorMap(outcome.map);
    setDraftGuests(outcome.guests);
    setIsDirty(true);
  };

  // Fill a table's free chairs with the party's not-yet-seated members. Any
  // member who doesn't fit stays unseated — the split.
  const handleAutoSeatParty = (guestId: string, tableId: string): boolean => {
    const guest = draftGuests.find((g) => g.id === guestId);
    const target = draftFloorMap.tables.find((t) => t.id === tableId);
    if (!guest || !target) return false;

    const outcome = seatParty(draftFloorMap, draftGuests, guestId, tableId);
    setDraftFloorMap(outcome.map);
    setDraftGuests(outcome.guests);
    setIsDirty(true);
    notify(tf('fpSeatedToast', { guest: guest.name, size: String(getGuestPartySize(guest)), table: target.name }));
    return true;
  };

  const handleUnassignParty = (guestId: string): void => {
    const guest = draftGuests.find((g) => g.id === guestId);
    const outcome = unassignParty(draftFloorMap, draftGuests, guestId);
    setDraftFloorMap(outcome.map);
    setDraftGuests(outcome.guests);
    setIsDirty(true);
    if (guest) notify(tf('fpUnseatedToast', { guest: guest.name }));
  };

  const handleSaveChanges = async () => {
    await onSave(draftFloorMap, draftGuests);
    setIsDirty(false);
  };

  const handleCancelEditor = () => {
    setIsDirty(false);
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
    setIsDirty,
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
    clampAllToCircle,
  };
}
