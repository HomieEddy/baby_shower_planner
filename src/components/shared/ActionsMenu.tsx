import { ReactNode, useEffect, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';

export interface ActionsMenuItem {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  danger?: boolean;
}

interface ActionsMenuProps {
  items: ActionsMenuItem[];
  /** Accessible name for the trigger (e.g. "More actions"). */
  label: string;
  className?: string;
}

// Overflow ("kebab") menu for occasional toolbar actions. Closes on outside
// mousedown and Escape. Trigger is a 44px touch target.
export const ActionsMenu = ({ items, label, className = '' }: ActionsMenuProps) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const itemClass = (danger?: boolean) =>
    `w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition-colors flex items-center gap-2 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B735B] ${
      danger ? 'text-rose-700 hover:bg-rose-50' : 'text-[#5D5449] hover:bg-[#EFE6DC]'
    }`;

  return (
    <div className={`relative shrink-0 ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        aria-expanded={open}
        aria-haspopup="menu"
        title={label}
        className="inline-flex min-w-[44px] min-h-[44px] items-center justify-center rounded-full border border-[#CBAE94] bg-white text-[#8B735B] hover:bg-[#EFE6DC] transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B735B]"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 w-48 p-1.5 rounded-2xl border border-[#CBAE94] bg-white shadow-lg">
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className={itemClass(item.danger)}
              onClick={() => { setOpen(false); item.onClick(); }}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
