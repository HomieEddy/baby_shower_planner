import React, { useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { adminContainerVariants, adminCardVariants } from '../shared/motionPresets';
import { GuestRowCard } from './GuestRowCard';
import { GuestToolbar, GuestTableView, BulkActionsBar } from './GuestListParts';
import { MetricCard } from '../shared/MetricCard';
import { Segmented } from '../shared/Segmented';
import { GuestDetailsModal } from './GuestListModals';
import {
  Users,
  CheckCircle2,
  Clock,
  XCircle,
  UserPlus,
  Send,
  Upload,
  FileSpreadsheet,
  Mail,
  Smartphone,
  MessageSquare,
  Lightbulb,
  Link2,
} from 'lucide-react';
import { Guest, Language } from '../../types';
import { Translations } from '../../translations';
import { channelLabel } from '../../lib/capabilities';
import { getGuestPartySize as getPartySize } from '../../lib/tableAssignment';
import { getPartyDietarySummary } from '../../lib/guestAttendees';
import { Modal } from '../shared/Modal';
import { useTf } from '../shared/i18n';
import { EmptyState } from '../shared/EmptyState';
import { TextInput, Select } from '../shared/ui';
import { Pagination } from '../shared/Pagination';
import { usePagination } from '../shared/hooks';
import { useGuestAdminController } from './useGuestAdminController';

interface AdminGuestsTabProps {
  language: Language;
  t: Translations;
  guests: Guest[];
  onRefresh: () => Promise<void>;
}

export const AdminGuestsTab: React.FC<AdminGuestsTabProps> = ({ language, t, guests, onRefresh }) => {
  const {
    searchTerm, setSearchTerm,
    statusFilter, setStatusFilter,
    sourceFilter, setSourceFilter,
    metricMode, switchMetricMode,
    listView, switchListView,
    selectedIds, setSelectedIds, toggleSelect, toggleSelectAll,
    filteredGuests, clearFilters,
    attendingGuests, pendingGuests, declinedGuests, pendingApprovals,
    totalPartySize, totalAttendingPartySize, pendingPartySize, declinedPartySize,
    register, handleSubmit, setValue, setFocus, deliveryChannel, errors, markGoing, setMarkGoing,
    channelOptions, submittingGuest, handleAddGuest,
    attendeeModal, setAttendeeModal, extraMembers, setExtraMembers, handleConfirmAttendees,
    registerEdit, handleSubmitEdit, editErrors, savingEdit, editMembers, setEditMembers,
    editMaxParty, editStatus, editPrimaryName, handleOpenEditGuest, handleSaveEditGuest,
    viewingGuest, editingGuest, closeGuestModal, closeEditModal, handleOpenViewGuest,
    viewingMessage, loadingMessage,
    showCsvImportModal, setShowCsvImportModal, rawCsvText, setRawCsvText, importingCsv, handleProcessCsvImport,
    handleDeleteGuest, handleRemoveAttendee, handleApproval,
    copiedToken, handleCopyMagicLink, handleCopyInviteMessage,
    handleExportCsv, handleBulkExport, handleBulkResend, handleBulkDelete, handleSendReminders,
  } = useGuestAdminController({ language, t, guests, onRefresh });

  const listRef = useRef<HTMLDivElement>(null);
  const approvalRef = useRef<HTMLDivElement>(null);
  const scrollToList = () => listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const getGuestPartySize = getPartySize;
  const tf = useTf();

  const guestsPager = usePagination(filteredGuests);
  const approvalsPager = usePagination(pendingApprovals);


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
        <Segmented
          ariaLabel={`${t.metricInvitesLabel} / ${t.colPartySize}`}
          value={metricMode}
          onChange={switchMetricMode}
          options={[
            { value: 'invites', label: t.metricInvitesLabel },
            { value: 'party', label: t.colPartySize },
          ]}
        />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <MetricCard label={t.statAttending} icon={<CheckCircle2 className="w-5 h-5" />}
          value={metricMode === 'party' ? totalAttendingPartySize : attendingGuests.length}
          footer={t.statTotalAttendingParty} onClick={() => { setStatusFilter('Attending'); scrollToList(); }} />
        <MetricCard label={t.statPending} icon={<Clock className="w-5 h-5" />}
          value={metricMode === 'party' ? pendingPartySize : pendingGuests.length}
          footer={t.awaitingResponse} iconClass="text-[#5D5449]" onClick={() => { setStatusFilter('Pending'); scrollToList(); }} />
        <MetricCard label={t.statDeclined} icon={<XCircle className="w-5 h-5 text-rose-500" />}
          value={metricMode === 'party' ? declinedPartySize : declinedGuests.length}
          footer={t.unableToAttend} iconClass="text-rose-600" onClick={() => { setStatusFilter('Declined'); scrollToList(); }} />
        <MetricCard label={t.statAwaitingApproval} icon={<Clock className="w-5 h-5 text-amber-600" />}
          value={pendingApprovals.length}
          footer={t.approvalPendingBadge} iconClass="text-amber-700" onClick={() => approvalRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />
        <MetricCard label={t.statTotalGuests} icon={<Users className="w-5 h-5" />}
          value={metricMode === 'party' ? totalPartySize : guests.length}
          footer={t.totalGuestInvites} onClick={() => { setStatusFilter('All'); scrollToList(); }} />
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
              <div>
                <label className="label-mono block mb-1">{tf('dietaryForMember', { name: t.finderPartyLead })}</label>
                <TextInput type="text" placeholder={t.dietaryPlaceholder} {...register('dietary_restrictions')} />
              </div>
              <div className="flex items-end">
                <motion.button whileTap={{ scale: 0.98 }} type="submit" disabled={submittingGuest}
                  className="btn-accent w-full py-2.5 px-6 text-sm disabled:opacity-50">
                  <Send className="w-4 h-4 mr-2" />
                  <span>{submittingGuest ? t.sendingInviteBtn : markGoing || deliveryChannel === 'none' ? t.createInviteBtn : t.sendInviteBtn}</span>
                </motion.button>
              </div>
            </div>
          </form>
      </motion.div>

      {/* Pending self-registrations awaiting host approval */}
      {pendingApprovals.length > 0 && (
        <motion.div ref={approvalRef} variants={adminCardVariants} className="card-paper p-6 sm:p-8 space-y-4">
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
            {approvalsPager.pageItems.map((g) => (
              <div key={g.id} className="flex flex-wrap items-center justify-between gap-3 p-4 bg-white border border-[#CBAE94]/50 rounded-2xl">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[#5D5449] truncate">{g.name}</p>
                  <p className="text-xs font-mono text-[#5D5449]/70 truncate">
                    {[g.email, g.phone].filter(Boolean).join(' | ') || t.channelNone}
                    {' · '}
                    {tf('guestPartySizeLabel', { count: String(getGuestPartySize(g)), max: String(g.max_party_size || 1) })}
                  </p>
                  {getPartyDietarySummary(g) ? (
                    <p className="text-xs text-[#8B735B] truncate">{getPartyDietarySummary(g)}</p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleApproval(g, 'approve')}
                    className="px-4 min-h-[44px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>{t.approveBtn}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApproval(g, 'reject')}
                    className="px-4 min-h-[44px] rounded-xl border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold inline-flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <XCircle className="w-4 h-4" />
                    <span>{t.rejectBtn}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
          <Pagination
            page={approvalsPager.page}
            totalPages={approvalsPager.totalPages}
            rangeStart={approvalsPager.rangeStart}
            rangeEnd={approvalsPager.rangeEnd}
            total={approvalsPager.total}
            onPageChange={approvalsPager.setPage}
          />
        </motion.div>
      )}

      {/* Invited Guests Table Section */}
      <motion.div ref={listRef} variants={adminCardVariants} className="card-paper p-6 sm:p-8 space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="shrink-0">
            <h3 className="font-sans text-xl font-bold text-[#8B735B] whitespace-nowrap">{t.guestListTitle}</h3>
          </div>

          <GuestToolbar
            className="lg:flex-1 lg:min-w-0"
            searchTerm={searchTerm}
            onSearchChange={setSearchTerm}
            statusFilter={statusFilter}
            onStatusFilter={setStatusFilter}
            sourceFilter={sourceFilter}
            onSourceFilter={setSourceFilter}
            viewMode={listView}
            onViewMode={switchListView}
            onExportCsv={handleExportCsv}
            onOpenImport={() => setShowCsvImportModal(true)}
            onSendReminders={handleSendReminders}
          />
        </div>

        {selectedIds.length > 0 && (
          <BulkActionsBar
            count={selectedIds.length}
            allSelected={selectedIds.length === filteredGuests.length && filteredGuests.length > 0}
            onToggleSelectAll={toggleSelectAll}
            onResend={handleBulkResend}
            onExport={handleBulkExport}
            onDelete={handleBulkDelete}
            onClear={() => setSelectedIds([])}
          />
        )}

        {listView === 'table' && filteredGuests.length > 0 && (
          <GuestTableView guests={guestsPager.pageItems} onView={handleOpenViewGuest} />
        )}

        {listView === 'cards' && (
        <div className="grid grid-cols-1 gap-3">
          <AnimatePresence>
            {guestsPager.pageItems.map((guest) => (
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
                  : () => clearFilters()
                }
              />
            </div>
          )}
        </div>
        )}

        <Pagination
          page={guestsPager.page}
          totalPages={guestsPager.totalPages}
          rangeStart={guestsPager.rangeStart}
          rangeEnd={guestsPager.rangeEnd}
          total={guestsPager.total}
          onPageChange={guestsPager.setPage}
        />
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
          {extraMembers.map((member, i) => (
            <div key={i} className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="label-mono block mb-1 text-xs font-bold text-[#8B735B]">
                  {t.fieldName} {i + 1}
                </label>
                <TextInput type="text" value={member.name} placeholder={t.nameExamplePh}
                  onChange={(e) => setExtraMembers((prev) => prev.map((m, j) => (j === i ? { ...m, name: e.target.value } : m)))} />
              </div>
              <div>
                <label className="label-mono block mb-1 text-xs font-bold text-[#8B735B]">{t.colDietary}</label>
                <TextInput type="text" value={member.dietary || ''} placeholder={t.dietaryPlaceholder}
                  onChange={(e) => setExtraMembers((prev) => prev.map((m, j) => (j === i ? { ...m, dietary: e.target.value } : m)))} />
              </div>
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
                          setEditMembers((prev) => prev.slice(0, Math.max(0, m - 1)));
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
                      {tf('includedAttendeesLabel', { count: String(editMembers.length + 1) })}
                    </label>
                    <div className="space-y-1.5 p-2 rounded-xl border border-[#CBAE94] bg-white/60">
                      <div className="flex items-center gap-2">
                        <span className="flex-1 text-sm font-bold text-[#5D5449] truncate">{editPrimaryName}</span>
                        <span className="shrink-0 px-2 py-0.5 rounded-full bg-[#EFE6DC] border border-[#CBAE94] text-xs font-mono font-bold text-[#8B735B]">{t.finderPartyLead}</span>
                      </div>
                      <TextInput type="text" placeholder={t.dietaryPlaceholder} aria-label={tf('dietaryForMember', { name: editPrimaryName })}
                        {...registerEdit('dietary_restrictions')} />
                    </div>
                    {editMembers.map((member, i) => (
                      <div key={i} className="space-y-1.5 p-2 rounded-xl border border-[#CBAE94]/60 bg-white/60">
                        <div className="flex items-center gap-2">
                          <TextInput type="text" value={member.name} placeholder={t.nameExamplePh}
                            onChange={(e) => setEditMembers((prev) => prev.map((m, j) => (j === i ? { ...m, name: e.target.value } : m)))} />
                          <button type="button" onClick={() => setEditMembers((prev) => prev.filter((_, j) => j !== i))}
                            title={t.removeAttendeeTitle}
                            className="shrink-0 p-2 rounded-xl border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700 transition-colors cursor-pointer">
                            <XCircle className="w-4 h-4" />
                          </button>
                        </div>
                        <TextInput type="text" value={member.dietary || ''} placeholder={t.dietaryPlaceholder} aria-label={t.colDietary}
                          onChange={(e) => setEditMembers((prev) => prev.map((m, j) => (j === i ? { ...m, dietary: e.target.value } : m)))} />
                      </div>
                    ))}
                    <button type="button" disabled={editMembers.length >= editMaxParty - 1}
                      onClick={() => setEditMembers((prev) => [...prev, { name: '', contact: '', dietary: '' }])}
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
        onApproval={handleApproval}
      />
    </motion.div>
  );
};
