import { Component, ReactNode, useState } from 'react';
import { Canvas, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Grid, Html, useCursor } from '@react-three/drei';
import { Guest, FloorMapData, LandmarkElement, TableElement } from '../../types';
import {
  WORLD_SCALE,
  toWorld,
  roomWorldSize,
  isRoomCircle,
  isRoomEllipse,
  roomRadiusWorld,
  tableCenterWorld,
  tableRotationY,
  seatLocalWorld,
} from './floorPlan3Dhelpers';
import { getGuestPartySize, getTableOccupiedSeats } from './floorPlanHelpers';
import { useT } from '../shared/i18n';

// ─── Palette (matches the 2D floor plan) ─────────────────────────
const C = {
  occupied: '#8B735B',
  free: '#FFFDF9',
  mine: '#2E9E5B',
  fit: '#A7F3D0',
  leg: '#7A6650',
  glowTarget: '#C9A227',
  canFit: '#10B981',
  cannotFit: '#EF4444',
  floor: '#F2E8DA',
};

const LANDMARK_COLORS: Record<LandmarkElement['type'], string> = {
  entrance: '#4A9D6E',
  stage: '#8B735B',
  gifts: '#D4A373',
  dessert: '#E9A3A3',
  bar: '#C9A227',
  dj: '#8E6BB5',
  restroom: '#7FB3D5',
  food: '#B07D4F',
  custom: '#A09080',
};

// ─── Proportional sizes (world units ~= "table-scaled metres") ────
const TABLE_TOP_THICK = 0.06;
const TABLE_TOP_H = 0.5; // tabletop surface height
const CHAIR_SEAT_H = 0.34;
const CHAIR_W = 0.34;
const BACKREST_H = 0.24;
const LANDMARK_H = 0.55;

export interface FloorPlan3DProps {
  floorMap: FloorMapData;
  guests: Guest[];
  /** Pending-seating guest (host surface). Drives can-fit coloring + click-to-seat. */
  selectedGuest?: Guest | null;
  /** Guest's own table/seat (day-of VenueModal). */
  targetTableId?: string | null;
  targetSeatIndex?: number | null;
  /** true (default) = host seating mode; false = read-only highlight (guest). */
  seating?: boolean;
  onTableHover?: (table: TableElement, x: number, y: number) => void;
  onSeatHover?: (table: TableElement, seatIndex: number, x: number, y: number) => void;
  onLandmarkHover?: (landmark: LandmarkElement, x: number, y: number) => void;
  onTableClick?: (table: TableElement) => void;
  onLeave?: () => void;
  className?: string;
}

const checkWebGL = (): boolean => {
  try {
    const canvas = document.createElement('canvas');
    return !!(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
};

// Canvas can throw at runtime in edge WebGL environments; fall back instead of crashing the page.
class CanvasBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed) return this.props.fallback;
    return this.props.children;
  }
}

// ─── Interactors (reuse useCursor; sub-components so hooks stay valid) ──

interface PointerHandlers {
  onOver?: (e: ThreeEvent<PointerEvent>) => void;
  onMove?: (e: ThreeEvent<PointerEvent>) => void;
  onOut?: (e: ThreeEvent<PointerEvent>) => void;
  onClick?: (e: ThreeEvent<PointerEvent>) => void;
  onLeave?: () => void;
}

const useHover = (handlers: PointerHandlers) => {
  const [hovered, setHovered] = useState(false);
  useCursor(hovered, `pointer`, 'default');
  const { onOver, onMove, onOut, onClick } = handlers;
  return {
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      setHovered(true);
      onOver?.(e);
    },
    onPointerMove: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      if (!hovered) setHovered(true);
      onMove?.(e);
    },
    onPointerOut: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      setHovered(false);
      onOut?.(e);
      handlers.onLeave?.();
    },
    onClick: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation();
      onClick?.(e);
    },
  };
};

// ─── Chair ────────────────────────────────────────────────────────

interface ChairProps {
  table: TableElement;
  seatIndex: number;
  fill: string;
  onSeatHover?: FloorPlan3DProps['onSeatHover'];
  onLeave?: () => void;
}

