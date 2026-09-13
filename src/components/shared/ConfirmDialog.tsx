import { createContext, useCallback, useContext, useState, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';
import { useT, useTf } from './i18n';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning';
  /** When set, the user must type this word before the confirm button enables. */
  requireText?: string;
}

interface ConfirmState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

const ConfirmContext = createContext<(options: ConfirmOptions) => Promise<boolean>>(
  () => Promise.resolve(false)
);

export const ConfirmProvider = ({ children }: { children: ReactNode }) => {
  const t = useT();
  const tf = useTf();
  const [state, setState] = useState<ConfirmState | null>(null);
  const [typed, setTyped] = useState('');

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setTyped('');
      setState({ ...options, variant: options.variant || 'danger', resolve });
    });
  }, []);

  const close = (value: boolean) => {
    state?.resolve(value);
    setState(null);
  };

  const isDanger = state?.variant === 'danger';
  const requireText = state?.requireText;
  const canConfirm = !requireText || typed.trim().toUpperCase() === requireText.toUpperCase();

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={!!state}
        onClose={() => close(false)}
        maxWidth="md"
        ariaLabel={state?.title}
        footer={
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => close(false)}
              className="px-5 min-h-[44px] rounded-xl border border-[#CBAE94] text-sm font-bold text-[#5D5449] hover:bg-[#EFE6DC] transition-colors"
            >
              {state?.cancelText || t.cancelBtn}
            </button>
            <button
              type="button"
              onClick={() => canConfirm && close(true)}
              disabled={!canConfirm}
              className={`px-5 min-h-[44px] rounded-xl text-sm font-bold text-white shadow-md transition-all ${
                isDanger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-[#8B735B] hover:bg-[#705C47]'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              {state?.confirmText || t.confirmBtn}
            </button>
          </div>
        }
      >
        {state && (
          <div className="flex items-start gap-4">
            <div
              className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${
                isDanger ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-700'
              }`}
            >
              <AlertTriangle className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="font-sans text-xl font-bold text-[#4A3F35]">{state.title}</h3>
            </div>
          </div>
        )}
        <p className="text-xs sm:text-sm text-[#5D5449] leading-relaxed">{state?.message}</p>
        {requireText && (
          <div className="mt-4 space-y-1.5">
            <label className="label-mono block text-xs font-bold">
              {tf('typeToConfirmHint', { word: requireText })}
            </label>
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={requireText}
              aria-label={tf('typeToConfirmHint', { word: requireText })}
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#CBAE94] bg-white text-sm font-mono font-bold text-[#4A3F35] focus:outline-none focus:ring-2 focus:ring-[#8B735B]"
            />
          </div>
        )}
      </Modal>
    </ConfirmContext.Provider>
  );
};

export const useConfirm = () => useContext(ConfirmContext);
