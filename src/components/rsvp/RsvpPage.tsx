import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Guest, EventAlert } from '../../types';
import { EventDetailsCard } from './EventDetailsCard';
import { stripPrimaryAttendees, buildAttendeePayload } from '../../lib/guestAttendees';
import { useCapabilities, availableChannels, channelLabel } from '../../lib/capabilities';
import { motion, AnimatePresence } from 'motion/react';
import { useToast } from '../shared/ToastContext';
import { useConfirm } from '../shared/ConfirmDialog';
import { cardStagger, popIn, fadeUp } from '../shared/motionPresets';
import { useT } from '../shared/i18n';
import { useCopyFeedback } from '../shared/hooks';
import { RsvpCarouselTabs } from './RsvpCarouselTabs';
import { ConfirmationView } from './ConfirmationView';
import { InviteSuccessModal } from './InviteSuccessModal';
import {
  CheckCircle2,
  XCircle,
  Users,
  Send,
  Sparkles,
  Lightbulb,
  Edit3,
  AlertCircle,
  Calendar,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Bell,
  Copy,
  Check,
  MessageSquare,
  Link2,
  Trash2,
} from 'lucide-react';

const RsvpFormSchema = z.object({
  rsvpStatus: z.enum(['Attending', 'Declined']),
  attendees: z.array(z.object({ name: z.string(), contact: z.string() })),
  dietary: z.string(),
});
type RsvpFormValues = z.infer<typeof RsvpFormSchema>;

