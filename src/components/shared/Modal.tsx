import { ReactNode, useEffect, useRef } from 'react';
import { useT } from './i18n';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  /** Renders a header row with the title and a close button. */
  title?: ReactNode;
  /** Content area (scrolls if taller than the viewport). */
  children: ReactNode;
  /** Optional footer row below the content. */
  footer?: ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  /** Clicking the backdrop closes the modal. Defaults to false to preserve pre-refactor behavior. */
  closeOnBackdrop?: boolean;
  /** When false, escape key and backdrop never close the modal. */
  dismissible?: boolean;
  /** Accessible name when `title` is not plain text. */
  ariaLabel?: string;
  /** Extra classes on the outer fixed wrapper (e.g. print overrides). */
  wrapperClassName?: string;
  /** Extra classes on the panel card. */
  panelClassName?: string;
  /** Extra classes on the scrollable content area. */
  contentClassName?: string;
}

const WIDTHS: Record<NonNullable<ModalProps['maxWidth']>, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-2xl',
  '2xl': 'max-w-3xl',
};

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])';

export const Modal = ({
  open,
  onClose,
  title,
  children,
  footer,
  maxWidth = 'md',
  closeOnBackdrop = false,
  dismissible = true,
  ariaLabel,
  wrapperClassName = '',
  panelClassName = '',
  contentClassName = '',
}: ModalProps) => {
  const t = useT();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !dismissible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, dismissible, onClose]);

  // Focus trap + scroll lock: one shared fix covering every modal in the app.
  useEffect(() => {
    if (!open) return;
    const prevActive = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const panel = panelRef.current;
    const initial = panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel;
    initial?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
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
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <div className={`fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm ${wrapperClassName}`}>
          {dismissible && (
            <motion.div
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={closeOnBackdrop ? onClose : undefined}
            />
          )}
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={typeof title === 'string' ? title : ariaLabel}
            tabIndex={-1}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={`relative w-full ${WIDTHS[maxWidth]} bg-[#FFFDF9] rounded-3xl shadow-2xl border-2 border-[#CBAE94] outline-none ${panelClassName}`}
          >
            {title !== undefined && (
              <div className="flex items-center justify-between border-b border-[#CBAE94]/30 px-6 py-4 print:hidden">
                <div className="min-w-0">{title}</div>
                {dismissible && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="p-2 -mr-1 rounded-full hover:bg-[#EFE6DC] text-[#5D5449] transition-colors shrink-0"
                    aria-label={t.closeModal}
                    title={t.closeModal}
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>
            )}
            {title === undefined && dismissible && (
              <button
                type="button"
                onClick={onClose}
                className="absolute top-3 right-3 z-10 p-2 rounded-full hover:bg-[#EFE6DC] text-[#5D5449] transition-colors print:hidden"
                aria-label={t.closeModal}
                title={t.closeModal}
              >
                <X className="w-5 h-5" />
              </button>
            )}
            <div className={`px-6 py-5 overflow-y-auto max-h-[85vh] ${contentClassName}`}>{children}</div>
            {footer !== undefined && (
              <div className="px-6 py-4 border-t border-[#CBAE94]/30 print:hidden">{footer}</div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
