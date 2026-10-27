import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Stage, Layer, Group, Circle } from 'react-konva';
import { renderTableBody, renderLandmark, SeatRing, TableLabel, renderRoomBoundary } from './venueShapes';
import { useCanvasPalette } from './canvasPalette';
import { MapPin, Users, Utensils, Info, DoorOpen, Sparkles, CheckCircle2, X } from 'lucide-react';
import { Guest, FloorMapData } from '../../types';
import { useT, useTf } from '../shared/i18n';
import { useDialogA11y } from '../shared/useDialogA11y';
import { ViewModeToggle, ViewMode } from '../shared/ViewModeToggle';
import { getGuestPartySize, getTableOccupiedSeats, getTableSeats, getAttendeeSeatLocation } from '../../lib/tableAssignment';
import { getSeatLocalPosition } from './floorPlanHelpers';
import { getPartyMembers, getPartyDietarySummary } from '../../lib/guestAttendees';
import { FinderSelection } from './GuestFinderPage';

// The guest's own seat: the same emerald the host page uses for "fits here".
const MY_SEAT = '#059669';
const MY_SEAT_STROKE = '#047857';

const FloorPlan3D = lazy(() => import('./FloorPlan3D').then((m) => ({ default: m.FloorPlan3D })));

interface VenueModalProps {
  open: boolean;
  selected: FinderSelection;
  floorMap: FloorMapData | null;
  roster: Guest[];
  onClose: () => void;
}

