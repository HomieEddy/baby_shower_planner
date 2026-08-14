import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { adminContainerVariants, adminCardVariants } from '../shared/motionPresets';
import { GuestRowCard } from './GuestRowCard';
import { GuestMetricCard, GuestMetricToggle, GuestFiltersBar, BulkActionsBar } from './GuestListParts';
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
  Link2,
  CheckSquare,
  Square,
  X,
} from 'lucide-react';
import { Guest, Language, DeliveryChannel } from '../../types';
import { Translations } from '../../translations';
import { adminFetch } from '../../lib/api';
import { GuestImportSchema, EditGuestSchema } from '../../lib/validation';
import { useCapabilities, availableChannels, channelLabel } from '../../lib/capabilities';
import { getGuestPartySize as getPartySize } from '../seating/floorPlanHelpers';
import { useConfirm } from '../shared/ConfirmDialog';
import { useCopyFeedback } from '../shared/hooks';
import { Modal } from '../shared/Modal';
import { useToast } from '../shared/ToastContext';
import { EmptyState } from '../shared/EmptyState';
import { TextInput, Select } from '../shared/ui';

interface AdminGuestsTabProps {
  language: Language;
  t: Translations;
  guests: Guest[];
  onRefresh: () => Promise<void>;
}

type AddGuestFormValues = z.input<typeof GuestImportSchema>;
type EditGuestFormValues = z.input<typeof EditGuestSchema>;

