// Guest-list controller: all AdminGuestsTab behaviour except rendering —
// filter/metric/selection state, bulk + CSV actions, the URL-routed detail/edit
// modals, the add/edit form state machines, and the capability-aware channel
// options. Derived values come from guestListModel; the component is JSX only.

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useSearchParams } from 'react-router-dom';
import type { Guest, FloorMapData, DeliveryChannel, Language } from '../../types';
import type { Translations } from '../../translations';
import { adminFetch } from '../../lib/api';
import { toCsv, downloadCsv } from '../../lib/csv';
import { getPartyDietary, getAttendeeDietary, type AdditionalAttendee } from '../../lib/guestAttendees';
import { getGuestPartySize } from '../../lib/tableAssignment';
import { GuestImportSchema, EditGuestFormSchema } from '../../lib/validation';
import { useCapabilities, availableChannels } from '../../lib/capabilities';
import { decodeApiError } from '../../lib/errors';
import { useToast } from '../shared/ToastContext';
import { useConfirm, useActionConfirm } from '../shared/ConfirmDialog';
import { useTf, useApiErrorMessage } from '../shared/i18n';
import { useCopyFeedback } from '../shared/hooks';
import {
  buildGuestCsv,
  computeGuestMetrics,
  filterGuests,
  parseGuestCsvRows,
  type MetricMode,
  type SourceFilter,
  type StatusFilter,
} from './guestListModel';

type AddGuestFormValues = z.input<typeof GuestImportSchema>;
type EditGuestFormValues = z.input<typeof EditGuestFormSchema>;

interface GuestAdminControllerArgs {
  language: Language;
  t: Translations;
  guests: Guest[];
  onRefresh: () => Promise<void>;
}

