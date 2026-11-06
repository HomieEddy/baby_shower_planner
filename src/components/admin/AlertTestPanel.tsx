// Send the draft alert to one address or number before it goes to the list.
// The test contacts are saved on the event settings so they persist.

import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FlaskConical, Mail, MessageSquare } from 'lucide-react';
import type { EventSettings, Language } from '../../types';
import type { Translations } from '../../translations';
import { adminFetch } from '../../lib/api';
import { setSettingsCache } from '../../lib/settingsQuery';
import { TextInput } from '../shared/ui';
import { useToast } from '../shared/ToastContext';
import { useApiErrorMessage } from '../shared/i18n';
import type { Capabilities } from '../../lib/capabilities';
import { AdminSectionTitle } from './AdminPageHeader';

interface AlertTestPanelProps {
  t: Translations;
  tf: (key: keyof Translations, vars?: Record<string, string | number>) => string;
  language: Language;
  settings?: EventSettings | null;
  caps?: Capabilities;
  title: string;
  message: string;
}

export const AlertTestPanel: React.FC<AlertTestPanelProps> = ({ t, tf, language, settings, caps, title, message }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const apiMessage = useApiErrorMessage();

  const savedEmail = settings?.alertTestEmail ?? '';
  const savedPhone = settings?.alertTestPhone ?? '';
  const [email, setEmail] = useState(savedEmail);
  const [phone, setPhone] = useState(savedPhone);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState<'email' | 'text' | null>(null);

  // Settings arrive after mount; adopt them once they load or change. Done
  // during render (not in an effect) so the form never shows a stale frame.
  const [synced, setSynced] = useState({ email: savedEmail, phone: savedPhone });
  if (synced.email !== savedEmail || synced.phone !== savedPhone) {
    setSynced({ email: savedEmail, phone: savedPhone });
    setEmail(savedEmail);
    setPhone(savedPhone);
  }

  const dirty = email.trim() !== savedEmail || phone.trim() !== savedPhone;

  const saveContacts = async () => {
    setSaving(true);
    try {
      const res = await adminFetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alertTestEmail: email.trim(), alertTestPhone: phone.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(apiMessage(data.error ?? '', data.message ?? t.testFailedToast));
        return;
      }
      if (data.settings) setSettingsCache(queryClient, data.settings);
      else await queryClient.invalidateQueries({ queryKey: ['settings'] });
      toast.love(t.testContactsSavedToast);
    } catch {
      toast.error(t.testFailedToast);
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async (channel: 'email' | 'text') => {
    const to = channel === 'email' ? email.trim() : phone.trim();
    if (!title.trim() || !message.trim()) {
      toast.error(t.testNeedsBody);
      return;
    }
    if (!to) {
      toast.error(channel === 'email' ? t.INVALID_EMAIL : t.INVALID_PHONE);
      return;
    }
    setSending(channel);
    try {
      const res = await adminFetch('/api/alerts/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ channel, to, title, message, language }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.sent) {
        toast.love(tf('testSentToast', { to }));
      } else {
        toast.error(data.error ? apiMessage(data.error, data.message ?? t.testFailedToast) : t.testFailedToast);
      }
    } catch {
      toast.error(t.testFailedToast);
    } finally {
      setSending(null);
    }
  };

  const testBtn = 'btn-outline-accent px-4 py-2.5 text-sm gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed';

  return (
    <div className="card-soft p-5 sm:p-6 space-y-5">
      <AdminSectionTitle icon={FlaskConical} title={t.testAlertTitle} />
      <p className="text-xs text-[#5D5449] -mt-2">{t.testAlertDesc}</p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="label-mono block" htmlFor="alert-test-email">{t.testEmailLabel}</label>
          <div className="flex gap-2">
            <TextInput id="alert-test-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="name@example.com" className="flex-1 min-w-0" />
            <button type="button" className={testBtn}
              disabled={!!sending || !caps?.email || !email.trim()}
              title={!caps?.email ? t.providerNotConfigured : undefined}
              onClick={() => sendTest('email')}>
              <Mail className="w-4 h-4" />
              <span>{sending === 'email' ? '…' : t.sendTestEmailBtn}</span>
            </button>
          </div>
        </div>

        <div className="space-y-2">
          <label className="label-mono block" htmlFor="alert-test-phone">{t.testPhoneLabel}</label>
          <div className="flex gap-2">
            <TextInput id="alert-test-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 514 555 0100" className="flex-1 min-w-0" />
            <button type="button" className={testBtn}
              disabled={!!sending || !caps?.sms || !phone.trim()}
              title={!caps?.sms ? t.providerNotConfigured : undefined}
              onClick={() => sendTest('text')}>
              <MessageSquare className="w-4 h-4" />
              <span>{sending === 'text' ? '…' : t.sendTestSmsBtn}</span>
            </button>
          </div>
        </div>
      </div>

      <div className="flex justify-end">
        <button type="button" onClick={saveContacts} disabled={!dirty || saving}
          className="btn-outline-accent px-4 py-2 text-sm cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
          {t.saveTestContactsBtn}
        </button>
      </div>
    </div>
  );
};
