import { lazy, Suspense, useState, useMemo, type DragEvent, type MouseEvent } from 'react';
import {
  Stage,
  Layer,
  Rect,
  Circle,
  Text,
  Group,
  Transformer,
} from 'react-konva';
import {
  Maximize2,
  X,
  Save,
  Home,
  Landmark,
  Castle,
  Tent,
  Plus,
  MapPin,
  Award,
  Gift,
  Bath,
  Utensils,
  UtensilsCrossed,
  Info,
  Layers,
  Layout,
  Users,
  Trash2,
  ChevronRight,
  Check,
  Square,
  Circle as CircleIcon,
} from 'lucide-react';
import { Guest, FloorMapData, LandmarkElement, SeatOccupant, TableElement } from '../../types';
import { TextInput, Select } from '../shared/ui';
import {
  getGuestPartySize,
  getTableOccupiedSeats,
  getTableSeats,
  getAttendeeLocations,
  getGuestSeatedCount,
  getAvailableSeats,
  getUnseatedPartySize,
  canSeatParty,
} from '../../lib/tableAssignment';
import { findNearestSeat } from './floorPlanHelpers';
import { getPartyMembers } from '../../lib/guestAttendees';
import { SeatRing, renderRoomBoundary, renderLandmark } from './venueShapes';
import { useFloorPlanEditor } from './floorplanHooks';
import { ViewModeToggle, ViewMode } from '../shared/ViewModeToggle';
import { useT, useTf } from '../shared/i18n';
import { useConfirm } from '../shared/ConfirmDialog';
import { Language } from '../../types';

interface AttendeeKey {
  guestId: string;
  attendeeIndex: number;
}

interface PaletteItem extends AttendeeKey {
  name: string;
  partyName: string;
  tableName: string | null;
  seatIndex: number | null;
}

const FloorPlan3D = lazy(() => import('./FloorPlan3D').then((m) => ({ default: m.FloorPlan3D })));

export interface HoverTooltip {
  title: string;
  subtitle?: string;
  details: string[];
  x: number;
  y: number;
}

interface FloorPlanEditorProps {
  floorMap: FloorMapData;
  guests: Guest[];
  language: Language;
  saving: boolean;
  notify: (msg: string | null) => void;
  onSave: (map: FloorMapData, guests: Guest[]) => Promise<void>;
  onCancel: () => void;
  hoverTooltip: HoverTooltip | null;
  setHoverTooltip: (t: HoverTooltip | null) => void;
  handleTableHover: (table: TableElement, guestsList: Guest[], clientX: number, clientY: number) => void;
  handleSeatHover: (table: TableElement, seatIndex: number, guestsList: Guest[], clientX: number, clientY: number) => void;
  handleLandmarkHover: (landmark: LandmarkElement, clientX: number, clientY: number) => void;
}

