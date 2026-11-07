// Shows the host how the draft alert will arrive by SMS: the text split into
// standalone texts of up to 160 characters, using the same rule as the sender.

import React from 'react';
import { MessageSquare } from 'lucide-react';
import type { AlertType, Guest, Language } from '../../types';
import type { Translations } from '../../translations';
import { composeDayOf, type MessageContent } from '../../lib/compose';
import { smsParts } from '../../lib/smsParts';
import { gsmLength, SMS_PART_LIMIT } from '../../lib/gsm7';

interface SmsSplitPreviewProps {
  t: Translations;
  tf: (key: keyof Translations, vars?: Record<string, string | number>) => string;
  language: Language;
  alertType: AlertType;
  title: string;
  message: string;
}

// Sample values the same length as real ones (4-digit code, token-style link),
// so the split lands where it will for real guests.
const SAMPLE_CODE = '0000';
const sampleLink = () =>
  `${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3025'}/rsvp/token-${'x'.repeat(20)}`;

function previewContent(alertType: AlertType, title: string, message: string, language: Language): MessageContent {
  if (alertType === 'DAY_OF') {
    return composeDayOf({ code: SAMPLE_CODE, language_pref: language } as Guest, title, message, language);
  }
  // Mirrors composeAlert, without its server-side link helper.
  return {
    kind: 'alert', language, subject: title, heading: title, rows: [],
    link: sampleLink(), code: SAMPLE_CODE, paragraphs: [message],
  };
}

export const SmsSplitPreview: React.FC<SmsSplitPreviewProps> = ({ t, tf, language, alertType, title, message }) => {
  if (!title.trim() && !message.trim()) return null;
  const parts = smsParts(previewContent(alertType, title, message, language));
  const count = parts.length;

  return (
    <div className="mt-3 rounded-xl border border-[#CBAE94]/60 bg-[#EFE6DC]/30 p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs font-semibold text-[#4A3F35]">
        <MessageSquare className="w-4 h-4 text-[#8B735B]" />
        <span>{t.smsPreviewTitle}</span>
      </div>
      <p className={`text-xs ${count > 1 ? 'text-amber-800' : 'text-[#5D5449]'}`}>
        {count > 1 ? tf('smsPreviewMulti', { count }) : t.smsPreviewSingle}
      </p>
      <ol className="space-y-2">
        {parts.map((part, i) => (
          <li key={i}>
            {i > 0 && (
              <div className="flex items-center gap-2 my-1 text-[10px] uppercase tracking-wide text-amber-800" aria-hidden="true">
                <span className="flex-1 border-t border-dashed border-amber-400" />
                <span>{tf('smsPreviewSplit', { index: i + 1 })}</span>
                <span className="flex-1 border-t border-dashed border-amber-400" />
              </div>
            )}
            <div className="text-[10px] text-[#5D5449] mb-0.5">
              {tf('smsPreviewPart', { index: i + 1, count, length: gsmLength(part), limit: SMS_PART_LIMIT })}
            </div>
            <pre className="whitespace-pre-wrap break-words font-mono text-xs bg-white border border-[#CBAE94]/40 rounded-lg p-2 text-[#4A3F35]">{part}</pre>
          </li>
        ))}
      </ol>
      <p className="text-[11px] text-[#5D5449]">{t.smsPreviewNote}</p>
    </div>
  );
};
