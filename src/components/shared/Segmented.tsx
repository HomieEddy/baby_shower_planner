import { ReactNode } from 'react';

export interface SegmentedOption<T extends string> {
  value: T;
  /** Visible label. Omit for icon-only options and supply `ariaLabel`. */
  label?: ReactNode;
  icon?: ReactNode;
  /** Accessible name for icon-only options. */
  ariaLabel?: string;
  /** Optional count badge (e.g. filtered totals). */
  count?: number;
}

interface SegmentedProps<T extends string> {
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
  className?: string;
}

// The app's one pill/segmented control: filters, view toggles, mode switches.
// Root is shrink-0 so it keeps its size inside an overflow-x-auto toolbar strip.
export const Segmented = <T extends string,>({
  options,
  value,
  onChange,
  ariaLabel,
  className = '',
}: SegmentedProps<T>) => (
  <div
    role="group"
    aria-label={ariaLabel}
    className={`no-scrollbar inline-flex max-w-full items-center overflow-x-auto rounded-full bg-white p-1 border border-[#CBAE94] text-xs font-bold font-mono shrink-0 ${className}`}
  >
    {options.map((opt) => {
      const active = opt.value === value;
      return (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          aria-pressed={active}
          aria-label={opt.ariaLabel}
          className={`px-2.5 py-1 rounded-full transition-colors inline-flex items-center justify-center gap-1 cursor-pointer whitespace-nowrap focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B735B] ${
            active ? 'bg-[#8B735B] text-white shadow-xs' : 'text-[#5D5449] hover:text-[#8B735B]'
          }`}
        >
          {opt.icon}
          {opt.label}
          {opt.count !== undefined && (
            <span className={`px-1.5 rounded-full text-[10px] font-bold ${active ? 'bg-white/25 text-white' : 'bg-[#EFE6DC] text-[#8B735B]'}`}>
              {opt.count}
            </span>
          )}
        </button>
      );
    })}
  </div>
);
