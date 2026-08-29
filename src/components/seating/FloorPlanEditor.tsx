import { lazy, Suspense, useState } from 'react';
import {
  Stage,
  Layer,
  Rect,
  Circle,
  Text,
  Group,
  Line,
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
  Sparkles,
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
import { Guest, FloorMapData, LandmarkElement, TableElement } from '../../types';
import { TextInput, Select } from '../shared/ui';
import { getGuestPartySize, getTableOccupiedSeats } from './floorPlanHelpers';
import { renderCustomLandmarkShape } from './renderCustomLandmarkShape';
import { useFloorPlanEditor } from './floorplanHooks';
import { ViewModeToggle, ViewMode } from '../shared/ViewModeToggle';
import { useT } from '../shared/i18n';
import { Language } from '../../types';

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
  } = useFloorPlanEditor({ floorMap, guests, notify, onSave, onCancel });

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
                <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-300 text-[10px] font-mono font-bold uppercase shrink-0">
                  {t.unsavedChangesBadge}
                </span>
              )}
            </div>
            <p className="hidden sm:block text-[11px] text-[#8B735B] font-medium">
              {t.editorSubtitle}
            </p>
          </div>
        </div>

        {/* Live Draft Stats Tracker */}
        <div className="hidden md:flex items-center gap-4 bg-[#EFE6DC]/60 px-4 py-1.5 rounded-2xl border border-[#CBAE94]">
          <div className="text-center">
            <span className="text-[10px] font-mono font-bold uppercase text-[#8B735B]">{t.draftCapacityLabel}</span>
            <p className="text-xs font-bold text-[#4A3F35]">
              {t.seatsTotalLabel.replace('{{count}}', String(draftFloorMap.tables.reduce((s, t) => s + t.capacity, 0)))}
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
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleCancelEditor}
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
              <span className="text-[11px] font-mono font-bold text-[#4A3F35] bg-[#EFE6DC] px-2 py-0.5 rounded-lg border border-[#CBAE94]/60">
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
                <Square className="w-3.5 h-3.5" /> Rectangle
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
                <CircleIcon className="w-3.5 h-3.5" /> Circle
              </button>
            </div>

            {/* Size Presets */}
            {(draftFloorMap.roomShape ?? 'rectangle') === 'circle' ? (
              <div>
                <label className="text-[10px] font-mono uppercase font-bold text-[#8B735B] block mb-1">
                  {t.roomPresetsLabel}
                </label>
                <div className="grid grid-cols-2 gap-1.5 text-[11px] font-bold">
                  <button type="button" onClick={() => handleUpdateDiameter(650)} className={`px-2 py-1.5 rounded-xl border transition-all text-left flex items-center gap-1 ${Math.min(draftFloorMap.canvasWidth, draftFloorMap.canvasHeight) === 650 ? 'bg-[#8B735B] text-white border-[#8B735B]' : 'bg-white text-[#5D5449] border-[#CBAE94]/60 hover:bg-[#EFE6DC]'}`}>
                    <Home className="w-3 h-3" /> Small (Ø 650)
                  </button>
                  <button type="button" onClick={() => handleUpdateDiameter(850)} className={`px-2 py-1.5 rounded-xl border transition-all text-left flex items-center gap-1 ${Math.min(draftFloorMap.canvasWidth, draftFloorMap.canvasHeight) === 850 ? 'bg-[#8B735B] text-white border-[#8B735B]' : 'bg-white text-[#5D5449] border-[#CBAE94]/60 hover:bg-[#EFE6DC]'}`}>
                    <Landmark className="w-3 h-3" /> Standard (Ø 850)
                  </button>
                  <button type="button" onClick={() => handleUpdateDiameter(1100)} className={`px-2 py-1.5 rounded-xl border transition-all text-left flex items-center gap-1 ${Math.min(draftFloorMap.canvasWidth, draftFloorMap.canvasHeight) === 1100 ? 'bg-[#8B735B] text-white border-[#8B735B]' : 'bg-white text-[#5D5449] border-[#CBAE94]/60 hover:bg-[#EFE6DC]'}`}>
                    <Castle className="w-3 h-3" /> Large (Ø 1100)
                  </button>
                  <button type="button" onClick={() => handleUpdateDiameter(1400)} className={`px-2 py-1.5 rounded-xl border transition-all text-left flex items-center gap-1 ${Math.min(draftFloorMap.canvasWidth, draftFloorMap.canvasHeight) === 1400 ? 'bg-[#8B735B] text-white border-[#8B735B]' : 'bg-white text-[#5D5449] border-[#CBAE94]/60 hover:bg-[#EFE6DC]'}`}>
                    <Tent className="w-3 h-3" /> Grand (Ø 1400)
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <label className="text-[10px] font-mono uppercase font-bold text-[#8B735B] block mb-1">
                  {t.roomPresetsLabel}
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
            )}

            {/* Room Custom Sliders */}
            {(draftFloorMap.roomShape ?? 'rectangle') === 'circle' ? (
              <div className="space-y-2 pt-1 border-t border-[#CBAE94]/30 text-xs">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-bold text-[#4A3F35]">Diameter</span>
                    <div className="flex items-center gap-1 font-mono font-bold text-[#8B735B]">
                      <button type="button" onClick={() => handleUpdateDiameter(Math.min(draftFloorMap.canvasWidth, draftFloorMap.canvasHeight) - 100)} className="w-5 h-5 rounded bg-[#EFE6DC] hover:bg-[#CBAE94] flex items-center justify-center text-[#4A3F35]">-</button>
                      <span>{Math.min(draftFloorMap.canvasWidth, draftFloorMap.canvasHeight)}px</span>
                      <button type="button" onClick={() => handleUpdateDiameter(Math.min(draftFloorMap.canvasWidth, draftFloorMap.canvasHeight) + 100)} className="w-5 h-5 rounded bg-[#EFE6DC] hover:bg-[#CBAE94] flex items-center justify-center text-[#4A3F35]">+</button>
                    </div>
                  </div>
                  <input type="range" min={500} max={2500} step={50} value={Math.min(draftFloorMap.canvasWidth, draftFloorMap.canvasHeight)} onChange={(e) => handleUpdateDiameter(parseInt(e.target.value, 10))} className="w-full accent-[#8B735B]" />
                </div>
                <button type="button" onClick={() => handleUpdateDiameter(Math.min(draftFloorMap.canvasWidth, draftFloorMap.canvasHeight) + 150)} className="w-full py-2 px-3 rounded-xl bg-[#EFE6DC] hover:bg-[#CBAE94] text-[#4A3F35] font-bold text-[11px] transition-colors flex items-center justify-center gap-1">
                  <Maximize2 className="w-3.5 h-3.5 text-[#8B735B]" /> + Expand Room (+150px Ø)
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
                <span className="text-[11px] font-bold text-[#4A3F35] block">
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
                <span className="text-[11px] font-bold text-[#4A3F35] block">
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
                onClick={() => handleDraftAddLandmark('stage', 'Parents Throne & Stage')}
                className="p-2 rounded-xl border border-[#CBAE94]/60 bg-white hover:bg-[#EFE6DC] text-left transition-colors flex items-center gap-1.5"
              >
                <Award className="w-3.5 h-3.5 text-[#8B735B]" /> {t.parentsStageBtn}
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
                onClick={() => handleDraftAddLandmark('photobooth', 'Bear Photo Backdrop')}
                className="p-2 rounded-xl border border-[#CBAE94]/60 bg-white hover:bg-[#EFE6DC] text-left transition-colors flex items-center gap-1.5"
              >
                <Sparkles className="w-3.5 h-3.5 text-[#8B735B]" /> {t.photoBoothBtn}
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
          className="lg:col-span-6 bg-[#FFFDF9] rounded-3xl p-3 lg:p-4 shadow-xl border-2 border-[#CBAE94] flex flex-col h-[70vh] lg:h-full overflow-hidden order-1 lg:order-2"
        >
          <div className="flex items-center justify-between mb-2 gap-2">
            <span className="text-xs font-bold text-[#8B735B] flex items-center gap-1">
              <Layers className="w-3.5 h-3.5" /> {t.fullScreenCanvasLabel}
            </span>
            <div className="flex items-center gap-2">
              <ViewModeToggle value={viewMode} onChange={setViewMode} />
              <span className="hidden md:inline text-[11px] font-mono text-[#5D5449]">
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
                    if (selectedGuestForSeating) {
                      handleDraftAssignGuest(selectedGuestForSeating.id, table.id);
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
              {/* Layer 1: Grid + Room Boundary */}
              <Layer>
                {(draftFloorMap.roomShape ?? 'rectangle') === 'circle' ? (
                  <Circle
                    x={draftFloorMap.canvasWidth / 2}
                    y={draftFloorMap.canvasHeight / 2}
                    radius={Math.min(draftFloorMap.canvasWidth, draftFloorMap.canvasHeight) / 2 - 10}
                    stroke="#CBAE94"
                    strokeWidth={2}
                    dash={[8, 8]}
                  />
                ) : (
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
                )}
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
                      onMouseEnter={(e) => handleLandmarkHover(landmark, e.evt.clientX, e.evt.clientY)}
                      onMouseMove={(e) => handleLandmarkHover(landmark, e.evt.clientX, e.evt.clientY)}
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
                      onMouseEnter={(e) => handleTableHover(table, draftGuests, e.evt.clientX, e.evt.clientY)}
                      onMouseMove={(e) => handleTableHover(table, draftGuests, e.evt.clientX, e.evt.clientY)}
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
          )}
        </div>

        {/* Right Inspector Column (col-3) */}
        <div className="lg:col-span-3 lg:overflow-y-auto space-y-4 pr-1 order-3">
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

                  {/* Assigned Guests List in Draft */}
                  <div className="space-y-2 pt-2 border-t border-[#CBAE94]/40">
                    <div className="flex items-center justify-between text-xs font-bold text-[#4A3F35]">
                      <span>{t.seatedGuestsPartiesLabel}</span>
                    </div>

                    {draftSelectedTable.assignedGuestIds.length === 0 ? (
                      <p className="text-xs text-[#5D5449]/70 italic py-2">
                        {t.noDraftGuestsMsg}
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
                                    {t.attendingNamesLabel}
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
                        {t.chooseGuestOption}
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
                  className="w-full px-3 py-2 rounded-xl border border-[#CBAE94] text-xs font-bold text-[#5D5449] bg-white focus:outline-none"
                />
              </div>

              {/* {t.confirmedAttendingLabel} Selector */}
              <div className="space-y-1.5 max-h-56 overflow-y-auto pr-1">
                <span className="text-[10px] font-mono font-bold uppercase text-[#8B735B] block mb-1">
                  {t.confirmedAttendingLabel}
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
                              : t.primaryGuestLabel}
                          </span>
                          <span className="font-semibold">
                                {assignedTable ? assignedTable.name : t.unassignedWord}
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
                        {t.selectedPartyLabel}
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
                        {t.includedAttendeesLabel} ({selectedGuestForSeating.attendee_names.length}):
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
                      {t.chooseVenueTableLabel}
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
                                  {language === 'FR' ? 'Placé à cette table' : t.currentlySeatedHere}
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
