import React, { useState } from 'react';
import { motion } from 'motion/react';
import { adminContainerVariants, adminCardVariants } from '../shared/motionPresets';
import {
  ShieldAlert,
  Bell,
  Send,
  Trash2,
  Users,
} from 'lucide-react';
import { Language, Guest, EventAlert, AlertType, EventSettings } from '../../types';
import { Translations } from '../../translations';
import { adminFetch } from '../../lib/api';
import { isAttending } from '../../lib/guestAttendees';
import {
  alertCandidates,
  hasContactFor,
  type AlertAudience,
  type AlertChannel,
} from '../../lib/alertRecipients';
import { DAY_OF_COPY } from '../../lib/compose';
import { TextInput, TextArea } from '../shared/ui';
import { Segmented, type SegmentedOption } from '../shared/Segmented';
import { IconButton } from '../shared/IconButton';
import { Pagination } from '../shared/Pagination';
import { usePagination } from '../shared/hooks';
import { formatDateLong, formatDateTimeShort } from '../../lib/dateUtils';
import { useToast } from '../shared/ToastContext';
import { useActionConfirm } from '../shared/ConfirmDialog';
import { useApiErrorMessage, useTf } from '../shared/i18n';
import { useCapabilities, noProviders, channelLabel } from '../../lib/capabilities';
import { AdminPageHeader, AdminSectionTitle } from './AdminPageHeader';
import { AlertGuestPicker } from './AlertGuestPicker';
import { AlertTestPanel } from './AlertTestPanel';

interface AdminAlertsTabProps {
  language: Language;
  t: Translations;
  guests: Guest[];
  alerts: EventAlert[];
  settings?: EventSettings | null;
  onRefresh: () => Promise<void>;
  onDeleteAlert: (alertId: string) => void;
}

