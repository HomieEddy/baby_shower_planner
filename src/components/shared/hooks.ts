import { useCallback, useState } from 'react';
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