const Chair3D = ({ table, seatIndex, fill, onSeatHover, onLeave }: ChairProps) => {
  const pos = seatLocalWorld(table, seatIndex);
  const events = useHover({
    onOver: (e) => onSeatHover?.(table, seatIndex, e.clientX, e.clientY),
    onMove: (e) => onSeatHover?.(table, seatIndex, e.clientX, e.clientY),
    onLeave,
  });
  return (
    <group position={[pos.x, 0, pos.z]} rotation={[0, pos.yaw, 0]} {...events}>
      <mesh position={[0, CHAIR_SEAT_H, 0]} castShadow>
        <boxGeometry args={[CHAIR_W, 0.07, CHAIR_W]} />
        <meshStandardMaterial color={fill} />
      </mesh>
      <mesh position={[0, CHAIR_SEAT_H + BACKREST_H / 2, CHAIR_W / 2 - 0.02]} castShadow>
        <boxGeometry args={[CHAIR_W, BACKREST_H, 0.05]} />
        <meshStandardMaterial color={fill} />
      </mesh>
      <mesh position={[0, CHAIR_SEAT_H / 2, 0]} castShadow>
        <cylinderGeometry args={[0.02, 0.02, CHAIR_SEAT_H, 8]} />
        <meshStandardMaterial color={C.leg} />
      </mesh>
    </group>
  );
};

// ─── Table ────────────────────────────────────────────────────────

interface TableProps {
  floorMap: FloorMapData;
  table: TableElement;
  guests: Guest[];
  selectedGuest?: Guest | null;
  targetTableId?: string | null;
  targetSeatIndex?: number | null;
  seating: boolean;
  onTableHover?: FloorPlan3DProps['onTableHover'];
  onSeatHover?: FloorPlan3DProps['onSeatHover'];
  onTableClick?: FloorPlan3DProps['onTableClick'];
  onLeave?: () => void;
}

