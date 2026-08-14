import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence, Variants } from 'motion/react';
import {
  Users,
  CheckCircle2,
  Clock,
  XCircle,
  UtensilsCrossed,
  UserPlus,
  Send,
  Copy,
  Check,
  Search,
  Upload,
  Download,
  FileSpreadsheet,
  Settings,
  Trash2,
  Mail,
  Smartphone,
  MessageSquare,
  Lightbulb,
  QrCode,
  Sparkles,
  Link2,
} from 'lucide-react';
import { Guest, GuestbookEntry, Language, DeliveryChannel } from '../../types';
import { Translations } from '../../translations';
import { adminFetch } from '../../lib/api';
import { GuestImportSchema, EditGuestSchema } from '../../lib/validation';
import { useCapabilities, availableChannels } from '../../lib/capabilities';
import { useConfirm } from '../shared/ConfirmDialog';
import { Modal } from '../shared/Modal';
import { useToast } from '../shared/ToastContext';
import { EmptyState } from '../shared/EmptyState';
import { TextInput, Select } from '../shared/ui';

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

interface AdminGuestsTabProps {
  language: Language;
  t: Translations;
  guests: Guest[];
  guestbookEntries: GuestbookEntry[];
  onRefresh: () => Promise<void>;
}

type AddGuestFormValues = z.input<typeof GuestImportSchema>;
type EditGuestFormValues = z.input<typeof EditGuestSchema>;