export const VenueModal = ({ open, selected, floorMap, roster, onClose }: VenueModalProps) => {
  const t = useT();
  const tf = useTf();
  const palette = useCanvasPalette();
  const [viewMode, setViewMode] = useState<ViewMode>('2d');
  const [mapWidth, setMapWidth] = useState(440);
  const mapWrapRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Escape, focus trap, and scroll lock for the full-screen venue modal.
  useDialogA11y(open, panelRef, onClose);

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
  }, [selected, floorMap, open]);

  // The exact table + chair for THIS person (a party may be split across tables).
  const attendeeNames = getPartyMembers(selected.guest);
  const attendeeIndex =
    selected.attendeeName === null ? 0 : Math.max(0, attendeeNames.indexOf(selected.attendeeName));
  const guestSeat = useMemo(
    () => getAttendeeSeatLocation(selected.guest.id, attendeeIndex, floorMap, roster),
    [selected.guest.id, attendeeIndex, floorMap, roster]
  );

  const guestAssignedTable = guestSeat?.table ?? null;
  const seatIndex = guestSeat?.seatIndex ?? null;

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

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 bg-[#3A2F27]/90 backdrop-blur-md flex items-center justify-center p-4 sm:p-8 overflow-y-auto"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={t.venueTitle}
            initial={{ opacity: 0, scale: 0.92, y: 24 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: -12 }}
            transition={{ type: 'spring', stiffness: 240, damping: 22 }}
            onClick={(e) => e.stopPropagation()}
            className="card-guest relative w-full max-w-4xl p-5 sm:p-8 max-h-[92vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 border-b border-[#CBAE94]/40 pb-4 mb-5">
              <div className="flex items-center gap-3 min-w-0">
                <motion.div
                  className="w-11 h-11 rounded-2xl bg-[#EFE6DC] border border-[#CBAE94]/60 text-[#8B735B] flex items-center justify-center shrink-0"
                  animate={{ rotate: [0, -6, 6, 0] }}
                  transition={{ duration: 0.8, delay: 0.3 }}
                >
                  <MapPin className="w-5 h-5" />
                </motion.div>
                <div className="min-w-0">
                  <h2 className="font-gaegu text-2xl font-bold text-[#4A3F35] leading-tight">
                    {t.venueTitle}
                  </h2>
                  <p className="text-xs font-mono font-bold text-[#5D5449] break-words">
                    {selected.displayName} · {tf('finderCodeParty', { code: selected.guest.code, count: String(getGuestPartySize(selected.guest)) })}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-full border border-[#CBAE94]/60 text-[#4A3F35] transition-transform hover:-translate-y-0.5 shrink-0"
                aria-label={t.closeModal}
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
                  className="p-5 rounded-xl bg-[#EFE6DC]/60 border border-[#CBAE94]/60"
                >
                  <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <motion.span
                        className="shrink-0 inline-block px-3 py-1 rounded-full bg-[#4A3F35] text-xs font-mono font-bold uppercase"
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
                        {tf('finderSeatedWithParty', { count: getGuestPartySize(selected.guest) })}
                      </p>
                      <p className="flex items-center gap-2 font-bold">
                        <MapPin className="w-4 h-4 text-[#8B735B]" />
                        {t.finderNearEntrance}
                      </p>
                      {getPartyDietarySummary(selected.guest) && (
                        <motion.p
                          className="flex items-center gap-2 font-bold text-[#8B735B]"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: 0.5 }}
                        >
                          <Utensils className="w-4 h-4" />
                          {tf('finderDietaryNote', { dietary: getPartyDietarySummary(selected.guest) })}
                        </motion.p>
                      )}
                    </div>

                    <motion.div
                      className="flex items-center gap-2 pt-1 text-xs font-mono text-[#4A3F35] font-bold"
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
                  className="bg-[#FAF6F0] p-3 sm:p-4 rounded-xl border border-[#CBAE94]/60"
                >
                  <div className="flex items-center justify-between mb-2 gap-2">
                    <p className="text-xs font-bold text-[#4A3F35]">
                      {t.finderTableHighlight}
                    </p>
                    <ViewModeToggle value={viewMode} onChange={setViewMode} />
                  </div>
                  <p className="text-xs text-[#5D5449] text-center mb-2">
                    {viewMode === '3d' ? t.finderMap3dHint : t.finderMapHint}
                  </p>

                  <div ref={mapWrapRef} className="relative w-full overflow-x-auto flex justify-center">
                    {floorMap &&
                      (viewMode === '3d' ? (
                        <Suspense
                          fallback={
                            <div className="w-full h-[360px] sm:h-[420px] flex items-center justify-center text-xs font-mono font-bold text-[#8B735B]">
                              3D…
                            </div>
                          }
                        >
                          <FloorPlan3D
                            className="w-full h-[360px] sm:h-[420px]"
                            floorMap={floorMap}
                            guests={roster}
                            seating={false}
                            targetTableId={guestAssignedTable.id}
                            targetSeatIndex={seatIndex}
                          />
                        </Suspense>
                      ) : (
                      <div
                        className="relative shrink-0"
                        style={{ width: mapWidth, height: mapHeight }}
                      >
                        <Stage width={mapWidth} height={mapHeight} scaleX={scale} scaleY={scale}>
                          <Layer listening={false}>{renderRoomBoundary(floorMap)}</Layer>
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
                              const occupied = getTableOccupiedSeats(tbl, roster);
                              const seatLayout = getTableSeats(tbl, roster);
                              return (
                                <Group key={`gtbl-${tbl.id}`} x={tbl.x} y={tbl.y}>
                                  {/* Outer seat dots around the table (editor geometry) */}
                                  <SeatRing
                                    table={tbl}
                                    renderSeat={(pos, i) => {
                                      const isMine = isTarget && seatIndex === i;
                                      return (
                                        <Circle
                                          key={`seat-${i}`}
                                          x={pos.x}
                                          y={pos.y}
                                          radius={8}
                                          fill={isMine ? MY_SEAT : seatLayout[i] ? '#8B735B' : palette.surface}
                                          stroke={isMine ? MY_SEAT_STROKE : palette.accent}
                                          strokeWidth={2}
                                        />
                                      );
                                    }}
                                  />

                                  {/* Premium table body */}
                                  {renderTableBody({ table: tbl, isSelected: false })}

                                  {/* Table title + capacity */}
                                  <TableLabel table={tbl} occupied={occupied} seatsLabel={t.seatsLabel} />
                                </Group>
                              );
                            })}
                          </Layer>
                        </Stage>

                        {/* Static ring on the guest's table — only the seat pulses */}
                        {targetTableCenter && (
                          <div
                            className="absolute pointer-events-none"
                            style={{
                              left: targetTableCenter.x,
                              top: targetTableCenter.y,
                              // The wrapper needs a size: the ring spans the table plus its chairs.
                              width: (guestAssignedTable.width + 36) * scale,
                              height: (guestAssignedTable.height + 36) * scale,
                              transform: 'translate(-50%, -50%)',
                            }}
                          >
                            <span
                              aria-hidden
                              className={`absolute inset-0 border-[3px] ${guestAssignedTable.shape === 'circle' ? 'rounded-full' : 'rounded-2xl'}`}
                              style={{ borderColor: 'var(--ink)' }}
                            />
                            <span
                              aria-hidden
                              className={`absolute inset-0 blur-[2px] ${guestAssignedTable.shape === 'circle' ? 'rounded-full' : 'rounded-2xl'}`}
                              style={{ backgroundColor: 'color-mix(in srgb, var(--ink) 12%, transparent)' }}
                            />
                          </div>
                        )}

                        {/* Pulsing green seat — the attendee's exact seat */}
                        {seatCenter && (
                          <div
                            className="absolute pointer-events-none"
                            style={{
                              left: seatCenter.x,
                              top: seatCenter.y,
                              width: Math.max(20 * scale, 14),
                              height: Math.max(20 * scale, 14),
                              transform: 'translate(-50%, -50%)',
                            }}
                          >
                            <motion.span
                              aria-hidden
                              className="absolute inset-0 rounded-full border-[3px]"
                              style={{ borderColor: MY_SEAT }}
                              initial={{ scale: 0.5, opacity: 0.9 }}
                              animate={{ scale: [0.6, 2.2], opacity: [0.9, 0] }}
                              transition={{ duration: 1.2, repeat: Infinity, ease: 'easeOut' }}
                            />
                            <span className="absolute inset-0 rounded-full blur-[1px]" style={{ backgroundColor: `${MY_SEAT}4D` }} />
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
                              className="absolute inset-0 rounded-full"
                              style={{ backgroundColor: 'color-mix(in srgb, var(--ink) 25%, transparent)' }}
                              animate={{ scale: [1, 2], opacity: [0.6, 0] }}
                              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeOut' }}
                            />
                            <motion.div
                              className="relative w-8 h-8 rounded-full flex items-center justify-center shadow-lg"
                              style={{ backgroundColor: 'var(--ink)', color: 'var(--bg)' }}
                              animate={{ y: [0, -5, 0] }}
                              transition={{ duration: 1.8, repeat: Infinity, ease: 'easeInOut' }}
                            >
                              <DoorOpen className="w-4 h-4" />
                            </motion.div>
                          </div>
                        )}
                      </div>
                      )
                    )}
                  </div>

                  {/* Legend */}
                  <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 mt-3 text-xs font-mono font-bold text-[#5D5449]">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full border-2" style={{ borderColor: 'var(--ink)' }} />
                      {t.finderLegendYourTable}
                    </span>
                    {seatCenter && (
                      <span className="flex items-center gap-1.5">
                        <motion.span
                          className="w-2.5 h-2.5 rounded-full"
                          style={{ backgroundColor: MY_SEAT }}
                          animate={{ scale: [1, 1.6, 1], opacity: [1, 0.4, 1] }}
                          transition={{ duration: 1.2, repeat: Infinity }}
                        />
                        {t.finderLegendYourSeat}
                      </span>
                    )}
                    {entrance && (
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: 'var(--ink)' }} />
                        {t.finderLegendEntrance}
                      </span>
                    )}
                    <span className="flex items-center gap-1.5 text-[#8B735B]">
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
                className="p-6 rounded-xl bg-[#EFE6DC]/60 border border-[#CBAE94]/60 text-center space-y-2"
              >
                <motion.div
                  animate={{ y: [0, -5, 0] }}
                  transition={{ duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
                  className="w-fit mx-auto"
                >
                  <Info className="w-6 h-6 text-[#8B735B]" />
                </motion.div>
                <p className="font-bold text-sm text-[#4A3F35]">
                  {t.finderOpenSeatingTitle}
                </p>
                <p className="text-xs text-[#5D5449]">{t.finderOpenSeatingMsg}</p>
              </motion.div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body
  );
};