const Table3D = ({
  floorMap,
  table,
  guests,
  selectedGuest,
  targetTableId,
  targetSeatIndex,
  seating,
  onTableHover,
  onSeatHover,
  onTableClick,
  onLeave,
}: TableProps) => {
  const center = tableCenterWorld(floorMap, table);
  const occupied = getTableOccupiedSeats(table, guests);
  const pSize = selectedGuest ? getGuestPartySize(selectedGuest) : 0;
  const isAssignedHere = selectedGuest ? table.assignedGuestIds.includes(selectedGuest.id) : false;
  const occupiedOther = isAssignedHere ? occupied - Math.min(pSize, occupied) : occupied;
  const freeOther = table.capacity - occupiedOther;
  const canFit = selectedGuest ? freeOther >= pSize : false;
  const isTarget = targetTableId === table.id;

  const isRound = table.shape === 'circle';
  const r = table.width / 2 * WORLD_SCALE;
  const w = table.width * WORLD_SCALE;
  const d = table.height * WORLD_SCALE;

  const topColor = table.color || '#F1E3CD';
  let glow: string | null = null;
  if (isTarget) glow = C.glowTarget;
  else if (seating && selectedGuest) glow = canFit ? C.canFit : C.cannotFit;

  const events = useHover({
    onOver: (e) => onTableHover?.(table, e.clientX, e.clientY),
    onMove: (e) => onTableHover?.(table, e.clientX, e.clientY),
    onLeave,
    onClick: (e) => {
      if (onTableClick) onTableClick(table);
      void e;
    },
  });

  return (
    <group position={[center.x, 0, center.z]} rotation={[0, tableRotationY(table), 0]}>
      <group {...events}>
        {/* Tabletop */}
        {isRound ? (
          <mesh position={[0, TABLE_TOP_H - TABLE_TOP_THICK / 2, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[r, r, TABLE_TOP_THICK, 40]} />
            <meshStandardMaterial
              color={topColor}
              emissive={glow || '#000000'}
              emissiveIntensity={glow ? 0.35 : 0}
            />
          </mesh>
        ) : (
          <mesh position={[0, TABLE_TOP_H - TABLE_TOP_THICK / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[w, TABLE_TOP_THICK, d]} />
            <meshStandardMaterial
              color={topColor}
              emissive={glow || '#000000'}
              emissiveIntensity={glow ? 0.35 : 0}
            />
          </mesh>
        )}

        {/* Base */}
        {isRound ? (
          <group>
            <mesh position={[0, 0.02, 0]} castShadow>
              <cylinderGeometry args={[r * 0.22, r * 0.26, 0.05, 24]} />
              <meshStandardMaterial color={C.leg} />
            </mesh>
            <mesh position={[0, TABLE_TOP_H / 2, 0]} castShadow>
              <cylinderGeometry args={[r * 0.12, r * 0.16, TABLE_TOP_H - 0.05, 16]} />
              <meshStandardMaterial color={C.leg} />
            </mesh>
          </group>
        ) : (
          <>
            {[
              [w / 2 - 0.06, d / 2 - 0.06],
              [-(w / 2 - 0.06), d / 2 - 0.06],
              [w / 2 - 0.06, -(d / 2 - 0.06)],
              [-(w / 2 - 0.06), -(d / 2 - 0.06)],
            ].map(([lx, lz], i) => (
              <mesh key={i} position={[lx, (TABLE_TOP_H - 0.05) / 2, lz]} castShadow>
                <boxGeometry args={[0.08, TABLE_TOP_H - 0.05, 0.08]} />
                <meshStandardMaterial color={C.leg} />
              </mesh>
            ))}
          </>
        )}

        {/* Chairs around the table */}
        {Array.from({ length: table.capacity || 8 }).map((_, idx) => (
          <Chair3D
            key={idx}
            table={table}
            seatIndex={idx}
            fill={
              isTarget && targetSeatIndex === idx
                ? C.mine
                : idx < occupied
                  ? C.occupied
                  : seating && selectedGuest && canFit
                    ? C.fit
                    : C.free
            }
            onSeatHover={onSeatHover}
            onLeave={onLeave}
          />
        ))}

        {/* Table name label */}
        <Html
          center
          position={[0, TABLE_TOP_H + 0.25, 0]}
          distanceFactor={14}
          pointerEvents="none"
          style={{ pointerEvents: 'none' }}
        >
          <span
            style={{
              fontFamily: 'Poppins, sans-serif',
              fontWeight: 700,
              fontSize: 11,
              color: '#4A3F35',
              background: 'rgba(255,253,249,0.9)',
              border: '1px solid #CBAE94',
              borderRadius: 999,
              padding: '2px 8px',
              whiteSpace: 'nowrap',
              boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
            }}
          >
            {table.name}
          </span>
        </Html>
      </group>
    </group>
  );
};

// ─── Landmark ─────────────────────────────────────────────────────

interface LandmarkProps {
  floorMap: FloorMapData;
  landmark: LandmarkElement;
  onLandmarkHover?: FloorPlan3DProps['onLandmarkHover'];
  onLeave?: () => void;
}

const LandmarkBox = ({ w, h, d, x = 0, y = 0, z = 0, c }: { w: number; h: number; d: number; x?: number; y?: number; z?: number; c: string }) => (
  <mesh position={[x, y, z]} castShadow receiveShadow>
    <boxGeometry args={[w, h, d]} />
    <meshStandardMaterial color={c} />
  </mesh>
);

const LandmarkCyl = ({ r, h, x = 0, y = 0, z = 0, c }: { r: number; h: number; x?: number; y?: number; z?: number; c: string }) => (
  <mesh position={[x, y, z]} castShadow receiveShadow>
    <cylinderGeometry args={[r, r, h, 20]} />
    <meshStandardMaterial color={c} />
  </mesh>
);

const Landmark3D = ({ floorMap, landmark, onLandmarkHover, onLeave }: LandmarkProps) => {
  const pos = toWorld(floorMap, landmark.x + landmark.width / 2, landmark.y + landmark.height / 2);
  const w = landmark.width * WORLD_SCALE;
  const d = landmark.height * WORLD_SCALE;
  const events = useHover({
    onOver: (e) => onLandmarkHover?.(landmark, e.clientX, e.clientY),
    onMove: (e) => onLandmarkHover?.(landmark, e.clientX, e.clientY),
    onLeave,
  });

  const base = LANDMARK_COLORS[landmark.type] || '#A09080';
  let labelY = LANDMARK_H + 0.15;
  let body: ReactNode;

  switch (landmark.type) {
    case 'entrance': {
      const doorH = 1.0;
      const fT = 0.08;
      const doorW = w - fT * 2;
      labelY = doorH + 0.15;
      body = (
        <>
          <LandmarkBox w={w + 0.1} h={0.06} d={d + 0.1} y={0.03} c="#8B735B" />
          <LandmarkBox w={w} h={fT} d={0.12} y={doorH} c={base} />
          <LandmarkBox w={fT} h={doorH} d={0.12} x={-w / 2 + fT / 2} y={doorH / 2} c={base} />
          <LandmarkBox w={fT} h={doorH} d={0.12} x={w / 2 - fT / 2} y={doorH / 2} c={base} />
          <LandmarkBox w={doorW} h={doorH - 0.06} d={0.06} y={(doorH - 0.06) / 2} z={0.02} c="#6B4F3A" />
          <LandmarkBox w={0.04} h={0.08} d={0.04} x={doorW / 2 - 0.1} y={doorH / 2} z={0.08} c="#C9A227" />
        </>
      );
      break;
    }
    case 'stage': {
      const stageH = 0.18;
      labelY = 0.8;
      body = (
        <>
          <LandmarkBox w={w} h={stageH} d={d} y={stageH / 2} c={base} />
          <LandmarkBox w={w} h={0.65} d={0.06} y={stageH + 0.325} z={-d / 2 + 0.03} c="#8B735B" />
          <LandmarkBox w={0.12} h={0.3} d={0.12} x={-w / 2 + 0.12} y={stageH + 0.15} z={d / 2 - 0.1} c="#4A3F35" />
          <LandmarkBox w={0.12} h={0.3} d={0.12} x={w / 2 - 0.12} y={stageH + 0.15} z={d / 2 - 0.1} c="#4A3F35" />
        </>
      );
      break;
    }
    case 'restroom':
      body = (
        <>
          <LandmarkBox w={w} h={LANDMARK_H} d={d} y={LANDMARK_H / 2} c={base} />
          <LandmarkBox w={w * 0.3} h={LANDMARK_H - 0.1} d={0.04} x={-w * 0.2} y={(LANDMARK_H - 0.1) / 2} z={d / 2 + 0.01} c="#6B4F3A" />
          <LandmarkBox w={0.1} h={0.12} d={0.08} x={w * 0.25} y={0.18} z={-d * 0.2} c="#FFFDF9" />
          <LandmarkCyl r={0.07} h={0.1} x={w * 0.25} y={0.05} z={-d * 0.2} c="#FFFDF9" />
        </>
      );
      break;
    case 'gifts':
      body = (
        <>
          <LandmarkBox w={w} h={0.3} d={d} y={0.15} c="#8B735B" />
          <LandmarkBox w={w * 0.2} h={0.12} d={w * 0.2} x={-w * 0.2} y={0.36} z={-d * 0.15} c="#C53030" />
          <LandmarkBox w={w * 0.18} h={0.1} d={w * 0.18} x={w * 0.2} y={0.35} z={d * 0.15} c={base} />
        </>
      );
      break;
    case 'dessert':
      body = (
        <>
          <LandmarkBox w={w} h={0.3} d={d} y={0.15} c="#8B735B" />
          <LandmarkCyl r={Math.min(w, d) * 0.3} h={0.14} y={0.37} c={base} />
          <LandmarkCyl r={Math.min(w, d) * 0.2} h={0.12} y={0.5} c="#FFFDF9" />
        </>
      );
      break;
    case 'bar':
      body = (
        <>
          <LandmarkBox w={w} h={0.42} d={d} y={0.21} c={base} />
          <LandmarkBox w={w - 0.06} h={0.03} d={d - 0.06} y={0.42} c="#FFFDF9" />
          <LandmarkCyl r={0.025} h={0.08} x={-w * 0.25} y={0.46} c="#C53030" />
          <LandmarkCyl r={0.025} h={0.08} x={0} y={0.46} c="#4A9D6E" />
          <LandmarkCyl r={0.025} h={0.08} x={w * 0.25} y={0.46} c="#C9A227" />
        </>
      );
      break;
    case 'food':
      body = (
        <>
          <LandmarkBox w={w} h={0.3} d={d} y={0.15} c="#8B735B" />
          <LandmarkBox w={w * 0.3} h={0.08} d={d * 0.4} x={-w * 0.2} y={0.34} c="#E8E0D4" />
          <LandmarkBox w={w * 0.3} h={0.08} d={d * 0.4} x={w * 0.2} y={0.34} c="#E8E0D4" />
        </>
      );
      break;
    case 'dj':
      body = (
        <>
          <LandmarkBox w={w} h={0.42} d={d} y={0.21} c={base} />
          <LandmarkCyl r={Math.min(w, d) * 0.25} h={0.02} x={-w * 0.2} y={0.43} c="#4A3F35" />
          <LandmarkCyl r={Math.min(w, d) * 0.25} h={0.02} x={w * 0.2} y={0.43} c="#4A3F35" />
        </>
      );
      break;
    default:
      body = <LandmarkBox w={w} h={LANDMARK_H} d={d} y={LANDMARK_H / 2} c={base} />;
  }

  return (
    <group position={[pos.x, 0, pos.z]} rotation={[0, -(landmark.rotation || 0) * (Math.PI / 180), 0]} {...events}>
      {body}
      <Html
        center
        position={[0, labelY, 0]}
        distanceFactor={14}
        pointerEvents="none"
        style={{ pointerEvents: 'none' }}
      >
        <span
          style={{
            fontFamily: 'Poppins, sans-serif',
            fontWeight: 700,
            fontSize: 10,
            color: '#FFF',
            background: 'rgba(74,63,53,0.85)',
            borderRadius: 999,
            padding: '2px 8px',
            whiteSpace: 'nowrap',
          }}
        >
          {landmark.name}
        </span>
      </Html>
    </group>
  );
};

// ─── Scene ────────────────────────────────────────────────────────

const Scene = (props: FloorPlan3DProps) => {
  const { floorMap, guests } = props;
  const { width: roomW, height: roomH } = roomWorldSize(floorMap);
  const scale = Math.max(roomW, roomH);

  return (
    <>
      <ambientLight intensity={0.65} />
      <directionalLight
        position={[scale, scale * 1.5, scale * 0.8]}
        intensity={1.3}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-roomW}
        shadow-camera-right={roomW}
        shadow-camera-top={roomH}
        shadow-camera-bottom={-roomH}
        shadow-camera-near={0.5}
        shadow-camera-far={scale * 5}
      />
      <directionalLight position={[-scale, scale * 0.6, -scale * 0.8]} intensity={0.35} />

      {/* Floor */}
      {isRoomCircle(floorMap) ? (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
          <circleGeometry args={[roomRadiusWorld(floorMap), 64]} />
          <meshStandardMaterial color={C.floor} />
        </mesh>
      ) : isRoomEllipse(floorMap) ? (
        <mesh
          rotation={[-Math.PI / 2, 0, 0]}
          position={[0, -0.02, 0]}
          scale={[roomW / 2, roomH / 2, 1]}
          receiveShadow
        >
          <circleGeometry args={[1, 64]} />
          <meshStandardMaterial color={C.floor} />
        </mesh>
      ) : (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
          <planeGeometry args={[roomW, roomH]} />
          <meshStandardMaterial color={C.floor} />
        </mesh>
      )}
      <Grid
        args={[roomW, roomH]}
        position={[0, 0.01, 0]}
        cellSize={0.5}
        cellThickness={0.6}
        cellColor="#DCC9B2"
        sectionSize={2.5}
        sectionThickness={1}
        sectionColor="#C9A9B4"
        fadeDistance={scale * 5}
      />

      {floorMap.landmarks.map((lm) => (
        <Landmark3D
          key={lm.id}
          floorMap={floorMap}
          landmark={lm}
          onLandmarkHover={props.onLandmarkHover}
          onLeave={props.onLeave}
        />
      ))}

      {floorMap.tables.map((table) => (
        <Table3D
          key={table.id}
          floorMap={floorMap}
          table={table}
          guests={guests}
          selectedGuest={props.selectedGuest}
          targetTableId={props.targetTableId}
          targetSeatIndex={props.targetSeatIndex}
          seating={props.seating ?? true}
          onTableHover={props.onTableHover}
          onSeatHover={props.onSeatHover}
          onTableClick={props.onTableClick}
          onLeave={props.onLeave}
        />
      ))}

      <OrbitControls
        target={[0, 0, 0]}
        maxPolarAngle={Math.PI / 2 - 0.06}
        minDistance={scale * 0.3}
        maxDistance={scale * 5}
        enableDamping
        dampingFactor={0.12}
      />
    </>
  );
};

export const FloorPlan3D = (props: FloorPlan3DProps) => {
  const t = useT();
  const [webglOk] = useState(checkWebGL);
  const { width: roomW, height: roomH } = roomWorldSize(props.floorMap);

  const fallback = (
    <div
      className={props.className}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#FAF6F0',
        border: '1px solid #CBAE94',
        borderRadius: 16,
        color: '#5D5449',
        fontSize: 12,
        fontWeight: 700,
        padding: 16,
        textAlign: 'center',
      }}
    >
      {webglOk ? t.view3dUnavailable : t.view3dUnsupported}
    </div>
  );

  if (!webglOk) return fallback;

  return (
    <div className={props.className} style={{ position: 'relative' }}>
      <CanvasBoundary fallback={fallback}>
        <Canvas
          shadows
          dpr={[1, 2]}
          camera={{
            position: [roomW * 0.75, roomH * 1.15, roomW * 0.8],
            fov: 45,
            near: 0.05,
            far: 10000,
          }}
          onPointerMissed={props.onLeave ? () => props.onLeave?.() : undefined}
          style={{ width: '100%', height: '100%' }}
        >
          <Scene {...props} />
        </Canvas>
      </CanvasBoundary>
    </div>
  );
};