export const AdminGuestsTab: React.FC<AdminGuestsTabProps> = ({ language, t, guests, guestbookEntries, onRefresh }) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const confirm = useConfirm();

  const [submittingGuest, setSubmittingGuest] = useState(false);

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<AddGuestFormValues>({
    resolver: zodResolver(GuestImportSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      delivery_channel: 'email',
      max_party_size: 2,
      language_pref: language,
    },
  });

  const { register: registerEdit, handleSubmit: handleSubmitEdit, reset: resetEditForm, formState: { errors: editErrors } } = useForm<EditGuestFormValues>({
    resolver: zodResolver(EditGuestSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      delivery_channel: 'none',
      max_party_size: 2,
      rsvp_status: 'Pending',
    },
  });

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Attending' | 'Pending' | 'Declined'>('All');

  const [showCsvImportModal, setShowCsvImportModal] = useState(false);
  const [rawCsvText, setRawCsvText] = useState('');
  const [importingCsv, setImportingCsv] = useState(false);

  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  const [editingGuest, setEditingGuest] = useState<Guest | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const [invitedGuestModal, setInvitedGuestModal] = useState<{
    name: string;
    email: string;
    token: string;
    message: string;
  } | null>(null);

  const [copiedMsg, setCopiedMsg] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<'All' | 'Host' | 'Guest-invited'>('All');

  const { data: caps } = useCapabilities();
  const channelOptions: DeliveryChannel[] = availableChannels(caps);
  const deliveryChannel = watch('delivery_channel');
  // If the current channel can't actually send (e.g. SMS unconfigured), fall
  // back to a link-only invite rather than leaving a dead option selected.
  useEffect(() => {
    if (caps && deliveryChannel && deliveryChannel !== 'none' && !channelOptions.includes(deliveryChannel)) {
      setValue('delivery_channel', 'none');
    }
  }, [caps, deliveryChannel, channelOptions, setValue]);

  const getGuestPartySize = (guest: Guest): number => {
    if (!guest) return 1;
    const namesCount = guest.attendee_names ? guest.attendee_names.length : 0;
    const detailsCount = guest.attendee_details ? guest.attendee_details.length : 0;
    const attendingCount = guest.attending_party_size || 0;
    const maxCount = guest.max_party_size || 1;
    if (guest.rsvp_status === 'Attending') {
      return Math.max(namesCount, detailsCount, attendingCount, 1);
    }
    return Math.max(namesCount, detailsCount, attendingCount, maxCount, 1);
  };

  const primaryGuests = guests.filter((g) => !g.is_read_only);
  const attendingGuests = primaryGuests.filter((g) => g.rsvp_status === 'Attending');
  const pendingGuests = primaryGuests.filter((g) => g.rsvp_status === 'Pending');
  const declinedGuests = primaryGuests.filter((g) => g.rsvp_status === 'Declined');
  const totalAttendingPartySize = attendingGuests.reduce((acc, g) => acc + getGuestPartySize(g), 0);

  const dietaryList = guests
    .filter((g) => g.rsvp_status === 'Attending' && g.dietary_restrictions && g.dietary_restrictions.trim() !== '')
    .map((g) => ({
      guestName: g.name,
      restriction: g.dietary_restrictions.trim(),
    }));

  const filteredGuests = guests.filter((g) => {
    const matchesSearch =
      g.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      g.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'All' || g.rsvp_status === statusFilter;
    const matchesSource =
      sourceFilter === 'All' ||
      (sourceFilter === 'Guest-invited' ? !!g.invited_by_guest_id : !g.invited_by_guest_id);
    return matchesSearch && matchesStatus && matchesSource;
  });

  const handleOpenEditGuest = (g: Guest) => {
    setEditingGuest(g);
    resetEditForm({
      name: g.name,
      email: g.email || '',
      phone: g.phone || '',
      delivery_channel: channelOptions.includes((g.delivery_channel || 'none') as DeliveryChannel)
        ? ((g.delivery_channel || 'none') as DeliveryChannel)
        : 'none',
      max_party_size: Number(g.max_party_size || getGuestPartySize(g) || 2),
      rsvp_status: g.rsvp_status,
    });
  };

  const handleSaveEditGuest = async (values: EditGuestFormValues) => {
    if (!editingGuest) return;
    if ((values.delivery_channel === 'email' || values.delivery_channel === 'both') && !(values.email || '').trim()) {
      toast.error(t.emailRequiredToast);
      return;
    }
    if ((values.delivery_channel === 'text' || values.delivery_channel === 'both') && !(values.phone || '').trim()) {
      toast.error(t.phoneRequiredToast);
      return;
    }
    try {
      setSavingEdit(true);
      const res = await adminFetch(`/api/guests/${editingGuest.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: values.name.trim(),
          email: (values.email || '').trim(),
          phone: (values.phone || '').trim(),
          delivery_channel: values.delivery_channel,
          max_party_size: values.max_party_size,
          attending_party_size: values.rsvp_status === 'Attending' ? values.max_party_size : editingGuest.attending_party_size,
          rsvp_status: values.rsvp_status,
        }),
      });
      const data = await res.json();
      if (data.guest) {
        setEditingGuest(null);
        toast.love(t.guestUpdatedToast.replace('{{name}}', data.guest.name));
        await onRefresh();
      }
    } catch (err) {
      console.error('Failed to update guest:', err);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteGuest = async (id: string, guestName: string) => {
    const ok = await confirm({
      title: `${t.deleteGuestTitle}?`,
      message: `Are you sure you want to delete the invitation for "${guestName}"? Their RSVP, seating assignment, and links will be removed.`,
      confirmText: 'Delete Guest',
    });
    if (!ok) return;
    try {
      const res = await adminFetch(`/api/guests/${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.info(t.guestDeletedToast.replace('{{name}}', guestName));
        await onRefresh();
      }
    } catch (err) {
      console.error('Failed to delete guest:', err);
    }
  };

  const handleExportCsv = () => {
    if (guests.length === 0) {
      toast.info(t.noExportToast);
      return;
    }
    const headers = ['Guest Name', 'Email', 'Phone', 'Delivery Channel', 'RSVP Status', 'Max Party Size', 'Attending Party Size', 'Dietary Restrictions', 'Table ID', 'Magic RSVP Token', 'Magic RSVP URL', 'Invited By'];
    const rows = guests.map((g) => {
      const url = `${window.location.origin}/rsvp/${g.magic_token}`;
      return [
        `"${g.name.replace(/"/g, '""')}"`,
        `"${(g.email || '').replace(/"/g, '""')}"`,
        `"${(g.phone || '').replace(/"/g, '""')}"`,
        `"${g.delivery_channel || 'none'}"`,
        `"${g.rsvp_status}"`,
        g.max_party_size,
        g.attending_party_size,
        `"${(g.dietary_restrictions || '').replace(/"/g, '""')}"`,
        `"${g.table_id || ''}"`,
        `"${g.magic_token}"`,
        `"${url}"`,
        `"${(g.invited_by_guest_name || 'Host').replace(/"/g, '""')}"`,
      ].join(',');
    });
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `baby_shower_guests_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.love(t.exportedToast);
  };

  const handleCopyAllLinks = () => {
    if (guests.length === 0) return;
    const linksFormatted = guests.map((g) => {
      const url = `${window.location.origin}/rsvp/${g.magic_token}`;
      return `${g.name}: ${url}`;
    }).join('\n');
    navigator.clipboard.writeText(linksFormatted);
    toast.love(t.linksCopiedToast.replace('{{count}}', String(guests.length)));
  };

  const handleSendInvitations = async () => {
    const ok = await confirm({
      title: 'Send Invitations?',
      message: `This will send invitation messages to all ${guests.length} invited guests on their preferred channel (email/SMS).`,
      confirmText: 'Send Invitations',
    });
    if (!ok) return;
    try {
      const res = await adminFetch('/api/send-invitations', { method: 'POST' });
      const data = await res.json();
      if (data.sent > 0) toast.love(t.invitesSentMsg.replace('{{count}}', String(data.sent)) + (data.failed > 0 ? t.invitesFailedSuffix.replace('{{count}}', String(data.failed)) : ''));
      else toast.error(t.invitesNoneToast);
    } catch { toast.error(t.invitesErrorToast); }
  };

  const handleSendReminders = async () => {
    const pendingCount = guests.filter((g) => g.rsvp_status === 'Pending').length;
    const ok = await confirm({
      title: 'Send Reminders?',
      message: `This will send reminder messages to the ${pendingCount} guest(s) who have not responded yet.`,
      confirmText: 'Send Reminders',
    });
    if (!ok) return;
    try {
      const res = await adminFetch('/api/send-reminders', { method: 'POST' });
      const data = await res.json();
      if (data.sent > 0) toast.info(t.remindersSentMsg.replace('{{count}}', String(data.sent)) + (data.failed > 0 ? t.invitesFailedSuffix.replace('{{count}}', String(data.failed)) : ''));
      else toast.error(t.remindersNoneToast);
    } catch { toast.error(t.remindersErrorToast); }
  };

  const handleProcessCsvImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawCsvText.trim()) {
      toast.error(t.csvEmptyToast);
      return;
    }
    try {
      setImportingCsv(true);
      const lines = rawCsvText.trim().split('\n');
      const parsedGuests: any[] = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        if (i === 0 && (line.toLowerCase().includes('name') || line.toLowerCase().includes('email'))) continue;
        const parts = line.split(',').map((p) => p.replace(/^"|"$/g, '').trim());
        if (parts[0]) {
          parsedGuests.push({
            name: parts[0],
            email: parts[1] || '',
            phone: parts[2] || '',
            max_party_size: Number(parts[3]) || 2,
            delivery_channel: parts[4] && ['email', 'text', 'both', 'none'].includes(parts[4].toLowerCase()) ? parts[4].toLowerCase() : 'email',
            language_pref: language,
          });
        }
      }
      if (parsedGuests.length === 0) {
        toast.error(t.csvInvalidToast);
        return;
      }
      const res = await adminFetch('/api/guests/batch-import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guests: parsedGuests }),
      });
      if (res.ok) {
        const data = await res.json();
        toast.love(t.csvImportedToast.replace('{{count}}', String(data.count)));
        setShowCsvImportModal(false);
        setRawCsvText('');
        onRefresh();
      } else {
        toast.error(t.csvImportFailedToast);
      }
    } catch (err) {
      console.error('CSV import error:', err);
      toast.error(t.csvImportErrorToast);
    } finally {
      setImportingCsv(false);
    }
  };

  const handleAddGuest = async (values: AddGuestFormValues) => {
    if (!values.name.trim()) return;
    if ((values.delivery_channel === 'email' || values.delivery_channel === 'both') && !(values.email || '').trim()) {
      toast.error(t.emailRequiredToast);
      return;
    }
    if ((values.delivery_channel === 'text' || values.delivery_channel === 'both') && !(values.phone || '').trim()) {
      toast.error(t.phoneRequiredToast);
      return;
    }
    try {
      setSubmittingGuest(true);
      const res = await adminFetch('/api/guests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: values.name.trim(),
          email: (values.email || '').trim(),
          phone: (values.phone || '').trim(),
          delivery_channel: values.delivery_channel,
          max_party_size: values.max_party_size,
          language_pref: values.language_pref,
        }),
      });
      const data = await res.json();
      if (data.guest && data.magic_token) {
        const contactInfo = [data.guest.email, data.guest.phone].filter(Boolean).join(' | ');
        setInvitedGuestModal({
          name: data.guest.name,
          email: contactInfo || data.guest.email || data.guest.phone || '',
          token: data.magic_token,
          message: data.invite_message || '',
        });
        setValue('name', '');
        setValue('email', '');
        setValue('phone', '');
        await onRefresh();
      } else if (data.error) {
        toast.error(data.error);
      }
    } catch (err) {
      console.error('Error adding guest:', err);
    } finally {
      setSubmittingGuest(false);
    }
  };

  const handleCopyMagicLink = (token: string) => {
    const fullUrl = `${window.location.origin}/rsvp/${token}`;
    navigator.clipboard.writeText(fullUrl);
    setCopiedToken(token);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  const handleCopyInviteMessage = async (guestId: string) => {
    try {
      const res = await adminFetch(`/api/guests/${guestId}/invite-message`);
      const data = await res.json();
      if (!data.message) throw new Error('No message');
      await navigator.clipboard.writeText(data.message);
      toast.love(t.messageCopiedToast);
    } catch {
      toast.error(t.invitesErrorToast);
    }
  };

  return (
    <motion.div
      key="guests"
      variants={containerVariants}
      initial="hidden"
      animate="show"
      className="space-y-8"
    >
      {/* Metrics Cards Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <motion.div variants={cardVariants} className="card-paper-sm p-4 sm:p-5 relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="label-mono">{t.statAttending}</span>
            <CheckCircle2 className="w-5 h-5 text-[#8B735B]" />
          </div>
          <div className="mt-3 flex items-baseline justify-between">
            <span className="text-2xl sm:text-3xl font-sans font-bold text-[#8B735B]">{attendingGuests.length}</span>
            <span className="text-xs text-[#5D5449] font-mono">({totalAttendingPartySize} {t.colPartySize.toLowerCase()})</span>
          </div>
          <div className="mt-2 text-[11px] text-[#8B735B] font-mono font-bold">{t.statTotalAttendingParty}: {totalAttendingPartySize}</div>
        </motion.div>

        <motion.div variants={cardVariants} className="card-paper-sm p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="label-mono">{t.statPending}</span>
            <Clock className="w-5 h-5 text-[#8B735B]" />
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-sans font-bold text-[#8B735B]">{pendingGuests.length}</span>
          </div>
          <div className="mt-2 text-[11px] text-[#5D5449] font-mono">{t.awaitingResponse}</div>
        </motion.div>

        <motion.div variants={cardVariants} className="card-paper-sm p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="label-mono">{t.statDeclined}</span>
            <XCircle className="w-5 h-5 text-rose-500" />
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-sans font-bold text-[#8B735B]">{declinedGuests.length}</span>
          </div>
          <div className="mt-2 text-[11px] text-rose-600 font-mono">{t.unableToAttend}</div>
        </motion.div>

        <motion.div variants={cardVariants} className="card-paper-sm p-4 sm:p-5">
          <div className="flex items-center justify-between">
            <span className="label-mono">{t.statTotalGuests}</span>
            <Users className="w-5 h-5 text-[#8B735B]" />
          </div>
          <div className="mt-3">
            <span className="text-2xl sm:text-3xl font-sans font-bold text-[#8B735B]">{guests.length}</span>
          </div>
          <div className="mt-2 text-[11px] text-[#5D5449] font-mono">{t.totalGuestInvites}</div>
        </motion.div>
      </div>

      {/* Middle Section: Add Guest Form & Dietary Restriction Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div variants={cardVariants} className="lg:col-span-2 card-paper p-6 sm:p-8 space-y-6">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 bg-[#EFE6DC] text-[#8B735B] rounded-2xl border border-[#CBAE94]">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-sans text-xl font-bold text-[#8B735B]">{t.addGuestTitle}</h3>
              <p className="text-xs text-[#5D5449]">{t.addGuestSubtitle}</p>
            </div>
          </div>

          <form onSubmit={handleSubmit(handleAddGuest)} className="space-y-4">
            <div className="bg-[#EFE6DC]/40 p-3.5 rounded-2xl border border-[#CBAE94]/60 space-y-2">
              <label className="label-mono block text-xs font-bold text-[#8B735B]">{t.fieldSendVia} *</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {channelOptions.map((c) => (
                  <button key={c} type="button" onClick={() => setValue('delivery_channel', c)}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${deliveryChannel === c ? 'bg-[#8B735B] text-white border-[#8B735B] shadow-xs' : 'bg-white text-[#5D5449] border-[#CBAE94] hover:bg-[#EFE6DC]'}`}>
                    {c === 'none' ? <Link2 className="w-3.5 h-3.5" />
                      : c === 'email' ? <Mail className="w-3.5 h-3.5" />
                      : c === 'text' ? <MessageSquare className="w-3.5 h-3.5" />
                      : <Smartphone className="w-3.5 h-3.5" />}
                    <span>{c === 'none' ? t.channelNone : c === 'email' ? t.channelEmail : c === 'text' ? t.channelText : t.channelBoth}</span>
                  </button>
                ))}
              </div>
              {deliveryChannel === 'none' && (
                <p className="text-[11px] text-[#8B735B] font-mono flex items-center gap-1">
                  <Lightbulb className="w-3 h-3 shrink-0" /> {t.linkOnlyHint}
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label-mono block mb-1">{t.fieldName} *</label>
                <TextInput type="text" required placeholder={t.nameExamplePh} {...register('name')} />
                {errors.name && <p className="text-rose-600 text-[10px]">{errors.name.message}</p>}
              </div>
              <div>
                <label className="label-mono block mb-1">{t.fieldEmail} {(deliveryChannel === 'email' || deliveryChannel === 'both') ? '*' : '(Optional)'}</label>
                <TextInput type="email" required={deliveryChannel === 'email' || deliveryChannel === 'both'} placeholder={t.emailExamplePh} {...register('email')} />
                {errors.email && <p className="text-rose-600 text-[10px]">{errors.email.message}</p>}
              </div>
              <div>
                <label className="label-mono block mb-1">{t.fieldPhone} {(deliveryChannel === 'text' || deliveryChannel === 'both') ? '*' : '(Optional)'}</label>
                <TextInput type="tel" required={deliveryChannel === 'text' || deliveryChannel === 'both'} placeholder={t.fieldPhonePlaceholder} {...register('phone')} />
                {errors.phone && <p className="text-rose-600 text-[10px]">{errors.phone.message}</p>}
              </div>
              <div>
                <label className="label-mono block mb-1">{t.fieldLanguage}</label>
                <Select {...register('language_pref')}>
                  <option value="EN">{t.presetEnglish}</option>
                  <option value="FR">{t.presetFrench}</option>
                </Select>
              </div>
              <div>
                <label className="label-mono block mb-1">{language === 'FR' ? 'Nombre de personnes (Taille du groupe) *' : 'Allowed Party Size (Max Guests) *'}</label>
                <TextInput type="number" min="1" max="20" required {...register('max_party_size', { valueAsNumber: true })} />
                {errors.max_party_size && <p className="text-rose-600 text-[10px]">{errors.max_party_size.message}</p>}
              </div>
            </div>

            <motion.button whileTap={{ scale: 0.98 }} type="submit" disabled={submittingGuest}
              className="btn-accent w-full sm:w-auto py-3 px-6 text-sm disabled:opacity-50">
              <Send className="w-4 h-4 mr-2" />
              <span>{submittingGuest ? t.sendingInviteBtn : t.sendInviteBtn}</span>
            </motion.button>
          </form>
        </motion.div>

        <motion.div variants={cardVariants} className="card-paper p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center space-x-2.5 mb-4">
              <div className="p-2 bg-[#EFE6DC] text-[#8B735B] rounded-xl border border-[#CBAE94]">
                <UtensilsCrossed className="w-5 h-5" />
              </div>
              <h3 className="font-sans text-lg font-bold text-[#8B735B]">{t.dietaryTitle}</h3>
            </div>
            {dietaryList.length === 0 ? (
              <p className="text-xs text-[#5D5449]/70 italic py-6 text-center font-mono">{t.noDietaryMsg}</p>
            ) : (
              <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                {dietaryList.map((item, idx) => (
                  <div key={idx} className="p-3 bg-white rounded-2xl border border-[#CBAE94] text-xs text-[#5D5449] flex flex-col space-y-0.5 shadow-2xs">
                    <span className="font-bold text-[#8B735B]">{item.guestName}:</span>
                    <span className="text-[#5D5449] bg-[#EFE6DC] px-2 py-0.5 rounded-md inline-block self-start font-medium mt-1">{item.restriction}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="mt-4 pt-3 border-t border-dashed border-[#CBAE94] text-[11px] text-[#8B735B] font-mono font-bold text-center">
            Total Reported Dietary Needs: {dietaryList.length}
          </div>
        </motion.div>
      </div>

      {/* Invited Guests Table Section */}
      <motion.div variants={cardVariants} className="card-paper p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="label-mono">{t.guestListBadge}</div>
            <h3 className="font-sans text-xl font-bold text-[#8B735B]">{t.guestListTitle}</h3>
          </div>

          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <div className="relative">
              <Search className="w-4 h-4 text-[#CBAE94] absolute left-3 top-2.5" />
              <input type="text" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={t.searchGuestsPh}
                className="pl-9 pr-3 py-1.5 rounded-full border-2 border-[#CBAE94] text-xs font-bold text-[#5D5449] focus:outline-none focus:ring-2 focus:ring-[#8B735B] w-36 sm:w-44 bg-white" />
            </div>

            <div className="flex items-center gap-1.5">
              <button type="button" onClick={handleExportCsv}
                className="px-3 py-1.5 rounded-full bg-white border border-[#CBAE94] text-[#8B735B] font-bold text-xs hover:bg-[#EFE6DC] transition-all flex items-center gap-1 shadow-2xs" title={t.exportCsvTitle}>
                <Download className="w-3.5 h-3.5" /><span className="hidden md:inline">{t.exportCsvBtn}</span>
              </button>
              <button type="button" onClick={() => setShowCsvImportModal(true)}
                className="px-3 py-1.5 rounded-full bg-white border border-[#CBAE94] text-[#8B735B] font-bold text-xs hover:bg-[#EFE6DC] transition-all flex items-center gap-1 shadow-2xs" title={t.importCsvTitle}>
                <Upload className="w-3.5 h-3.5" /><span className="hidden md:inline">{t.importCsvBtn}</span>
              </button>
              <button type="button" onClick={handleCopyAllLinks}
                className="px-3 py-1.5 rounded-full bg-white border border-[#CBAE94] text-[#8B735B] font-bold text-xs hover:bg-[#EFE6DC] transition-all flex items-center gap-1 shadow-2xs" title={t.copyAllLinksTitle}>
                <Copy className="w-3.5 h-3.5" /><span className="hidden md:inline">{t.copyAllLinksBtn}</span>
              </button>
              <button type="button" onClick={handleSendInvitations}
                className="px-3 py-1.5 rounded-full bg-[#8B735B] text-white font-bold text-xs hover:bg-[#4A3F35] transition-all flex items-center gap-1 shadow-2xs" title={t.sendInvitesTitle}>
                <Send className="w-3.5 h-3.5" /><span className="hidden md:inline">{t.sendInvitesBtn}</span>
              </button>
              <button type="button" onClick={handleSendReminders}
                className="px-3 py-1.5 rounded-full bg-amber-600 text-white font-bold text-xs hover:bg-amber-700 transition-all flex items-center gap-1 shadow-2xs" title={t.remindTitle}>
                <Clock className="w-3.5 h-3.5" /><span className="hidden md:inline">{t.remindBtn}</span>
              </button>
            </div>

            <div className="flex items-center space-x-1 bg-[#EFE6DC] p-1 rounded-full text-xs font-bold font-mono border border-[#CBAE94]">
              {(['All', 'Attending', 'Pending', 'Declined'] as const).map((st) => (
                <button key={st} onClick={() => setStatusFilter(st)}
                  className={`px-2.5 py-1 rounded-full transition-colors ${statusFilter === st ? 'bg-[#8B735B] text-white shadow-xs font-bold' : 'text-[#5D5449] hover:text-[#8B735B]'}`}>{st}</button>
              ))}
            </div>

            <div className="flex items-center space-x-1 bg-white p-1 rounded-full text-xs font-bold font-mono border border-[#CBAE94]" title={t.sourceFilterTitle}>
              {(['All', 'Host', 'Guest-invited'] as const).map((st) => (
                <button key={st} onClick={() => setSourceFilter(st)}
                  className={`px-2.5 py-1 rounded-full transition-colors ${sourceFilter === st ? 'bg-[#D4A373] text-white shadow-xs font-bold' : 'text-[#5D5449] hover:text-[#8B735B]'}`}>{st}</button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3">
          <AnimatePresence>
            {filteredGuests.map((guest) => {
              const isCopied = copiedToken === guest.magic_token;
              const initials = guest.name.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
              const channelLabel =
                guest.delivery_channel === 'both' ? t.channelBoth
                : guest.delivery_channel === 'text' ? t.channelText
                : guest.delivery_channel === 'none' ? t.channelNone
                : t.channelEmail;
              const partySize = getGuestPartySize(guest);
              const maxSize = Math.max(guest.max_party_size || 1, partySize);

              return (
                <motion.div
                  key={guest.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="bg-white border border-[#CBAE94]/50 rounded-2xl p-4 space-y-3 shadow-xs"
                >
                  {/* Header: initials, name, status */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-full bg-[#EFE6DC] border border-[#CBAE94] flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-[#8B735B]">{initials}</span>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-bold text-[#5D5449] text-sm truncate">{guest.name}</h4>
                          {guest.delivery_channel ? (
                            <span className="px-2 py-0.5 rounded-md bg-[#EFE6DC] border border-[#CBAE94] text-[10px] font-mono font-bold text-[#8B735B]">
                              {channelLabel}
                            </span>
                          ) : null}
                          {guest.invited_by_guest_name ? (
                            <span className="px-2 py-0.5 rounded-md bg-amber-50 border border-amber-300 text-[10px] font-mono font-bold text-amber-800" title={guest.guest_note || ''}>
                              {t.invitedByBadge.replace('{{name}}', guest.invited_by_guest_name)}
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md bg-[#F8F5F0] border border-[#CBAE94]/50 text-[10px] font-mono font-bold text-[#5D5449]/60">
                              {t.invitedByHostBadge}
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-[#5D5449]/70 font-mono truncate mt-0.5 flex items-center gap-2 flex-wrap">
                          {guest.email ? <span className="inline-flex items-center gap-1"><Mail className="w-3 h-3 shrink-0" />{guest.email}</span> : null}
                          {guest.phone ? <span className="inline-flex items-center gap-1"><Smartphone className="w-3 h-3 shrink-0" />{guest.phone}</span> : null}
                        </div>
                      </div>
                    </div>
                    {guest.rsvp_status === 'Attending' && (
                      <span className="inline-flex items-center space-x-1 px-3 py-1 rounded-full bg-[#EFE6DC] text-emerald-800 text-[11px] font-bold border border-emerald-300 whitespace-nowrap shrink-0">
                        <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" /><span>{t.statusAttendingWord}</span>
                      </span>
                    )}
                    {guest.rsvp_status === 'Pending' && (
                      <span className="inline-flex items-center space-x-1 px-3 py-1 rounded-full bg-[#EFE6DC] text-[#8B735B] text-[11px] font-bold border border-[#CBAE94] whitespace-nowrap shrink-0">
                        <Clock className="w-3 h-3 text-[#8B735B] shrink-0" /><span>{t.statusPendingWord}</span>
                      </span>
                    )}
                    {guest.rsvp_status === 'Declined' && (
                      <span className="inline-flex items-center space-x-1 px-3 py-1 rounded-full bg-rose-50 text-rose-800 text-[11px] font-bold border border-rose-300 whitespace-nowrap shrink-0">
                        <XCircle className="w-3 h-3 text-rose-500 shrink-0" /><span>{t.statusDeclinedWord}</span>
                      </span>
                    )}
                  </div>

                  {/* Details: code, party size, dietary */}
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="px-2.5 py-1 rounded-lg bg-[#EFE6DC] border border-[#CBAE94] text-xs font-bold font-mono text-[#8B735B]">{guest.code}</span>
                    <span className="px-2.5 py-1 rounded-lg bg-white border border-[#CBAE94] text-[11px] font-bold text-[#5D5449]">
                      {guest.rsvp_status === 'Attending'
                        ? `${partySize} / ${maxSize}`
                        : t.guestPartySizeLabel.replace('{{count}}', String(partySize)).replace('{{max}}', String(maxSize))}
                    </span>
                    {guest.dietary_restrictions ? (
                      <span className="px-2.5 py-1 rounded-full bg-[#EFE6DC] text-[11px] font-medium text-[#8B735B] border border-[#CBAE94] max-w-full truncate">
                        {guest.dietary_restrictions}
                      </span>
                    ) : null}
                  </div>

                  {/* Actions */}
                  <div className="grid grid-cols-4 gap-1.5 pt-2 border-t border-[#CBAE94]/30 sm:flex sm:justify-end sm:gap-2">
                    <button onClick={() => handleCopyMagicLink(guest.magic_token)}
                      className="px-2 py-3 bg-[#EFE6DC] hover:bg-[#CBAE94] hover:text-white text-[#8B735B] rounded-xl text-[11px] font-bold font-mono transition-colors inline-flex items-center justify-center space-x-1 border border-[#CBAE94] cursor-pointer"
                      title={t.copyMagicLinkTitle}>
                      {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : <Copy className="w-3 h-3 shrink-0" />}
                      <span className="truncate">{isCopied ? t.linkCopied : t.copyLink}</span>
                    </button>
                    <button onClick={() => handleCopyInviteMessage(guest.id)}
                      className="px-2 py-3 bg-[#8B735B] hover:bg-[#5D5449] text-white rounded-xl text-[11px] font-bold font-mono transition-colors inline-flex items-center justify-center space-x-1 cursor-pointer"
                      title={t.copyMessageBtn}>
                      <Copy className="w-3 h-3 shrink-0" /><span className="truncate">{t.copyMessageBtn}</span>
                    </button>
                    <button onClick={() => handleOpenEditGuest(guest)}
                      className="px-2 py-3 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-xl text-[11px] font-bold font-mono transition-colors inline-flex items-center justify-center space-x-1 border border-amber-300 cursor-pointer"
                      title={t.editGuestTitle}>
                      <Settings className="w-3 h-3 shrink-0" /><span className="truncate">{t.editBtn}</span>
                    </button>
                    <button onClick={() => handleDeleteGuest(guest.id, guest.name)}
                      className="px-2 py-3 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-xl text-[11px] font-bold font-mono transition-colors inline-flex items-center justify-center space-x-1 border border-rose-300 cursor-pointer"
                      title={t.deleteGuestTitle}>
                      <Trash2 className="w-3.5 h-3.5 shrink-0" />
                    </button>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>

          {filteredGuests.length === 0 && (
            <div className="p-6">
              <EmptyState
                type={guests.length === 0 ? 'guests' : 'search'}
                title={guests.length === 0 ? 'No Guest Invitations Yet' : 'No Guests Found'}
                description={guests.length === 0 ? 'Your invitation list is empty! Add guests using the form above.' : 'No guests matched your current search query or filter.'}
                actionLabel={guests.length === 0 ? t.addFirstGuestBtn : t.clearFilterBtn}
                onAction={guests.length === 0
                  ? () => { const el = document.querySelector('input[required]'); if (el) (el as HTMLElement).focus(); }
                  : () => { setSearchTerm(''); setStatusFilter('All'); toast.info(t.filterResetToast); }
                }
              />
            </div>
          )}
        </div>
      </motion.div>

      {/* Modal: Batch CSV Guest Import */}
      <Modal open={showCsvImportModal} onClose={() => setShowCsvImportModal(false)} maxWidth="lg"
        title={
          <div className="flex items-center gap-2">
            <FileSpreadsheet className="w-5 h-5 text-[#8B735B]" />
            <h3 className="font-sans text-xl font-bold text-[#4A3F35]">{t.importCsvTitle}</h3>
          </div>
        }>
        <p className="text-xs text-[#4A3F35]/80 leading-relaxed font-sans">
          Paste comma-separated rows or raw CSV values below. Columns format:
          <code className="block mt-1 p-2 rounded-lg bg-[#EFE6DC] font-mono text-[11px] text-[#8B735B]">{t.csvColumnsHint}</code>
        </p>
        <form onSubmit={handleProcessCsvImport} className="space-y-4">
          <textarea rows={6} value={rawCsvText} onChange={(e) => setRawCsvText(e.target.value)}
            placeholder={`Grandma Ellen, ellen@example.com, 555-0101, 2, email\nUncle Mark, mark@example.com, 555-0102, 1, text`}
            className="w-full p-3 rounded-xl border border-[#CBAE94] text-xs font-mono focus:outline-none focus:ring-2 focus:ring-[#8B735B] bg-white text-[#4A3F35]" />
          <div className="flex justify-between items-center pt-2">
            <button type="button" onClick={() => setRawCsvText(`Grandma Ellen, ellen@example.com, 555-0101, 2, email\nUncle Mark, mark@example.com, 555-0102, 1, text\nSophia Martinez, sophia@example.com, 555-0103, 2, email`)}
              className="text-xs font-bold text-[#8B735B] hover:underline">{t.loadSampleBtn}</button>
            <div className="flex gap-2">
              <button type="button" onClick={() => setShowCsvImportModal(false)}
                className="px-4 py-2 rounded-xl border border-[#CBAE94] text-xs font-bold text-[#8B735B] hover:bg-[#EFE6DC]">{t.cancelBtn}</button>
              <button type="submit" disabled={importingCsv}
                className="btn-accent px-4 py-2 text-xs font-bold flex items-center gap-1.5">
                <Upload className="w-3.5 h-3.5" /><span>{importingCsv ? t.importingBtn : t.processImportBtn}</span>
              </button>
            </div>
          </div>
        </form>
      </Modal>

      {/* Modal: Invite Sent Confirmation */}
      <Modal open={!!invitedGuestModal} onClose={() => setInvitedGuestModal(null)} maxWidth="md">
        <div className="space-y-4">
          <div className="w-12 h-12 bg-[#EFE6DC] text-[#8B735B] rounded-full flex items-center justify-center mx-auto border-2 border-[#CBAE94]">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div className="text-center space-y-1">
            <h3 className="font-sans text-2xl font-bold text-[#8B735B]">{t.inviteSentModalTitle}</h3>
            <p className="text-xs text-[#5D5449]">{t.inviteLinkForLabel} <strong className="text-[#8B735B]">{invitedGuestModal?.name}</strong> ({invitedGuestModal?.email})</p>
          </div>
          <div className="bg-white p-3.5 rounded-2xl border-2 border-[#CBAE94] font-mono text-xs text-[#5D5449] break-all select-all">
            {window.location.origin}/rsvp/{invitedGuestModal?.token}
          </div>
          {invitedGuestModal?.message && (
            <div className="bg-[#EFE6DC]/50 p-3 rounded-xl border border-[#CBAE94] whitespace-pre-wrap text-left text-[11px] text-[#5D5449] font-mono max-h-40 overflow-y-auto">
              {invitedGuestModal.message}
            </div>
          )}
          <p className="text-[11px] text-[#8B735B] bg-[#EFE6DC] p-3 rounded-xl border border-[#CBAE94] font-mono"><Lightbulb className="w-3.5 h-3.5 inline" /> {t.sendEmailLogNotice}</p>
          <div className="flex space-x-3">
            <button onClick={() => invitedGuestModal && handleCopyMagicLink(invitedGuestModal.token)} className="btn-accent flex-1 py-3 text-xs">{t.copyLink}</button>
            {invitedGuestModal?.message && (
              <button onClick={() => {
                if (!invitedGuestModal) return;
                navigator.clipboard.writeText(invitedGuestModal.message);
                setCopiedMsg(true);
                setTimeout(() => setCopiedMsg(false), 2000);
                toast.love(t.messageCopiedToast);
              }} className="btn-outline-accent flex-1 py-3 text-xs inline-flex items-center justify-center">
                {copiedMsg ? <Check className="w-3.5 h-3.5 mr-1.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
                <span>{t.copyMessageBtn}</span>
              </button>
            )}
            <button onClick={() => { if (invitedGuestModal) { const m = invitedGuestModal; setInvitedGuestModal(null); navigate(`/rsvp/${m.token}`); } }} className="btn-outline-accent flex-1 py-3 text-xs">{t.previewInviteBtn}</button>
          </div>
          <button onClick={() => setInvitedGuestModal(null)} className="w-full py-2 text-[#5D5449]/70 hover:text-[#5D5449] text-xs font-mono font-bold text-center">{t.closeModal}</button>
        </div>
      </Modal>

      {/* Modal: Edit Guest */}
      <Modal open={!!editingGuest} onClose={() => setEditingGuest(null)} maxWidth="lg"
        title={
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-[#8B735B]" />
            <h3 className="font-sans text-xl font-bold text-[#4A3F35]">{t.editGuestTitle}</h3>
          </div>
        }>
        <form onSubmit={handleSubmitEdit(handleSaveEditGuest)} className="space-y-4">
                <div>
                  <label className="label-mono block mb-1">{t.guestNameRequired}</label>
                  <TextInput type="text" required {...registerEdit('name')} />
                  {editErrors.name && <p className="text-rose-600 text-[10px]">{editErrors.name.message}</p>}
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label-mono block mb-1">{t.emailLabel}</label>
                    <TextInput type="email" {...registerEdit('email')} />
                  </div>
                  <div>
                    <label className="label-mono block mb-1">{t.phoneLabel}</label>
                    <TextInput type="tel" {...registerEdit('phone')} />
                  </div>
                </div>
                <div>
                  <label className="label-mono block mb-1">{t.fieldSendVia}</label>
                  <Select {...registerEdit('delivery_channel')}>
                    {channelOptions.map((c) => (
                      <option key={c} value={c}>{c === 'none' ? t.channelNone : c === 'email' ? t.channelEmail : c === 'text' ? t.channelText : t.channelBoth}</option>
                    ))}
                  </Select>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label-mono block mb-1">{t.partySizeSeatsLabel}</label>
                    <TextInput type="number" min="1" max="20" required {...registerEdit('max_party_size', { valueAsNumber: true })} />
                    {editErrors.max_party_size && <p className="text-rose-600 text-[10px]">{editErrors.max_party_size.message}</p>}
                  </div>
                  <div>
                    <label className="label-mono block mb-1">{t.rsvpStatusLabel}</label>
                    <Select {...registerEdit('rsvp_status')}>
                      <option value="Pending">{t.statusPendingWord}</option>
                      <option value="Attending">{t.statusAttendingWord}</option>
                      <option value="Declined">{t.statusDeclinedWord}</option>
                    </Select>
                  </div>
                </div>
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#CBAE94]/30">
                  <button type="button" onClick={() => setEditingGuest(null)}
                    className="px-4 py-2.5 rounded-xl border border-[#CBAE94] text-xs font-bold text-[#5D5449] hover:bg-[#EFE6DC]">{t.cancelBtn}</button>
                  <button type="submit" disabled={savingEdit}
                    className="px-5 py-2.5 rounded-xl bg-[#8B735B] hover:bg-[#705C47] text-white text-xs font-bold shadow-md">{savingEdit ? 'Saving...' : 'Save Changes'}</button>
                </div>
              </form>
      </Modal>
    </motion.div>
  );
};
