// The 2D draft canvas: the Konva stage, the tables/landmarks/seats, and the
// DOM drag-and-drop surface that feeds it. Rendering and hit-testing only â€” the
// draft lives in floorplanHooks, the visual rules in tableVisuals.
//
// Note: the 3D view is a separate component; the parent picks between them.

import { useState, type DragEvent as ReactDragEvent, type MouseEvent, type ReactNode, type RefObject } from 'react';
import { Stage, Layer, Group, Circle, Rect, Text, Transformer } from 'react-konva';
import type { FloorMapData, Guest, LandmarkElement, SeatOccupant, TableElement } from '../../types';
import {
  getAvailableSeats,
  getTableOccupiedSeats,
  getTableSeats,
  getUnseatedPartySize,
  canSeatParty,
} from '../../lib/tableAssignment';
import { clampPointToRoom, findNearestSeat } from './floorPlanHelpers';
import { seatVisual, tableOutline } from './tableVisuals';
import { SeatRing, renderLandmark, renderRoomBoundary } from './venueShapes';
import { useT, useTf } from '../shared/i18n';

// Axis ruler thickness (px) drawn above / left of the interactive canvas.
const AXIS = 18;

// "Nice" tick values (1/2/5 × 10^n) across an axis, aiming for ~8 labels.
const axisTicks = (size: number): number[] => {
  if (size <= 0) return [0];
  const raw = size / 8;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? pow * 10;
  const ticks: number[] = [];
  for (let v = 0; v <= size; v += step) ticks.push(v);
  return ticks;
};

// X / Y rulers around the interactive canvas so the increasing direction (and the
// px scale) is obvious. Purely decorative — never intercepts pointer events.
const CanvasAxes = ({
  mapWidth,
  mapHeight,
  scale,
  show,
  children,
}: {
  mapWidth: number;
  mapHeight: number;
  scale: number;
  show: boolean;
  children: ReactNode;
}) => {
  const width = mapWidth * scale;
  const height = mapHeight * scale;
  const pad = show ? AXIS : 0;
  const xTicks = axisTicks(mapWidth);
  const yTicks = axisTicks(mapHeight);
  const lastX = xTicks[xTicks.length - 1];
  const lastY = yTicks[yTicks.length - 1];
  return (
    <div className="relative shrink-0 m-auto" style={{ width: width + pad, height: height + pad }}>
      {show && (
        <>
          {/* X axis — values increase to the right */}
          <div className="absolute select-none pointer-events-none" aria-hidden="true" style={{ left: AXIS, top: 0, width, height: AXIS }}>
            <div className="absolute inset-x-0 bottom-0 h-px bg-[#CBAE94]" />
            {xTicks.map((v) => (
              <div key={`x-${v}`} className="absolute bottom-0" style={{ left: v * scale }}>
                <div className="absolute bottom-0 w-px h-1 bg-[#8B735B]" />
                <span
                  className="absolute bottom-1.5 text-[9px] leading-none font-mono font-bold text-[#8B735B] whitespace-nowrap"
                  style={{ transform: v === 0 ? 'translateX(0)' : v === lastX ? 'translateX(-100%)' : 'translateX(-50%)' }}
                >
                  {v}
                </span>
              </div>
            ))}
          </div>

          {/* Y axis — values increase downward */}
          <div className="absolute select-none pointer-events-none" aria-hidden="true" style={{ left: 0, top: AXIS, width: AXIS, height }}>
            <div className="absolute inset-y-0 right-0 w-px bg-[#CBAE94]" />
            {yTicks.map((v) => (
              <div key={`y-${v}`} className="absolute right-0" style={{ top: v * scale }}>
                <div className="absolute right-0 h-px w-1 bg-[#8B735B]" />
                <span
                  className="absolute right-1.5 text-[9px] leading-none font-mono font-bold text-[#8B735B] whitespace-nowrap"
                  style={{ transform: v === 0 ? 'translateY(0)' : v === lastY ? 'translateY(-100%)' : 'translateY(-50%)' }}
                >
                  {v}
                </span>
              </div>
            ))}
          </div>

          {/* Axis names at the origin */}
          <div className="absolute select-none pointer-events-none" aria-hidden="true" style={{ left: 0, top: 0, width: AXIS, height: AXIS }}>
            <span className="absolute right-0.5 top-0 text-[9px] leading-none font-mono font-bold text-[#8B735B]">X</span>
            <span className="absolute left-0 bottom-0 text-[9px] leading-none font-mono font-bold text-[#8B735B]">Y</span>
          </div>
        </>
      )}

      <div className="absolute" style={{ left: pad, top: pad }}>
        {children}
      </div>
    </div>
  );
};

export interface FloorPlanSelection {
  /** Selected table or landmark id. */
  id: string | null;
  /** Member picked from the palette, waiting for a chair. */
  attendee: SeatOccupant | null;
  /** Party picked for seating (highlights every table that can take it). */
  party: Guest | null;
}

