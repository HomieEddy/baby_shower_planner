import { ReactNode, useEffect } from 'react';
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

export const Modal = ({
  open,
  onClose,
  title,
  children,
  footer,
  maxWidth = 'md',
  closeOnBackdrop = false,
  dismissible = true,
  wrapperClassName = '',
  panelClassName = '',
  contentClassName = '',
}: ModalProps) => {
  const t = useT();
  useEffect(() => {
    if (!open || !dismissible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, dismissible, onClose]);

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
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className={`relative w-full ${WIDTHS[maxWidth]} bg-[#FFFDF9] rounded-3xl shadow-2xl border-2 border-[#CBAE94] ${panelClassName}`}
          >
            {title !== undefined && (
              <div className="flex items-center justify-between border-b border-[#CBAE94]/30 px-6 py-4 print:hidden">
                <div className="min-w-0">{title}</div>
                {dismissible && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="p-1.5 rounded-full hover:bg-[#EFE6DC] text-[#5D5449] transition-colors shrink-0"
                    title={t.closeModal}
                  >
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>
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
