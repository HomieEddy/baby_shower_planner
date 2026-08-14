import { CheckCircle2, Check, Copy, MessageSquare } from 'lucide-react';
import { Modal } from '../shared/Modal';
import { useCopyFeedback } from '../shared/hooks';
import { useT } from '../shared/i18n';

export const InviteSuccessModal = ({
  modal,
  onClose,
}: {
  modal: { name: string; url: string; message: string } | null;
  onClose: () => void;
}) => {
  const t = useT();
  const { copiedKey, copy } = useCopyFeedback();

  return (
    <Modal open={!!modal} onClose={onClose} maxWidth="md">
      <div className="text-center space-y-4">
        <div className="w-12 h-12 mx-auto bg-[#E9E0D2] text-[#4A3F35] rounded-full flex items-center justify-center border-2 border-[#4A3F35]">
          <CheckCircle2 className="w-6 h-6" />
        </div>
        <div className="space-y-1">
          <h3 className="font-newsreader text-2xl font-bold text-[#4A3F35]">{t.inviteCreatedTitle}</h3>
          <p className="text-xs text-[#5D5449]">{t.inviteCreatedHint.replace('{{name}}', modal?.name || '')}</p>
        </div>
        <div className="bg-white p-3.5 rounded-2xl border-2 border-[#CBAE94] font-mono text-xs text-[#5D5449] break-all select-all">
          {modal?.url}
        </div>
        <div className="bg-[#EFE6DC]/50 p-3 rounded-xl border border-[#CBAE94] whitespace-pre-wrap text-left text-[11px] text-[#5D5449] font-mono max-h-40 overflow-y-auto">
          {modal?.message}
        </div>
        <div className="flex space-x-3">
          <button
            onClick={() => copy(modal?.url || '', 'invite-url')}
            className="btn-accent flex-1 py-3 text-xs inline-flex items-center justify-center"
          >
            {copiedKey === 'invite-url' ? <Check className="w-3.5 h-3.5 mr-1.5" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
            <span>{t.copyLink}</span>
          </button>
          <button
            onClick={() => copy(modal?.message || '', 'invite-msg')}
            className="btn-outline-accent flex-1 py-3 text-xs inline-flex items-center justify-center"
          >
            {copiedKey === 'invite-msg' ? <Check className="w-3.5 h-3.5 mr-1.5" /> : <MessageSquare className="w-3.5 h-3.5 mr-1.5" />}
            <span>{t.copyMessageBtn}</span>
          </button>
        </div>
        <button onClick={onClose} className="w-full py-2 text-[#5D5449]/70 hover:text-[#5D5449] text-xs font-mono font-bold text-center">
          {t.closeModal}
        </button>
      </div>
    </Modal>
  );
};
