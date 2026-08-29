import { useEffect, useMemo, useRef, useState } from 'react';
import { Guest, FloorMapData, LandmarkElement, TableElement } from '../../types';
import { getGuestPartySize } from './floorPlanHelpers';
import { useT } from '../shared/i18n';

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
  const t = useT();
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

  const handleUpdateRoomShape = (shape: 'rectangle' | 'circle') => {
    if (shape === 'circle') {
      const d = Math.min(draftFloorMap.canvasWidth, draftFloorMap.canvasHeight);
      setDraftFloorMap({ ...draftFloorMap, roomShape: 'circle', canvasWidth: d, canvasHeight: d });
    } else {
      setDraftFloorMap({ ...draftFloorMap, roomShape: 'rectangle' });
    }
    setIsDirty(true);
  };

  const handleUpdateDiameter = (diameter: number) => {
    const d = Math.max(500, Math.min(3000, diameter));
    setDraftFloorMap({ ...draftFloorMap, roomShape: 'circle', canvasWidth: d, canvasHeight: d });
    setIsDirty(true);
  };

  const handleDraftAddTable = (shape: 'circle' | 'rectangle') => {
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
    const updatedTables = draftFloorMap.tables.map((t) =>
      t.id === id
        ? { ...t, x: Math.round(e.target.x()), y: Math.round(e.target.y()) }
        : t
    );
    setDraftFloorMap({ ...draftFloorMap, tables: updatedTables });
    setIsDirty(true);
  };

  const handleDraftLandmarkDragEnd = (id: string, e: any) => {
    const updatedLandmarks = draftFloorMap.landmarks.map((l) =>
      l.id === id
        ? { ...l, x: Math.round(e.target.x()), y: Math.round(e.target.y()) }
        : l
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
  };

  const handleDraftAssignGuest = (guestId: string, tableId: string | null): boolean => {
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
          notify(
            t.fpCannotSeatToast.replace('{{guest}}', guest.name).replace('{{size}}', String(partySize)).replace('{{table}}', targetTable.name).replace('{{available}}', String(available))
          );
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
      notify(t.fpSeatedToast.replace('{{guest}}', guest.name).replace('{{size}}', String(partySize)).replace('{{table}}', targetTbl?.name || ''));
    } else {
      notify(t.fpUnseatedToast.replace('{{guest}}', guest.name));
    }

    return true;
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
    handleUpdateDraftRoomSize,
    handleUpdateRoomShape,
    handleUpdateDiameter,
    handleDraftAddTable,
    handleDraftAddLandmark,
    handleDraftTableDragEnd,
    handleDraftLandmarkDragEnd,
    handleDraftTransformEnd,
    handleDraftDeleteSelected,
    handleDraftAssignGuest,
    handleSaveChanges,
    handleCancelEditor,
  };
}
