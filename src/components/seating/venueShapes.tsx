import { Group, Circle, Ellipse, Rect, Text, Line } from 'react-konva';
import { TableElement, LandmarkElement } from '../../types';

// ─── Premium Table Body (drop-in for basic shapes) ──────────────

interface TableBodyProps {
  table: TableElement;
  isSelected: boolean;
}

export const renderTableBody = ({ table, isSelected }: TableBodyProps) => {
  const strokeColor = isSelected ? '#4A3F35' : '#D4C9B5';
  const strokeW = isSelected ? 3 : 1.5;
  const fillColor = '#FFFDF9';

  if (table.shape === 'circle') {
    const r = table.width / 2;
    return (
      <Group>
        <Circle x={r + 2} y={r + 3} radius={r + 1} fill="rgba(0,0,0,0.08)" />
        <Circle x={r} y={r} radius={r} fill={fillColor} stroke={strokeColor} strokeWidth={strokeW} />
        <Circle x={r} y={r} radius={r * 0.85} fill={fillColor === '#FFFDF9' ? '#FAF6F0' : '#F5F0E8'} />
        <Circle x={r} y={r} radius={r * 0.4} fill="rgba(212, 163, 115, 0.08)" />
        <Circle x={r} y={r} radius={4} fill="#D4A373" opacity={0.6} />
        <Circle x={r} y={r} radius={1.5} fill="#D4A373" />
      </Group>
    );
  }

  return (
    <Group>
      <Rect x={3} y={4} width={table.width} height={table.height} cornerRadius={14} fill="rgba(0,0,0,0.06)" />
      <Rect width={table.width} height={table.height} fill={fillColor} stroke={strokeColor} strokeWidth={strokeW} cornerRadius={14} />
      <Rect x={4} y={4} width={table.width - 8} height={table.height - 8} fill={fillColor === '#FFFDF9' ? '#FAF6F0' : '#F5F0E8'} cornerRadius={12} />
      <Line points={[table.width * 0.2, table.height / 2, table.width * 0.8, table.height / 2]} stroke="#E8E0D4" strokeWidth={1} dash={[4, 4]} />
    </Group>
  );
};

// ─── Premium Landmark Rendering ──────────────────────────────────

