import { useState, useEffect, useCallback, useRef } from 'react';
import { FloorMapData, Guest, TableElement } from '../../types';

export function useSeatingHistory(
  floorMap: FloorMapData | null,
  floorMapId: string,
  guests: Guest[],
  setFloorMap: (m: FloorMapData) => void,
  setGuests: (g: Guest[]) => void,
  saveFloorMap: (m: FloorMapData) => Promise<void>,
  notify: (msg: string | null) => void
) {
  const [fullHistory, setFullHistory] = useState<{ tables: TableElement[]; guests: Guest[] }[]>([]);
  const [historyIndex, setHistoryIndex] = useState<number>(-1);

  const floorMapRef = useRef(floorMap);
  floorMapRef.current = floorMap;
  const guestsRef = useRef(guests);
  guestsRef.current = guests;

  const seatingHistory = fullHistory.map((h) => h.tables);

  const pushSeatingHistory = useCallback((tables: FloorMapData['tables']) => {
    setFullHistory((prev) => {
      const next = prev.slice(0, historyIndex + 1);
      next.push({
        tables: JSON.parse(JSON.stringify(tables)),
        guests: JSON.parse(JSON.stringify(guestsRef.current)),
      });
      setHistoryIndex(next.length - 1);
      return next;
    });
  }, [historyIndex]);

  const restoreSnapshot = useCallback(async (targetIndex: number, label: string) => {
    const snapshot = fullHistory[targetIndex];
    if (!snapshot || !floorMapRef.current) return;

    const mapClone: FloorMapData = {
      ...floorMapRef.current,
      tables: JSON.parse(JSON.stringify(snapshot.tables)),
    };
    const guestsClone = JSON.parse(JSON.stringify(snapshot.guests));

    setFloorMap(mapClone);
    setGuests(guestsClone);
    setHistoryIndex(targetIndex);

    try {
      await saveFloorMap(mapClone);
      for (const g of guestsClone) {
        await fetch('/api/floorplan/assign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ guestId: g.id, tableId: g.table_id || null }),
        });
      }
    } catch (err) {
      console.error(`Failed to persist ${label} state:`, err);
    }

    notify(label === 'undo' ? '\u21A9\uFE0F Undid seating change' : '\u21AA\uFE0F Redid seating change');
    setTimeout(() => notify(null), 2500);
  }, [fullHistory, setFloorMap, setGuests, saveFloorMap, notify]);

  const handleUndo = useCallback(async () => {
    if (historyIndex <= 0) return;
    await restoreSnapshot(historyIndex - 1, 'undo');
  }, [historyIndex, restoreSnapshot]);

  const handleRedo = useCallback(async () => {
    if (historyIndex >= fullHistory.length - 1) return;
    await restoreSnapshot(historyIndex + 1, 'redo');
  }, [historyIndex, fullHistory.length, restoreSnapshot]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (e.target as HTMLElement)?.tagName;
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes(activeTag)) return;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          e.preventDefault();
          handleRedo();
        } else {
          e.preventDefault();
          handleUndo();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        handleRedo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleUndo, handleRedo]);

  return { seatingHistory, historyIndex, pushSeatingHistory, handleUndo, handleRedo };
}
