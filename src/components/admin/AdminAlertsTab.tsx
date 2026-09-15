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
import { TextInput, TextArea } from '../shared/ui';
import { Segmented } from '../shared/Segmented';
import { IconButton } from '../shared/IconButton';
import { formatDateLong } from '../../lib/dateUtils';
import { useToast } from '../shared/ToastContext';
import { useActionConfirm } from '../shared/ConfirmDialog';
import { useTf } from '../shared/i18n';

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

  const [alertType, setAlertType] = useState<AlertType>('REMINDER');
  const [targetAudience, setTargetAudience] = useState<'ALL' | 'PENDING' | 'ATTENDING'>('PENDING');
  const [alertTitle, setAlertTitle] = useState('RSVP Reminder: Baby Shower');
  const [alertMessage, setAlertMessage] = useState('Friendly reminder! We haven\'t received your RSVP yet for our baby shower. Please click below to confirm if you will be able to join us!');
  const [dispatchingAlert, setDispatchingAlert] = useState(false);

  const recipients = guests.filter((g) => {
    if (g.rsvp_status === 'Declined') return false;
    if (targetAudience === 'PENDING') return g.rsvp_status === 'Pending';
    if (targetAudience === 'ATTENDING') return g.rsvp_status === 'Attending';
    return true;
  });

  const handlePresetAlert = (type: AlertType) => {
    setAlertType(type);
    const pn = settings?.parentsNames || '';
    const bn = settings?.babyName || '';
    const dv = settings?.date || '';
    const vn = settings?.venueName || '';
    const va = settings?.venueAddress || '';
    const babyLabel = bn
      ? tf('babyLabelSet', { name: bn })
      : t.babyLabelUnset;
    if (type === 'REMINDER') {
      setTargetAudience('PENDING');
      setAlertTitle(tf('alertReminderTitle', { parents: pn }));
      setAlertMessage(tf('alertReminderMsg', { baby: babyLabel, date: formatDateLong(dv, language) }));
    } else if (type === 'DATE_CHANGE') {
      setTargetAudience('ALL');
      setAlertTitle(t.alertDateChangeTitle);
      setAlertMessage(tf('alertDateChangeMsg', { date: formatDateLong(dv, language) }));
    } else if (type === 'VENUE_CHANGE') {
      setTargetAudience('ALL');
      setAlertTitle(t.alertVenueChangeTitle);
      setAlertMessage(tf('alertVenueChangeMsg', { venue: vn, address: va }));
    } else if (type === 'CANCELLATION') {
      setTargetAudience('ALL');
      setAlertTitle(t.alertCancellationTitle);
      setAlertMessage(tf('alertCancellationMsg', { baby: babyLabel }));
    } else {
      setTargetAudience('ALL');
      setAlertTitle(t.alertUpdateTitle);
      setAlertMessage(tf('alertUpdateMsg', { parents: pn, baby: babyLabel }));
    }
  };

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
      <motion.div variants={adminCardVariants} className="card-paper p-6 sm:p-8 space-y-6">
        <div className="flex items-center space-x-3 border-b border-[#CBAE94]/40 pb-4">
          <div className="p-3 bg-amber-100 text-amber-800 rounded-2xl border border-amber-300">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-sans text-2xl font-bold text-[#8B735B]">{t.broadcastTitle}</h3>
            <p className="text-xs text-[#5D5449]">{t.broadcastDesc}</p>
          </div>
        </div>

        <div className="space-y-2">
          <label className="label-mono block">{t.quickTemplatesLabel}</label>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
            <button type="button" onClick={() => handlePresetAlert('REMINDER')}
              className={`p-3 rounded-2xl border-2 text-xs font-bold text-left transition-all flex flex-col space-y-1 ${alertType === 'REMINDER' ? 'border-amber-600 bg-amber-50 text-amber-900' : 'border-[#CBAE94]/50 bg-white hover:bg-[#EFE6DC]/40 text-[#5D5449]'}`}>
              <span className="font-bold">{t.rsvpReminderTemplate}</span>
              <span className="text-xs opacity-75 text-amber-800">{t.rsvpReminderTemplateDesc}</span>
            </button>
            <button type="button" onClick={() => handlePresetAlert('VENUE_CHANGE')}
              className={`p-3 rounded-2xl border-2 text-xs font-bold text-left transition-all flex flex-col space-y-1 ${alertType === 'VENUE_CHANGE' ? 'border-[#8B735B] bg-[#EFE6DC] text-[#8B735B]' : 'border-[#CBAE94]/50 bg-white hover:bg-[#EFE6DC]/40 text-[#5D5449]'}`}>
              <span className="font-bold">{t.venueChangeTemplate}</span>
              <span className="text-xs opacity-75">{t.venueChangeTemplateDesc}</span>
            </button>
            <button type="button" onClick={() => handlePresetAlert('DATE_CHANGE')}
              className={`p-3 rounded-2xl border-2 text-xs font-bold text-left transition-all flex flex-col space-y-1 ${alertType === 'DATE_CHANGE' ? 'border-[#8B735B] bg-[#EFE6DC] text-[#8B735B]' : 'border-[#CBAE94]/50 bg-white hover:bg-[#EFE6DC]/40 text-[#5D5449]'}`}>
              <span className="font-bold">{t.dateChangeTemplate}</span>
              <span className="text-xs opacity-75">{t.dateChangeTemplateDesc}</span>
            </button>
            <button type="button" onClick={() => handlePresetAlert('CANCELLATION')}
              className={`p-3 rounded-2xl border-2 text-xs font-bold text-left transition-all flex flex-col space-y-1 ${alertType === 'CANCELLATION' ? 'border-rose-500 bg-rose-50 text-rose-800' : 'border-[#CBAE94]/50 bg-white hover:bg-[#EFE6DC]/40 text-[#5D5449]'}`}>
              <span className="font-bold">{t.cancellationTemplate}</span>
              <span className="text-xs opacity-75 text-rose-600">{t.cancellationTemplateDesc}</span>
            </button>
            <button type="button" onClick={() => handlePresetAlert('CUSTOM')}
              className={`p-3 rounded-2xl border-2 text-xs font-bold text-left transition-all flex flex-col space-y-1 ${alertType === 'CUSTOM' ? 'border-[#8B735B] bg-[#EFE6DC] text-[#8B735B]' : 'border-[#CBAE94]/50 bg-white hover:bg-[#EFE6DC]/40 text-[#5D5449]'}`}>
              <span className="font-bold">{t.customTemplate}</span>
              <span className="text-xs opacity-75">{t.customTemplateDesc}</span>
            </button>
          </div>
        </div>

        <div className="space-y-2 pt-1 border-t border-[#CBAE94]/30">
          <label className="label-mono block">{t.targetGroupLabel}</label>
          <Segmented
            ariaLabel={t.targetGroupLabel}
            value={targetAudience}
            onChange={setTargetAudience}
            options={[
              { value: 'ALL', label: t.allNonDeclinedLabel, count: guests.filter((g) => g.rsvp_status !== 'Declined').length },
              { value: 'PENDING', label: t.pendingOnlyLabel, count: guests.filter((g) => g.rsvp_status === 'Pending').length },
              { value: 'ATTENDING', label: t.attendingOnlyLabel, count: guests.filter((g) => g.rsvp_status === 'Attending').length },
            ]}
          />
          <p className="text-xs text-[#8B735B] font-mono">{t.declinedNote}</p>
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
            <span className="text-xs text-[#5D5449] font-mono flex items-center space-x-1">
              <Mail className="w-3.5 h-3.5 text-[#8B735B]" />
              <span>{t.willNotifyLabel} <strong>{recipients.filter((g) => !!g.email).length}</strong> {t.willNotifyOfLabel} <strong>{recipients.length}</strong> {t.guestEmailsLabel}</span>
            </span>
            <button type="submit" disabled={dispatchingAlert}
              className="btn-accent px-6 py-3 text-xs flex items-center space-x-2 bg-amber-800 hover:bg-amber-900">
              <Send className="w-4 h-4" /><span>{dispatchingAlert ? t.dispatchingAlertBtn : t.dispatchAlertBtn}</span>
            </button>
          </div>
        </form>
      </motion.div>

      {/* Broadcast History */}
      <motion.div variants={adminCardVariants} className="card-paper p-6 sm:p-8 space-y-4">
        <h4 className="font-sans text-lg font-bold text-[#8B735B] flex items-center space-x-2">
          <Bell className="w-5 h-5 text-[#8B735B]" /><span>{tf('alertsHistoryCount', { count: alerts.length })}</span>
        </h4>
        {alerts.length === 0 ? (
          <p className="text-xs text-[#5D5449] italic font-mono bg-[#EFE6DC]/40 p-4 rounded-2xl border border-dashed border-[#CBAE94] text-center">{t.noAlertsYetMsg}</p>
        ) : (
          <div className="space-y-3">
            {alerts.map((alt) => (
              <div key={alt.id}
                className={`p-4 rounded-2xl border-2 flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${alt.type === 'CANCELLATION' ? 'bg-rose-50 border-rose-300 text-rose-950' : alt.type === 'REMINDER' ? 'bg-amber-50 border-amber-300 text-amber-950' : 'bg-[#F8F5F0] border-[#CBAE94] text-[#5D5449]'}`}>
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-sm">{alt.title}</span>
                    <span className="text-xs font-mono font-bold uppercase px-2 py-0.5 rounded-full bg-white/80 border border-current">{alt.type.replace('_', ' ')}</span>
                    <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">{t.alertTargetPrefix} {alt.target_audience === 'PENDING' ? t.targetPendingGuests : alt.target_audience === 'ATTENDING' ? t.targetAttendingGuests : t.targetAllNonDeclined}</span>
                  </div>
                  <p className="text-xs italic leading-relaxed">{alt.message}</p>
                  <span className="text-xs font-mono opacity-70 block">{tf('alertDispatchMeta', { date: new Date(alt.created_at).toLocaleString(), count: String(alt.notified_guests_count) })}</span>
                </div>
                <IconButton variant="danger" label={t.deleteAlertTitle} onClick={() => onDeleteAlert(alt.id)} className="shrink-0 self-end sm:self-center">
                  <Trash2 className="w-4 h-4" />
                </IconButton>
              </div>
            ))}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};
