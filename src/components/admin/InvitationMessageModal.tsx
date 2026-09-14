import { useRef, useState } from 'react';
import { RotateCcw, AlertTriangle } from 'lucide-react';
import { Modal } from '../shared/Modal';
import { Segmented } from '../shared/Segmented';
import { useT } from '../shared/i18n';
import type { EventSettings } from '../../types';
import {
  DEFAULT_INVITATION_TEMPLATE,
  INVITATION_PLACEHOLDERS,
  invitationTemplateValues,
  renderInvitationTemplate,
  resolveInvitationTemplate,
} from '../../lib/invitationTemplate';

interface InvitationMessageModalProps {
  open: boolean;
  onClose: () => void;
  settings?: EventSettings | null;
  onSave: (templates: { invitationTemplateFr: string; invitationTemplateEn: string }) => void;
}

// Rich-ish, dependency-free editor for the self-serve invitation message:
// a textarea, placeholder chips that splice tokens at the cursor, and a live
// preview rendered with the current event settings.
export const InvitationMessageModal = ({ open, onClose, settings, onSave }: InvitationMessageModalProps) => {
  const t = useT();
  const [lang, setLang] = useState<'FR' | 'EN'>('FR');
  // Seeded on mount (the parent remounts this tab once settings load). Closing
  // without saving re-seeds, so Cancel discards edits.
  const initialFr = resolveInvitationTemplate(settings?.invitationTemplateFr, 'FR');
  const initialEn = resolveInvitationTemplate(settings?.invitationTemplateEn, 'EN');
  const [fr, setFr] = useState(initialFr);
  const [en, setEn] = useState(initialEn);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const discardAndClose = () => {
    setFr(initialFr);
    setEn(initialEn);
    setLang('FR');
    onClose();
  };

  const current = lang === 'FR' ? fr : en;
  const setCurrent = (value: string) => (lang === 'FR' ? setFr(value) : setEn(value));

  const insertToken = (token: string) => {
    const ta = textareaRef.current;
    const snippet = `{{${token}}}`;
    const start = ta?.selectionStart ?? current.length;
    const end = ta?.selectionEnd ?? start;
    const next = current.slice(0, start) + snippet + current.slice(end);
    setCurrent(next);
    requestAnimationFrame(() => {
      const pos = start + snippet.length;
      ta?.focus();
      ta?.setSelectionRange(pos, pos);
    });
  };

  const registerLink = `${window.location.origin}/register`;
  const preview = renderInvitationTemplate(
    current,
    // Sample a guest name + code so the per-guest tokens render in the preview.
    invitationTemplateValues(settings ?? {}, lang, registerLink, { guestName: 'Marie', code: '1234' })
  );
  const missingLink = !/\{\{\s*(registerLink|rsvpLink)\s*\}\}/.test(current);

  return (
    <Modal
      open={open}
      onClose={discardAndClose}
      maxWidth="2xl"
      title={<h3 className="font-sans text-xl font-bold text-[#4A3F35]">{t.editInvitationMessageBtn}</h3>}
      footer={
        <div className="flex items-center justify-end gap-3">
          <button
            type="button"
            onClick={discardAndClose}
            className="px-5 min-h-[44px] rounded-xl border border-[#CBAE94] text-sm font-bold text-[#5D5449] hover:bg-[#EFE6DC] transition-colors"
          >
            {t.cancelBtn}
          </button>
          <button
            type="button"
            onClick={() => { onSave({ invitationTemplateFr: fr, invitationTemplateEn: en }); onClose(); }}
            className="px-5 min-h-[44px] rounded-xl bg-[#8B735B] hover:bg-[#705C47] text-white text-sm font-bold shadow-md transition-colors"
          >
            {t.saveChangesBtn}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented
            ariaLabel={t.inviteMessageLabel}
            value={lang}
            onChange={setLang}
            options={[
              { value: 'FR', label: t.presetFrench },
              { value: 'EN', label: t.presetEnglish },
            ]}
          />
          <button
            type="button"
            onClick={() => setCurrent(DEFAULT_INVITATION_TEMPLATE[lang])}
            className="inline-flex items-center gap-1.5 px-3 min-h-[44px] rounded-xl border border-[#CBAE94] text-xs font-bold text-[#8B735B] hover:bg-[#EFE6DC] transition-colors"
          >
            <RotateCcw className="w-3.5 h-3.5" /> {t.resetToDefaultBtn}
          </button>
        </div>

        <div className="space-y-2">
          <p className="text-xs text-[#5D5449]">{t.invitationMessageHint}</p>
          <div className="flex flex-wrap gap-1.5">
            {INVITATION_PLACEHOLDERS.map((ph) => (
              <button
                key={ph.token}
                type="button"
                onClick={() => insertToken(ph.token)}
                className="px-2.5 py-1.5 rounded-full border border-[#CBAE94] bg-white hover:bg-[#EFE6DC] text-xs font-bold text-[#5D5449] transition-colors"
                title={`{{${ph.token}}}`}
              >
                {t[ph.labelKey as keyof typeof t] as string}
              </button>
            ))}
          </div>
        </div>

        <textarea
          ref={textareaRef}
          rows={14}
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          aria-label={t.inviteMessageLabel}
          className="w-full px-3.5 py-2.5 rounded-2xl border border-[#CBAE94] text-xs font-mono leading-relaxed text-[#4A3F35] bg-white focus:outline-none focus:ring-2 focus:ring-[#8B735B] resize-y"
        />

        {missingLink && (
          <p className="flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> {t.invitationMessageMissingLinkWarn}
          </p>
        )}

        <div className="space-y-1.5">
          <span className="label-mono block text-xs font-bold text-[#8B735B]">{t.invitationMessagePreviewLabel}</span>
          <pre className="whitespace-pre-wrap break-words rounded-2xl border border-[#CBAE94] bg-[#FAF6F0] p-3.5 text-xs leading-relaxed text-[#4A3F35] font-sans max-h-56 overflow-y-auto">
            {preview}
          </pre>
        </div>
      </div>
    </Modal>
  );
};