export const renderLandmark = (landmark: LandmarkElement, isSelected: boolean) => {
  const w = landmark.width;
  const h = landmark.height;
  const s = isSelected ? '#4A3F35' : '#8B735B';
  const sw = isSelected ? 3 : 1.5;
  const bg = isSelected ? 'rgba(239,230,220,1)' : 'rgba(250,246,240,1)';

  switch (landmark.type) {
    case 'entrance': {
      const dX = w * 0.2;
      const dW = w * 0.6;
      const dTop = 4;
      const dBot = h - 16;
      const dH = dBot - dTop;
      return (
        <Group>
          <Rect width={w} height={h} fill={bg} stroke={s} strokeWidth={sw} cornerRadius={6} shadowColor="rgba(0,0,0,0.08)" shadowBlur={4} />
          {/* step / threshold */}
          <Rect x={dX - 5} y={dBot} width={dW + 10} height={6} fill="#D4C9B5" cornerRadius={[2, 2, 0, 0]} />
          {/* door frame */}
          <Rect x={dX} y={dTop} width={dW} height={dH} fill="#8B735B" cornerRadius={3} />
          {/* door leaf */}
          <Rect x={dX + 4} y={dTop + 4} width={dW - 8} height={dH - 8} fill="#A98D6B" cornerRadius={2} />
          {/* inset panels */}
          <Rect x={dX + 10} y={dTop + 9} width={dW - 20} height={(dH - 22) * 0.42} fill="#8B735B" cornerRadius={1} />
          <Rect x={dX + 10} y={dTop + 13 + (dH - 22) * 0.42} width={dW - 20} height={(dH - 22) * 0.42} fill="#8B735B" cornerRadius={1} />
          {/* handle */}
          <Circle x={dX + dW - 13} y={dTop + dH / 2} radius={2} fill="#C9A227" />
          <Text text={landmark.name} x={0} y={h - 14} width={w} align="center" fontSize={8} fontStyle="bold" fill="#4A3F35" />
        </Group>
      );
    }
    case 'stage':
      return (
        <Group>
          <Rect width={w} height={h} fill={bg} stroke={s} strokeWidth={sw} cornerRadius={8} shadowColor="rgba(0,0,0,0.15)" shadowBlur={8} shadowOffsetY={-2} />
          <Rect x={0} y={h - 4} width={w} height={4} fill="#D4A373" cornerRadius={[0, 0, 8, 8]} />
          {[0.2, 0.4, 0.5, 0.6, 0.8].map((p, i) => (
            <Line key={i} points={[w * p, 0, w * p, h - 4]} stroke="#D4C9B5" strokeWidth={0.5} dash={[2, 2]} />
          ))}
          <Rect x={w / 2 - 12} y={6} width={24} height={18} fill="#8B735B" cornerRadius={4} />
          <Circle x={w / 2} y={20} radius={4} fill="#D4A373" />
          <Text text={landmark.name} x={0} y={h - 16} width={w} align="center" fontSize={8} fontStyle="bold" fill="#4A3F35" />
        </Group>
      );
    case 'gifts':
      return (
        <Group>
          <Rect width={w} height={h} fill={bg} stroke={s} strokeWidth={sw} cornerRadius={10} shadowColor="rgba(0,0,0,0.08)" shadowBlur={4} />
          <Rect x={w * 0.3} y={h * 0.35} width={w * 0.4} height={h * 0.4} fill="#D4A373" cornerRadius={3} />
          <Rect x={w * 0.38} y={h * 0.25} width={w * 0.24} height={h * 0.25} fill="#CBAE94" cornerRadius={3} />
          <Line points={[w * 0.5, h * 0.25, w * 0.5, h * 0.75]} stroke="#FAF6F0" strokeWidth={1.5} />
          <Line points={[w * 0.38, h * 0.38, w * 0.62, h * 0.38]} stroke="#FAF6F0" strokeWidth={1} />
          <Rect x={w * 0.15} y={h * 0.5} width={w * 0.2} height={h * 0.25} fill="#C53030" cornerRadius={2} opacity={0.8} />
          <Line points={[w * 0.25, h * 0.5, w * 0.25, h * 0.75]} stroke="#FAF6F0" strokeWidth={1} />
          <Text text={landmark.name} x={0} y={h - 14} width={w} align="center" fontSize={8} fontStyle="bold" fill="#4A3F35" />
        </Group>
      );
    case 'restroom':
      return (
        <Group>
          <Rect width={w} height={h} fill={bg} stroke={s} strokeWidth={sw} cornerRadius={10} shadowColor="rgba(0,0,0,0.08)" shadowBlur={4} />
          {/* door */}
          <Rect x={6} y={h * 0.35} width={w * 0.26} height={h * 0.6} fill="#8B735B" cornerRadius={2} />
          <Circle x={6 + w * 0.26 - 6} y={h * 0.65} radius={1.5} fill="#C9A227" />
          {/* toilet: tank + bowl */}
          <Rect x={w * 0.55} y={h * 0.18} width={w * 0.18} height={h * 0.26} fill="#FFFDF9" cornerRadius={2} stroke="#D4C9B5" strokeWidth={1} />
          <Ellipse x={w * 0.64} y={h * 0.56} radiusX={w * 0.11} radiusY={h * 0.15} fill="#FFFDF9" stroke="#D4C9B5" strokeWidth={1} />
          {/* sink */}
          <Rect x={w * 0.42} y={h * 0.56} width={w * 0.2} height={h * 0.12} fill="#FFFDF9" cornerRadius={2} stroke="#D4C9B5" strokeWidth={1} />
          <Circle x={w * 0.52} y={h * 0.63} radius={2.5} fill="#7FB3D5" />
          <Text text={landmark.name} x={0} y={h - 14} width={w} align="center" fontSize={8} fontStyle="bold" fill="#4A3F35" />
        </Group>
      );
    case 'dessert':
      return (
        <Group>
          <Rect width={w} height={h} fill={bg} stroke={s} strokeWidth={sw} cornerRadius={10} shadowColor="rgba(0,0,0,0.08)" shadowBlur={4} />
          <Rect x={w / 2 - 18} y={h * 0.5} width={36} height={10} fill="#D4A373" cornerRadius={2} />
          <Rect x={w / 2 - 12} y={h * 0.35} width={24} height={8} fill="#CBAE94" cornerRadius={2} />
          <Rect x={w / 2 - 6} y={h * 0.2} width={12} height={6} fill="#E8E0D4" cornerRadius={2} />
          <Circle x={w / 2} y={h * 0.15} radius={2} fill="#D4A373" />
          <Line points={[w / 2, h * 0.12, w / 2, h * 0.18]} stroke="#D4A373" strokeWidth={1} />
          <Text text={landmark.name} x={0} y={h - 14} width={w} align="center" fontSize={8} fontStyle="bold" fill="#4A3F35" />
        </Group>
      );
    case 'bar':
      return (
        <Group>
          <Rect width={w} height={h} fill={bg} stroke={s} strokeWidth={sw} cornerRadius={8} shadowColor="rgba(0,0,0,0.08)" shadowBlur={4} />
          <Rect x={6} y={6} width={w - 12} height={h * 0.45} fill="#8B735B" cornerRadius={4} />
          <Line points={[w * 0.15, h * 0.65, w * 0.15, h * 0.85]} stroke="#8B735B" strokeWidth={1.5} />
          <Line points={[w * 0.5, h * 0.65, w * 0.5, h * 0.85]} stroke="#8B735B" strokeWidth={1.5} />
          <Line points={[w * 0.85, h * 0.65, w * 0.85, h * 0.85]} stroke="#8B735B" strokeWidth={1.5} />
          <Circle x={w * 0.15} y={h * 0.7} radius={3} fill="#D4A373" />
          <Circle x={w * 0.5} y={h * 0.7} radius={3} fill="#D4A373" />
          <Circle x={w * 0.85} y={h * 0.7} radius={3} fill="#D4A373" />
          <Text text={landmark.name} x={0} y={h - 14} width={w} align="center" fontSize={8} fontStyle="bold" fill="#FAF6F0" />
        </Group>
      );
    case 'food':
      return (
        <Group>
          <Rect width={w} height={h} fill={bg} stroke={s} strokeWidth={sw} cornerRadius={10} shadowColor="rgba(0,0,0,0.08)" shadowBlur={4} />
          <Rect x={6} y={8} width={w - 12} height={h * 0.35} fill="#D4A373" cornerRadius={4} />
          <Circle x={w * 0.25} y={h * 0.55} r={4} fill="#8B735B" />
          <Circle x={w * 0.5} y={h * 0.55} r={4} fill="#8B735B" />
          <Circle x={w * 0.75} y={h * 0.55} r={4} fill="#8B735B" />
          <Circle x={w * 0.25} y={h * 0.7} r={3} fill="#CBAE94" />
          <Circle x={w * 0.5} y={h * 0.7} r={3} fill="#CBAE94" />
          <Circle x={w * 0.75} y={h * 0.7} r={3} fill="#CBAE94" />
          <Text text={landmark.name} x={0} y={h - 14} width={w} align="center" fontSize={8} fontStyle="bold" fill="#4A3F35" />
        </Group>
      );
    default:
      return (
        <Group>
          <Rect width={w} height={h} fill={bg} stroke={s} strokeWidth={sw} cornerRadius={8} dash={[4, 4]} />
          <Text text={landmark.name} width={w} height={h} align="center" verticalAlign="middle" fontSize={10} fontStyle="bold" fill="#4A3F35" />
        </Group>
      );
  }
};
