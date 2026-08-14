import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Guest, EventAlert } from '../../types';
import { EventDetailsCard } from './EventDetailsCard';
import { stripPrimaryAttendees, buildAttendeePayload } from '../../lib/guestAttendees';
import { motion, AnimatePresence } from 'motion/react';
import { useToast } from '../shared/ToastContext';
import { cardStagger, popIn, fadeUp } from '../shared/motionPresets';
import { useT } from '../shared/i18n';
import {
  Heart,
  CheckCircle2,
  XCircle,
  Users,
  Utensils,
  Send,
  Sparkles,
  Gift,
  Lightbulb,
  ExternalLink,
  Edit3,
  AlertCircle,
  Calendar,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Bell,
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

  // Carousel Tab State ('rsvp' = Page 1 | 'event' = Page 2)
  const [activeTab, setActiveTab] = useState<'rsvp' | 'event'>('rsvp');
  const [direction, setDirection] = useState<number>(1);

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
  const handleTabChange = (newTab: 'rsvp' | 'event') => {
    if (newTab === activeTab) return;
    setDirection(newTab === 'event' ? 1 : -1);
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
        toast.error(dataRes.error || 'Failed to submit RSVP');
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
      await fetch(`/api/rsvp/${token}/reset`, { method: 'POST' });
      setIsEditing(true);
      setSubmitted(false);
      toast.info(t.rsvpUnlockedToast);
    } catch (err) {
      console.error('Error resetting token:', err);
      toast.error(t.rsvpResetErrorToast);
    }
  };

  const slideVariants = {
    enter: (dir: number) => ({
      x: dir > 0 ? '100%' : '-100%',
      opacity: 0,
    }),
    center: {
      x: '0%',
      opacity: 1,
    },
    exit: (dir: number) => ({
      x: dir < 0 ? '100%' : '-100%',
      opacity: 0,
    }),
  };

  // Filter alerts for the current guest:
  // 1. Guests who have DECLINED will NEVER see any broadcast alerts.
  // 2. Filter by target_audience (PENDING vs ATTENDING vs ALL).
  const visibleAlerts = alerts.filter((a) => {
    if (guest?.rsvp_status === 'Declined') {
      return false;
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
      {/* 2-Tab Carousel Header Navigation Control */}
      <div className="bg-white border-2 border-[#4A3F35] p-1.5 rounded-full flex items-center justify-between max-w-lg mx-auto shadow-sm">
        <button
          onClick={() => handleTabChange(activeTab === 'event' ? 'rsvp' : 'event')}
          className="p-2.5 rounded-full hover:bg-[#E9E0D2]/50 text-[#4A3F35] transition-colors"
          title={t.prevSlideBtn}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-1 relative bg-[#F8F5F0] p-1 rounded-full border border-[#4A3F35]/15">
          <button
            onClick={() => handleTabChange('rsvp')}
            className={`relative px-4 py-2 rounded-full text-xs font-bold font-mono transition-all flex items-center space-x-2 z-10 ${
              activeTab === 'rsvp'
                ? 'text-[#F8F5F0]'
                : 'text-[#4A3F35]/70 hover:text-[#4A3F35]'
            }`}
          >
            {activeTab === 'rsvp' && (
              <motion.div
                layoutId="activeCarouselTab"
                className="absolute inset-0 bg-[#4A3F35] rounded-full -z-10"
                transition={{ type: 'spring', stiffness: 350, damping: 30 }}
              />
            )}
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>{t.rsvpTabLabel}</span>
          </button>

          <button
            onClick={() => handleTabChange('event')}
            className={`relative px-4 py-2 rounded-full text-xs font-bold font-mono transition-all flex items-center space-x-2 z-10 ${
              activeTab === 'event'
                ? 'text-[#F8F5F0]'
                : 'text-[#4A3F35]/70 hover:text-[#4A3F35]'
            }`}
          >
            {activeTab === 'event' && (
              <motion.div
                layoutId="activeCarouselTab"
                className="absolute inset-0 bg-[#4A3F35] rounded-full -z-10"
                transition={{ type: 'spring', stiffness: 350, damping: 30 }}
              />
            )}
            <Calendar className="w-3.5 h-3.5" />
            <span>{t.eventTabLabel}</span>
          </button>
        </div>

        <button
          onClick={() => handleTabChange(activeTab === 'rsvp' ? 'event' : 'rsvp')}
          className="p-2.5 rounded-full hover:bg-[#E9E0D2]/50 text-[#4A3F35] transition-colors"
          title={t.nextSlideBtn}
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Carousel Container with Smooth Sliding Animation */}
      <div className="relative overflow-hidden min-h-[450px]">
        <AnimatePresence mode="wait" custom={direction}>
          
          {/* Tab 1: RSVP Form / Confirmation */}
          {activeTab === 'rsvp' && (
            <motion.div
              key="rsvpTab"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: 'spring', stiffness: 260, damping: 28 }}
            >
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
                        <motion.div
                          key="confirmation"
                          variants={cardStagger}
                          initial="hidden"
                          animate="show"
                          className="text-center space-y-6 max-w-lg mx-auto py-2"
                        >
                          <motion.div
                            variants={popIn}
                            className="w-16 h-16 bg-[#E9E0D2] text-[#4A3F35] rounded-full flex items-center justify-center mx-auto border-2 border-[#4A3F35] shadow-xs"
                          >
                            <motion.span
                              animate={{ rotate: [0, -8, 8, 0] }}
                              transition={{ duration: 0.6, delay: 0.4 }}
                            >
                              <CheckCircle2 className="w-8 h-8 text-[#4A3F35]" />
                            </motion.span>
                          </motion.div>

                          <motion.div className="space-y-2" variants={fadeUp}>
                            {guest.is_read_only && (
                              <div className="bg-[#E9E0D2] border border-[#8B735B] rounded-xl p-3 mb-2 flex items-center justify-center gap-2 text-xs font-bold text-[#4A3F35]">
                                <Sparkles className="w-4 h-4 text-[#8B735B]" />
                                <span>{t.readOnlyBadge}</span>
                              </div>
                            )}
                            <span className="label-mono inline-flex items-center gap-1.5 bg-[#E9E0D2] px-3 py-1 rounded-full border border-[#4A3F35]/20">
                              <Sparkles className="w-3.5 h-3.5 text-[#8B735B]" />
                              <span>{t.rsvpConfirmedTitle}</span>
                            </span>
                            <h3 className="font-newsreader text-2xl sm:text-3xl font-bold text-[#4A3F35]">
                              {guest.rsvp_status === 'Attending'
                                ? `${t.rsvpConfirmedMsgAttending}`
                                : `${t.rsvpConfirmedMsgDeclined}`}
                            </h3>
                            {guest.is_read_only && (
                              <p className="text-xs text-[#5D5449] font-medium pt-1 max-w-md mx-auto">
                                {t.readOnlyNotice.replace('{{name}}', guest.confirmed_by_guest_name || 'the main guest')}
                              </p>
                            )}
                          </motion.div>

                          {/* 4-Digit Reservation Code Box */}
                          <motion.div
                            variants={popIn}
                            transition={{ delay: 0.2 }}
                            className="bg-[#EFE6DC] rounded-2xl p-4 border-2 border-[#CBAE94] text-center space-y-1 shadow-sm"
                          >
                            <p className="text-xs font-mono font-bold uppercase tracking-wider text-[#8B735B]">
                              {t.seatingCodeTitle}
                            </p>
                            <motion.div
                              className="text-3xl font-mono font-black text-[#4A3F35] tracking-widest py-1"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ delay: 0.35 }}
                            >
                              {guest.code.split('').map((digit, i) => (
                                <motion.span
                                  key={i}
                                  className="inline-block"
                                  initial={{ opacity: 0, y: 14, scale: 0.6 }}
                                  animate={{ opacity: 1, y: 0, scale: 1 }}
                                  transition={{ delay: 0.35 + i * 0.09, type: 'spring', stiffness: 420, damping: 14 }}
                                >
                                  {digit}
                                </motion.span>
                              ))}
                            </motion.div>
                            <p className="text-[11px] text-[#5D5449] font-medium">
                              {t.seatingCodeHint}
                            </p>
                          </motion.div>

                          {/* Summary Box */}
                          <motion.div
                            variants={fadeUp}
                            className="bg-white rounded-2xl p-6 border border-[#4A3F35]/20 text-left space-y-2 text-xs sm:text-sm shadow-xs"
                          >
                            <p className="text-[#4A3F35]">
                              <strong>{t.invitedGuestLabel}</strong> {guest.name}
                            </p>
                            <p className="text-[#4A3F35]">
                              <strong>{t.reservationCodeLabel}</strong> <span className="font-mono font-bold text-[#8B735B]">{guest.code}</span>
                            </p>
                            <p className="text-[#4A3F35]">
                              <strong>{t.statusLabel}</strong>{' '}
                              <span className={guest.rsvp_status === 'Attending' ? 'text-emerald-700 font-bold' : 'text-rose-600 font-bold'}>
                                {guest.rsvp_status}
                              </span>
                            </p>
                            {guest.rsvp_status === 'Attending' && (
                              <>
                                <p className="text-[#4A3F35]">
                                  <strong>Attending Guests ({guest.attending_party_size || 1}):</strong>{' '}
                                  {guest.attendee_names && guest.attendee_names.length > 0
                                    ? guest.attendee_names.join(', ')
                                    : guest.name}
                                </p>
                                {guest.dietary_restrictions && (
                                  <p className="text-[#4A3F35]">
                                    <strong>{t.dietaryRestrictionsLabel}</strong> {guest.dietary_restrictions}
                                  </p>
                                )}
                              </>
                            )}
                          </motion.div>

                          {/* Registry Link & Actions */}
                          <div className="space-y-4 pt-2">
                            <button
                              onClick={() => handleTabChange('event')}
                              className="btn-accent w-full text-sm space-x-2 py-3.5"
                            >
                              <Calendar className="w-4 h-4" />
                              <span>{t.viewEventDetailsBtn}</span>
                              <ChevronRight className="w-4 h-4 ml-1" />
                            </button>

                            <div className="flex items-center justify-center pt-1">
                              {!guest.is_read_only ? (
                                <button
                                  onClick={handleEditRsvp}
                                  className="inline-flex items-center space-x-1.5 text-[#4A3F35] hover:text-[#D4A373] text-xs font-mono font-bold underline transition-colors"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                  <span>{t.editRsvpBtn}</span>
                                </button>
                              ) : (
                                <p className="text-xs font-mono text-[#5D5449]">
                                  {t.readOnlyContactHostNote.replace('{{name}}', guest.confirmed_by_guest_name || 'the main guest')}
                                </p>
                              )}
                            </div>
                          </div>

                          {/* Status Badge */}
                          <div className="pt-6 border-t border-dashed border-[#4A3F35]/20">
                            <div className="label-mono mb-2">{t.currentStatusLabel}</div>
                            <div className="bg-[#E9E0D2] px-5 py-2.5 rounded-full border border-[#4A3F35]/20 inline-flex items-center gap-2 text-xs font-bold text-[#4A3F35]">
                              <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                              <span>{t.rsvpConfirmedLabel} <strong>Attending ({guest.attending_party_size || 1})</strong></span>
                            </div>
                          </div>
                        </motion.div>
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
            </motion.div>
          )}

          {/* Tab 2: Event Details & Schedule */}
          {activeTab === 'event' && (
            <motion.div
              key="eventTab"
              custom={direction}
              variants={slideVariants}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ type: 'spring', stiffness: 260, damping: 28 }}
              className="space-y-4"
            >
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
            </motion.div>
          )}

        </AnimatePresence>
      </div>
      </>
      )}

    </div>
  );
};
