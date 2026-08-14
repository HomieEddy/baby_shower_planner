import { Group, Circle, Rect, Text, Line, Arc } from 'react-konva';
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
    case 'entrance':
      return (
        <Group>
          <Rect width={w} height={h} fill={bg} stroke={s} strokeWidth={sw} cornerRadius={6} shadowColor="rgba(0,0,0,0.08)" shadowBlur={4} />
          <Rect x={4} y={4} width={w / 2 - 6} height={h - 8} fill="#E8E0D4" cornerRadius={[4, 0, 0, 4]} stroke="#D4C9B5" strokeWidth={1} />
          <Rect x={w / 2 + 2} y={4} width={w / 2 - 6} height={h - 8} fill="#E8E0D4" cornerRadius={[0, 4, 4, 0]} stroke="#D4C9B5" strokeWidth={1} />
          <Circle x={w / 2 - 6} y={h / 2} radius={1.5} fill="#8B735B" />
          <Circle x={w / 2 + 6} y={h / 2} radius={1.5} fill="#8B735B" />
          <Arc x={w / 2} y={2} innerRadius={w * 0.3} outerRadius={w * 0.3} angle={180} rotation={180} stroke="#D4C9B5" strokeWidth={1} />
          <Text text={landmark.name} x={0} y={h - 14} width={w} align="center" fontSize={8} fontStyle="bold" fill="#4A3F35" />
        </Group>
      );
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
    case 'photobooth':
      return (
        <Group>
          <Rect width={w} height={h} fill={bg} stroke={s} strokeWidth={sw} cornerRadius={10} shadowColor="rgba(0,0,0,0.08)" shadowBlur={4} />
          <Rect x={w / 2 - 12} y={h * 0.25} width={24} height={18} fill="#4A3F35" cornerRadius={4} />
          <Rect x={w / 2 - 8} y={h * 0.3} width={16} height={10} fill="#FAF6F0" cornerRadius={2} />
          <Circle x={w / 2} y={h * 0.35} radius={3} fill="#4A3F35" />
          <Rect x={w / 2 - 3} y={h * 0.2} width={6} height={4} fill="#D4A373" cornerRadius={1} />
          <Line points={[w / 2, h * 0.85, w / 2 - 10, h]} stroke="#8B735B" strokeWidth={2} />
          <Line points={[w / 2, h * 0.85, w / 2 + 10, h]} stroke="#8B735B" strokeWidth={2} />
          <Line points={[w / 2 - 10, h, w / 2 + 10, h]} stroke="#8B735B" strokeWidth={2} />
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
