import React, { useState } from 'react';
import { motion } from 'motion/react';
import { adminContainerVariants, adminCardVariants } from '../shared/motionPresets';
import {
  ShieldAlert,
  Bell,
  Send,
  Mail,
  Trash2,
} from 'lucide-react';
import { Language, Guest, EventAlert, AlertType, EventSettings } from '../../types';
import { Translations } from '../../translations';
import { adminFetch } from '../../lib/api';
import { isAttending } from '../../lib/guestAttendees';
import { TextInput, TextArea } from '../shared/ui';
import { Segmented } from '../shared/Segmented';
import { IconButton } from '../shared/IconButton';
import { Pagination } from '../shared/Pagination';
import { usePagination } from '../shared/hooks';
import { formatDateLong, formatDateTimeShort } from '../../lib/dateUtils';
import { useToast } from '../shared/ToastContext';
import { useActionConfirm } from '../shared/ConfirmDialog';
import { useTf } from '../shared/i18n';
import { useCapabilities, noProviders } from '../../lib/capabilities';
import { AdminPageHeader, AdminSectionTitle } from './AdminPageHeader';

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
  const { data: caps } = useCapabilities();
  const sendsBlocked = noProviders(caps);

  // Template text for each quick alert, in the app language.
  const presetFor = (type: AlertType): { audience: 'ALL' | 'PENDING' | 'ATTENDING'; title: string; message: string } => {
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
  const [targetAudience, setTargetAudience] = useState<'ALL' | 'PENDING' | 'ATTENDING'>('PENDING');
  const [alertTitle, setAlertTitle] = useState(() => presetFor('REMINDER').title);
  const [alertMessage, setAlertMessage] = useState(() => presetFor('REMINDER').message);
  const [dispatchingAlert, setDispatchingAlert] = useState(false);

  const alertsPager = usePagination(alerts);

  const recipients = guests.filter((g) => {
    if (g.rsvp_status === 'Declined') return false;
    if (targetAudience === 'PENDING') return g.rsvp_status === 'Pending';
    if (targetAudience === 'ATTENDING') return isAttending(g);
    return true;
  });

  const handlePresetAlert = (type: AlertType) => {
    const preset = presetFor(type);
    setAlertType(type);
    setTargetAudience(preset.audience);
    setAlertTitle(preset.title);
    setAlertMessage(preset.message);
  };

  const TEMPLATES: { type: AlertType; label: string; desc: string }[] = [
    { type: 'REMINDER', label: t.rsvpReminderTemplate, desc: t.rsvpReminderTemplateDesc },
    { type: 'VENUE_CHANGE', label: t.venueChangeTemplate, desc: t.venueChangeTemplateDesc },
    { type: 'DATE_CHANGE', label: t.dateChangeTemplate, desc: t.dateChangeTemplateDesc },
    { type: 'CANCELLATION', label: t.cancellationTemplate, desc: t.cancellationTemplateDesc },
    { type: 'CUSTOM', label: t.customTemplate, desc: t.customTemplateDesc },
  ];
  const templateLabel = (type: string) => TEMPLATES.find((tpl) => tpl.type === type)?.label ?? type;

  const handleDispatchAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!alertTitle || !alertMessage) return;
    if (!(await confirmAction(t.dispatchAlertBtn))) return;
    try {
      setDispatchingAlert(true);
      const res = await adminFetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: alertType, title: alertTitle, message: alertMessage, target_audience: targetAudience }),
      });
      const data = await res.json();
      if (data.alert) {
        toast.love(tf('alertDispatchedToast', { count: String(data.notified_count) }));
        await onRefresh();
      }
    } catch (err) {
      console.error('Error dispatching alert:', err);
    } finally {
      setDispatchingAlert(false);
    }
  };

  return (
    <motion.div
      key="alerts"
      variants={adminContainerVariants}
      initial="hidden"
      animate="show"
      className="space-y-8"
    >
      {/* Dispatch Alert Form Card */}
      <motion.div variants={adminCardVariants}>
        <AdminPageHeader
          icon={ShieldAlert}
          eyebrow={t.tabUrgentAlerts}
          title={t.broadcastTitle}
          subtitle={t.broadcastDesc}
        />
      </motion.div>

      <motion.div variants={adminCardVariants} className="card-soft p-5 sm:p-6 space-y-6">

        <div className="space-y-2">
          <label className="label-mono block">{t.quickTemplatesLabel}</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
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

        <div className="space-y-2 pt-1 border-t border-[#CBAE94]/30">
          <label className="label-mono block">{t.targetGroupLabel}</label>
          <Segmented
            wrap
            ariaLabel={t.targetGroupLabel}
            value={targetAudience}
            onChange={setTargetAudience}
            options={[
              { value: 'ALL', label: t.allNonDeclinedLabel, count: guests.filter((g) => g.rsvp_status !== 'Declined').length },
              { value: 'PENDING', label: t.pendingOnlyLabel, count: guests.filter((g) => g.rsvp_status === 'Pending').length },
              { value: 'ATTENDING', label: t.attendingOnlyLabel, count: guests.filter(isAttending).length },
            ]}
          />
          <p className="text-xs text-[#5D5449]">{t.declinedNote}</p>
        </div>

        <form onSubmit={handleDispatchAlert} className="space-y-4">
          <div>
            <label className="label-mono block mb-1">{t.alertTitleLabel}</label>
            <TextInput type="text" required value={alertTitle} onChange={(e) => setAlertTitle(e.target.value)}
              placeholder={t.alertTitlePh} />
          </div>
          <div>
            <label className="label-mono block mb-1">{t.alertMessageLabel2}</label>
            <TextArea rows={4} required value={alertMessage} onChange={(e) => setAlertMessage(e.target.value)}
              placeholder={t.alertMessagePh} className="resize-none" />
          </div>

          <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span className="text-xs text-[#5D5449] flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 shrink-0 text-[#8B735B]" />
              <span>{t.willNotifyLabel} <strong>{recipients.filter((g) => !!g.email).length}</strong> {t.willNotifyOfLabel} <strong>{recipients.length}</strong> {t.guestEmailsLabel}</span>
            </span>
            <button type="submit" disabled={dispatchingAlert || sendsBlocked}
              title={sendsBlocked ? t.providerNotConfigured : undefined}
              className="btn-accent px-6 py-3 text-sm gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">
              <Send className="w-4 h-4" /><span>{dispatchingAlert ? t.dispatchingAlertBtn : t.dispatchAlertBtn}</span>
            </button>
          </div>
        </form>
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
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-sm">{alt.title}</span>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[#EFE6DC] text-[#5D5449]">{templateLabel(alt.type)}</span>
                    <span className="text-xs font-medium px-2 py-0.5 rounded-full border border-[#CBAE94]/60 text-[#5D5449]">{t.alertTargetPrefix} {alt.target_audience === 'PENDING' ? t.targetPendingGuests : alt.target_audience === 'ATTENDING' ? t.targetAttendingGuests : t.targetAllNonDeclined}</span>
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
