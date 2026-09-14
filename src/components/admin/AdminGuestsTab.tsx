import React, { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { adminContainerVariants, adminCardVariants } from '../shared/motionPresets';
import { GuestRowCard } from './GuestRowCard';
import { GuestMetricCard, GuestMetricToggle, GuestFiltersBar, BulkActionsBar } from './GuestListParts';
import { GuestListModal, GuestDetailsModal } from './GuestListModals';
import {
  Users,
  CheckCircle2,
  Clock,
  XCircle,
  UserPlus,
  Send,
  Copy,
  Check,
  Upload,
  FileSpreadsheet,
  Mail,
  Smartphone,
  MessageSquare,
  Lightbulb,
  Link2,
} from 'lucide-react';
import { Guest, Language, DeliveryChannel, FloorMapData } from '../../types';
import { Translations } from '../../translations';
import { adminFetch } from '../../lib/api';
import { GuestImportSchema, EditGuestFormSchema } from '../../lib/validation';
import { useCapabilities, availableChannels, channelLabel } from '../../lib/capabilities';
import { getGuestPartySize as getPartySize, getAttendeeLocations } from '../../lib/tableAssignment';
import { getPartyMembers } from '../../lib/guestAttendees';
import { useConfirm } from '../shared/ConfirmDialog';
import { useCopyFeedback } from '../shared/hooks';
import { Modal } from '../shared/Modal';
import { useToast } from '../shared/ToastContext';
import { useTf } from '../shared/i18n';
import { EmptyState } from '../shared/EmptyState';
import { TextInput, Select } from '../shared/ui';

interface AdminGuestsTabProps {
  language: Language;
  t: Translations;
  guests: Guest[];
  onRefresh: () => Promise<void>;
}

type AddGuestFormValues = z.input<typeof GuestImportSchema>;
type EditGuestFormValues = z.input<typeof EditGuestFormSchema>;

// CSV-aware line split: quoted fields may contain commas.
function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; } else { inQuotes = false; }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur.trim());
  return out;
}