export interface FloorPlanCanvasCallbacks {
  onSelect: (id: string | null, type: 'table' | 'landmark' | null) => void;
  onPickAttendee: (attendee: SeatOccupant | null) => void;
  onSeatAttendee: (guestId: string, attendeeIndex: number, tableId: string, seatIndex: number | null) => void;
  onAutoSeatParty: (guestId: string, tableId: string) => void;
  onTableDragEnd: (tableId: string, e: any) => void;
  onLandmarkDragEnd: (landmarkId: string, e: any) => void;
  onTransformEnd: () => void;
  onHoverTable: (table: TableElement, clientX: number, clientY: number) => void;
  onHoverSeat: (table: TableElement, seatIndex: number, clientX: number, clientY: number) => void;
  onHoverLandmark: (landmark: LandmarkElement, clientX: number, clientY: number) => void;
  onHoverEnd: () => void;
}

export interface FloorPlanCanvasProps {
  map: FloorMapData;
  guests: Guest[];
  selection: FloorPlanSelection;
  /** The member currently being dragged from the palette, if any. */
  dragging: SeatOccupant | null;
  scale: number;
  /** Draw the X/Y rulers around the stage. */
  showAxes: boolean;
  stageRef: RefObject<any>;
  transformerRef: RefObject<any>;
  callbacks: FloorPlanCanvasCallbacks;
}

