import { Layout, Box } from 'lucide-react';
import { useT } from './i18n';

export type ViewMode = '2d' | '3d';

interface ViewModeToggleProps {
  value: ViewMode;
  onChange: (mode: ViewMode) => void;
  className?: string;
}

// Compact 2D/3D segmented control used on every floor-plan surface.
export const ViewModeToggle = ({ value, onChange, className = '' }: ViewModeToggleProps) => {
  const t = useT();
  const buttonClass = (active: boolean) =>
    `flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${
      active ? 'bg-[#8B735B] text-white shadow-sm' : 'text-[#8B735B] hover:bg-[#EFE6DC]/50'
    }`;

  return (
    <div
      className={`inline-flex items-center gap-1 bg-[#EFE6DC]/70 p-1 rounded-2xl border border-[#CBAE94]/70 ${className}`}
      role="group"
      aria-label={`${t.view2d} / ${t.view3d}`}
    >
      <button
        type="button"
        onClick={() => onChange('2d')}
        aria-pressed={value === '2d'}
        className={buttonClass(value === '2d')}
      >
        <Layout className="w-3.5 h-3.5" /> {t.view2d}
      </button>
      <button
        type="button"
        onClick={() => onChange('3d')}
        aria-pressed={value === '3d'}
        className={buttonClass(value === '3d')}
      >
        <Box className="w-3.5 h-3.5" /> {t.view3d}
      </button>
    </div>
  );
};