export const AdminGuestsTab: React.FC<AdminGuestsTabProps> = ({ language, t, guests, onRefresh }) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const tf = useTf();
  const confirm = useConfirm();

  const [submittingGuest, setSubmittingGuest] = useState(false);
  // Host self-registration: create the guest already "going", no invitation.
  const [markGoing, setMarkGoing] = useState(false);
  // Party-member entry: when the group size is > 1 the host names the members.
  const [attendeeModal, setAttendeeModal] = useState<{ values: AddGuestFormValues; going: boolean } | null>(null);
  const [extraNames, setExtraNames] = useState<string[]>([]);

  const { register, handleSubmit, setValue, watch, setFocus, formState: { errors } } = useForm<AddGuestFormValues>({
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

  const { register: registerEdit, handleSubmit: handleSubmitEdit, reset: resetEditForm, watch: watchEdit, formState: { errors: editErrors } } = useForm<EditGuestFormValues>({
    resolver: zodResolver(EditGuestFormSchema),
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

  // Guest details/edit are URL-routed: ?guest=<id> opens details, &edit=1 opens
  // the edit modal on top. Closing edit returns to details; browser Back works.
  const guestParam = searchParams.get('guest');
  const viewingGuest = guestParam ? guests.find((g) => g.id === guestParam) ?? null : null;
  const editingGuest = searchParams.get('edit') && viewingGuest ? viewingGuest : null;
  const closeGuestModal = () =>
    setSearchParams((prev) => { const p = new URLSearchParams(prev); p.delete('guest'); p.delete('edit'); return p; });
  const closeEditModal = () =>
    setSearchParams((prev) => { const p = new URLSearchParams(prev); p.delete('edit'); return p; });
  const [savingEdit, setSavingEdit] = useState(false);
  // Additional members (primary guest excluded) while editing a party.
  const [editExtraNames, setEditExtraNames] = useState<string[]>([]);

  const [metricModal, setMetricModal] = useState<'Attending' | 'Pending' | 'Declined' | 'Awaiting' | 'Total' | null>(null);
  const [metricListView, setMetricListView] = useState<'invites' | 'party'>('invites');

  const [viewingMessage, setViewingMessage] = useState('');
  const [loadingMessage, setLoadingMessage] = useState(false);

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

  // Edit-modal party editor: the allowed size caps how many members can be named.
  const editMaxParty = Math.max(1, Number(watchEdit('max_party_size')) || 1);
  const editStatus = watchEdit('rsvp_status');
  const editPrimaryName = (watchEdit('name') || editingGuest?.name || '').trim();

  const primaryGuests = guests.filter((g) => !g.is_read_only);
  // Self-registrations only count once approved.
  const approvedGuests = primaryGuests.filter((g) => (g.approval_status || 'approved') === 'approved');
  const pendingApprovals = primaryGuests.filter((g) => g.approval_status === 'pending');
  const attendingGuests = approvedGuests.filter((g) => g.rsvp_status === 'Attending');
  const pendingGuests = approvedGuests.filter((g) => g.rsvp_status === 'Pending');
  const declinedGuests = approvedGuests.filter((g) => g.rsvp_status === 'Declined');
  const totalAttendingPartySize = attendingGuests.reduce((acc, g) => acc + getGuestPartySize(g), 0);
  const pendingPartySize = pendingGuests.reduce((acc, g) => acc + getGuestPartySize(g), 0);
  const declinedPartySize = declinedGuests.reduce((acc, g) => acc + getGuestPartySize(g), 0);
  const totalPartySize = guests.reduce((acc, g) => acc + getGuestPartySize(g), 0);

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
    setEditExtraNames(getPartyMembers(g).slice(1));
    setSearchParams((prev) => { const p = new URLSearchParams(prev); p.set('guest', g.id); p.set('edit', '1'); return p; });
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

  // Load the invite message whenever the detail modal's guest changes — covers
  // both clicking a row and deep-linking straight to ?guest=<id>.
  useEffect(() => {
    if (!viewingGuest) return;
    let cancelled = false;
    setViewingMessage('');
    setLoadingMessage(true);
    adminFetch(`/api/guests/${viewingGuest.id}/invite-message`)
      .then((res) => res.json())
      .then((data) => { if (!cancelled && data.message) setViewingMessage(data.message); })
      .catch(() => { /* non-fatal */ })
      .finally(() => { if (!cancelled) setLoadingMessage(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewingGuest?.id]);

  const handleOpenViewGuest = (g: Guest) =>
    setSearchParams((prev) => { const p = new URLSearchParams(prev); p.set('guest', g.id); p.delete('edit'); return p; });

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
      const maxParty = Math.max(1, Number(values.max_party_size) || 1);
      const res = await adminFetch(`/api/guests/${editingGuest.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: values.name.trim(),
          email: (values.email || '').trim(),
          phone: (values.phone || '').trim(),
          delivery_channel: values.delivery_channel,
          max_party_size: maxParty,
          rsvp_status: values.rsvp_status,
          // Additional members; the backend derives the attended count and seats.
          attendee_names: values.rsvp_status === 'Declined' ? [] : editExtraNames.slice(0, Math.max(0, maxParty - 1)),
        }),
      });
      const data = await res.json();
      if (data.guest) {
        closeEditModal();
        toast.love(tf('guestUpdatedToast', { name: data.guest.name }));
        await onRefresh();
      } else {
        toast.error(data.error || data.message || t.invitesErrorToast);
      }
    } catch (err) {
      console.error('Failed to update guest:', err);
      toast.error(t.invitesErrorToast);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteGuest = async (id: string, guestName: string) => {
    const ok = await confirm({
      title: t.deleteAllConfirmTitle,
      message: tf('deleteAllConfirmMsg', { name: guestName }),
      confirmText: t.deleteGuestTitle,
    });
    if (!ok) return;
    try {
      const res = await adminFetch(`/api/guests/${id}`, { method: 'DELETE' });
      if (res.ok) {
        closeGuestModal();
        toast.info(tf('guestDeletedToast', { name: guestName }));
        await onRefresh();
      }
    } catch (err) {
      console.error('Failed to delete guest:', err);
    }
  };

  const handleRemoveAttendee = async (guestId: string, attendeeIndex: number, removedName: string, promoteName?: string) => {
    try {
      const res = await adminFetch(`/api/guests/${guestId}/remove-attendee`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ index: attendeeIndex, promote_name: promoteName }),
      });
      const data = await res.json();
      if (res.ok) {
        closeGuestModal();
        toast.info(tf(data.deleted ? 'guestDeletedToast' : 'attendeeRemovedToast', { name: removedName }));
        await onRefresh();
      } else {
        toast.error(data.message || data.error || t.invitesErrorToast);
      }
    } catch (err) {
      console.error('Failed to remove attendee:', err);
      toast.error(t.invitesErrorToast);
    }
  };

  const handleApproval = async (guest: Guest, decision: 'approve' | 'reject') => {
    try {
      const res = await adminFetch(`/api/guests/${guest.id}/${decision}`, { method: 'POST' });
      if (res.ok) {
        toast.love(tf(decision === 'approve' ? 'guestApprovedToast' : 'guestRejectedToast', { name: guest.name }));
        await onRefresh();
      }
    } catch (err) {
      console.error('Approval failed:', err);
      toast.error(t.invitesErrorToast);
    }
  };

  const handleExportCsv = () => {
    if (guests.length === 0) {
      toast.info(t.noExportToast);
      return;
    }
    void exportGuestsCsv(guests);
  };

  // One row per individual person, with their party's reservation code and their
  // own table/seat resolved from the floor map (split parties included).
  const exportGuestsCsv = async (list: Guest[]) => {
    let floorMap: FloorMapData | null = null;
    try {
      const res = await fetch('/api/floorplan');
      const data = await res.json();
      floorMap = data.floorMap ?? null;
    } catch {
      /* fall back to the party's legacy table_id below */
    }

    // First five columns stay import-compatible (name, email, phone, max party, channel).
    const headers = [
      'Guest Name', 'Email', 'Phone', 'Max Party Size', 'Delivery Channel',
      'Reservation Code', 'Group / Party', 'Table', 'Seat', 'RSVP Status',
      'Attending Party Size', 'Dietary Restrictions', 'Magic RSVP Token', 'Magic RSVP URL', 'Invited By',
    ];
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows: string[][] = [];

    for (const g of list) {
      const names = getPartyMembers(g);
      const locations = getAttendeeLocations(g.id, floorMap, list);
      const url = `${window.location.origin}/rsvp/${g.magic_token}`;
      names.forEach((name, i) => {
        const loc = locations.find((l) => l.attendeeIndex === i) ?? null;
        rows.push([
          esc(name),
          esc(g.email),
          esc(g.phone),
          String(g.max_party_size ?? ''),
          esc(g.delivery_channel || 'none'),
          esc(g.code),
          esc(g.name),
          esc(loc?.tableName ?? ''),
          loc ? String(loc.seatIndex + 1) : '',
          esc(g.rsvp_status),
          String(g.attending_party_size ?? ''),
          esc(g.dietary_restrictions || ''),
          esc(g.magic_token),
          esc(url),
          esc(g.invited_by_guest_name || 'Host'),
        ]);
      });
    }

    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
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
        const parts = parseCsvLine(line);
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
        toast.love(tf('csvImportedToast', { count: data.count }));
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

  const handleAddGuest = (values: AddGuestFormValues) => {
    if (!values.name.trim()) return;
    if (!markGoing) {
      if ((values.delivery_channel === 'email' || values.delivery_channel === 'both') && !(values.email || '').trim()) {
        toast.error(t.emailRequiredToast);
        return;
      }
      if ((values.delivery_channel === 'text' || values.delivery_channel === 'both') && !(values.phone || '').trim()) {
        toast.error(t.phoneRequiredToast);
        return;
      }
    }
    // A group ask the host to name the extra members before creating anything.
    const partySize = Math.max(1, Number(values.max_party_size) || 1);
    if (partySize > 1) {
      setExtraNames(Array(partySize - 1).fill(''));
      setAttendeeModal({ values, going: markGoing });
      return;
    }
    void submitGuest(values, [], markGoing);
  };

  const handleConfirmAttendees = () => {
    if (!attendeeModal) return;
    const extras = extraNames.map((n) => n.trim()).filter(Boolean);
    const { values, going } = attendeeModal;
    setAttendeeModal(null);
    void submitGuest(values, extras, going);
  };

  const submitGuest = async (values: AddGuestFormValues, extras: string[], going: boolean) => {
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
          going,
          attendee_names: extras,
        }),
      });
      const data = await res.json();
      if (going) {
        if (data.guest) {
          toast.love(tf('guestAddedGoingToast', { name: data.guest.name }));
          setValue('name', '');
          setValue('email', '');
          setValue('phone', '');
          await onRefresh();
        } else if (data.error) {
          toast.error(data.error);
        }
      } else if (data.guest && data.magic_token) {
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
      if (data.sent > 0) toast.love(tf('invitesSentMsg', { count: data.sent }) + (data.failed > 0 ? tf('invitesFailedSuffix', { count: String(data.failed) }) : ''));
      else toast.info(t.invitesNoneToast);
      setSelectedIds([]);
    } catch { toast.error(t.invitesErrorToast); }
  };

  const handleSendReminders = async () => {
    try {
      const res = await adminFetch('/api/send-reminders', { method: 'POST' });
      const data = await res.json();
      if (data.sent > 0) {
        toast.love(tf('remindersSentMsg', { count: data.sent }) + (data.failed > 0 ? tf('invitesFailedSuffix', { count: String(data.failed) }) : ''));
      } else {
        toast.info(t.remindersNoneToast);
      }
    } catch {
      toast.error(t.remindersErrorToast);
    }
  };

  const handleBulkExport = () => {
    if (selectedIds.length === 0) return;
    void exportGuestsCsv(guests.filter((g) => selectedIds.includes(g.id)));
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    const ok = await confirm({
      title: t.bulkDeleteConfirmTitle,
      message: tf('bulkDeleteConfirmMsg', { count: selectedIds.length }),
      confirmText: t.bulkDeleteBtn,
    });
    if (!ok) return;
    try {
      await Promise.all(selectedIds.map((id) => adminFetch(`/api/guests/${id}`, { method: 'DELETE' })));
      toast.love(tf('guestDeletedToast', { name: String(selectedIds.length) }));
      setSelectedIds([]);
      await onRefresh();
    } catch (err) {
      console.error('Bulk delete failed:', err);
      toast.error(t.invitesErrorToast);
    }
  };

  const metricModalList: Guest[] = (() => {
    switch (metricModal) {
      case 'Attending': return attendingGuests;
      case 'Pending': return pendingGuests;
      case 'Declined': return declinedGuests;
      case 'Awaiting': return pendingApprovals;
      case 'Total': return guests;
      default: return [];
    }
  })();

  const metricModalTitle = (() => {
    switch (metricModal) {
      case 'Attending': return t.statAttending;
      case 'Pending': return t.statPending;
      case 'Declined': return t.statDeclined;
      case 'Awaiting': return t.statAwaitingApproval;
      case 'Total': return t.statTotalGuests;
      default: return '';
    }
  })();

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
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <GuestMetricCard label={t.statAttending} icon={<CheckCircle2 className="w-5 h-5" />}
          value={metricMode === 'party' ? totalAttendingPartySize : attendingGuests.length}
          footer={t.statTotalAttendingParty} onClick={() => setMetricModal('Attending')} />
        <GuestMetricCard label={t.statPending} icon={<Clock className="w-5 h-5" />}
          value={metricMode === 'party' ? pendingPartySize : pendingGuests.length}
          footer={t.awaitingResponse} iconClass="text-[#5D5449]" onClick={() => setMetricModal('Pending')} />
        <GuestMetricCard label={t.statDeclined} icon={<XCircle className="w-5 h-5 text-rose-500" />}
          value={metricMode === 'party' ? declinedPartySize : declinedGuests.length}
          footer={t.unableToAttend} iconClass="text-rose-600" onClick={() => setMetricModal('Declined')} />
        <GuestMetricCard label={t.statAwaitingApproval} icon={<Clock className="w-5 h-5 text-amber-600" />}
          value={pendingApprovals.length}
          footer={t.approvalPendingBadge} iconClass="text-amber-700" onClick={() => setMetricModal('Awaiting')} />
        <GuestMetricCard label={t.statTotalGuests} icon={<Users className="w-5 h-5" />}
          value={metricMode === 'party' ? totalPartySize : guests.length}
          footer={t.totalGuestInvites} onClick={() => setMetricModal('Total')} />
      </div>

      {/* Add Guest Form */}
      <motion.div variants={adminCardVariants} className="card-paper p-5 sm:p-6 space-y-4">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-[#EFE6DC] text-[#8B735B] rounded-2xl border border-[#CBAE94]">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-sans text-lg font-bold text-[#8B735B]">{t.addGuestTitle}</h3>
              <p className="text-xs text-[#5D5449]">{t.addGuestSubtitle}</p>
            </div>
          </div>

          <form onSubmit={handleSubmit(handleAddGuest)} className="space-y-3">
            <label className="flex items-start gap-3 p-3 rounded-2xl border border-[#CBAE94]/60 bg-[#EFE6DC]/40 cursor-pointer">
              <input type="checkbox" checked={markGoing} onChange={(e) => setMarkGoing(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-[#8B735B] shrink-0" />
              <span>
                <span className="block text-xs font-bold text-[#8B735B]">{t.addGuestGoingToggle}</span>
                <span className="block text-xs text-[#5D5449]">{t.addGuestGoingHint}</span>
              </span>
            </label>

            {!markGoing && (
            <div className="bg-[#EFE6DC]/40 p-3 rounded-2xl border border-[#CBAE94]/60 space-y-2">
              <label className="label-mono block text-xs font-bold text-[#8B735B]">{t.fieldSendVia} *</label>
              <div className="flex flex-wrap gap-2">
                {channelOptions.map((c) => (
                  <button key={c} type="button" onClick={() => setValue('delivery_channel', c)}
                    className={`flex-1 min-w-[7rem] py-2 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-1.5 ${deliveryChannel === c ? 'bg-[#8B735B] text-white border-[#8B735B] shadow-xs' : 'bg-white text-[#5D5449] border-[#CBAE94] hover:bg-[#EFE6DC]'}`}>
                    {c === 'none' ? <Link2 className="w-3.5 h-3.5" />
                      : c === 'email' ? <Mail className="w-3.5 h-3.5" />
                      : c === 'text' ? <MessageSquare className="w-3.5 h-3.5" />
                      : <Smartphone className="w-3.5 h-3.5" />}
                    <span>{channelLabel(t, c)}</span>
                  </button>
                ))}
              </div>
              {deliveryChannel === 'none' && (
                <p className="text-xs text-[#8B735B] font-mono flex items-center gap-1">
                  <Lightbulb className="w-3 h-3 shrink-0" /> {t.linkOnlyHint}
                </p>
              )}
            </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className="label-mono block mb-1">{t.fieldName} *</label>
                <TextInput type="text" required placeholder={t.nameExamplePh} {...register('name')} />
                {errors.name && <p className="text-rose-600 text-xs">{errors.name.message}</p>}
              </div>
              <div>
                <label className="label-mono block mb-1">{t.fieldEmail} {!markGoing && (deliveryChannel === 'email' || deliveryChannel === 'both') ? <span aria-hidden="true">*</span> : t.optionalLabel}</label>
                <TextInput type="email" required={!markGoing && (deliveryChannel === 'email' || deliveryChannel === 'both')} placeholder={t.emailExamplePh} {...register('email')} />
                {errors.email && <p className="text-rose-600 text-xs">{errors.email.message}</p>}
              </div>
              <div>
                <label className="label-mono block mb-1">{t.fieldPhone} {!markGoing && (deliveryChannel === 'text' || deliveryChannel === 'both') ? <span aria-hidden="true">*</span> : t.optionalLabel}</label>
                <TextInput type="tel" required={!markGoing && (deliveryChannel === 'text' || deliveryChannel === 'both')} placeholder={t.fieldPhonePlaceholder} {...register('phone')} />
                {errors.phone && <p className="text-rose-600 text-xs">{errors.phone.message}</p>}
              </div>
              <div>
                <label className="label-mono block mb-1">{t.fieldLanguage}</label>
                <Select {...register('language_pref')}>
                  <option value="EN">{t.presetEnglish}</option>
                  <option value="FR">{t.presetFrench}</option>
                </Select>
              </div>
              <div>
                <label className="label-mono block mb-1">{t.partySizeSeatsLabel}</label>
                <TextInput type="number" min="1" max="20" required {...register('max_party_size', { valueAsNumber: true })} />
                {errors.max_party_size && <p className="text-rose-600 text-xs">{errors.max_party_size.message}</p>}
              </div>
              <div className="flex items-end">
                <motion.button whileTap={{ scale: 0.98 }} type="submit" disabled={submittingGuest}
                  className="btn-accent w-full py-2.5 px-6 text-sm disabled:opacity-50">
                  <Send className="w-4 h-4 mr-2" />
                  <span>{submittingGuest ? t.sendingInviteBtn : markGoing ? t.createInviteBtn : t.sendInviteBtn}</span>
                </motion.button>
              </div>
            </div>
          </form>
      </motion.div>

      {/* Pending self-registrations awaiting host approval */}
      {pendingApprovals.length > 0 && (
        <motion.div variants={adminCardVariants} className="card-paper p-6 sm:p-8 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-amber-50 text-amber-700 rounded-2xl border border-amber-300">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <div className="label-mono">{t.approvalPendingBadge}</div>
              <h3 className="font-sans text-xl font-bold text-[#8B735B]">{t.approvalQueueTitle}</h3>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3">
            {pendingApprovals.map((g) => (
              <div key={g.id} className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white border border-[#CBAE94]/50 rounded-2xl">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[#5D5449] truncate">{g.name}</p>
                  <p className="text-xs font-mono text-[#5D5449]/70 truncate">
                    {[g.email, g.phone].filter(Boolean).join(' | ') || t.channelNone}
                    {' · '}
                    {tf('guestPartySizeLabel', { count: String(getGuestPartySize(g)), max: String(g.max_party_size || 1) })}
                  </p>
                  {g.dietary_restrictions ? (
                    <p className="text-xs text-[#8B735B] truncate">{g.dietary_restrictions}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleApproval(g, 'approve')}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{t.approveBtn}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApproval(g, 'reject')}
                    className="px-3 py-1.5 rounded-xl border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold inline-flex items-center gap-1.5 transition-colors"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>{t.rejectBtn}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Invited Guests Table Section */}
      <motion.div variants={adminCardVariants} className="card-paper p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="shrink-0">
            <h3 className="font-sans text-xl font-bold text-[#8B735B] whitespace-nowrap">{t.guestListTitle}</h3>
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
            onSendReminders={handleSendReminders}
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
                onToggleSelect={toggleSelect}
                onView={handleOpenViewGuest}
              />
            ))}
          </AnimatePresence>

          {filteredGuests.length === 0 && (
            <div className="p-6">
              <EmptyState
                type={guests.length === 0 ? 'guests' : 'search'}
                title={guests.length === 0 ? t.noGuestsYetTitle : t.noGuestsMatchTitle}
                description={guests.length === 0 ? t.noGuestsYetMsg : t.noGuestsMatchMsg}
                actionLabel={guests.length === 0 ? t.addFirstGuestBtn : t.clearFilterBtn}
                onAction={guests.length === 0
                  ? () => setFocus('name')
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
          {t.csvPasteHint}
          <code className="block mt-1 p-2 rounded-lg bg-[#EFE6DC] font-mono text-xs text-[#8B735B]">{t.csvColumnsHint}</code>
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
            <div className="bg-[#EFE6DC]/50 p-3 rounded-xl border border-[#CBAE94] whitespace-pre-wrap text-left text-xs text-[#5D5449] font-mono max-h-40 overflow-y-auto">
              {invitedGuestModal.message}
            </div>
          )}
          <p className="text-xs text-[#8B735B] bg-[#EFE6DC] p-3 rounded-xl border border-[#CBAE94] font-mono"><Lightbulb className="w-3.5 h-3.5 inline" /> {t.sendEmailLogNotice}</p>
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

      {/* Modal: Name the party members */}
      <Modal open={!!attendeeModal} onClose={() => setAttendeeModal(null)} maxWidth="lg"
        title={
          <div className="flex items-center gap-2">
            <Users className="w-5 h-5 text-[#8B735B]" />
            <h3 className="font-sans text-xl font-bold text-[#4A3F35]">{t.addAttendeesTitle}</h3>
          </div>
        }>
        <p className="text-xs text-[#5D5449] leading-relaxed font-sans">{t.attendeeSectionHint}</p>
        <div className="space-y-3 pt-2">
          <div>
            <label className="label-mono block mb-1 text-xs font-bold text-[#8B735B]">{t.finderPartyLead}</label>
            <div className="px-3 py-2 rounded-xl border border-[#CBAE94] bg-[#EFE6DC]/50 text-sm font-bold text-[#5D5449]">
              {attendeeModal?.values.name.trim()}
            </div>
          </div>
          {extraNames.map((name, i) => (
            <div key={i}>
              <label className="label-mono block mb-1 text-xs font-bold text-[#8B735B]">
                {t.fieldName} {i + 1}
              </label>
              <TextInput type="text" value={name} placeholder={t.nameExamplePh}
                onChange={(e) => setExtraNames((prev) => prev.map((n, j) => (j === i ? e.target.value : n)))} />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-end gap-3 pt-4 mt-2 border-t border-[#CBAE94]/30">
          <button type="button" onClick={() => setAttendeeModal(null)}
            className="px-4 py-2.5 rounded-xl border border-[#CBAE94] text-xs font-bold text-[#5D5449] hover:bg-[#EFE6DC]">{t.cancelBtn}</button>
          <button type="button" onClick={handleConfirmAttendees}
            className="btn-accent px-5 py-2.5 text-xs font-bold inline-flex items-center gap-1.5">
            <Send className="w-3.5 h-3.5" />
            <span>{attendeeModal?.going ? t.createInviteBtn : t.sendInviteBtn}</span>
          </button>
        </div>
      </Modal>

      {/* Modal: Edit Guest */}
      <Modal open={!!editingGuest} onClose={closeEditModal} maxWidth="lg"
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
                  {editErrors.name && <p className="text-rose-600 text-xs">{editErrors.name.message}</p>}
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
                    <TextInput type="number" min="1" max="20" required
                      {...registerEdit('max_party_size', {
                        valueAsNumber: true,
                        onChange: (e) => {
                          const m = Math.max(1, Number((e.target as HTMLInputElement).value) || 1);
                          setEditExtraNames((prev) => prev.slice(0, Math.max(0, m - 1)));
                        },
                      })} />
                    {editErrors.max_party_size && <p className="text-rose-600 text-xs">{editErrors.max_party_size.message}</p>}
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
                {editStatus !== 'Declined' && (
                  <div className="space-y-2 rounded-2xl border border-[#CBAE94]/60 bg-[#EFE6DC]/30 p-3.5">
                    <label className="label-mono block text-xs font-bold text-[#8B735B]">
                      {tf('includedAttendeesLabel', { count: String(editExtraNames.length + 1) })}
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 px-3 py-2 rounded-xl border border-[#CBAE94] bg-white/60 text-sm font-bold text-[#5D5449] truncate">
                        {editPrimaryName}
                      </div>
                      <span className="shrink-0 px-2 py-0.5 rounded-full bg-[#EFE6DC] border border-[#CBAE94] text-xs font-mono font-bold text-[#8B735B]">{t.finderPartyLead}</span>
                    </div>
                    {editExtraNames.map((name, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <TextInput type="text" value={name} placeholder={t.nameExamplePh}
                          onChange={(e) => setEditExtraNames((prev) => prev.map((n, j) => (j === i ? e.target.value : n)))} />
                        <button type="button" onClick={() => setEditExtraNames((prev) => prev.filter((_, j) => j !== i))}
                          title={t.removeAttendeeTitle}
                          className="shrink-0 p-2 rounded-xl border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700 transition-colors cursor-pointer">
                          <XCircle className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                    <button type="button" disabled={editExtraNames.length >= editMaxParty - 1}
                      onClick={() => setEditExtraNames((prev) => [...prev, ''])}
                      className="w-full py-2 rounded-xl border border-dashed border-[#CBAE94] text-xs font-bold text-[#8B735B] hover:bg-[#EFE6DC] disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-1.5">
                      <UserPlus className="w-3.5 h-3.5" /> {t.addAnotherGuestBtn}
                    </button>
                  </div>
                )}
                <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#CBAE94]/30">
                  <button type="button" onClick={closeEditModal}
                    className="px-4 py-2.5 rounded-xl border border-[#CBAE94] text-xs font-bold text-[#5D5449] hover:bg-[#EFE6DC]">{t.cancelBtn}</button>
                  <button type="submit" disabled={savingEdit}
                    className="px-5 py-2.5 rounded-xl bg-[#8B735B] hover:bg-[#705C47] text-white text-xs font-bold shadow-md">{savingEdit ? t.savingBtn : t.saveChangesBtn}</button>
                </div>
              </form>
      </Modal>

      {/* Modal: Metric Card Guest List */}
      <GuestListModal
        open={!!metricModal}
        title={metricModalTitle}
        guests={metricModalList}
        listView={metricListView}
        onListViewChange={setMetricListView}
        onClose={() => setMetricModal(null)}
      />

      {/* Modal: Invitation Details */}
      <GuestDetailsModal
        open={!!viewingGuest && !editingGuest}
        guest={viewingGuest}
        allGuests={guests}
        message={viewingMessage}
        loadingMessage={loadingMessage}
        copiedToken={copiedToken}
        onClose={closeGuestModal}
        onCopyLink={handleCopyMagicLink}
        onCopyMessage={handleCopyInviteMessage}
        onEdit={handleOpenEditGuest}
        onDelete={handleDeleteGuest}
        onRemoveAttendee={handleRemoveAttendee}
      />
    </motion.div>
  );
};