export const AdminGuestsTab: React.FC<AdminGuestsTabProps> = ({ language, t, guests, onRefresh }) => {
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

  const { copiedKey: copiedToken, copy: copyMagicLink } = useCopyFeedback();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [metricMode, setMetricMode] = useState<'invites' | 'party'>(() =>
    localStorage.getItem('guestMetricMode') === 'party' ? 'party' : 'invites'
  );
  const switchMetricMode = (m: 'invites' | 'party') => {
    setMetricMode(m);
    localStorage.setItem('guestMetricMode', m);
  };

  const [editingGuest, setEditingGuest] = useState<Guest | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const [invitedGuestModal, setInvitedGuestModal] = useState<{
    name: string;
    email: string;
    token: string;
    message: string;
  } | null>(null);

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

  const getGuestPartySize = getPartySize;

  const primaryGuests = guests.filter((g) => !g.is_read_only);
  const attendingGuests = primaryGuests.filter((g) => g.rsvp_status === 'Attending');
  const pendingGuests = primaryGuests.filter((g) => g.rsvp_status === 'Pending');
  const declinedGuests = primaryGuests.filter((g) => g.rsvp_status === 'Declined');
  const totalAttendingPartySize = attendingGuests.reduce((acc, g) => acc + getGuestPartySize(g), 0);
  const pendingPartySize = pendingGuests.reduce((acc, g) => acc + getGuestPartySize(g), 0);
  const declinedPartySize = declinedGuests.reduce((acc, g) => acc + getGuestPartySize(g), 0);
  const totalPartySize = guests.reduce((acc, g) => acc + getGuestPartySize(g), 0);

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
    exportGuestsCsv(guests);
  };

  const exportGuestsCsv = (list: Guest[]) => {
    const headers = ['Guest Name', 'Email', 'Phone', 'Delivery Channel', 'RSVP Status', 'Max Party Size', 'Attending Party Size', 'Dietary Restrictions', 'Table ID', 'Magic RSVP Token', 'Magic RSVP URL', 'Invited By'];
    const rows = list.map((g) => {
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
    copyMagicLink(fullUrl, token);
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

  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const toggleSelectAll = () =>
    setSelectedIds((prev) =>
      prev.length === filteredGuests.length && filteredGuests.length > 0
        ? []
        : filteredGuests.map((g) => g.id)
    );

  const handleBulkResend = async () => {
    if (selectedIds.length === 0) return;
    try {
      const res = await adminFetch('/api/send-invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guestIds: selectedIds }),
      });
      const data = await res.json();
      if (data.sent > 0) toast.love(t.invitesSentMsg.replace('{{count}}', String(data.sent)) + (data.failed > 0 ? t.invitesFailedSuffix.replace('{{count}}', String(data.failed)) : ''));
      else toast.info(t.invitesNoneToast);
      setSelectedIds([]);
    } catch { toast.error(t.invitesErrorToast); }
  };

  const handleBulkExport = () => {
    if (selectedIds.length === 0) return;
    exportGuestsCsv(guests.filter((g) => selectedIds.includes(g.id)));
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    const ok = await confirm({
      title: t.bulkDeleteBtn,
      message: `Delete ${selectedIds.length} guest(s)? Their RSVPs, seating assignments, and links will be removed. This cannot be undone.`,
      confirmText: t.bulkDeleteBtn,
    });
    if (!ok) return;
    try {
      await Promise.all(selectedIds.map((id) => adminFetch(`/api/guests/${id}`, { method: 'DELETE' })));
      toast.love(t.guestDeletedToast.replace('{{name}}', String(selectedIds.length)));
      setSelectedIds([]);
      await onRefresh();
    } catch (err) {
      console.error('Bulk delete failed:', err);
      toast.error(t.invitesErrorToast);
    }
  };

  return (
    <motion.div
      key="guests"
      variants={adminContainerVariants}
      initial="hidden"
      animate="show"
      className="space-y-8"
    >
      {/* Metrics Cards Grid */}
      <div className="flex justify-end mb-3">
        <GuestMetricToggle metricMode={metricMode} onSwitch={switchMetricMode} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <GuestMetricCard label={t.statAttending} icon={<CheckCircle2 className="w-5 h-5" />}
          value={metricMode === 'party' ? totalAttendingPartySize : attendingGuests.length}
          footer={t.statTotalAttendingParty} />
        <GuestMetricCard label={t.statPending} icon={<Clock className="w-5 h-5" />}
          value={metricMode === 'party' ? pendingPartySize : pendingGuests.length}
          footer={t.awaitingResponse} iconClass="text-[#5D5449]" />
        <GuestMetricCard label={t.statDeclined} icon={<XCircle className="w-5 h-5 text-rose-500" />}
          value={metricMode === 'party' ? declinedPartySize : declinedGuests.length}
          footer={t.unableToAttend} iconClass="text-rose-600" />
        <GuestMetricCard label={t.statTotalGuests} icon={<Users className="w-5 h-5" />}
          value={metricMode === 'party' ? totalPartySize : guests.length}
          footer={t.totalGuestInvites} />
      </div>

      {/* Middle Section: Add Guest Form & Dietary Restriction Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div variants={adminCardVariants} className="lg:col-span-2 card-paper p-6 sm:p-8 space-y-6">
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
                    <span>{channelLabel(t, c)}</span>
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

        <motion.div variants={adminCardVariants} className="card-paper p-6 flex flex-col justify-between">
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
      <motion.div variants={adminCardVariants} className="card-paper p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="label-mono">{t.guestListBadge}</div>
            <h3 className="font-sans text-xl font-bold text-[#8B735B]">{t.guestListTitle}</h3>
          </div>

          <GuestFiltersBar
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            statusFilter={statusFilter}
            onStatusFilter={setStatusFilter}
            sourceFilter={sourceFilter}
            onSourceFilter={setSourceFilter}
            onExportCsv={handleExportCsv}
            onOpenImport={() => setShowCsvImportModal(true)}
            allSelected={selectedIds.length === filteredGuests.length && filteredGuests.length > 0}
            onToggleSelectAll={toggleSelectAll}
          />
        </div>

        {selectedIds.length > 0 && (
          <BulkActionsBar
            count={selectedIds.length}
            onResend={handleBulkResend}
            onExport={handleBulkExport}
            onDelete={handleBulkDelete}
            onClear={() => setSelectedIds([])}
          />
        )}

        <div className="grid grid-cols-1 gap-3">
          <AnimatePresence>
            {filteredGuests.map((guest) => (
              <GuestRowCard
                key={guest.id}
                guest={guest}
                selected={selectedIds.includes(guest.id)}
                copiedToken={copiedToken}
                onToggleSelect={toggleSelect}
                onCopyLink={handleCopyMagicLink}
                onCopyMessage={handleCopyInviteMessage}
                onEdit={handleOpenEditGuest}
                onDelete={handleDeleteGuest}
              />
            ))}
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
                copyMagicLink(invitedGuestModal.message, 'msg');
                toast.love(t.messageCopiedToast);
              }} className="btn-outline-accent flex-1 py-3 text-xs inline-flex items-center justify-center">
                {copiedToken === 'msg' ? <Check className="w-3.5 h-3.5 mr-1.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5 mr-1.5" />}
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
                      <option key={c} value={c}>{channelLabel(t, c)}</option>
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