export const RsvpPage = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
    const t = useT();
  const { toast } = useToast();

  const [guest, setGuest] = useState<Guest | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Carousel Tab State ('rsvp' = Page 1 | 'event' = Page 2 | 'invite' = Page 3)
  const [activeTab, setActiveTab] = useState<'rsvp' | 'event' | 'invite'>('rsvp');
  const TAB_ORDER = ['rsvp', 'event', 'invite'] as const;

  // System Alerts state
  const [alerts, setAlerts] = useState<EventAlert[]>([]);

  // Form State (react-hook-form)
  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    control,
  } = useForm<RsvpFormValues>({
    resolver: zodResolver(RsvpFormSchema),
    defaultValues: {
      rsvpStatus: 'Attending',
      attendees: [{ name: '', contact: '' }],
      dietary: '',
    },
  });
  const rsvpStatus = watch('rsvpStatus');
  const { fields, append, remove } = useFieldArray({ control, name: 'attendees' });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [isEditing, setIsEditing] = useState(false);

  // Handle Tab Switching with Direction
  const handleTabChange = (newTab: 'rsvp' | 'event' | 'invite') => {
    if (newTab === activeTab) return;
    setActiveTab(newTab);
  };

  // Fetch alerts
  const fetchAlerts = async () => {
    try {
      const res = await fetch('/api/alerts');
      const data = await res.json();
      if (data.alerts) {
        setAlerts(data.alerts.filter((a: EventAlert) => a.active));
      }
    } catch (err) {
      console.error('Error fetching alerts:', err);
    }
  };

  useEffect(() => {
    fetchAlerts();
  }, []);

  // Fetch guest by magic_token
  const fetchGuest = async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setErrorMsg(null);
      const res = await fetch(`/api/rsvp/${token}`);
      const data = await res.json();

      if (res.ok && data.guest) {
        setGuest(data.guest);
        reset({
          rsvpStatus: data.guest.rsvp_status === 'Declined' ? 'Declined' : 'Attending',
          // Additional party members only — the primary guest is implicit (stored at index 0)
          attendees: stripPrimaryAttendees(data.guest.attendee_details, data.guest.attendee_names),
          dietary: data.guest.dietary_restrictions || '',
        });
        if (data.guest.token_used || data.guest.is_read_only) {
          setSubmitted(true);
        }
      } else {
        setErrorMsg(t.invalidTokenMsg);
      }
    } catch (err) {
      console.error('Error fetching RSVP token:', err);
      setErrorMsg(t.invalidTokenMsg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGuest();
  }, [token]);

  // ─── Contact & notifications (self-service) ────────────────────
  const { data: caps } = useCapabilities();
  const contactChannels = availableChannels(caps);
  const inviteChannels: ('link-only' | 'email' | 'text' | 'both')[] = ['link-only'];
  if (caps?.email) inviteChannels.push('email');
  if (caps?.sms) inviteChannels.push('text');
  if (caps?.email && caps?.sms) inviteChannels.push('both');

  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactChannel, setContactChannel] = useState<'none' | 'email' | 'text' | 'both'>('none');
  const [savingContact, setSavingContact] = useState(false);

  const [inviteName, setInviteName] = useState('');
  const [inviteContact, setInviteContact] = useState('');
  const [inviteChannel, setInviteChannel] = useState<'link-only' | 'email' | 'text' | 'both'>('link-only');
  const [inviteNote, setInviteNote] = useState('');
  const [inviting, setInviting] = useState(false);
  const [inviteModal, setInviteModal] = useState<{ name: string; url: string; message: string } | null>(null);

  const [myInvites, setMyInvites] = useState<Guest[]>([]);
  const { copiedKey, copy: copyText } = useCopyFeedback();
  const confirm = useConfirm();

  useEffect(() => {
    if (guest) {
      setContactEmail(guest.email || '');
      setContactPhone(guest.phone || '');
      setContactChannel(['none', 'email', 'text', 'both'].includes(guest.delivery_channel as string)
        ? (guest.delivery_channel as 'none' | 'email' | 'text' | 'both')
        : 'none');
    }
  }, [guest]);

  const fetchInvites = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`/api/rsvp/${token}/invites`);
      const data = await res.json();
      if (res.ok && data.invites) setMyInvites(data.invites);
    } catch { /* non-fatal */ }
  }, [token]);

  useEffect(() => {
    if (guest) fetchInvites();
  }, [guest, fetchInvites]);

  const handleSaveContact = async () => {
    if (!token) return;
    if ((contactChannel === 'email' || contactChannel === 'both') && !contactEmail.trim()) {
      toast.error(t.contactForChannelError.replace('{{channel}}', t.channelEmail));
      return;
    }
    if ((contactChannel === 'text' || contactChannel === 'both') && !contactPhone.trim()) {
      toast.error(t.contactForChannelError.replace('{{channel}}', t.channelText));
      return;
    }
    try {
      setSavingContact(true);
      const res = await fetch(`/api/rsvp/${token}/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: contactEmail, phone: contactPhone, delivery_channel: contactChannel }),
      });
      const data = await res.json();
      if (res.ok && data.guest) {
        setGuest(data.guest);
        toast.love(t.contactSavedToast);
      } else {
        toast.error(data.message || t.contactSaveErrorToast);
      }
    } catch (err) {
      console.error('Contact save error:', err);
      toast.error(t.contactSaveErrorToast);
    } finally {
      setSavingContact(false);
    }
  };

  const handleInvite = async () => {
    if (!token) return;
    if (!inviteName.trim()) {
      toast.error(t.inviteNameRequiredToast);
      return;
    }
    if (inviteChannel !== 'link-only' && !inviteContact.trim()) {
      toast.error(t.contactForChannelError.replace('{{channel}}', channelLabel(t, inviteChannel)));
      return;
    }
    try {
      setInviting(true);
      const res = await fetch(`/api/rsvp/${token}/invite`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: inviteName, contact: inviteContact, channel: inviteChannel, note: inviteNote }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setInviteModal({ name: data.guest.name, url: data.invite_url, message: data.invite_message });
        if (data.already_invited) {
          toast.info(t.inviteAlreadyInvitedToast.replace('{{name}}', data.guest.name));
        } else if (data.sent.length > 0) {
          toast.love(t.inviteSentChannelToast
            .replace('{{name}}', data.guest.name)
            .replace('{{channel}}', data.sent.map((c: string) => channelLabel(t, c)).join(' + ')));
        } else if (data.failed.length > 0) {
          toast.error(t.inviteDeliveryFailedToast.replace('{{name}}', data.guest.name));
        } else {
          toast.info(t.inviteSentLinkOnlyToast.replace('{{name}}', data.guest.name));
        }
        setInviteName('');
        setInviteContact('');
        setInviteNote('');
        fetchInvites();
      } else {
        toast.error(data.message || t.inviteFailedToast);
      }
    } catch (err) {
      console.error('Invite error:', err);
      toast.error(t.inviteFailedToast);
    } finally {
      setInviting(false);
    }
  };

  const handleRemoveInvite = async (invitee: Guest) => {
    if (!token) return;
    const ok = await confirm({
      title: t.removeInviteTitle,
      message: t.removeInviteMsg.replace('{{name}}', invitee.name),
      confirmText: t.removeInviteBtn,
    });
    if (!ok) return;
    try {
      const res = await fetch(`/api/rsvp/${token}/invites/${invitee.id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.info(t.inviteRemovedToast);
        fetchInvites();
      } else {
        toast.error(t.inviteFailedToast);
      }
    } catch (err) {
      console.error('Remove invite error:', err);
      toast.error(t.inviteFailedToast);
    }
  };

  const statusWord = (s: string) =>
    s === 'Attending' ? t.statusAttendingWord : s === 'Declined' ? t.statusDeclinedWord : t.statusPendingWord;

  // Handle Submit
  const onSubmit = async (data: RsvpFormValues) => {
    if (!token || !guest || guest.is_read_only) return;

    try {
      setSubmitting(true);
      const additional = data.rsvpStatus === 'Attending'
        ? data.attendees.filter(a => a.name.trim() !== '').map(a => ({ name: a.name.trim(), contact: a.contact ? a.contact.trim() : '' }))
        : [];
      // The primary guest is implicit — always stored first in the attendee list
      const payload = buildAttendeePayload(guest.name.trim(), additional, data.rsvpStatus);

      const res = await fetch(`/api/rsvp/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rsvp_status: data.rsvpStatus,
          attendee_details: payload.attendee_details,
          attendee_names: payload.attendee_names,
          attending_party_size: payload.attendee_names.length,
          dietary_restrictions: data.dietary,
        }),
      });

      const dataRes = await res.json();
      if (res.ok && dataRes.guest) {
        setGuest(dataRes.guest);
        setSubmitted(true);
        setIsEditing(false);
        if (data.rsvpStatus === 'Attending') {
          toast.love(t.rsvpConfirmedToast);
        } else {
          toast.info(t.rsvpDeclinedToast);
        }
      } else {
        toast.error(dataRes.error === 'RSVP_CLOSED' ? t.rsvpClosedToast : dataRes.message || dataRes.error || 'Failed to submit RSVP');
      }
    } catch (err) {
      console.error('RSVP submit error:', err);
      toast.error(t.rsvpSubmitErrorToast);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle Edit RSVP
  const handleEditRsvp = async () => {
    if (!token) return;
    try {
      const res = await fetch(`/api/rsvp/${token}/reset`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast.error(data.error === 'RSVP_CLOSED' ? t.rsvpClosedToast : t.rsvpResetErrorToast);
        return;
      }
      setIsEditing(true);
      setSubmitted(false);
      toast.info(t.rsvpUnlockedToast);
    } catch (err) {
      console.error('Error resetting token:', err);
      toast.error(t.rsvpResetErrorToast);
    }
  };

  // Filter alerts for the current guest:
  // 1. Guests who have DECLINED only see CANCELLATION alerts (they might
  //    still show up otherwise).
  // 2. Filter by target_audience (PENDING vs ATTENDING vs ALL).
  const visibleAlerts = alerts.filter((a) => {
    if (guest?.rsvp_status === 'Declined') {
      return a.type === 'CANCELLATION';
    }
    if (a.target_audience === 'PENDING') {
      return !guest || guest.rsvp_status === 'Pending';
    }
    if (a.target_audience === 'ATTENDING') {
      return !guest || guest.rsvp_status === 'Attending';
    }
    return true;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-300">

      {/* Urgent Host Broadcast Alert Banner */}
      {visibleAlerts.length > 0 && (
        <div className="space-y-3 max-w-2xl mx-auto">
          {visibleAlerts.map((a) => (
            <div
              key={a.id}
              className={`p-4 rounded-2xl border-2 flex items-start space-x-3 shadow-xs animate-in slide-in-from-top-2 duration-200 ${
                a.type === 'CANCELLATION'
                  ? 'bg-rose-50 border-rose-400 text-rose-900'
                  : 'bg-amber-50 border-amber-400 text-amber-900'
              }`}
            >
              <AlertTriangle className={`w-5 h-5 shrink-0 mt-0.5 ${a.type === 'CANCELLATION' ? 'text-rose-600' : 'text-amber-600'}`} />
              <div className="space-y-1 text-left flex-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-sm font-sans">{a.title}</span>
                  <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-white/80 font-bold border border-current shrink-0">
                    {a.type.replace('_', ' ')}
                  </span>
                </div>
                <p className="text-xs leading-relaxed font-sans">{a.message}</p>
                <p className="text-[10px] opacity-70 font-mono">
                  {a.target_audience === 'PENDING'
                    ? 'Reminder sent to pending guests'
                    : a.target_audience === 'ATTENDING'
                    ? 'Broadcasted to attending guests'
                    : 'Broadcasted to invited guests'}{' '}
                  • {new Date(a.created_at).toLocaleDateString()}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Event home (no invitation token): show event details only */}
      {!token ? (
        <>
          <div className="bg-[#E9E0D2]/60 border border-[#4A3F35]/20 rounded-2xl p-3.5 text-center text-xs font-mono font-bold text-[#4A3F35]">
            {t.homeRsvpHint}
          </div>
          <EventDetailsCard />
        </>
      ) : (
      <>
      {/* 3-Tab Carousel Header Navigation Control */}
      <RsvpCarouselTabs activeTab={activeTab} onTabChange={handleTabChange} />

      {/* Carousel Container with Smooth Sliding Animation. All tabs stay mounted
          and slide via CSS transitions — no enter/exit lifecycle to get stuck. */}
      <div className="relative overflow-hidden min-h-[450px]">
        <div className="grid">
          {TAB_ORDER.map((tab, i) => {
            const isActive = activeTab === tab;
            const activeIndex = TAB_ORDER.indexOf(activeTab);
            return (
            <div
              key={tab}
              inert={!isActive}
              className={`[grid-area:1/1] transition-all duration-500 ease-out ${
                isActive
                  ? 'translate-x-0 opacity-100'
                  : i < activeIndex
                  ? '-translate-x-full opacity-0'
                  : 'translate-x-full opacity-0'
              }`}
            >
            {tab === 'rsvp' && (
              <div className="card-paper p-6 sm:p-10">
                
                {/* Link to Event Details */}
                <div className="mb-6 border-b border-[#4A3F35]/10 pb-4 flex items-center justify-between">
                  <span className="text-[11px] font-mono text-[#4A3F35]/60 font-bold">
                    {t.step1of2Label}
                  </span>

                  <button
                    onClick={() => handleTabChange('event')}
                    className="text-xs font-bold text-[#4A3F35] hover:text-[#D4A373] inline-flex items-center space-x-1 font-mono transition-colors py-2 px-1 -mx-1"
                  >
                    <span>{t.viewEventScheduleBtn}</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>

                {/* Loading State */}
                {loading && (
                  <div className="text-center py-12 space-y-3">
                    <div className="w-8 h-8 border-3 border-[#D4A373] border-t-transparent rounded-full animate-spin mx-auto" />
                    <p className="text-xs text-[#4A3F35] font-medium font-mono">{t.loadingInviteMsg}</p>
                  </div>
                )}

                {/* Error / Invalid Token State */}
                {!loading && (errorMsg || !guest) && (
                  <div className="text-center py-8 space-y-4 max-w-md mx-auto">
                    <div className="w-12 h-12 bg-[#E9E0D2] text-[#4A3F35] rounded-full flex items-center justify-center mx-auto border border-[#4A3F35]/20">
                      <AlertCircle className="w-6 h-6" />
                    </div>
                    <h3 className="font-newsreader text-2xl font-bold text-[#4A3F35]">
                      {t.invalidTokenTitle}
                    </h3>
                    <p className="text-xs sm:text-sm text-[#4A3F35]/80 leading-relaxed">
                      {errorMsg || t.invalidTokenMsg}
                    </p>
                  </div>
                )}

                {/* Guest RSVP Interactive Form & Confirmation */}
                {!loading && guest && (
                  <div>
                    <AnimatePresence mode="wait">
                      
                      {/* State A: Confirmation / Already Submitted View */}
                      {submitted && !isEditing ? (
                        <ConfirmationView
                          guest={guest}
                          onEdit={handleEditRsvp}
                          onViewEvent={() => handleTabChange('event')}
                        />
                      ) : (

                        /* State B: RSVP Form */
                        <motion.div
                          key="form"
                          initial={{ opacity: 0, y: 15 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, y: -15 }}
                          className="space-y-8 max-w-xl mx-auto"
                        >
                          
                          {/* Greeting Header */}
                          <div className="text-center space-y-2 border-b border-dashed border-[#4A3F35]/20 pb-6">
                            <div className="label-mono">{t.rsvpResponseTitle}</div>
                            <h3 className="font-newsreader text-2xl sm:text-3xl font-bold text-[#4A3F35]">
                              {t.rsvpGreeting.replace('{{name}}', guest.name)}
                            </h3>
                            <p className="text-sm text-[#4A3F35]/70 font-sans">
                              {t.rsvpPrompt}
                            </p>
                          </div>

                          {/* Form */}
                          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
                            
                            {/* Attendance Radio Cards */}
                            <div className="space-y-3">
                              <label className="label-mono block">
                                {t.responseStatusLabel}
                              </label>
                              
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                
                                {/* Option: Attending */}
                                <div
                                  onClick={() => setValue('rsvpStatus', 'Attending')}
                                  className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex items-start space-x-3 ${
                                    rsvpStatus === 'Attending'
                                      ? 'border-[#4A3F35] bg-[#E9E0D2]/50 shadow-2xs'
                                      : 'border-[#4A3F35]/20 bg-white hover:border-[#4A3F35]/40'
                                  }`}
                                >
                                  <input
                                    type="radio"
                                    value="Attending"
                                    {...register('rsvpStatus')}
                                    className="mt-1 text-[#4A3F35] focus:ring-[#4A3F35]"
                                  />
                                  <div>
                                    <span className="font-bold text-[#4A3F35] text-sm block">
                                      {t.statusAttendingOption}
                                    </span>
                                    <span className="text-xs text-[#4A3F35]/70">
                                      {t.attendingHappyText}
                                    </span>
                                  </div>
                                </div>

                                {/* Option: Declined */}
                                <div
                                  onClick={() => setValue('rsvpStatus', 'Declined')}
                                  className={`p-4 rounded-2xl border-2 cursor-pointer transition-all flex items-start space-x-3 ${
                                    rsvpStatus === 'Declined'
                                      ? 'border-[#4A3F35] bg-[#E9E0D2]/50 shadow-2xs'
                                      : 'border-[#4A3F35]/20 bg-white hover:border-[#4A3F35]/40'
                                  }`}
                                >
                                  <input
                                    type="radio"
                                    value="Declined"
                                    {...register('rsvpStatus')}
                                    className="mt-1 text-[#4A3F35] focus:ring-[#4A3F35]"
                                  />
                                  <div>
                                    <span className="font-bold text-[#4A3F35] text-sm block">
                                      {t.statusDeclinedOption}
                                    </span>
                                    <span className="text-xs text-[#4A3F35]/70">
                                      {t.declinedWarmText}
                                    </span>
                                  </div>
                                </div>

                              </div>
                            </div>

                             {/* Individual Attendee Names & Contact Inputs (Only when Attending) */}
                            {rsvpStatus === 'Attending' && (
                              <div className="space-y-4 bg-[#E9E0D2]/40 p-5 rounded-2xl border border-[#4A3F35]/20 animate-in fade-in duration-200">
                                <div>
                                  <label className="label-mono block mb-1">
                                    {t.attendeeSectionTitle}
                                  </label>
                                  <p className="text-xs text-[#4A3F35]/70 mb-1 font-sans">
                                    {t.attendeeSectionHint}
                                  </p>
                                  <p className="text-[11px] text-[#8B735B] font-medium font-sans flex items-center gap-1">
                                    <Lightbulb className="w-3 h-3 shrink-0" />
                                    {t.primaryGuestIncluded.replace('{{name}}', guest.name)}
                                  </p>
                                  <p className="text-[11px] text-[#8B735B] font-medium font-sans flex items-center gap-1">
                                    <Lightbulb className="w-3 h-3 shrink-0" />
                                    {t.attendeeContactHelper}
                                  </p>
                                </div>

                                <div className="space-y-3">
                                  {fields.map((att, index) => (
                                    <div key={att.id} className="p-3.5 bg-white/90 rounded-xl border border-[#4A3F35]/20 space-y-2.5">
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-xs font-mono font-bold text-[#8B735B] uppercase tracking-wider">
                                          {`Party Member #${index + 1}`}
                                        </span>
                                        <button
                                          type="button"
                                          onClick={() => remove(index)}
                                          className="p-1 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg transition-colors"
                                          title={t.removeGuestBtn}
                                        >
                                          <XCircle className="w-4 h-4" />
                                        </button>
                                      </div>

                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        <div>
                                          <input
                                            type="text"
                                            required
                                            {...register(`attendees.${index}.name`)}
                                            placeholder={t.fullNamePlaceholder}
                                            className="w-full px-3 py-2 rounded-lg border border-[#4A3F35]/20 bg-white font-bold text-xs text-[#4A3F35] focus:outline-none focus:ring-2 focus:ring-[#4A3F35]"
                                          />
                                        </div>
                                        <div>
                                          <input
                                            type="text"
                                            {...register(`attendees.${index}.contact`)}
                                            placeholder={t.attendeeContactPlaceholder}
                                            className="w-full px-3 py-2 rounded-lg border border-[#4A3F35]/20 bg-white font-medium text-xs text-[#4A3F35] focus:outline-none focus:ring-2 focus:ring-[#4A3F35]"
                                          />
                                        </div>
                                      </div>
                                    </div>
                                  ))}
                                </div>

                                <button
                                  type="button"
                                  onClick={() => append({ name: '', contact: '' })}
                                  className="mt-2 w-full py-2.5 rounded-xl border border-dashed border-[#4A3F35]/30 bg-white/80 hover:bg-white text-xs font-bold text-[#4A3F35] transition-colors flex items-center justify-center gap-1.5"
                                >
                                  <Users className="w-4 h-4 text-[#8B735B]" />
                                  <span>{t.addAnotherGuestBtn}</span>
                                </button>
                              </div>
                            )}

                            {/* Dietary Restrictions (Only when Attending) */}
                            {rsvpStatus === 'Attending' && (
                              <div className="space-y-2">
                                <label className="label-mono block">
                                  {t.dietaryLabel}
                                </label>
                                <textarea
                                  rows={2}
                                  {...register('dietary')}
                                  placeholder={t.dietaryPlaceholder}
                                  className="w-full px-4 py-3 rounded-xl border border-[#4A3F35]/20 focus:outline-none focus:ring-2 focus:ring-[#4A3F35] text-sm bg-white text-[#4A3F35]"
                                />
                              </div>
                            )}

                            {/* Submit Button */}
                            <motion.button
                              whileTap={{ scale: 0.98 }}
                              type="submit"
                              disabled={submitting}
                              className="btn-accent w-full py-3.5 text-sm font-bold disabled:opacity-50"
                            >
                              <Send className="w-4 h-4 mr-2" />
                              <span>{submitting ? t.submittingRsvpBtn : t.submitRsvpBtn}</span>
                            </motion.button>

                          </form>

                        </motion.div>
                      )}

                    </AnimatePresence>
                  </div>
                )}

              </div>
            )}
            {tab === 'event' && (
              <div className="space-y-4">
              {/* Back to RSVP Form header bar */}
              <div className="bg-white border border-[#4A3F35]/15 p-3.5 rounded-2xl flex items-center justify-between">
                <button
                  onClick={() => handleTabChange('rsvp')}
                  className="text-xs font-bold text-[#4A3F35] hover:text-[#D4A373] inline-flex items-center space-x-1 font-mono transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>{t.returnToRsvpBtn}</span>
                </button>
                <span className="text-[11px] font-mono text-[#4A3F35]/60 font-bold">
                  {t.step2of2Label}
                </span>
              </div>

              <EventDetailsCard />

              {/* Bottom Carousel Action */}
              <div className="text-center pt-2">
                <button
                  onClick={() => handleTabChange('rsvp')}
                  className="btn-accent px-6 py-3.5 text-sm font-bold shadow-md hover:scale-105 inline-flex items-center space-x-2"
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  <span>{t.returnToConfirmationBtn}</span>
                </button>
              </div>
              </div>
            )}
            {tab === 'invite' && (
              <div className="space-y-4">
              {/* Back to RSVP Form header bar */}
              <div className="bg-white border border-[#4A3F35]/15 p-3.5 rounded-2xl flex items-center justify-between">
                <button
                  onClick={() => handleTabChange('rsvp')}
                  className="text-xs font-bold text-[#4A3F35] hover:text-[#D4A373] inline-flex items-center space-x-1 font-mono transition-colors"
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span>{t.returnToRsvpBtn}</span>
                </button>
                <span className="text-[11px] font-mono text-[#4A3F35]/60 font-bold">
                  {t.step3of3Label}
                </span>
              </div>

              {/* Invite a guest */}
              <div className="card-paper p-5 sm:p-6 space-y-4">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 bg-[#EFE6DC] text-[#8B735B] rounded-xl border border-[#CBAE94]">
                    <Users className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="font-sans text-base font-bold text-[#8B735B]">{t.inviteGuestTitle}</h3>
                    <p className="text-[11px] text-[#5D5449]">{t.inviteGuestHint}</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label-mono block mb-1">{t.inviteeNameLabel} *</label>
                    <input
                      type="text"
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      placeholder={t.inviteeNamePh}
                      className="w-full px-3 py-2 rounded-lg border border-[#4A3F35]/20 bg-white text-xs text-[#4A3F35] focus:outline-none focus:ring-2 focus:ring-[#4A3F35]"
                    />
                  </div>
                  <div>
                    <label className="label-mono block mb-1">{t.inviteeContactLabel}</label>
                    <input
                      type="text"
                      value={inviteContact}
                      onChange={(e) => setInviteContact(e.target.value)}
                      placeholder={t.inviteeContactPh}
                      className="w-full px-3 py-2 rounded-lg border border-[#4A3F35]/20 bg-white text-xs text-[#4A3F35] focus:outline-none focus:ring-2 focus:ring-[#4A3F35]"
                    />
                  </div>
                </div>
                <div>
                  <label className="label-mono block mb-1">{t.inviteChannelLabel}</label>
                  <select
                    value={inviteChannel}
                    onChange={(e) => setInviteChannel(e.target.value as 'link-only' | 'email' | 'text' | 'both')}
                    className="w-full px-3 py-2 rounded-lg border border-[#4A3F35]/20 bg-white text-xs font-bold text-[#4A3F35] focus:outline-none focus:ring-2 focus:ring-[#4A3F35]"
                  >
                    {inviteChannels.map((c) => (
                      <option key={c} value={c}>{channelLabel(t, c)}</option>
                    ))}
                  </select>
                  {inviteChannel === 'link-only' && (
                    <p className="text-[11px] text-[#8B735B] font-medium mt-1 flex items-center gap-1">
                      <Link2 className="w-3 h-3 shrink-0" />
                      {t.linkOnlyHint}
                    </p>
                  )}
                </div>
                <div>
                  <label className="label-mono block mb-1">{t.inviteeNoteLabel}</label>
                  <input
                    type="text"
                    value={inviteNote}
                    onChange={(e) => setInviteNote(e.target.value)}
                    placeholder={t.inviteeNotePh}
                    className="w-full px-3 py-2 rounded-lg border border-[#4A3F35]/20 bg-white text-xs text-[#4A3F35] focus:outline-none focus:ring-2 focus:ring-[#4A3F35]"
                  />
                </div>
                <button
                  onClick={handleInvite}
                  disabled={inviting}
                  className="btn-accent w-full py-3 text-sm font-bold disabled:opacity-50"
                >
                  <Send className="w-4 h-4 mr-2" />
                  <span>{inviting ? t.sendingInviteBtn : t.createInviteBtn}</span>
                </button>
              </div>

              {/* Your invitations */}
              <div className="card-paper p-5 sm:p-6 space-y-3">
                <div className="label-mono">{t.yourInvitesTitle}</div>
                {myInvites.length === 0 ? (
                  <p className="text-xs text-[#5D5449]/70 italic py-2">{t.noInvitesYet}</p>
                ) : (
                  <div className="space-y-2.5">
                    {myInvites.map((invitee) => (
                      <div key={invitee.id} className="p-3 bg-white rounded-xl border border-[#4A3F35]/15 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-[#4A3F35] truncate">{invitee.name}</p>
                            <p className="text-[10px] font-mono text-[#8B735B] truncate">
                              {invitee.email || invitee.phone || t.channelNone}
                            </p>
                            {invitee.guest_note && (
                              <p className="text-[10px] text-[#5D5449] italic truncate">{invitee.guest_note}</p>
                            )}
                          </div>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${
                              invitee.rsvp_status === 'Attending'
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                : invitee.rsvp_status === 'Declined'
                                ? 'bg-rose-50 text-rose-800 border-rose-300'
                                : 'bg-[#E9E0D2] text-[#8B735B] border-[#CBAE94]'
                            }`}
                          >
                            {statusWord(invitee.rsvp_status)}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => copyText(`${window.location.origin}/rsvp/${invitee.magic_token}`, `link-${invitee.id}`)}
                            className="px-2.5 py-1.5 rounded-lg bg-[#E9E0D2] hover:bg-[#CBAE94] hover:text-white text-[#8B735B] text-[10px] font-bold font-mono transition-colors border border-[#CBAE94] inline-flex items-center gap-1"
                          >
                            {copiedKey === `link-${invitee.id}` ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                            <span>{copiedKey === `link-${invitee.id}` ? t.linkCopied : t.copyLink}</span>
                          </button>
                          <button
                            onClick={() => copyText((invitee as Guest & { invite_message?: string }).invite_message || '', `msg-${invitee.id}`)}
                            className="px-2.5 py-1.5 rounded-lg bg-white hover:bg-[#EFE6DC] text-[#5D5449] text-[10px] font-bold font-mono transition-colors border border-[#CBAE94] inline-flex items-center gap-1"
                          >
                            {copiedKey === `msg-${invitee.id}` ? <Check className="w-3 h-3 text-emerald-600" /> : <MessageSquare className="w-3 h-3" />}
                            <span>{copiedKey === `msg-${invitee.id}` ? t.linkCopied : t.copyMessageBtn}</span>
                          </button>
                          <button
                            onClick={() => handleRemoveInvite(invitee)}
                            className="ml-auto px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 text-[10px] font-bold font-mono transition-colors border border-rose-300 inline-flex items-center gap-1"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>{t.removeInviteBtn}</span>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Bottom Carousel Action */}
              <div className="text-center pt-2">
                <button
                  onClick={() => handleTabChange('rsvp')}
                  className="btn-accent px-6 py-3.5 text-sm font-bold shadow-md hover:scale-105 inline-flex items-center space-x-2"
                >
                  <ChevronLeft className="w-4 h-4 mr-1" />
                  <span>{t.returnToConfirmationBtn}</span>
                </button>
              </div>
              </div>
            )}
            </div>
            );
          })}
        </div>
      </div>

      {/* Contact & notifications (self-service) */}
      {guest && !loading && (
        <div className="max-w-2xl mx-auto space-y-5 pt-4">
          <div className="card-paper p-5 sm:p-6 space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="p-2 bg-[#EFE6DC] text-[#8B735B] rounded-xl border border-[#CBAE94]">
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-sans text-base font-bold text-[#8B735B]">{t.contactCardTitle}</h3>
                <p className="text-[11px] text-[#5D5449]">{t.contactCardHint}</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label-mono block mb-1">{t.fieldEmail}</label>
                <input
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[#4A3F35]/20 bg-white text-xs text-[#4A3F35] focus:outline-none focus:ring-2 focus:ring-[#4A3F35]"
                />
              </div>
              <div>
                <label className="label-mono block mb-1">{t.fieldPhone}</label>
                <input
                  type="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[#4A3F35]/20 bg-white text-xs text-[#4A3F35] focus:outline-none focus:ring-2 focus:ring-[#4A3F35]"
                />
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[200px]">
                <label className="label-mono block mb-1">{t.notificationChoiceLabel}</label>
                <select
                  value={contactChannel}
                  onChange={(e) => setContactChannel(e.target.value as 'none' | 'email' | 'text' | 'both')}
                  className="w-full px-3 py-2 rounded-lg border border-[#4A3F35]/20 bg-white text-xs font-bold text-[#4A3F35] focus:outline-none focus:ring-2 focus:ring-[#4A3F35]"
                >
                  {contactChannels.map((c) => (
                    <option key={c} value={c}>{channelLabel(t, c)}</option>
                  ))}
                </select>
              </div>
              <button
                onClick={handleSaveContact}
                disabled={savingContact}
                className="btn-accent px-5 py-2 text-xs font-bold disabled:opacity-50 inline-flex items-center"
              >
                <Check className="w-3.5 h-3.5 mr-1.5" />
                <span>{savingContact ? t.sendingInviteBtn : t.contactSaveBtn}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Invite success modal */}
      <InviteSuccessModal modal={inviteModal} onClose={() => setInviteModal(null)} />
      </>
      )}

    </div>
  );
};