export const AdminAlertsTab: React.FC<AdminAlertsTabProps> = ({ language, t, guests, alerts, settings, onRefresh, onDeleteAlert }) => {
  const { toast } = useToast();
  const confirmAction = useActionConfirm();
  const tf = useTf();
  const apiMessage = useApiErrorMessage();
  const { data: caps } = useCapabilities();
  const sendsBlocked = noProviders(caps);

  // Template text for each quick alert, in the app language.
  const presetFor = (type: AlertType): { audience: AlertAudience; title: string; message: string } => {
    const pn = settings?.parentsNames || '';
    const bn = settings?.babyName || '';
    const dv = settings?.date || '';
    const vn = settings?.venueName || '';
    const va = settings?.venueAddress || '';
    const babyLabel = bn
      ? tf('babyLabelSet', { name: bn })
      : t.babyLabelUnset;
    switch (type) {
      case 'REMINDER':
        return {
          audience: 'PENDING',
          title: pn ? tf('alertReminderTitle', { parents: pn }) : t.alertReminderTitleGeneric,
          message: tf('alertReminderMsg', { baby: babyLabel, date: formatDateLong(dv, language) }),
        };
      case 'DAY_OF':
        return { audience: 'ATTENDING', title: DAY_OF_COPY[language].title, message: DAY_OF_COPY[language].message };
      case 'DATE_CHANGE':
        return { audience: 'ALL', title: t.alertDateChangeTitle, message: tf('alertDateChangeMsg', { date: formatDateLong(dv, language) }) };
      case 'VENUE_CHANGE':
        return { audience: 'ALL', title: t.alertVenueChangeTitle, message: tf('alertVenueChangeMsg', { venue: vn, address: va }) };
      case 'CANCELLATION':
        return { audience: 'ALL', title: t.alertCancellationTitle, message: tf('alertCancellationMsg', { baby: babyLabel }) };
      default:
        return { audience: 'ALL', title: t.alertUpdateTitle, message: tf('alertUpdateMsg', { parents: pn, baby: babyLabel }) };
    }
  };

  const [alertType, setAlertType] = useState<AlertType>('REMINDER');
  const [alertTitle, setAlertTitle] = useState(() => presetFor('REMINDER').title);
  const [alertMessage, setAlertMessage] = useState(() => presetFor('REMINDER').message);
  const [audience, setAudience] = useState<AlertAudience>('PENDING');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [channel, setChannel] = useState<AlertChannel>('both');
  const [dispatchingAlert, setDispatchingAlert] = useState(false);

  const alertsPager = usePagination(alerts);

  // Channels the server can actually send on. Options that can't send are
  // hidden, and the picked channel falls back to the first usable one.
  const channelOptions: SegmentedOption<AlertChannel>[] = [
    ...(caps?.email ? [{ value: 'email' as const, label: t.channelEmail }] : []),
    ...(caps?.sms ? [{ value: 'text' as const, label: t.channelText }] : []),
    ...(caps?.email && caps?.sms ? [{ value: 'both' as const, label: t.channelBoth }] : []),
  ];
  const activeChannel: AlertChannel = channelOptions.find((o) => o.value === channel)?.value ?? channelOptions[0]?.value ?? channel;

  const audienceOptions: SegmentedOption<AlertAudience>[] = [
    { value: 'ALL', label: t.allNonDeclinedLabel, count: guests.filter((g) => g.rsvp_status !== 'Declined').length },
    { value: 'PENDING', label: t.pendingOnlyLabel, count: guests.filter((g) => g.rsvp_status === 'Pending').length },
    { value: 'ATTENDING', label: t.attendingOnlyLabel, count: guests.filter(isAttending).length },
    { value: 'SELECTED', label: t.targetSelectedGuests, count: selectedIds.length },
  ];

  // Same rules the server applies on send, so the preview matches the fan-out.
  const candidates = alertCandidates(guests, alertType, audience, selectedIds);
  const recipients = candidates.filter((g) => hasContactFor(g, activeChannel));
  const skipped = candidates.length - recipients.length;
  const emailCount = activeChannel !== 'text' ? recipients.filter((g) => !!g.email).length : 0;
  const smsCount = activeChannel !== 'email' ? recipients.filter((g) => !!g.phone).length : 0;

  const TEMPLATES: { type: AlertType; label: string; desc: string }[] = [
    { type: 'REMINDER', label: t.rsvpReminderTemplate, desc: t.rsvpReminderTemplateDesc },
    { type: 'DAY_OF', label: t.dayOfTemplate, desc: t.dayOfTemplateDesc },
    { type: 'VENUE_CHANGE', label: t.venueChangeTemplate, desc: t.venueChangeTemplateDesc },
    { type: 'DATE_CHANGE', label: t.dateChangeTemplate, desc: t.dateChangeTemplateDesc },
    { type: 'CANCELLATION', label: t.cancellationTemplate, desc: t.cancellationTemplateDesc },
    { type: 'CUSTOM', label: t.customTemplate, desc: t.customTemplateDesc },
  ];
  const templateLabel = (type: string) => TEMPLATES.find((tpl) => tpl.type === type)?.label ?? type;

  const handlePresetAlert = (type: AlertType) => {
    const preset = presetFor(type);
    setAlertType(type);
    setAudience(preset.audience);
    setAlertTitle(preset.title);
    setAlertMessage(preset.message);
  };

  const handleDispatchAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!alertTitle || !alertMessage || !activeChannel || recipients.length === 0) return;
    if (!(await confirmAction(t.dispatchAlertBtn, { message: tf('alertConfirmSend', { count: recipients.length }) }))) return;
    try {
      setDispatchingAlert(true);
      const res = await adminFetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: alertType,
          title: alertTitle,
          message: alertMessage,
          target_audience: audience,
          channel: activeChannel,
          ...(audience === 'SELECTED' ? { guest_ids: selectedIds } : {}),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.alert) {
        toast.love(tf('alertDispatchedToast', { count: String(data.notified_count) }));
        await onRefresh();
      } else {
        toast.error(apiMessage(data.error ?? '', data.message ?? t.dispatchAlertBtn));
      }
    } catch (err) {
      console.error('Error dispatching alert:', err);
      toast.error(t.dispatchAlertBtn);
    } finally {
      setDispatchingAlert(false);
    }
  };

  const audienceLabel = (alt: EventAlert) => {
    if (alt.target_audience === 'SELECTED') return t.targetSelectedGuests;
    if (alt.target_audience === 'PENDING') return t.targetPendingGuests;
    if (alt.target_audience === 'ATTENDING') return t.targetAttendingGuests;
    return t.targetAllNonDeclined;
  };

  const canSend = !dispatchingAlert && !sendsBlocked && recipients.length > 0 && !!activeChannel;

  return (
    <motion.div
      key="alerts"
      variants={adminContainerVariants}
      initial="hidden"
      animate="show"
      className="space-y-8"
    >
      <motion.div variants={adminCardVariants}>
        <AdminPageHeader
          icon={ShieldAlert}
          eyebrow={t.tabUrgentAlerts}
          title={t.broadcastTitle}
          subtitle={t.broadcastDesc}
        />
      </motion.div>

      {/* Compose and send */}
      <motion.div variants={adminCardVariants} className="card-soft p-5 sm:p-6 space-y-6">
        <div className="space-y-2">
          <span className="label-mono block">{t.alertSectionMessage}</span>
          <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-2">
            {TEMPLATES.map((tpl) => (
              <button
                key={tpl.type}
                type="button"
                onClick={() => handlePresetAlert(tpl.type)}
                aria-pressed={alertType === tpl.type}
                className={`p-3 rounded-xl border text-left transition-colors flex flex-col gap-0.5 cursor-pointer ${
                  alertType === tpl.type
                    ? 'border-[#4A3F35] bg-[#EFE6DC] text-[#4A3F35]'
                    : 'border-[#CBAE94]/60 bg-white hover:bg-[#EFE6DC]/40 text-[#4A3F35]'
                }`}
              >
                <span className="text-sm font-semibold">{tpl.label}</span>
                <span className={`text-xs ${tpl.type === 'CANCELLATION' ? 'text-rose-700' : 'text-[#5D5449]'}`}>{tpl.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <form onSubmit={handleDispatchAlert} className="space-y-4">
          <div>
            <label className="label-mono block mb-1" htmlFor="alert-title">{t.alertTitleLabel}</label>
            <TextInput id="alert-title" type="text" required value={alertTitle} onChange={(e) => setAlertTitle(e.target.value)}
              placeholder={t.alertTitlePh} />
          </div>
          <div>
            <label className="label-mono block mb-1" htmlFor="alert-message">{t.alertMessageLabel2}</label>
            <TextArea id="alert-message" rows={4} required value={alertMessage} onChange={(e) => setAlertMessage(e.target.value)}
              placeholder={t.alertMessagePh} className="resize-none" />
          </div>

          <div className="pt-4 border-t border-[#CBAE94]/30 space-y-5">
            <span className="label-mono block">{t.alertSectionChannel}</span>

            <div className="space-y-2">
              <span className="text-xs font-semibold text-[#5D5449] block">{t.alertChannelLabel}</span>
              <Segmented
                ariaLabel={t.alertChannelLabel}
                value={activeChannel}
                onChange={setChannel}
                options={channelOptions}
              />
              {sendsBlocked && <p className="text-xs text-amber-800">{t.providerNotConfigured}</p>}
            </div>

            <div className="space-y-2">
              <span className="text-xs font-semibold text-[#5D5449] block">{t.targetGroupLabel}</span>
              <Segmented
                wrap
                ariaLabel={t.targetGroupLabel}
                value={audience}
                onChange={setAudience}
                options={audienceOptions}
              />
              <p className="text-xs text-[#5D5449]">{t.declinedNote}</p>
            </div>

            {audience === 'SELECTED' && (
              <AlertGuestPicker
                guests={guests}
                selectedIds={selectedIds}
                onChange={setSelectedIds}
                channel={activeChannel}
                t={t}
                tf={tf}
              />
            )}

            <div className={`rounded-xl border p-4 text-sm flex items-start gap-3 ${recipients.length === 0 ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-[#CBAE94]/60 bg-[#EFE6DC]/30 text-[#4A3F35]'}`}>
              <Users className="w-4 h-4 mt-0.5 shrink-0 text-[#8B735B]" />
              <div className="space-y-1">
                {recipients.length === 0 ? (
                  <p>{t.alertNoRecipients}</p>
                ) : (
                  <p>{tf('alertReachSummary', { count: recipients.length, email: emailCount, sms: smsCount })}</p>
                )}
                {skipped > 0 && <p className="text-xs text-[#5D5449]">{tf('alertSkippedNote', { count: skipped })}</p>}
              </div>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button type="submit" disabled={!canSend}
              title={sendsBlocked ? t.providerNotConfigured : undefined}
              className="btn-accent px-6 py-3 text-sm gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
              <Send className="w-4 h-4" /><span>{dispatchingAlert ? t.dispatchingAlertBtn : t.dispatchAlertBtn}</span>
            </button>
          </div>
        </form>
      </motion.div>

      {/* Test before sending */}
      <motion.div variants={adminCardVariants}>
        <AlertTestPanel
          t={t}
          tf={tf}
          language={language}
          settings={settings}
          caps={caps}
          title={alertTitle}
          message={alertMessage}
        />
      </motion.div>

      {/* Broadcast History */}
      <motion.div variants={adminCardVariants} className="card-soft p-5 sm:p-6 space-y-4">
        <AdminSectionTitle icon={Bell} title={tf('alertsHistoryCount', { count: alerts.length })} />
        {alerts.length === 0 ? (
          <p className="text-sm text-[#5D5449] bg-[#EFE6DC]/30 p-4 rounded-xl border border-dashed border-[#CBAE94] text-center">{t.noAlertsYetMsg}</p>
        ) : (
          <div className="space-y-3">
            {alertsPager.pageItems.map((alt) => (
              <div key={alt.id}
                className={`p-4 rounded-2xl border bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-[#4A3F35] ${alt.type === 'CANCELLATION' ? 'border-rose-300' : 'border-[#CBAE94]/60'}`}>
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-sm">{alt.title}</span>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[#EFE6DC] text-[#5D5449]">{templateLabel(alt.type)}</span>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full border border-[#CBAE94]/60 text-[#5D5449]">{t.alertTargetPrefix} {audienceLabel(alt)}</span>
                    {alt.channel && (
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full border border-[#CBAE94]/60 text-[#5D5449]">{channelLabel(t, alt.channel)}</span>
                    )}
                  </div>
                  <p className="text-sm text-[#5D5449] leading-relaxed">{alt.message}</p>
                  <span className="text-xs text-[#5D5449] block">{tf('alertDispatchMeta', { date: formatDateTimeShort(alt.created_at, language), count: String(alt.notified_guests_count) })}</span>
                </div>
                <IconButton variant="danger" label={t.deleteAlertTitle} onClick={() => onDeleteAlert(alt.id)} className="shrink-0 self-end sm:self-center">
                  <Trash2 className="w-4 h-4" />
                </IconButton>
              </div>
            ))}
          </div>
        )}

        <Pagination
          page={alertsPager.page}
          totalPages={alertsPager.totalPages}
          rangeStart={alertsPager.rangeStart}
          rangeEnd={alertsPager.rangeEnd}
          total={alertsPager.total}
          onPageChange={alertsPager.setPage}
        />
      </motion.div>
    </motion.div>
  );
};
