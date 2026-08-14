import React, { useState } from 'react';
import { motion, Variants } from 'motion/react';
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
import { Modal } from '../shared/Modal';
import { formatDateLong } from '../../lib/dateUtils';
import { useToast } from '../shared/ToastContext';

const containerVariants: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.04 },
  },
};

const cardVariants: Variants = {
  hidden: { opacity: 0, y: 18, scale: 0.98 },
  show: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { duration: 0.38, ease: [0.22, 1, 0.36, 1] },
  },
};

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

  const [alertType, setAlertType] = useState<AlertType>('REMINDER');
  const [targetAudience, setTargetAudience] = useState<'ALL' | 'PENDING' | 'ATTENDING'>('PENDING');
  const [alertTitle, setAlertTitle] = useState('RSVP Reminder: Baby Shower');
  const [alertMessage, setAlertMessage] = useState('Friendly reminder! We haven\'t received your RSVP yet for our baby shower. Please click below to confirm if you will be able to join us!');
  const [dispatchingAlert, setDispatchingAlert] = useState(false);
  const [alertSuccessModal, setAlertSuccessModal] = useState<{ title: string; count: number } | null>(null);

  const handlePresetAlert = (type: AlertType) => {
    setAlertType(type);
    const pn = settings?.parentsNames || '';
    const bn = settings?.babyName || '';
    const dv = settings?.date || '';
    const vn = settings?.venueName || '';
    const va = settings?.venueAddress || '';
    const babyLabel = bn
      ? t.babyLabelSet.replace('{{name}}', bn)
      : t.babyLabelUnset;
    if (type === 'REMINDER') {
      setTargetAudience('PENDING');
      setAlertTitle(t.alertReminderTitle.replace('{{parents}}', pn));
      setAlertMessage(t.alertReminderMsg.replace('{{baby}}', babyLabel).replace('{{date}}', formatDateLong(dv, language)));
    } else if (type === 'DATE_CHANGE') {
      setTargetAudience('ALL');
      setAlertTitle(t.alertDateChangeTitle);
      setAlertMessage(t.alertDateChangeMsg.replace('{{date}}', formatDateLong(dv, language)));
    } else if (type === 'VENUE_CHANGE') {
      setTargetAudience('ALL');
      setAlertTitle(t.alertVenueChangeTitle);
      setAlertMessage(t.alertVenueChangeMsg.replace('{{venue}}', vn).replace('{{address}}', va));
    } else if (type === 'CANCELLATION') {
      setTargetAudience('ALL');
      setAlertTitle(t.alertCancellationTitle);
      setAlertMessage(t.alertCancellationMsg.replace('{{baby}}', babyLabel));
    } else {
      setTargetAudience('ALL');
      setAlertTitle(t.alertUpdateTitle);
      setAlertMessage(t.alertUpdateMsg.replace('{{parents}}', pn).replace('{{baby}}', babyLabel));
    }
  };

  const handleDispatchAlert = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!alertTitle || !alertMessage) return;
    try {
      setDispatchingAlert(true);
      const res = await adminFetch('/api/alerts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: alertType, title: alertTitle, message: alertMessage, target_audience: targetAudience }),
      });
      const data = await res.json();
      if (data.alert) {
        setAlertSuccessModal({ title: data.alert.title, count: data.notified_count });
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
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="space-y-8"
    >
      {/* Dispatch Alert Form Card */}
      <motion.div variants={cardVariants} className="card-paper p-6 sm:p-8 space-y-6">
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
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            <button type="button" onClick={() => handlePresetAlert('REMINDER')}
              className={`p-3 rounded-2xl border-2 text-xs font-bold text-left transition-all flex flex-col space-y-1 ${alertType === 'REMINDER' ? 'border-amber-600 bg-amber-50 text-amber-900' : 'border-[#CBAE94]/50 bg-white hover:bg-[#EFE6DC]/40 text-[#5D5449]'}`}>
              <span className="font-bold">{t.rsvpReminderTemplate}</span>
              <span className="text-[10px] opacity-75 text-amber-800">{t.rsvpReminderTemplateDesc}</span>
            </button>
            <button type="button" onClick={() => handlePresetAlert('VENUE_CHANGE')}
              className={`p-3 rounded-2xl border-2 text-xs font-bold text-left transition-all flex flex-col space-y-1 ${alertType === 'VENUE_CHANGE' ? 'border-[#8B735B] bg-[#EFE6DC] text-[#8B735B]' : 'border-[#CBAE94]/50 bg-white hover:bg-[#EFE6DC]/40 text-[#5D5449]'}`}>
              <span className="font-bold">{t.venueChangeTemplate}</span>
              <span className="text-[10px] opacity-75">{t.venueChangeTemplateDesc}</span>
            </button>
            <button type="button" onClick={() => handlePresetAlert('DATE_CHANGE')}
              className={`p-3 rounded-2xl border-2 text-xs font-bold text-left transition-all flex flex-col space-y-1 ${alertType === 'DATE_CHANGE' ? 'border-[#8B735B] bg-[#EFE6DC] text-[#8B735B]' : 'border-[#CBAE94]/50 bg-white hover:bg-[#EFE6DC]/40 text-[#5D5449]'}`}>
              <span className="font-bold">{t.dateChangeTemplate}</span>
              <span className="text-[10px] opacity-75">{t.dateChangeTemplateDesc}</span>
            </button>
            <button type="button" onClick={() => handlePresetAlert('CANCELLATION')}
              className={`p-3 rounded-2xl border-2 text-xs font-bold text-left transition-all flex flex-col space-y-1 ${alertType === 'CANCELLATION' ? 'border-rose-500 bg-rose-50 text-rose-800' : 'border-[#CBAE94]/50 bg-white hover:bg-[#EFE6DC]/40 text-[#5D5449]'}`}>
              <span className="font-bold">{t.cancellationTemplate}</span>
              <span className="text-[10px] opacity-75 text-rose-600">{t.cancellationTemplateDesc}</span>
            </button>
            <button type="button" onClick={() => handlePresetAlert('CUSTOM')}
              className={`p-3 rounded-2xl border-2 text-xs font-bold text-left transition-all flex flex-col space-y-1 ${alertType === 'CUSTOM' ? 'border-[#8B735B] bg-[#EFE6DC] text-[#8B735B]' : 'border-[#CBAE94]/50 bg-white hover:bg-[#EFE6DC]/40 text-[#5D5449]'}`}>
              <span className="font-bold">{t.customTemplate}</span>
              <span className="text-[10px] opacity-75">{t.customTemplateDesc}</span>
            </button>
          </div>
        </div>

        <div className="space-y-2 pt-1 border-t border-[#CBAE94]/30">
          <label className="label-mono block">{t.targetGroupLabel}</label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <button type="button" onClick={() => setTargetAudience('ALL')}
              className={`p-3 rounded-2xl border-2 text-xs font-bold text-left transition-all flex items-center justify-between ${targetAudience === 'ALL' ? 'border-[#8B735B] bg-[#EFE6DC] text-[#8B735B]' : 'border-[#CBAE94]/40 bg-white text-[#5D5449] hover:bg-[#EFE6DC]/30'}`}>
              <span>{t.allNonDeclinedLabel}</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-white border border-current font-bold">{guests.filter((g) => g.rsvp_status !== 'Declined').length}</span>
            </button>
            <button type="button" onClick={() => setTargetAudience('PENDING')}
              className={`p-3 rounded-2xl border-2 text-xs font-bold text-left transition-all flex items-center justify-between ${targetAudience === 'PENDING' ? 'border-amber-600 bg-amber-50 text-amber-900' : 'border-[#CBAE94]/40 bg-white text-[#5D5449] hover:bg-[#EFE6DC]/30'}`}>
              <span>{t.pendingOnlyLabel}</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-white border border-current font-bold">{guests.filter((g) => g.rsvp_status === 'Pending').length}</span>
            </button>
            <button type="button" onClick={() => setTargetAudience('ATTENDING')}
              className={`p-3 rounded-2xl border-2 text-xs font-bold text-left transition-all flex items-center justify-between ${targetAudience === 'ATTENDING' ? 'border-emerald-600 bg-emerald-50 text-emerald-900' : 'border-[#CBAE94]/40 bg-white text-[#5D5449] hover:bg-[#EFE6DC]/30'}`}>
              <span>{t.attendingOnlyLabel}</span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-white border border-current font-bold">{guests.filter((g) => g.rsvp_status === 'Attending').length}</span>
            </button>
          </div>
          <p className="text-[11px] text-[#8B735B] font-mono">{t.declinedNote}</p>
        </div>

        <form onSubmit={handleDispatchAlert} className="space-y-4">
          <div>
            <label className="label-mono block mb-1">{t.alertTitleLabel}</label>
            <input type="text" required value={alertTitle} onChange={(e) => setAlertTitle(e.target.value)}
              placeholder={t.alertTitlePh}
              className="w-full px-4 py-2.5 rounded-2xl border-2 border-[#CBAE94] text-xs font-bold text-[#5D5449] focus:outline-none focus:ring-2 focus:ring-[#8B735B] bg-white" />
          </div>
          <div>
            <label className="label-mono block mb-1">{t.alertMessageLabel2}</label>
            <textarea rows={4} required value={alertMessage} onChange={(e) => setAlertMessage(e.target.value)}
              placeholder={t.alertMessagePh}
              className="w-full p-4 rounded-2xl border-2 border-[#CBAE94] text-xs font-bold text-[#5D5449] focus:outline-none focus:ring-2 focus:ring-[#8B735B] bg-white resize-none" />
          </div>

          <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <span className="text-xs text-[#5D5449] font-mono flex items-center space-x-1">
              <Mail className="w-3.5 h-3.5 text-[#8B735B]" />
              <span>{t.willNotifyLabel} <strong>{
                guests.filter((g) => {
                  if (g.rsvp_status === 'Declined') return false;
                  if (targetAudience === 'PENDING') return g.rsvp_status === 'Pending';
                  if (targetAudience === 'ATTENDING') return g.rsvp_status === 'Attending';
                  return true;
                }).filter((g) => !!g.email).length
              }</strong> {t.willNotifyOfLabel} <strong>{
                guests.filter((g) => {
                  if (g.rsvp_status === 'Declined') return false;
                  if (targetAudience === 'PENDING') return g.rsvp_status === 'Pending';
                  if (targetAudience === 'ATTENDING') return g.rsvp_status === 'Attending';
                  return true;
                }).length
              }</strong> {t.guestEmailsLabel}</span>
            </span>
            <button type="submit" disabled={dispatchingAlert}
              className="btn-accent px-6 py-3 text-xs flex items-center space-x-2 bg-amber-800 hover:bg-amber-900">
              <Send className="w-4 h-4" /><span>{dispatchingAlert ? 'Dispatching Broadcast...' : 'Dispatch Alert & Email Guests'}</span>
            </button>
          </div>
        </form>
      </motion.div>

      {/* Broadcast History */}
      <motion.div variants={cardVariants} className="card-paper p-6 sm:p-8 space-y-4">
        <h4 className="font-sans text-lg font-bold text-[#8B735B] flex items-center space-x-2">
          <Bell className="w-5 h-5 text-[#8B735B]" /><span>Active Broadcast Alerts History ({alerts.length})</span>
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
                    <span className="text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full bg-white/80 border border-current">{alt.type.replace('_', ' ')}</span>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">Target: {alt.target_audience === 'PENDING' ? 'Pending Guests' : alt.target_audience === 'ATTENDING' ? 'Attending Guests' : 'All Non-Declined'}</span>
                  </div>
                  <p className="text-xs italic leading-relaxed">{alt.message}</p>
                  <span className="text-[10px] font-mono opacity-70 block">Dispatched on {new Date(alt.created_at).toLocaleString()} • {alt.notified_guests_count} guest(s) notified</span>
                </div>
                <button onClick={() => onDeleteAlert(alt.id)}
                  className="p-2 text-rose-600 hover:bg-rose-100 rounded-xl transition-colors shrink-0 self-end sm:self-center" title={t.deleteAlertTitle}>
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Modal: Broadcast Alert Dispatched Confirmation */}
      <Modal open={!!alertSuccessModal} onClose={() => setAlertSuccessModal(null)} maxWidth="md">
        <div className="w-14 h-14 bg-amber-100 text-amber-800 rounded-full flex items-center justify-center mx-auto border-2 border-amber-400">
          <ShieldAlert className="w-7 h-7" />
        </div>
        <div className="space-y-1 text-center">
          <h3 className="font-sans text-2xl font-bold text-[#8B735B]">{t.broadcastDispatchedTitle}</h3>
          <p className="text-xs text-[#5D5449]">"{alertSuccessModal?.title}"</p>
        </div>
        <div className="bg-[#EFE6DC] p-4 rounded-2xl border border-[#CBAE94] text-xs text-[#5D5449] space-y-2 font-mono text-left">
          <div className="flex items-center space-x-2 text-[#8B735B] font-bold">
            <Mail className="w-4 h-4 shrink-0" /><span>{t.simulatedDispatchLabel}</span>
          </div>
          <p className="text-[11px]">{t.emailsTriggeredLabel} <strong>{alertSuccessModal?.count}</strong> {t.invitedGuestsLabel}</p>
          <p className="text-[11px] text-amber-800 font-bold">{t.bannerVisibleNote}</p>
        </div>
        <button onClick={() => setAlertSuccessModal(null)} className="btn-accent w-full py-3 text-xs">{t.doneReturnBtn}</button>
      </Modal>
    </motion.div>
  );
};
