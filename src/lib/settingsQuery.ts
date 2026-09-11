// Event settings access. One React Query path (key: ['settings']) replacing the
// bespoke Zustand store — every other fetched resource already uses React Query.

import { useQuery, type QueryClient } from '@tanstack/react-query';
import type { EventSettings } from '../types';
import { adminFetch } from './api';

export const settingsQueryKey = ['settings'] as const;

async function fetchSettings(): Promise<EventSettings | null> {
  // adminFetch: the host (when logged in) gets the full settings incl. reminder
  // contacts; guests get the scrubbed public shape.
  const res = await adminFetch('/api/settings');
  const data = await res.json();
  return (data.settings ?? null) as EventSettings | null;
}

// Read the event settings. Returns null until loaded (matches the old store's
// initial value), so existing `settings?.x` call sites are unchanged.
export function useSettings(): EventSettings | null {
  const { data } = useQuery({
    queryKey: settingsQueryKey,
    queryFn: fetchSettings,
    // Settings change only through the admin save, which writes the cache.
    staleTime: Infinity,
  });
  return data ?? null;
}

// Push a fresh settings object into the cache without another network call.
export function setSettingsCache(queryClient: QueryClient, settings: EventSettings): void {
  queryClient.setQueryData(settingsQueryKey, settings);
}