export const FloorPlanEditor = ({
  floorMap,
  guests,
  language,
  saving,
  notify,
  onSave,
  onCancel,
  hoverTooltip,
  setHoverTooltip,
  handleTableHover,
  handleSeatHover,
  handleLandmarkHover,
}: FloorPlanEditorProps) => {
  const t = useT();
  const tf = useTf();
  const confirmDiscard = useConfirm();
  const [viewMode, setViewMode] = useState<ViewMode>('2d');
  const {
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
    clampCirclePos,
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
  } = useFloorPlanEditor({ floorMap, guests, notify, onSave, onCancel });

  // Per-seat drag/tap state (DOM palette -> Konva canvas).
  const [draggingAttendee, setDraggingAttendee] = useState<AttendeeKey | null>(null);
  const [selectedAttendee, setSelectedAttendee] = useState<AttendeeKey | null>(null);
  const [dropTarget, setDropTarget] = useState<{ tableId: string; seatIndex: number } | null>(null);

  // Every attending person, in party order, with their current chair (if any).
  const palette = useMemo<PaletteItem[]>(() => {
    const items: PaletteItem[] = [];
    for (const g of draftGuests.filter((x) => x.rsvp_status === 'Attending')) {
      const names = getPartyMembers(g);
      const locations = getAttendeeLocations(g.id, draftFloorMap, draftGuests);
      names.forEach((name, attendeeIndex) => {
        const loc = locations.find((l) => l.attendeeIndex === attendeeIndex) ?? null;
        items.push({
          guestId: g.id,
          attendeeIndex,
          name,
          partyName: g.name,
          tableName: loc?.tableName ?? null,
          seatIndex: loc?.seatIndex ?? null,
        });
      });
    }
    return items;
  }, [draftGuests, draftFloorMap]);

  const paletteByParty = useMemo(() => {
    const groups = new Map<string, PaletteItem[]>();
    for (const item of palette) {
      const list = groups.get(item.guestId) ?? [];
      list.push(item);
      groups.set(item.guestId, list);
    }
    return groups;
  }, [palette]);

  const handleDragStart = (e: DragEvent, key: AttendeeKey) => {
    setDraggingAttendee(key);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', `${key.guestId}:${key.attendeeIndex}`);
  };

  const eventToSeat = (e: DragEvent | MouseEvent) => {
    const stage = modalStageRef.current;
    if (!stage) return null;
    const rect = stage.container().getBoundingClientRect();
    const x = (e.clientX - rect.left) / modalCanvasScale;
    const y = (e.clientY - rect.top) / modalCanvasScale;
    return findNearestSeat(draftFloorMap, x, y);
  };

  const handleCanvasDragOver = (e: DragEvent) => {
    if (!draggingAttendee && !e.dataTransfer.types.includes('text/plain')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget(eventToSeat(e));
  };

  const handleCanvasDrop = (e: DragEvent) => {
    e.preventDefault();
    // Prefer state, fall back to the dataTransfer payload for very fast drags.
    let key = draggingAttendee;
    if (!key) {
      const raw = e.dataTransfer.getData('text/plain');
      const [guestId, idx] = raw.split(':');
      if (guestId && idx !== undefined) key = { guestId, attendeeIndex: Number(idx) };
    }
    const seat = dropTarget ?? eventToSeat(e);
    setDraggingAttendee(null);
    setDropTarget(null);
    if (key && seat) handleSeatAttendee(key.guestId, key.attendeeIndex, seat.tableId, seat.seatIndex);
  };

  const handlePaletteItemClick = (key: AttendeeKey) => {
    setSelectedAttendee((prev) =>
      prev && prev.guestId === key.guestId && prev.attendeeIndex === key.attendeeIndex ? null : key
    );
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#FAF6F0] flex flex-col w-screen h-screen overflow-hidden animate-fadeIn">
      {/* Top Navigation Bar */}
      <div className="bg-[#FFFDF9] border-b-2 border-[#CBAE94] px-3 sm:px-6 py-3 flex items-center justify-between gap-2 shadow-md shrink-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-[#8B735B] text-white flex items-center justify-center shadow-md shrink-0">
            <Maximize2 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="font-gaegu text-xl sm:text-2xl font-bold text-[#4A3F35] truncate">
                {t.editorTitle}
              </h2>
              {isDirty && (
                <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 text-xs font-mono font-bold uppercase shrink-0">
                  {t.unsavedChangesBadge}
                </span>
              )}
            </div>
            <p className="hidden sm:block text-xs text-[#8B735B] font-medium">
              {t.editorSubtitle}
            </p>
          </div>
        </div>

        {/* Live Draft Stats Tracker */}
        <div className="hidden md:flex items-center gap-4 bg-[#EFE6DC]/60 px-4 py-1.5 rounded-2xl border border-[#CBAE94]">
          <div className="text-center">
            <span className="text-xs font-mono font-bold uppercase text-[#8B735B]">{t.draftCapacityLabel}</span>
            <p className="text-xs font-bold text-[#4A3F35]">
              {tf('seatsTotalLabel', { count: draftFloorMap.tables.reduce((s, t) => s + t.capacity, 0) })}
            </p>
          </div>
          <div className="h-6 w-px bg-[#CBAE94]/40" />
          <div className="text-center">
            <span className="text-xs font-mono font-bold uppercase text-[#8B735B]">{t.draftSeatedLabel}</span>
            <p className="text-xs font-bold text-[#4A3F35]">
              {draftFloorMap.tables.reduce((s, t) => s + getTableOccupiedSeats(t, draftGuests), 0)} Confirmed
            </p>
          </div>
        </div>

        {/* Action Buttons: Cancel and Save Changes */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
                onClick={async () => {
                  if (isDirty) {
                    const ok = await confirmDiscard({
                      title: t.unsavedChangesBadge,
                      message: t.discardChangesMsg,
                      confirmText: t.discardBtn,
                    });
                    if (!ok) return;
                  }
                  handleCancelEditor();
                }}
            className="px-3 sm:px-4 py-2.5 rounded-xl border-2 border-[#CBAE94] bg-white text-[#5D5449] hover:bg-[#EFE6DC] font-bold text-xs flex items-center gap-1.5 transition-colors shadow-sm"
          >
            <X className="w-4 h-4 text-red-500" /> <span className="hidden sm:inline">{t.cancelBtn}</span>
          </button>

          <button
            type="button"
            onClick={handleSaveChanges}
            disabled={saving}
            className="px-4 sm:px-6 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-lg flex items-center gap-2 transition-all transform hover:scale-105"
          >
            <Save className="w-4 h-4" />
            <span className="hidden sm:inline">{saving ? t.btnSavingChanges : t.btnSaveChanges}</span>
          </button>
        </div>
      </div>

      {/* Modal Main Content (3 Columns) */}
      <div className="flex-1 overflow-y-auto lg:overflow-hidden grid grid-cols-1 lg:grid-cols-12 gap-4 p-3 lg:p-4">
        {/* Left Toolbar Column (col-3) */}
        <div className="lg:col-span-3 lg:overflow-y-auto space-y-4 pr-1 order-2 lg:order-1">
          {/* {t.roomDimensionsLabel} & Size Controls */}
          <div className="bg-[#FFFDF9] rounded-3xl p-4 shadow-md border-2 border-[#CBAE94] space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="label-mono font-bold text-[#8B735B] flex items-center gap-1.5">
                <Maximize2 className="w-4 h-4" /> {t.roomDimensionsLabel}
              </h3>
              <span className="text-xs font-mono font-bold text-[#4A3F35] bg-[#EFE6DC] px-2 py-0.5 rounded-lg border border-[#CBAE94]/60">
                {(draftFloorMap.roomShape ?? 'rectangle') === 'circle'
                  ? `Ø ${Math.min(draftFloorMap.canvasWidth, draftFloorMap.canvasHeight)} px`
                  : `${draftFloorMap.canvasWidth} × ${draftFloorMap.canvasHeight} px`}
              </span>
            </div>

            {/* Room Shape Toggle */}
            <div className="flex items-center gap-1 p-1 rounded-2xl bg-[#EFE6DC]/60 border border-[#CBAE94]/40">
              <button
                type="button"
                onClick={() => handleUpdateRoomShape('rectangle')}
                className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                  (draftFloorMap.roomShape ?? 'rectangle') === 'rectangle'
                    ? 'bg-[#8B735B] text-white shadow-sm'
                    : 'text-[#8B735B] hover:bg-white/60'
                }`}
              >
                <Square className="w-3.5 h-3.5" /> {t.shapeRectangle}
              </button>
              <button
                type="button"
                onClick={() => handleUpdateRoomShape('circle')}
                className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                  draftFloorMap.roomShape === 'circle'
                    ? 'bg-[#8B735B] text-white shadow-sm'
                    : 'text-[#8B735B] hover:bg-white/60'
                }`}
              >
                <CircleIcon className="w-3.5 h-3.5" /> {t.shapeCircle}
              </button>
              <button
                type="button"
                onClick={() => handleUpdateRoomShape('ellipse')}
                className={`flex-1 py-1.5 px-2 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1 ${
                  draftFloorMap.roomShape === 'ellipse'
                    ? 'bg-[#8B735B] text-white shadow-sm'
                    : 'text-[#8B735B] hover:bg-white/60'
                }`}
              >
                <CircleIcon className="w-3.5 h-3.5" /> {t.shapeEllipse}
              </button>
            </div>

            {/* Size Presets */}
            {(draftFloorMap.roomShape ?? 'rectangle') === 'circle' ? (
              <div>
                <label className="text-xs font-mono uppercase font-bold text-[#8B735B] block mb-1">
                  {t.roomPresetsLabel}
                </label>
                <div className="grid grid-cols-2 gap-1.5 text-xs font-bold">
                  <button type="button" onClick={() => handleUpdateDiameter(650)} className={`min-h-[44px] px-3 py-2 rounded-xl border transition-all text-left flex items-center gap-1 ${Math.min(draftFloorMap.canvasWidth, draftFloorMap.canvasHeight) === 650 ? 'bg-[#8B735B] text-white border-[#8B735B]' : 'bg-white text-[#5D5449] border-[#CBAE94]/60 hover:bg-[#EFE6DC]'}`}>
                    <Home className="w-3 h-3" /> Small (Ø 650)
                  </button>
                  <button type="button" onClick={() => handleUpdateDiameter(850)} className={`min-h-[44px] px-3 py-2 rounded-xl border transition-all text-left flex items-center gap-1 ${Math.min(draftFloorMap.canvasWidth, draftFloorMap.canvasHeight) === 850 ? 'bg-[#8B735B] text-white border-[#8B735B]' : 'bg-white text-[#5D5449] border-[#CBAE94]/60 hover:bg-[#EFE6DC]'}`}>
                    <Landmark className="w-3 h-3" /> Standard (Ø 850)
                  </button>
                  <button type="button" onClick={() => handleUpdateDiameter(1100)} className={`min-h-[44px] px-3 py-2 rounded-xl border transition-all text-left flex items-center gap-1 ${Math.min(draftFloorMap.canvasWidth, draftFloorMap.canvasHeight) === 1100 ? 'bg-[#8B735B] text-white border-[#8B735B]' : 'bg-white text-[#5D5449] border-[#CBAE94]/60 hover:bg-[#EFE6DC]'}`}>
                    <Castle className="w-3 h-3" /> Large (Ø 1100)
                  </button>
                  <button type="button" onClick={() => handleUpdateDiameter(1400)} className={`min-h-[44px] px-3 py-2 rounded-xl border transition-all text-left flex items-center gap-1 ${Math.min(draftFloorMap.canvasWidth, draftFloorMap.canvasHeight) === 1400 ? 'bg-[#8B735B] text-white border-[#8B735B]' : 'bg-white text-[#5D5449] border-[#CBAE94]/60 hover:bg-[#EFE6DC]'}`}>
                    <Tent className="w-3 h-3" /> Grand (Ø 1400)
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <label className="text-xs font-mono uppercase font-bold text-[#8B735B] block mb-1">
                  {t.roomPresetsLabel}
                </label>
                <div className="grid grid-cols-2 gap-1.5 text-xs font-bold">
                  <button
                    type="button"
                    onClick={() => handleUpdateDraftRoomSize(750, 550)}
                    className={`min-h-[44px] px-3 py-2 rounded-xl border transition-all text-left flex items-center gap-1 ${
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
                    className={`min-h-[44px] px-3 py-2 rounded-xl border transition-all text-left flex items-center gap-1 ${
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
                    className={`min-h-[44px] px-3 py-2 rounded-xl border transition-all text-left flex items-center gap-1 ${
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
                    className={`min-h-[44px] px-3 py-2 rounded-xl border transition-all text-left flex items-center gap-1 ${
                      draftFloorMap.canvasWidth === 1500 && draftFloorMap.canvasHeight === 1000
                        ? 'bg-[#8B735B] text-white border-[#8B735B]'
                        : 'bg-white text-[#5D5449] border-[#CBAE94]/60 hover:bg-[#EFE6DC]'
                    }`}
                  >
                    <Tent className="w-3 h-3" /> Grand (1500×1000)
                  </button>
                </div>
              </div>
            )}

            {/* Room Custom Sliders */}
            {(draftFloorMap.roomShape ?? 'rectangle') === 'circle' ? (
              <div className="space-y-2 pt-1 border-t border-[#CBAE94]/30 text-xs">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-[#4A3F35]">{t.roomDiameterLabel}</span>
                    <div className="flex items-center gap-1 font-mono font-bold text-[#8B735B]">
                      <button type="button" onClick={() => handleUpdateDiameter(Math.min(draftFloorMap.canvasWidth, draftFloorMap.canvasHeight) - 100)} className="min-w-[44px] min-h-[44px] rounded-lg bg-[#EFE6DC] hover:bg-[#CBAE94] flex items-center justify-center text-[#4A3F35] font-bold">-</button>
                      <span>{Math.min(draftFloorMap.canvasWidth, draftFloorMap.canvasHeight)}px</span>
                      <button type="button" onClick={() => handleUpdateDiameter(Math.min(draftFloorMap.canvasWidth, draftFloorMap.canvasHeight) + 100)} className="min-w-[44px] min-h-[44px] rounded-lg bg-[#EFE6DC] hover:bg-[#CBAE94] flex items-center justify-center text-[#4A3F35] font-bold">+</button>
                    </div>
                  </div>
                  <input type="range" min={500} max={2500} step={50} value={Math.min(draftFloorMap.canvasWidth, draftFloorMap.canvasHeight)} onChange={(e) => handleUpdateDiameter(parseInt(e.target.value, 10))} className="w-full accent-[#8B735B]" />
                </div>
                <button type="button" onClick={() => handleUpdateDiameter(Math.min(draftFloorMap.canvasWidth, draftFloorMap.canvasHeight) + 150)} className="w-full py-2 px-3 rounded-xl bg-[#EFE6DC] hover:bg-[#CBAE94] text-[#4A3F35] font-bold text-xs transition-colors flex items-center justify-center gap-1">
                  <Maximize2 className="w-3.5 h-3.5 text-[#8B735B]" /> {t.expandRoomDiameterBtn}
                </button>
              </div>
            ) : (
              <div className="space-y-2 pt-1 border-t border-[#CBAE94]/30 text-xs">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-[#4A3F35]">{t.roomWidthLabel}</span>
                    <div className="flex items-center gap-1 font-mono font-bold text-[#8B735B]">
                      <button
                        type="button"
                        onClick={() => handleUpdateDraftRoomSize(draftFloorMap.canvasWidth - 100, draftFloorMap.canvasHeight)}
                        className="min-w-[44px] min-h-[44px] rounded-lg bg-[#EFE6DC] hover:bg-[#CBAE94] flex items-center justify-center text-[#4A3F35] font-bold"
                      >
                        -
                      </button>
                      <span>{draftFloorMap.canvasWidth}px</span>
                      <button
                        type="button"
                        onClick={() => handleUpdateDraftRoomSize(draftFloorMap.canvasWidth + 100, draftFloorMap.canvasHeight)}
                        className="min-w-[44px] min-h-[44px] rounded-lg bg-[#EFE6DC] hover:bg-[#CBAE94] flex items-center justify-center text-[#4A3F35] font-bold"
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
                        className="min-w-[44px] min-h-[44px] rounded-lg bg-[#EFE6DC] hover:bg-[#CBAE94] flex items-center justify-center text-[#4A3F35] font-bold"
                      >
                        -
                      </button>
                      <span>{draftFloorMap.canvasHeight}px</span>
                      <button
                        type="button"
                        onClick={() => handleUpdateDraftRoomSize(draftFloorMap.canvasWidth, draftFloorMap.canvasHeight + 100)}
                        className="min-w-[44px] min-h-[44px] rounded-lg bg-[#EFE6DC] hover:bg-[#CBAE94] flex items-center justify-center text-[#4A3F35] font-bold"
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
                  className="w-full py-2 px-3 rounded-xl bg-[#EFE6DC] hover:bg-[#CBAE94] text-[#4A3F35] font-bold text-xs transition-colors flex items-center justify-center gap-1"
                >
                  <Maximize2 className="w-3.5 h-3.5 text-[#8B735B]" /> {t.expandRoomBtn}
                </button>
              </div>
            )}
          </div>

          {/* Add Table Controls */}
          <div className="bg-[#FFFDF9] rounded-3xl p-4 shadow-md border-2 border-[#CBAE94] space-y-3">
            <h3 className="label-mono font-bold text-[#8B735B] flex items-center gap-1">
              <Plus className="w-4 h-4" /> {t.addTablesLabel}
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
                <span className="text-xs font-bold text-[#4A3F35] block">
                  {t.roundTableBtn}
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
                <span className="text-xs font-bold text-[#4A3F35] block">
                  {t.rectTableBtn}
                </span>
              </button>
            </div>
          </div>

          {/* Add Venue Features */}
          <div className="bg-[#FFFDF9] rounded-3xl p-4 shadow-md border-2 border-[#CBAE94] space-y-3">
            <h3 className="label-mono font-bold text-[#8B735B] flex items-center gap-1">
              <MapPin className="w-4 h-4" /> {t.addVenueFeaturesLabel}
            </h3>
            <div className="grid grid-cols-2 gap-2 text-xs font-bold text-[#5D5449]">
              <button
                type="button"
                onClick={() => handleDraftAddLandmark('entrance', 'Main Entrance')}
                className="p-2 rounded-xl border border-[#CBAE94]/60 bg-white hover:bg-[#EFE6DC] text-left transition-colors flex items-center gap-1.5"
              >
                <MapPin className="w-3.5 h-3.5 text-[#8B735B]" /> {t.entranceBtn}
              </button>
              <button
                type="button"
                onClick={() => handleDraftAddLandmark('stage', 'Main Stage')}
                className="p-2 rounded-xl border border-[#CBAE94]/60 bg-white hover:bg-[#EFE6DC] text-left transition-colors flex items-center gap-1.5"
              >
                <Award className="w-3.5 h-3.5 text-[#8B735B]" /> {t.mainStageBtn}
              </button>
              <button
                type="button"
                onClick={() => handleDraftAddLandmark('gifts', 'Gift & Baby Table')}
                className="p-2 rounded-xl border border-[#CBAE94]/60 bg-white hover:bg-[#EFE6DC] text-left transition-colors flex items-center gap-1.5"
              >
                <Gift className="w-3.5 h-3.5 text-[#8B735B]" /> {t.giftTableBtn}
              </button>
              <button
                type="button"
                onClick={() => handleDraftAddLandmark('restroom', 'Bathroom')}
                className="p-2 rounded-xl border border-[#CBAE94]/60 bg-white hover:bg-[#EFE6DC] text-left transition-colors flex items-center gap-1.5"
              >
                <Bath className="w-3.5 h-3.5 text-[#8B735B]" /> {t.bathroomBtn}
              </button>
              <button
                type="button"
                onClick={() => handleDraftAddLandmark('dessert', 'Dessert & Cake Bar')}
                className="p-2 rounded-xl border border-[#CBAE94]/60 bg-white hover:bg-[#EFE6DC] text-left transition-colors flex items-center gap-1.5"
              >
                <Utensils className="w-3.5 h-3.5 text-[#8B735B]" /> {t.cakeStationBtn}
              </button>
              <button
                type="button"
                onClick={() => handleDraftAddLandmark('bar', 'Mocktail & Drinks Bar')}
                className="p-2 rounded-xl border border-[#CBAE94]/60 bg-white hover:bg-[#EFE6DC] text-left transition-colors flex items-center gap-1.5"
              >
                <Utensils className="w-3.5 h-3.5 text-[#8B735B]" /> {t.drinksBarBtn}
              </button>
              <button
                type="button"
                onClick={() => handleDraftAddLandmark('food', 'Food Station')}
                className="p-2 rounded-xl border border-[#CBAE94]/60 bg-white hover:bg-[#EFE6DC] text-left transition-colors flex items-center gap-1.5"
              >
                <UtensilsCrossed className="w-3.5 h-3.5 text-[#8B735B]" /> {t.foodStationBtn}
              </button>
            </div>
          </div>

          {/* Instructions Tip Box */}
          <div className="bg-[#EFE6DC]/50 rounded-2xl p-3 border border-[#CBAE94] text-xs text-[#5D5449] space-y-1">
            <p className="font-bold flex items-center gap-1 text-[#8B735B]">
              <Info className="w-3.5 h-3.5" /> {t.quickGuideLabel}
            </p>
            <p className="text-xs leading-relaxed">
              {tf('quickGuideText', { save: t.btnSaveChanges })}
            </p>
          </div>
        </div>

        {/* Center Canvas Column (col-6) */}
        <div
          ref={modalContainerRef}
          className="lg:col-span-6 bg-[#FFFDF9] rounded-3xl p-3 lg:p-4 shadow-xl border-2 border-[#CBAE94] flex flex-col h-[70vh] lg:h-full overflow-hidden order-1 lg:order-2"
        >
          <div className="flex items-center justify-between mb-2 gap-2">
            <span className="text-xs font-bold text-[#8B735B] flex items-center gap-1">
              <Layers className="w-3.5 h-3.5" /> {t.fullScreenCanvasLabel}
            </span>
            <div className="flex items-center gap-2">
              {selectedId && (
                <button
                  type="button"
                  onClick={handleDraftDeleteSelected}
                  className="px-2.5 py-1.5 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 text-xs font-bold flex items-center gap-1 transition-colors"
                  title={selectedType === 'landmark' ? t.deleteLandmarkBtn : t.deleteTableBtn}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">{selectedType === 'landmark' ? t.deleteLandmarkBtn : t.deleteTableBtn}</span>
                </button>
              )}
              <ViewModeToggle value={viewMode} onChange={setViewMode} />
              <span className="hidden md:inline text-xs font-mono text-[#5D5449]">
                {t.liveDraftStageLabel}
              </span>
            </div>
          </div>

          {viewMode === '3d' ? (
            <Suspense
              fallback={
                <div className="flex-1 w-full flex items-center justify-center text-xs font-mono font-bold text-[#8B735B]">
                  3D…
                </div>
              }
            >
              <div className="flex-1 w-full overflow-hidden bg-[#FAF6F0] p-3 rounded-2xl border border-[#CBAE94]/40 min-h-[300px]">
                <FloorPlan3D
                  className="w-full h-full"
                  floorMap={draftFloorMap}
                  guests={draftGuests}
                  selectedGuest={selectedGuestForSeating}
                  onTableHover={(table, x, y) => handleTableHover(table, draftGuests, x, y)}
                  onSeatHover={(table, idx, x, y) => handleSeatHover(table, idx, draftGuests, x, y)}
                  onLandmarkHover={(lm, x, y) => handleLandmarkHover(lm, x, y)}
                  onTableClick={(table) => {
                    if (selectedAttendee) {
                      handleSeatAttendee(selectedAttendee.guestId, selectedAttendee.attendeeIndex, table.id, null);
                      setSelectedAttendee(null);
                    } else if (selectedGuestForSeating) {
                      handleAutoSeatParty(selectedGuestForSeating.id, table.id);
                    } else {
                      setSelectedId(table.id);
                      setSelectedType('table');
                    }
                  }}
                  onLeave={() => setHoverTooltip(null)}
                />
              </div>
            </Suspense>
          ) : (
          <div
            className={`flex-1 w-full overflow-auto flex justify-center items-center bg-[#FAF6F0] p-3 rounded-2xl border-2 transition-colors ${
              draggingAttendee ? 'border-emerald-500 bg-emerald-50/40' : 'border-[#CBAE94]/40'
            }`}
            onDragOver={handleCanvasDragOver}
            onDragLeave={() => setDropTarget(null)}
            onDrop={handleCanvasDrop}
          >
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
              {/* Layer 1: Grid + Room Boundary */}
              <Layer>
                {renderRoomBoundary(draftFloorMap)}
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
                      dragBoundFunc={(pos: any) => {
                        const p = clampCirclePos(pos.x, pos.y, landmark.width, landmark.height, draftFloorMap, true);
                        return { x: p.x, y: p.y };
                      }}
                      onDragEnd={(e) => handleDraftLandmarkDragEnd(landmark.id, e)}
                      onClick={() => {
                        setSelectedId(landmark.id);
                        setSelectedType('landmark');
                      }}
                      onMouseEnter={(e) => handleLandmarkHover(landmark, e.evt.clientX, e.evt.clientY)}
                      onMouseMove={(e) => handleLandmarkHover(landmark, e.evt.clientX, e.evt.clientY)}
                      onMouseLeave={() => setHoverTooltip(null)}
                    >
                      {renderLandmark(landmark, isSelected)}
                    </Group>
                  );
                })}
              </Layer>

              {/* Layer 3: Tables */}
              <Layer>
                {draftFloorMap.tables.map((table) => {
                  const isSelected = selectedId === table.id;
                  const tableSeats = getTableSeats(table, draftGuests);
                  const occupiedCount = getTableOccupiedSeats(table, draftGuests);
                  const isFull = occupiedCount >= table.capacity;

                  // Guest-first seating highlight: any free chair, matching seatParty.
                  const canFitGuest = selectedGuestForSeating
                    ? canSeatParty(table, draftFloorMap, draftGuests, selectedGuestForSeating.id)
                    : false;
                  const freeSeatsForGuest = selectedGuestForSeating ? getAvailableSeats(table, draftGuests) : 0;
                  const unseatedForGuest = selectedGuestForSeating
                    ? getUnseatedPartySize(selectedGuestForSeating.id, draftFloorMap, draftGuests)
                    : 0;

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
                      dragBoundFunc={(pos: any) => {
                        const p = clampCirclePos(pos.x, pos.y, table.width, table.height, draftFloorMap);
                        return { x: p.x, y: p.y };
                      }}
                      onDragEnd={(e) => handleDraftTableDragEnd(table.id, e)}
                      onClick={() => {
                        if (selectedAttendee) {
                          handleSeatAttendee(selectedAttendee.guestId, selectedAttendee.attendeeIndex, table.id, null);
                          setSelectedAttendee(null);
                        } else if (selectedGuestForSeating) {
                          handleAutoSeatParty(selectedGuestForSeating.id, table.id);
                        } else {
                          setSelectedId(table.id);
                          setSelectedType('table');
                        }
                      }}
                      onMouseEnter={(e) => handleTableHover(table, draftGuests, e.evt.clientX, e.evt.clientY)}
                      onMouseMove={(e) => handleTableHover(table, draftGuests, e.evt.clientX, e.evt.clientY)}
                      onMouseLeave={() => setHoverTooltip(null)}
                    >
                      {/* Seat Circles around Table */}
                      <SeatRing
                        table={table}
                        renderSeat={(pos, idx) => {
                          const occupant: SeatOccupant | null = tableSeats[idx] ?? null;
                          const isDropTargetSeat = dropTarget?.tableId === table.id && dropTarget.seatIndex === idx;
                          const isPickedSeat =
                            !!occupant &&
                            !!selectedAttendee &&
                            occupant.guestId === selectedAttendee.guestId &&
                            occupant.attendeeIndex === selectedAttendee.attendeeIndex;

                          let seatFill = occupant ? '#8B735B' : '#FFFDF9';
                          let seatStroke = '#CBAE94';
                          let seatRadius = 8;
                          if (isDropTargetSeat) {
                            seatFill = '#A7F3D0';
                            seatStroke = '#059669';
                            seatRadius = 10;
                          } else if (isPickedSeat) {
                            seatFill = '#FDE68A';
                            seatStroke = '#D97706';
                          } else if (selectedAttendee && !occupant) {
                            seatFill = '#D1FAE5';
                            seatStroke = '#059669';
                          }

                          return (
                            <Circle
                              key={`dseat-${table.id}-${idx}`}
                              x={pos.x}
                              y={pos.y}
                              radius={seatRadius}
                              fill={seatFill}
                              stroke={seatStroke}
                              strokeWidth={2}
                              onClick={(e) => {
                                e.cancelBubble = true;
                                if (selectedAttendee) {
                                  handleSeatAttendee(selectedAttendee.guestId, selectedAttendee.attendeeIndex, table.id, idx);
                                  setSelectedAttendee(null);
                                } else if (occupant) {
                                  setSelectedAttendee({ guestId: occupant.guestId, attendeeIndex: occupant.attendeeIndex });
                                } else {
                                  setSelectedAttendee(null);
                                }
                              }}
                              onMouseEnter={(e) => {
                                e.cancelBubble = true;
                                handleSeatHover(table, idx, draftGuests, e.evt.clientX, e.evt.clientY);
                              }}
                              onMouseMove={(e) => {
                                e.cancelBubble = true;
                                handleSeatHover(table, idx, draftGuests, e.evt.clientX, e.evt.clientY);
                              }}
                              onMouseLeave={() => setHoverTooltip(null)}
                            />
                          );
                        }}
                      />
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
                              ? `Fits (${Math.min(freeSeatsForGuest, unseatedForGuest)} Seats)`
                              : `Need ${unseatedForGuest} Seats`
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
          )}
        </div>

        {/* Right Inspector Column (col-3) */}
        <div className="lg:col-span-3 lg:overflow-y-auto space-y-4 pr-1 order-3">
          {/* Venue Feature Inspector (rename / re-type a selected landmark) */}
          {selectedType === 'landmark' && draftSelectedLandmark && (
            <div className="bg-[#FFFDF9] rounded-3xl p-4 shadow-md border-2 border-[#CBAE94] space-y-4">
              <div className="flex items-center justify-between border-b border-[#CBAE94]/40 pb-2">
                <div>
                  <span className="text-xs font-mono font-bold uppercase text-[#8B735B]">
                    {t.landmarkInspectorLabel}
                  </span>
                  <h3 className="font-gaegu text-2xl font-bold text-[#4A3F35]">
                    {draftSelectedLandmark.name}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={handleDraftDeleteSelected}
                  className="p-2 text-red-600 hover:bg-red-50 rounded-xl transition-colors"
                  title={t.deleteLandmarkBtn}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="label-mono block mb-1">{t.featureNameLabel}</label>
                  <TextInput
                    variant="soft"
                    type="text"
                    value={draftSelectedLandmark.name}
                    onChange={(e) => {
                      const newName = e.target.value;
                      setDraftFloorMap({
                        ...draftFloorMap,
                        landmarks: draftFloorMap.landmarks.map((l) =>
                          l.id === draftSelectedLandmark.id ? { ...l, name: newName } : l
                        ),
                      });
                      setIsDirty(true);
                    }}
                  />
                </div>

                <div>
                  <label className="label-mono block mb-1">{t.featureTypeLabel}</label>
                  <Select
                    variant="soft"
                    value={draftSelectedLandmark.type}
                    onChange={(e) => {
                      const type = e.target.value as LandmarkElement['type'];
                      setDraftFloorMap({
                        ...draftFloorMap,
                        landmarks: draftFloorMap.landmarks.map((l) =>
                          l.id === draftSelectedLandmark.id ? { ...l, type } : l
                        ),
                      });
                      setIsDirty(true);
                    }}
                  >
                    <option value="entrance">{t.entranceBtn}</option>
                    <option value="stage">{t.mainStageBtn}</option>
                    <option value="gifts">{t.giftTableBtn}</option>
                    <option value="restroom">{t.bathroomBtn}</option>
                    <option value="dessert">{t.cakeStationBtn}</option>
                    <option value="bar">{t.drinksBarBtn}</option>
                    <option value="food">{t.foodStationBtn}</option>
                    <option value="custom">{t.customFeatureBtn}</option>
                  </Select>
                </div>
              </div>
            </div>
          )}

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
                      <span className="text-xs font-mono font-bold uppercase text-[#8B735B]">
                        {t.draftTableInspectorLabel}
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
                          const updatedTables = draftFloorMap.tables.map((tbl) =>
                            tbl.id === draftSelectedTable.id ? { ...tbl, name: newName } : tbl
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
                            const updatedTables = draftFloorMap.tables.map((tbl) =>
                              tbl.id === draftSelectedTable.id ? { ...tbl, capacity: cap } : tbl
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
                            const updatedTables = draftFloorMap.tables.map((tbl) =>
                              tbl.id === draftSelectedTable.id ? { ...tbl, shape } : tbl
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

                  {/* Assigned Guests List in Draft (one row per chair) */}
                  <div className="space-y-2 pt-2 border-t border-[#CBAE94]/40">
                    <div className="flex items-center justify-between text-xs font-bold text-[#4A3F35]">
                      <span>{t.seatedGuestsPartiesLabel}</span>
                    </div>

                    {getTableSeats(draftSelectedTable, draftGuests).every((s) => !s) ? (
                      <p className="text-xs text-[#5D5449]/70 italic py-2">
                        {t.noDraftGuestsMsg}
                      </p>
                    ) : (
                      <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                        {getTableSeats(draftSelectedTable, draftGuests).map((seat, idx) => {
                          if (!seat) return null;
                          const guest = draftGuests.find((g) => g.id === seat.guestId);
                          if (!guest) return null;
                          const name = getPartyMembers(guest)[seat.attendeeIndex] ?? guest.name;

                          return (
                            <div
                              key={`${seat.guestId}-${seat.attendeeIndex}`}
                              className="p-2 rounded-xl bg-[#EFE6DC]/50 border border-[#CBAE94]/40 text-xs flex items-center justify-between gap-2"
                            >
                              <div className="min-w-0">
                                <p className="font-bold text-[#4A3F35] truncate">{name}</p>
                                <span className="text-xs text-[#8B735B] font-medium">
                                  {tf('seatedAtSeatLabel', { seat: String(idx + 1) })} · {guest.name}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => handleUnseatAttendee(draftSelectedTable.id, idx)}
                                className="text-red-500 hover:text-red-700 p-1 rounded-lg hover:bg-red-50 shrink-0"
                                title={t.unseatAttendeeBtn}
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Auto-fill a party into this table's free chairs */}
                  <div className="space-y-2 pt-2 border-t border-[#CBAE94]/40">
                    <label className="label-mono block">{t.seatPartyHereBtn}</label>
                    <select
                      onChange={(e) => {
                        if (e.target.value) {
                          handleAutoSeatParty(e.target.value, draftSelectedTable.id);
                          e.target.value = '';
                        }
                      }}
                      defaultValue=""
                      className="w-full px-3 py-2 rounded-xl border border-[#CBAE94] text-xs font-bold text-[#5D5449] bg-white"
                    >
                      <option value="" disabled>
                        {t.chooseGuestOption}
                      </option>
                      {draftGuests
                        .filter((g) => g.rsvp_status === 'Attending')
                        .map((g) => {
                          const pSize = getGuestPartySize(g);
                          const remaining = pSize - getGuestSeatedCount(g.id, draftFloorMap, draftGuests);
                          return (
                            <option key={g.id} value={g.id}>
                              {g.name} ({tf('partyOfLabel', { count: pSize })}) — {remaining > 0 ? tf('remainingToSeatLabel', { count: remaining }) : t.allAttendeesSeatedMsg}
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
                    {t.noTableSelectedTitle}
                  </h4>
                  <p className="text-xs text-[#5D5449]">
                    {t.noTableSelectedMsg}
                  </p>
                  <button
                    type="button"
                    onClick={() => setSeatingWorkflowTab('guest')}
                    className="w-full mt-2 py-2 px-3 rounded-xl bg-[#EFE6DC] hover:bg-[#CBAE94]/30 text-[#8B735B] text-xs font-bold transition-all flex items-center justify-center gap-1"
                  >
                    {t.switchByGuestModeBtn} <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </>
          )}

          {/* WORKFLOW 2: BY GUEST & PARTY INSPECTOR */}
          {seatingWorkflowTab === 'guest' && (
            <div className="bg-[#FFFDF9] rounded-3xl p-4 shadow-md border-2 border-[#CBAE94] space-y-4">
              <div>
                <span className="text-xs font-mono font-bold uppercase text-[#8B735B]">
                  {t.guestFirstSeatingLabel}
                </span>
                <h3 className="font-gaegu text-2xl font-bold text-[#4A3F35]">
                  {t.selectGuestSeatTitle}
                </h3>
              </div>

              {/* Filter Input */}
              <div>
                <input
                  type="text"
                  placeholder={t.filterGuestPh}
                  value={guestFilterQuery}
                  onChange={(e) => setGuestFilterQuery(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-[#CBAE94] text-xs font-bold text-[#5D5449] bg-white"
                />
              </div>

              {/* Attendee palette — drag a name onto a chair, or tap a name then a chair */}
              <div className="space-y-2 max-h-[22rem] overflow-y-auto pr-1">
                <span className="text-xs font-mono font-bold uppercase text-[#8B735B] block mb-1">
                  {t.dragAttendeeHint}
                </span>
                {Array.from(paletteByParty.entries())
                  .filter(([guestId, items]) => {
                    if (!guestFilterQuery.trim()) return true;
                    const q = guestFilterQuery.toLowerCase();
                    const party = draftGuests.find((g) => g.id === guestId);
                    return (
                      (party?.name.toLowerCase().includes(q) ?? false) ||
                      items.some((item) => item.name.toLowerCase().includes(q))
                    );
                  })
                  .map(([guestId, items]) => {
                    const guest = draftGuests.find((g) => g.id === guestId);
                    if (!guest) return null;
                    const seated = items.filter((i) => i.tableName !== null).length;
                    const isSelected = selectedGuestForSeating?.id === guestId;

                    return (
                      <div
                        key={guestId}
                        className={`p-2 rounded-2xl border text-xs transition-all ${
                          isSelected ? 'border-[#8B735B] bg-[#EFE6DC]' : 'border-[#CBAE94]/60 bg-white'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedGuestForSeating(guest)}
                          className="w-full flex items-center justify-between font-bold text-left text-[#4A3F35]"
                        >
                          <span className="truncate">{guest.name}</span>
                          <span className="ml-2 shrink-0 px-2 py-0.5 rounded-full text-xs font-mono bg-[#EFE6DC] text-[#8B735B]">
                            {seated}/{getGuestPartySize(guest)}
                          </span>
                        </button>
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {items.map((item) => {
                            const isPicked =
                              selectedAttendee?.guestId === item.guestId &&
                              selectedAttendee?.attendeeIndex === item.attendeeIndex;
                            const isSeated = item.tableName !== null;
                            return (
                              <button
                                key={`${item.guestId}-${item.attendeeIndex}`}
                                type="button"
                                draggable
                                onDragStart={(e) => handleDragStart(e, item)}
                                onDragEnd={() => {
                                  setDraggingAttendee(null);
                                  setDropTarget(null);
                                }}
                                onClick={() => handlePaletteItemClick(item)}
                                className={`px-2 py-1 rounded-lg border text-xs font-bold cursor-grab active:cursor-grabbing transition-all ${
                                  isPicked
                                    ? 'bg-amber-200 border-amber-400 text-amber-900'
                                    : isSeated
                                      ? 'bg-[#8B735B] text-white border-[#8B735B]'
                                      : 'bg-emerald-50 text-emerald-900 border-emerald-300 hover:bg-emerald-100'
                                }`}
                                title={
                                  isSeated
                                    ? `${item.tableName} · ${tf('seatedAtSeatLabel', { seat: String((item.seatIndex ?? 0) + 1) })}`
                                    : t.dragAttendeeHint
                                }
                              >
                                {item.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
              </div>

              {/* Selected Guest Details & Table Gating Selector */}
              {selectedGuestForSeating ? (() => {
                const pSize = getGuestPartySize(selectedGuestForSeating);
                const remaining = pSize - getGuestSeatedCount(selectedGuestForSeating.id, draftFloorMap, draftGuests);
                return (
                <div className="p-3 bg-[#EFE6DC]/50 rounded-2xl border-2 border-[#CBAE94] space-y-3 pt-3">
                  <div className="flex items-center justify-between border-b border-[#CBAE94]/40 pb-2">
                    <div>
                      <span className="text-xs font-mono font-bold uppercase text-[#8B735B]">
                        {t.selectedPartyLabel}
                      </span>
                      <h4 className="font-bold text-[#4A3F35] text-sm">
                        {selectedGuestForSeating.name}
                      </h4>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="px-2.5 py-1 bg-[#8B735B] text-white rounded-full text-xs font-bold font-mono">
                        {remaining > 0
                          ? tf('remainingToSeatLabel', { count: String(remaining) })
                          : t.allAttendeesSeatedMsg}
                      </span>
                      {getGuestSeatedCount(selectedGuestForSeating.id, draftFloorMap, draftGuests) > 0 && (
                        <button
                          type="button"
                          onClick={() => handleUnassignParty(selectedGuestForSeating.id)}
                          className="px-2 py-1 rounded-lg bg-red-100 hover:bg-red-200 text-red-700 text-xs font-bold"
                        >
                          {t.unassignParty}
                        </button>
                      )}
                    </div>
                  </div>

                  <div>
                    <span className="text-xs font-mono font-bold uppercase text-[#8B735B] block mb-1">
                      {tf('includedAttendeesLabel', { count: pSize })}
                    </span>
                    <div className="flex flex-wrap gap-1">
                      {getPartyMembers(selectedGuestForSeating).map((name, nIdx) => (
                        <span key={nIdx} className="px-2 py-0.5 bg-white rounded-md border border-[#CBAE94]/60 text-xs font-medium text-[#4A3F35]">
                          • {name}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Live Table Grid — auto-fill the party's remaining members */}
                  <div className="space-y-2 pt-1">
                    <span className="text-xs font-mono font-bold uppercase text-[#8B735B] block">
                      {t.chooseVenueTableLabel}
                    </span>
                    <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                      {draftFloorMap.tables.map((table) => {
                        const occCount = getTableOccupiedSeats(table, draftGuests);
                        const free = table.capacity - occCount;
                        const canFill = free > 0 && remaining > 0;

                        return (
                          <div
                            key={table.id}
                            className={`p-2.5 rounded-xl border text-xs space-y-1.5 transition-all ${
                              canFill ? 'bg-white border-[#10B981]/60 hover:border-[#10B981]' : 'bg-red-50/40 border-red-200 opacity-70'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-[#4A3F35]">
                                {table.name}
                              </span>
                              <span className="text-xs font-mono text-[#5D5449]">
                                {occCount} / {table.capacity} Seats ({free} Free)
                              </span>
                            </div>

                            {canFill ? (
                              <button
                                type="button"
                                onClick={() => handleAutoSeatParty(selectedGuestForSeating.id, table.id)}
                                className="w-full py-1.5 px-2 rounded-lg bg-[#10B981] hover:bg-[#059669] text-white text-xs font-bold shadow-md transition-all flex items-center justify-center gap-1"
                              >
                                <Check className="w-3.5 h-3.5" /> {t.seatPartyHere} ({Math.min(remaining, free)} {language === 'FR' ? 'siège(s)' : 'seats'})
                              </button>
                            ) : (
                              <div className="py-1 px-2 rounded-lg bg-red-100 text-red-700 text-xs font-bold text-center">
                                {free === 0 ? t.insufficientSeats : t.allAttendeesSeatedMsg}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                );
              })() : (
                <p className="text-xs text-[#5D5449]/70 italic text-center py-4 border-2 border-dashed border-[#CBAE94]/40 rounded-2xl">
                  {t.selectGuestHint}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
