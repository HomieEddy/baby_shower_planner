import { useEffect, useLayoutEffect, useRef, type RefObject } from 'react';

interface CanvasWheelZoomOptions {
  /** Scrollable wrapper around the Konva stage. */
  scrollRef: RefObject<HTMLElement | null>;
  stageRef: RefObject<any>;
  /** Current stage scale, in px per map unit. */
  scale: number;
  onZoomStep?: (factor: number) => void;
  /** Turn the listener off while the canvas isn't mounted. */
  enabled?: boolean;
}

/**
 * Ctrl/Cmd + wheel zoom that keeps the map point under the cursor fixed.
 * Uses a native listener so the browser's own page zoom can be cancelled.
 */
export const useCanvasWheelZoom = ({
  scrollRef,
  stageRef,
  scale,
  onZoomStep,
  enabled = true,
}: CanvasWheelZoomOptions) => {
  // The map point under the cursor when a zoom step started.
  const anchorRef = useRef<{ mapX: number; mapY: number; clientX: number; clientY: number } | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !enabled || !onZoomStep) return;
    const handleWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const stage = stageRef.current;
      if (stage) {
        const rect = stage.container().getBoundingClientRect();
        anchorRef.current = {
          mapX: (e.clientX - rect.left) / scale,
          mapY: (e.clientY - rect.top) / scale,
          clientX: e.clientX,
          clientY: e.clientY,
        };
      }
      onZoomStep(e.deltaY < 0 ? 1.1 : 1 / 1.1);
    };
    el.addEventListener('wheel', handleWheel, { passive: false });
    return () => el.removeEventListener('wheel', handleWheel);
  }, [scrollRef, stageRef, scale, onZoomStep, enabled]);

  // After a zoom step, scroll so the anchored map point is back under the cursor.
  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const stage = stageRef.current;
    const el = scrollRef.current;
    if (!anchor || !stage || !el) return;
    anchorRef.current = null;
    const rect = stage.container().getBoundingClientRect();
    const dx = rect.left + anchor.mapX * scale - anchor.clientX;
    const dy = rect.top + anchor.mapY * scale - anchor.clientY;
    el.scrollLeft += dx;
    // Vertical scroll is usually the page's, not the wrapper's.
    if (el.scrollHeight > el.clientHeight) el.scrollTop += dy;
    else window.scrollBy(0, dy);
  }, [scale, scrollRef, stageRef]);
};
