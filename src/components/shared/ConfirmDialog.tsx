import { createContext, useCallback, useContext, useState, ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Modal } from './Modal';

export interface ConfirmOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  variant?: 'danger' | 'warning';
}

interface ConfirmState extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

const ConfirmContext = createContext<(options: ConfirmOptions) => Promise<boolean>>(
  () => Promise.resolve(false)
);

export const ConfirmProvider = ({ children }: { children: ReactNode }) => {
  const [state, setState] = useState<ConfirmState | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => {
    return new Promise<boolean>((resolve) => {
      setState({ ...options, variant: options.variant || 'danger', resolve });
    });
  }, []);

  const close = (value: boolean) => {
    state?.resolve(value);
    setState(null);
  };

  const isDanger = state?.variant === 'danger';

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Modal
        open={!!state}
        onClose={() => close(false)}
        maxWidth="md"
        footer={
          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => close(false)}
              className="px-4 py-2.5 rounded-xl border border-[#CBAE94] text-xs font-bold text-[#5D5449] hover:bg-[#EFE6DC] transition-colors"
            >
              {state?.cancelText || 'Cancel'}
            </button>
            <button
              type="button"
              onClick={() => close(true)}
              className={`px-4 py-2.5 rounded-xl text-xs font-bold text-white shadow-md transition-all ${
                isDanger ? 'bg-rose-600 hover:bg-rose-700' : 'bg-[#8B735B] hover:bg-[#705C47]'
              }`}
            >
              {state?.confirmText || 'Confirm'}
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
      </Modal>
    </ConfirmContext.Provider>
  );
};

export const useConfirm = () => useContext(ConfirmContext);
