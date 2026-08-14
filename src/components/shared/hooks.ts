import { useCallback, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TableElement } from '../../types';
import { useToast } from './ToastContext';

// Copy text to the clipboard and flash feedback for `key` for 2 seconds.
export function useCopyFeedback() {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copy = useCallback(async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard blocked */
    }
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  }, []);
  return { copiedKey, copy };
}

// Toast + delayed window.print(): lets the toast render before the print dialog.
export function usePrint() {
  const { toast } = useToast();
  return useCallback(
    (msg: string, delay = 400) => {
      toast.info(msg);
      setTimeout(() => window.print(), delay);
    },
    [toast]
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
