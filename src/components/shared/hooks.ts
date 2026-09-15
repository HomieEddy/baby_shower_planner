import { useCallback, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TableElement } from '../../types';
import { useToast } from './ToastContext';
import { useActionConfirm } from './ConfirmDialog';
import { useT } from './i18n';

// Confirm, copy to the clipboard, then flash feedback for `key` for 2 seconds.
export function useCopyFeedback() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const confirmAction = useActionConfirm();
  const t = useT();
  const copy = useCallback(async (text: string, key: string, label?: string) => {
    if (!(await confirmAction(label ?? t.copyLabel))) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard blocked */
    }
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }, [confirmAction, t]);
  return { copiedKey, copy };
}

// Confirm, then toast + delayed window.print(): the toast renders before the
// print dialog.
export function usePrint() {
  const { toast } = useToast();
  const confirmAction = useActionConfirm();
  const t = useT();
  return useCallback(
    async (msg: string, delay = 400) => {
      if (!(await confirmAction(t.printLabel))) return;
      toast.info(msg);
      setTimeout(() => window.print(), delay);
    },
    [toast, confirmAction, t]
  );
}

// Client-side pagination for the long admin lists. Every list here is already
// fully fetched, so slicing in the browser is enough — no server paging. The
// page is clamped to the current page count, so filtering a list shorter than
// the current page just falls back to its last page.
export function usePagination<T>(items: T[], pageSize = 25) {
  const [storedPage, setPage] = useState(1);

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, storedPage), totalPages);

  const pageItems = useMemo(
    () => items.slice((page - 1) * pageSize, page * pageSize),
    [items, page, pageSize]
  );

  return {
    pageItems,
    page,
    setPage,
    total,
    totalPages,
    pageSize,
    rangeStart: total === 0 ? 0 : (page - 1) * pageSize + 1,
    rangeEnd: Math.min(page * pageSize, total),
  };
}

export type PaginationState = ReturnType<typeof usePagination<unknown>>;

// Fetch the floor map's tables (shared by the photo upload/gallery pages).
export function useFloorMapTables() {
  return useQuery({
    queryKey: ['floorplan-tables'],
    queryFn: async () => {
      const res = await fetch('/api/floorplan');
      const data = await res.json();
      return (data.floorMap?.tables ?? []) as TableElement[];
    },
  });
}