export function useGuestAdminController({ language, t, guests, onRefresh }: GuestAdminControllerArgs) {
  const [searchParams, setSearchParams] = useSearchParams();
  const { toast } = useToast();
  const tf = useTf();
  const apiError = useApiErrorMessage();
  const confirm = useConfirm();
  const confirmAction = useActionConfirm();

  // ── List state ──────────────────────────────────────────────────
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('All');

  const [metricMode, setMetricMode] = useState<MetricMode>(() =>
    localStorage.getItem('guestMetricMode') === 'party' ? 'party' : 'invites'
  );
  const switchMetricMode = (m: MetricMode) => {
    setMetricMode(m);
    localStorage.setItem('guestMetricMode', m);
  };

  // List rendering mode: roomy cards or a dense table for long guest lists.
  const [listView, setListView] = useState<'cards' | 'table'>(() =>
    localStorage.getItem('guestListView') === 'table' ? 'table' : 'cards'
  );
  const switchListView = (m: 'cards' | 'table') => {
    setListView(m);
    localStorage.setItem('guestListView', m);
  };

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const toggleSelect = (id: string) =>
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const filteredGuests = filterGuests(guests, { searchTerm, statusFilter, sourceFilter });
  const metrics = computeGuestMetrics(guests);

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('All');
    setSourceFilter('All');
    toast.info(t.filterResetToast);
  };

  const toggleSelectAll = () =>
    setSelectedIds((prev) =>
      prev.length === filteredGuests.length && filteredGuests.length > 0
        ? []
        : filteredGuests.map((g) => g.id)
    );

  // ── Add-guest form ──────────────────────────────────────────────
  const [submittingGuest, setSubmittingGuest] = useState(false);
  // Host self-registration: create the guest already "going", no invitation.
  const [markGoing, setMarkGoing] = useState(false);
  // Party-member entry: when the group size is > 1 the host names the members.
  const [attendeeModal, setAttendeeModal] = useState<{ values: AddGuestFormValues; going: boolean } | null>(null);
  const [extraMembers, setExtraMembers] = useState<AdditionalAttendee[]>([]);

  const { register, handleSubmit, setValue, setFocus, watch, formState: { errors } } = useForm<AddGuestFormValues>({
    resolver: zodResolver(GuestImportSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      delivery_channel: 'none',
      max_party_size: 2,
      language_pref: language,
      dietary_restrictions: '',
    },
  });

  // ── Edit-guest form ─────────────────────────────────────────────
  const { register: registerEdit, handleSubmit: handleSubmitEdit, reset: resetEditForm, watch: watchEdit, formState: { errors: editErrors } } = useForm<EditGuestFormValues>({
    resolver: zodResolver(EditGuestFormSchema),
    defaultValues: {
      name: '',
      email: '',
      phone: '',
      delivery_channel: 'none',
      max_party_size: 2,
      rsvp_status: 'Pending',
      dietary_restrictions: '',
    },
  });
  const [savingEdit, setSavingEdit] = useState(false);
  // Additional members (primary guest excluded) while editing a party.
  const [editMembers, setEditMembers] = useState<AdditionalAttendee[]>([]);

  // ── CSV import modal ────────────────────────────────────────────
  const [showCsvImportModal, setShowCsvImportModal] = useState(false);
  const [rawCsvText, setRawCsvText] = useState('');
  const [importingCsv, setImportingCsv] = useState(false);

  const { copiedKey: copiedToken, copy: copyMagicLink } = useCopyFeedback();

  // Guest details/edit are URL-routed: ?guest=<id> opens details, &edit=1 opens
  // the edit modal on top. Closing edit returns to details; browser Back works.
  const guestParam = searchParams.get('guest');
  const viewingGuest = guestParam ? guests.find((g) => g.id === guestParam) ?? null : null;
  const editingGuest = searchParams.get('edit') && viewingGuest ? viewingGuest : null;
  const closeGuestModal = () =>
    setSearchParams((prev) => { const p = new URLSearchParams(prev); p.delete('guest'); p.delete('edit'); return p; });
  const closeEditModal = () =>
    setSearchParams((prev) => { const p = new URLSearchParams(prev); p.delete('edit'); return p; });

  const [viewingMessage, setViewingMessage] = useState('');
  const [loadingMessage, setLoadingMessage] = useState(false);

  // Capabilities → channels a host can actually send on.
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

  // Edit-modal party editor: the allowed size caps how many members can be named.
  const editMaxParty = Math.max(1, Number(watchEdit('max_party_size')) || 1);
  const editStatus = watchEdit('rsvp_status');
  const editPrimaryName = (watchEdit('name') || editingGuest?.name || '').trim();

  const handleOpenViewGuest = (g: Guest) =>
    setSearchParams((prev) => { const p = new URLSearchParams(prev); p.set('guest', g.id); p.delete('edit'); return p; });

  const handleOpenEditGuest = (g: Guest) => {
    setEditMembers(getPartyDietary(g).slice(1).map((m) => ({ name: m.name, dietary: m.dietary })));
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
      dietary_restrictions: getAttendeeDietary(g, 0),
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

  // ── Handlers ────────────────────────────────────────────────────
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
    if (!(await confirmAction(t.saveChangesBtn))) return;
    try {
      setSavingEdit(true);
      const maxParty = Math.max(1, Number(values.max_party_size) || 1);
      const primaryDietary = (values.dietary_restrictions || '').trim();
      const extras = values.rsvp_status === 'Declined'
        ? []
        : editMembers
            .map((m) => ({ name: m.name.trim(), contact: '', dietary: (m.dietary || '').trim() }))
            .filter((m) => m.name)
            .slice(0, Math.max(0, maxParty - 1));
      // Full party (primary first) carries the per-member dietary; attendee_names
      // triggers the backend's party rebuild.
      const party = [{ name: values.name.trim(), contact: '', dietary: primaryDietary }, ...extras];
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
          dietary_restrictions: primaryDietary,
          attendee_names: party.map((m) => m.name),
          attendee_details: party,
        }),
      });
      const data = await res.json();
      if (data.guest) {
        closeEditModal();
        toast.love(tf('guestUpdatedToast', { name: data.guest.name }));
        await onRefresh();
      } else {
        const { code, message } = decodeApiError(data, res.status);
        toast.error(apiError(code, message || t.invitesErrorToast));
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
        const { code, message } = decodeApiError(data, res.status);
        toast.error(apiError(code, message || t.invitesErrorToast));
      }
    } catch (err) {
      console.error('Failed to remove attendee:', err);
      toast.error(t.invitesErrorToast);
    }
  };

  const handleApproval = async (guest: Guest, decision: 'approve' | 'reject') => {
    const approving = decision === 'approve';
    const ok = await confirm({
      title: approving ? t.approveConfirmTitle : t.rejectConfirmTitle,
      message: tf(approving ? 'approveConfirmMsg' : 'rejectConfirmMsg', { name: guest.name }),
      confirmText: approving ? t.approveBtn : t.rejectBtn,
      variant: approving ? 'warning' : 'danger',
    });
    if (!ok) return;
    try {
      const res = await adminFetch(`/api/guests/${guest.id}/${decision}`, { method: 'POST' });
      if (res.ok) {
        toast.love(tf(approving ? 'guestApprovedToast' : 'guestRejectedToast', { name: guest.name }));
        await onRefresh();
      } else {
        const { code, message } = decodeApiError(await res.json().catch(() => ({})), res.status);
        toast.error(apiError(code, message || t.invitesErrorToast));
      }
    } catch (err) {
      console.error('Approval failed:', err);
      toast.error(t.invitesErrorToast);
    }
  };

  const submitGuest = async (values: AddGuestFormValues, extras: AdditionalAttendee[], going: boolean) => {
    try {
      setSubmittingGuest(true);
      const attendee_details = [
        { name: values.name.trim(), contact: (values.email || values.phone || '').trim(), dietary: (values.dietary_restrictions || '').trim() },
        ...extras.map((m) => ({ name: m.name, contact: m.contact || '', dietary: (m.dietary || '').trim() })),
      ];
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
          attendee_names: extras.map((m) => m.name),
          attendee_details,
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
          toast.error(apiError(data.error, t.invitesErrorToast));
        }
      } else if (data.guest && data.magic_token) {
        setValue('name', '');
        setValue('email', '');
        setValue('phone', '');
        // Open the guest's details modal: copy link, copy message, and the
        // RSVP preview live there — no separate "invite sent" modal.
        setSearchParams((prev) => { const p = new URLSearchParams(prev); p.set('guest', data.guest.id); p.delete('edit'); return p; });
        toast.love(tf('invitesSentMsg', { count: 1 }));
        await onRefresh();
      } else if (data.error) {
        toast.error(apiError(data.error, t.invitesErrorToast));
      }
    } catch (err) {
      console.error('Error adding guest:', err);
    } finally {
      setSubmittingGuest(false);
    }
  };

  const handleAddGuest = async (values: AddGuestFormValues) => {
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
    // A link-only invite is created immediately: the host copies the
    // ready-to-send message from the details modal, and the guest names their
    // own party when they RSVP. The attendee-naming step is for direct sends.
    const linkOnly = values.delivery_channel === 'none';
    const partySize = Math.max(1, Number(values.max_party_size) || 1);
    if (!linkOnly && partySize > 1) {
      setExtraMembers(Array.from({ length: partySize - 1 }, () => ({ name: '', contact: '', dietary: '' })));
      setAttendeeModal({ values, going: markGoing });
      return;
    }
    if (!(await confirmAction(markGoing || linkOnly ? t.createInviteBtn : t.sendInviteBtn))) return;
    void submitGuest(values, [], markGoing);
  };

  const handleConfirmAttendees = async () => {
    if (!attendeeModal) return;
    const extras = extraMembers
      .map((m) => ({ name: m.name.trim(), contact: '', dietary: (m.dietary || '').trim() }))
      .filter((m) => m.name);
    const { values, going } = attendeeModal;
    if (!(await confirmAction(going ? t.createInviteBtn : t.sendInviteBtn))) return;
    setAttendeeModal(null);
    void submitGuest(values, extras, going);
  };

  const handleProcessCsvImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rawCsvText.trim()) {
      toast.error(t.csvEmptyToast);
      return;
    }
    try {
      setImportingCsv(true);
      const parsedGuests = parseGuestCsvRows(rawCsvText, language);
      if (parsedGuests.length === 0) {
        toast.error(t.csvInvalidToast);
        return;
      }
      if (!(await confirmAction(t.processImportBtn))) return;
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

  const handleCopyMagicLink = (token: string) => {
    const fullUrl = `${window.location.origin}/rsvp/${token}`;
    copyMagicLink(fullUrl, token);
  };

  const handleCopyInviteMessage = async (guestId: string) => {
    if (!(await confirmAction(t.copyLabel))) return;
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

  // ── Bulk + CSV ──────────────────────────────────────────────────
  // One row per individual person, with their party's reservation code and their
  // own table/seat resolved from the floor map (split parties included).
  const exportGuestsCsv = async (list: Guest[]) => {
    if (!(await confirmAction(t.exportCsvBtn))) return;
    let floorMap: FloorMapData | null = null;
    try {
      const res = await fetch('/api/floorplan');
      const data = await res.json();
      floorMap = data.floorMap ?? null;
    } catch {
      /* fall back to the party's legacy table_id below */
    }

    // First five columns stay import-compatible (name, email, phone, max party, channel).
    const { headers, rows } = buildGuestCsv(list, floorMap, window.location.origin);

    downloadCsv(`baby_shower_guests_${new Date().toISOString().split('T')[0]}.csv`, toCsv(headers, rows));
    toast.love(t.exportedToast);
  };

  const handleExportCsv = () => {
    if (guests.length === 0) {
      toast.info(t.noExportToast);
      return;
    }
    void exportGuestsCsv(guests);
  };

  const handleBulkExport = () => {
    if (selectedIds.length === 0) return;
    void exportGuestsCsv(guests.filter((g) => selectedIds.includes(g.id)));
  };

  const handleBulkResend = async () => {
    if (selectedIds.length === 0) return;
    if (!(await confirmAction(t.bulkResendBtn))) return;
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
    if (!(await confirmAction(t.remindBtn))) return;
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

  return {
    // list
    searchTerm, setSearchTerm,
    statusFilter, setStatusFilter,
    sourceFilter, setSourceFilter,
    metricMode, switchMetricMode,
    listView, switchListView,
    selectedIds, setSelectedIds, toggleSelect, toggleSelectAll,
    filteredGuests, clearFilters,
    ...metrics,
    // add form
    register, handleSubmit, setValue, setFocus, deliveryChannel, errors, markGoing, setMarkGoing,
    channelOptions, submittingGuest, handleAddGuest,
    attendeeModal, setAttendeeModal, extraMembers, setExtraMembers, handleConfirmAttendees,
    // edit form
    registerEdit, handleSubmitEdit, editErrors, savingEdit, editMembers, setEditMembers,
    editMaxParty, editStatus, editPrimaryName, handleOpenEditGuest, handleSaveEditGuest,
    // modals + message
    viewingGuest, editingGuest, closeGuestModal, closeEditModal, handleOpenViewGuest,
    viewingMessage, loadingMessage,
    showCsvImportModal, setShowCsvImportModal, rawCsvText, setRawCsvText, importingCsv, handleProcessCsvImport,
    // actions
    handleDeleteGuest, handleRemoveAttendee, handleApproval,
    copiedToken, handleCopyMagicLink, handleCopyInviteMessage,
    // bulk + CSV
    handleExportCsv, handleBulkExport, handleBulkResend, handleBulkDelete, handleSendReminders,
  };
}
