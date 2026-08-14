import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'motion/react';
import { Stage, Layer, Group, Circle, Text } from 'react-konva';
import { renderTableBody, renderLandmark } from './venueShapes';
import { MapPin, Users, Utensils, Info, DoorOpen, Sparkles, CheckCircle2, X } from 'lucide-react';
import { Guest, FloorMapData } from '../../types';
import { useT } from '../shared/i18n';
import {
  getGuestPartySize,
  getAttendeeSeatIndex,
  getSeatLocalPosition,
  getTableOccupiedSeats,
} from './floorPlanHelpers';
import { FinderSelection } from './GuestFinderPage';

interface VenueModalProps {
  open: boolean;
  selected: FinderSelection;
  floorMap: FloorMapData | null;
  roster: Guest[];
  onClose: () => void;
}

export const VenueModal = ({ open, selected, floorMap, roster, onClose }: VenueModalProps) => {
  const t = useT();
  const [mapWidth, setMapWidth] = useState(440);
  const mapWrapRef = useRef<HTMLDivElement>(null);

  // Escape closes the full-screen venue modal
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

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

  const guestAssignedTable = useMemo(() => {
    if (!floorMap) return null;
    return (
      floorMap.tables.find((tbl) => tbl.assignedGuestIds.includes(selected.guest.id)) ?? null
    );
  }, [selected, floorMap]);

  const seatIndex = useMemo(() => {
    if (!guestAssignedTable) return null;
    return getAttendeeSeatIndex(guestAssignedTable, selected.guest.id, selected.attendeeName, roster);
  }, [guestAssignedTable, selected, roster]);

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
                onClick={onClose}
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
                              const occupied = getTableOccupiedSeats(tbl, roster);
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
  );
};
