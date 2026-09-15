import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useT, useTf } from './i18n';

interface PaginationProps {
  page: number;
  totalPages: number;
  rangeStart: number;
  rangeEnd: number;
  total: number;
  onPageChange: (page: number) => void;
  className?: string;
}

// Shared footer control for the paginated admin lists. Renders nothing for a
// single page so short lists stay uncluttered.
export const Pagination = ({
  page,
  totalPages,
  rangeStart,
  rangeEnd,
  total,
  onPageChange,
  className = '',
}: PaginationProps) => {
  const t = useT();
  const tf = useTf();
  if (totalPages <= 1) return null;

  const btn =
    'inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-xl border border-[#CBAE94] bg-white text-[#5D5449] hover:bg-[#EFE6DC] disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer';

  return (
    <nav
      aria-label={t.paginationLabel}
      className={`flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#CBAE94]/30 ${className}`}
    >
      <span className="text-xs font-mono font-bold text-[#8B735B]">
        {tf('paginationRange', { from: rangeStart, to: rangeEnd, total })}
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className={btn}
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label={t.paginationPrev}
          title={t.paginationPrev}
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-xs font-mono font-bold text-[#8B735B] px-1 whitespace-nowrap">
          {tf('paginationPageOf', { page, total: totalPages })}
        </span>
        <button
          type="button"
          className={btn}
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label={t.paginationNext}
          title={t.paginationNext}
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </nav>
  );
};
