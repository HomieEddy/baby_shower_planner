import React, { createContext, useContext, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, Info, X, Sparkles, Heart } from 'lucide-react';
import { useT } from './i18n';

export type ToastType = 'success' | 'error' | 'info' | 'love';

export interface ToastMessage {
  id: string;
  message: string;
  type?: ToastType;
  duration?: number;
}

interface ToastContextType {
  showToast: (message: string, type?: ToastType, duration?: number) => void;
  toast: {
    success: (msg: string, duration?: number) => void;
    error: (msg: string, duration?: number) => void;
    info: (msg: string, duration?: number) => void;
    love: (msg: string, duration?: number) => void;
  };
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const tr = useT();
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback((message: string, type: ToastType = 'success', duration = 3500) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev.slice(-4), { id, message, type, duration }]); // limit to 5 visible

    if (duration > 0) {
      setTimeout(() => {
        removeToast(id);
      }, duration);
    }
  }, [removeToast]);

  const toast = {
    success: (msg: string, duration?: number) => showToast(msg, 'success', duration),
    error: (msg: string, duration?: number) => showToast(msg, 'error', duration),
    info: (msg: string, duration?: number) => showToast(msg, 'info', duration),
    love: (msg: string, duration?: number) => showToast(msg, 'love', duration),
  };

  return (
    <ToastContext.Provider value={{ showToast, toast }}>
      {children}

      {/* Floating Toast Container */}
      <div
        aria-live="polite"
        className="fixed bottom-5 left-4 right-4 sm:left-auto sm:right-5 z-[9999] flex flex-col gap-2.5 max-w-sm w-auto sm:w-full pointer-events-none"
      >
        <AnimatePresence>
          {toasts.map((t) => (
            <motion.div
              key={t.id}
              initial={{ opacity: 0, y: 20, scale: 0.92 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.25, ease: 'easeOut' }}
              className={`pointer-events-auto flex items-center justify-between gap-3 p-3.5 pr-4 rounded-2xl shadow-xl border backdrop-blur-md transition-all ${
                t.type === 'error'
                  ? 'bg-[#FFF5F5] border-rose-200 text-rose-900'
                  : t.type === 'info'
                  ? 'bg-[#F0F7FF] border-sky-200 text-sky-900'
                  : t.type === 'love'
                  ? 'bg-[#FFF0F5] border-pink-200 text-pink-900'
                  : 'bg-[#FFFDF9] border-[#CBAE94]/60 text-[#4A3F35]'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                    t.type === 'error'
                      ? 'bg-rose-100 text-rose-600'
                      : t.type === 'info'
                      ? 'bg-sky-100 text-sky-600'
                      : t.type === 'love'
                      ? 'bg-pink-100 text-pink-600'
                      : 'bg-[#EFE6DC] text-[#8B735B]'
                  }`}
                >
                  {t.type === 'error' ? (
                    <AlertCircle className="w-4 h-4" />
                  ) : t.type === 'info' ? (
                    <Info className="w-4 h-4" />
                  ) : t.type === 'love' ? (
                    <Heart className="w-4 h-4 fill-pink-500 text-pink-500" />
                  ) : (
                    <Sparkles className="w-4 h-4 text-[#8B735B]" />
                  )}
                </div>

                <p className="text-xs font-bold leading-snug break-words">{t.message}</p>
              </div>

              <button
                type="button"
                onClick={() => removeToast(t.id)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-black/5 transition-colors shrink-0"
                title={tr.closeModal}
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};
