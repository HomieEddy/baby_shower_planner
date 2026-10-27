import { ReactNode } from 'react';

interface AdminToolbarProps {
  /** Search + view/actions — one full-width row. */
  primary: ReactNode;
  /** Filter controls — their own row, horizontally scrollable when tight. */
  secondary?: ReactNode;
  className?: string;
}

// The one responsive admin toolbar: a primary row (search + view/actions) and
// an optional secondary row (filters). The filter row wraps onto a second
// line on phones instead of hiding filters off screen.
export const AdminToolbar = ({ primary, secondary, className = '' }: AdminToolbarProps) => (
  <div className={`flex flex-col gap-2 ${className}`}>
    <div className="flex w-full min-w-0 items-center gap-2">{primary}</div>
    {secondary !== undefined && (
      <div className="flex w-full min-w-0 flex-wrap items-center gap-2">
        {secondary}
      </div>
    )}
  </div>
);
