import { useEffect, RefObject } from 'react';

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Shared dialog behavior: focus trap, initial focus, focus restoration,
 * body scroll lock, and Escape-to-close. Used by the shared Modal and the
 * custom overlays (lightbox, slideshow, venue map) so they behave alike.
 */
export function useDialogA11y(
  open: boolean,
  panelRef: RefObject<HTMLElement | null>,
  onClose?: () => void,
  dismissible = true
) {
  useEffect(() => {
    if (!open) return;
    const prevActive = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const panel = panelRef.current;
    const initial = panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel;
    initial?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && dismissible && onClose) {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !panel) return;
      const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null
      );
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
      prevActive?.focus?.();
    };
  }, [open, panelRef, onClose, dismissible]);
}
