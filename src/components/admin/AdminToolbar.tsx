import { ReactNode } from 'react';

interface AdminToolbarProps {
  /** Search + view/actions — one full-width row. */
  primary: ReactNode;
  /** Filter controls — their own row, horizontally scrollable when tight. */
  secondary?: ReactNode;
  className?: string;
}

// The one responsive admin toolbar: a primary row (search + view/actions) and
// an optional secondary row (filters). Two tidy rows at every width — the
// filter strip scrolls instead of overlapping. Nothing wraps unpredictably.
export const AdminToolbar = ({ primary, secondary, className = '' }: AdminToolbarProps) => (
  <div className={`flex flex-col gap-2 ${className}`}>
    <div className="flex w-full min-w-0 items-center gap-2">{primary}</div>
    {secondary !== undefined && (
      <div className="no-scrollbar flex w-full min-w-0 items-center gap-2 overflow-x-auto">
        {secondary}
      </div>
    )}
  </div>
);