export const FloorPlanCanvas = ({
  map,
  guests,
  selection,
  dragging,
  scale,
  showAxes,
  stageRef,
  transformerRef,
  callbacks,
}: FloorPlanCanvasProps) => {
  const t = useT();
  const tf = useTf();
  const [dropTarget, setDropTarget] = useState<{ tableId: string; seatIndex: number } | null>(null);

  const eventToSeat = (e: ReactDragEvent | MouseEvent) => {
    const stage = stageRef.current;
    if (!stage) return null;
    const rect = stage.container().getBoundingClientRect();
    return findNearestSeat(
      map,
      (e.clientX - rect.left) / scale,
      (e.clientY - rect.top) / scale
    );
  };

  const handleDragOver = (e: ReactDragEvent) => {
    if (!dragging && !e.dataTransfer.types.includes('text/plain')) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDropTarget(eventToSeat(e));
  };

  const handleDrop = (e: ReactDragEvent) => {
    e.preventDefault();
    // Prefer the dragged state, fall back to the dataTransfer payload for very
    // fast drags.
    let key = dragging;
    if (!key) {
      const [guestId, index] = e.dataTransfer.getData('text/plain').split(':');
      if (guestId && index !== undefined) key = { guestId, attendeeIndex: Number(index) };
    }
    const seat = dropTarget ?? eventToSeat(e);
    setDropTarget(null);
    if (key && seat) callbacks.onSeatAttendee(key.guestId, key.attendeeIndex, seat.tableId, seat.seatIndex);
  };

  const handleTableClick = (table: TableElement) => {
    if (selection.attendee) {
      callbacks.onSeatAttendee(selection.attendee.guestId, selection.attendee.attendeeIndex, table.id, null);
      callbacks.onPickAttendee(null);
    } else if (selection.party) {
      callbacks.onAutoSeatParty(selection.party.id, table.id);
    } else {
      callbacks.onSelect(table.id, 'table');
    }
  };

  return (
    <div
      className={`flex-1 w-full overflow-auto flex bg-[#FAF6F0] p-3 rounded-2xl border-2 transition-colors ${
        dragging ? 'border-emerald-500 bg-emerald-50/40' : 'border-[#CBAE94]/40'
      }`}
      onDragOver={handleDragOver}
      onDragLeave={() => setDropTarget(null)}
      onDrop={handleDrop}
    >
      <CanvasAxes mapWidth={map.canvasWidth} mapHeight={map.canvasHeight} scale={scale} show={showAxes}>
        <Stage
          ref={stageRef}
          width={map.canvasWidth * scale}
          height={map.canvasHeight * scale}
          scaleX={scale}
          scaleY={scale}
          onMouseDown={(e) => {
            if (e.target === e.target.getStage()) callbacks.onSelect(null, null);
          }}
        >
        {/* Layer 1: Grid + Room Boundary */}
        <Layer>{renderRoomBoundary(map)}</Layer>

        {/* Layer 2: Landmarks */}
        <Layer>
          {map.landmarks.map((landmark) => (
            <Group
              key={landmark.id}
              id={landmark.id}
              x={landmark.x + landmark.width / 2}
              y={landmark.y + landmark.height / 2}
              offsetX={landmark.width / 2}
              offsetY={landmark.height / 2}
              width={landmark.width}
              height={landmark.height}
              rotation={landmark.rotation || 0}
              draggable
              dragBoundFunc={(pos: any) => clampPointToRoom(pos.x, pos.y, map)}
              onDragEnd={(e) => callbacks.onLandmarkDragEnd(landmark.id, e)}
              onClick={() => callbacks.onSelect(landmark.id, 'landmark')}
              onMouseEnter={(e) => callbacks.onHoverLandmark(landmark, e.evt.clientX, e.evt.clientY)}
              onMouseMove={(e) => callbacks.onHoverLandmark(landmark, e.evt.clientX, e.evt.clientY)}
              onMouseLeave={callbacks.onHoverEnd}
            >
              {renderLandmark(landmark, selection.id === landmark.id)}
            </Group>
          ))}
        </Layer>

        {/* Layer 3: Tables */}
        <Layer>
          {map.tables.map((table) => {
            const isSelected = selection.id === table.id;
            const tableSeats = getTableSeats(table, guests);
            const occupiedCount = getTableOccupiedSeats(table, guests);
            const isFull = occupiedCount >= table.capacity;

            const partyFocused = !!selection.party;
            const partyFits = selection.party ? canSeatParty(table, map, guests, selection.party.id) : false;
            const freeSeatsForParty = selection.party ? getAvailableSeats(table, guests) : 0;
            const unseatedForParty = selection.party
              ? getUnseatedPartySize(selection.party.id, map, guests)
              : 0;

            const outline = tableOutline({ isSelected, isFull, partyFocused, partyFits });

            return (
              <Group
                key={table.id}
                id={table.id}
                x={table.x + table.width / 2}
                y={table.y + table.height / 2}
                offsetX={table.width / 2}
                offsetY={table.height / 2}
                width={table.width}
                height={table.height}
                rotation={table.rotation || 0}
                draggable
                dragBoundFunc={(pos: any) => clampPointToRoom(pos.x, pos.y, map)}
                onDragEnd={(e) => callbacks.onTableDragEnd(table.id, e)}
                onClick={() => handleTableClick(table)}
                onMouseEnter={(e) => callbacks.onHoverTable(table, e.evt.clientX, e.evt.clientY)}
                onMouseMove={(e) => callbacks.onHoverTable(table, e.evt.clientX, e.evt.clientY)}
                onMouseLeave={callbacks.onHoverEnd}
              >
                <SeatRing
                  table={table}
                  renderSeat={(pos, idx) => {
                    const occupant: SeatOccupant | null = tableSeats[idx] ?? null;
                    const visual = seatVisual({
                      occupied: !!occupant,
                      isDropTarget: dropTarget?.tableId === table.id && dropTarget.seatIndex === idx,
                      isPicked:
                        !!occupant &&
                        !!selection.attendee &&
                        occupant.guestId === selection.attendee.guestId &&
                        occupant.attendeeIndex === selection.attendee.attendeeIndex,
                      pickMode: !!selection.attendee,
                    });

                    return (
                      <Circle
                        key={`dseat-${table.id}-${idx}`}
                        x={pos.x}
                        y={pos.y}
                        radius={visual.radius}
                        fill={visual.fill}
                        stroke={visual.stroke}
                        strokeWidth={2}
                        onClick={(e) => {
                          e.cancelBubble = true;
                          if (selection.attendee) {
                            callbacks.onSeatAttendee(selection.attendee.guestId, selection.attendee.attendeeIndex, table.id, idx);
                            callbacks.onPickAttendee(null);
                          } else if (occupant) {
                            callbacks.onPickAttendee({ guestId: occupant.guestId, attendeeIndex: occupant.attendeeIndex });
                          } else {
                            callbacks.onPickAttendee(null);
                          }
                        }}
                        onMouseEnter={(e) => {
                          e.cancelBubble = true;
                          callbacks.onHoverSeat(table, idx, e.evt.clientX, e.evt.clientY);
                        }}
                        onMouseMove={(e) => {
                          e.cancelBubble = true;
                          callbacks.onHoverSeat(table, idx, e.evt.clientX, e.evt.clientY);
                        }}
                        onMouseLeave={callbacks.onHoverEnd}
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
                    stroke={outline.stroke}
                    strokeWidth={outline.strokeWidth}
                    dash={outline.dash}
                    shadowBlur={outline.shadowBlur}
                    shadowColor={outline.shadowColor}
                    shadowOpacity={0.4}
                  />
                ) : (
                  <Rect
                    width={table.width}
                    height={table.height}
                    fill={table.color || '#8B735B'}
                    stroke={outline.stroke}
                    strokeWidth={outline.strokeWidth}
                    dash={outline.dash}
                    cornerRadius={14}
                    shadowBlur={outline.shadowBlur}
                    shadowColor={outline.shadowColor}
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
                    selection.party
                      ? partyFits
                        ? tf('fpFitsSeats', { count: Math.min(freeSeatsForParty, unseatedForParty) })
                        : tf('fpNeedSeats', { count: unseatedForParty })
                      : `${occupiedCount}/${table.capacity} ${t.seatsLabel}`
                  }
                  y={table.height / 2 - 4}
                  width={table.width}
                  height={table.height / 2}
                  align="center"
                  verticalAlign="middle"
                  fontSize={10}
                  fill={selection.party ? (partyFits ? '#A7F3D0' : '#FECACA') : '#FFE6D5'}
                />
              </Group>
            );
          })}

          <Transformer
            ref={transformerRef}
            boundBoxFunc={(oldBox, newBox) => (newBox.width < 40 || newBox.height < 30 ? oldBox : newBox)}
            onTransformEnd={callbacks.onTransformEnd}
          />
        </Layer>
        </Stage>
      </CanvasAxes>
    </div>
  );
};
