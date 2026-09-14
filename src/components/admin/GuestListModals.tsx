import { useState } from 'react';
import {
  Mail,
  Smartphone,
  CheckCircle2,
  Clock,
  XCircle,
  Copy,
  Check,
  Settings,
  Trash2,
  Loader2,
  X,
} from 'lucide-react';
import { Modal } from '../shared/Modal';
import { useT, useTf } from '../shared/i18n';
import { Guest } from '../../types';
import { getGuestPartySize } from '../../lib/tableAssignment';
import { getPartyMembers } from '../../lib/guestAttendees';
import { channelLabel } from '../../lib/capabilities';

interface GuestDetailsModalProps {
  open: boolean;
  guest: Guest | null;
  allGuests: Guest[];
  message: string;
  loadingMessage: boolean;
  copiedToken: string | null;
  onClose: () => void;
  onCopyLink: (token: string) => void;
  onCopyMessage: (guestId: string) => void;
  onEdit: (guest: Guest) => void;
  onDelete: (id: string, name: string) => void;
  onRemoveAttendee: (guestId: string, attendeeIndex: number, removedName: string, promoteName?: string) => void;
}

export const GuestDetailsModal = ({
  open,
  guest,
  allGuests,
  message,
  loadingMessage,
  copiedToken,
  onClose,
  onCopyLink,
  onCopyMessage,
  onEdit,
  onDelete,
  onRemoveAttendee,
}: GuestDetailsModalProps) => {
  const t = useT();
  const tf = useTf();
  const [pendingRemove, setPendingRemove] = useState<{ index: number; name: string } | null>(null);
  const [promoteName, setPromoteName] = useState('');
  if (!guest) return null;

  const initials = guest.name.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  const partySize = getGuestPartySize(guest);
  const maxSize = Math.max(guest.max_party_size || 1, partySize);
  const isCopied = copiedToken === guest.magic_token;
  const magicUrl = `${window.location.origin}/rsvp/${guest.magic_token}`;
  const channelLabelValue = channelLabel(t, guest.delivery_channel || 'none');
  const members = getPartyMembers(guest);
  const invitedGuests = allGuests.filter((g) => g.invited_by_guest_id === guest.id);

  const requestRemove = (index: number, name: string) => {
    setPromoteName(index === 0 && members.length > 1 ? members[1] || '' : '');
    setPendingRemove({ index, name });
  };

  const confirmRemove = () => {
    if (!pendingRemove) return;
    const promote = pendingRemove.index === 0 && members.length > 1 ? promoteName : undefined;
    onRemoveAttendee(guest.id, pendingRemove.index, pendingRemove.name, promote);
    setPendingRemove(null);
  };

  const statusBadge =
    guest.rsvp_status === 'Attending' ? (
      <span className="inline-flex items-center space-x-1 px-3 py-1 rounded-full bg-[#EFE6DC] text-emerald-800 text-xs font-bold border border-emerald-300 whitespace-nowrap shrink-0">
        <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" /><span>{t.statusAttendingWord}</span>
      </span>
    ) : guest.rsvp_status === 'Pending' ? (
      <span className="inline-flex items-center space-x-1 px-3 py-1 rounded-full bg-[#EFE6DC] text-[#8B735B] text-xs font-bold border border-[#CBAE94] whitespace-nowrap shrink-0">
        <Clock className="w-3 h-3 text-[#8B735B] shrink-0" /><span>{t.statusPendingWord}</span>
      </span>
    ) : (
      <span className="inline-flex items-center space-x-1 px-3 py-1 rounded-full bg-rose-50 text-rose-800 text-xs font-bold border border-rose-300 whitespace-nowrap shrink-0">
        <XCircle className="w-3 h-3 text-rose-500 shrink-0" /><span>{t.statusDeclinedWord}</span>
      </span>
    );

  return (
    <Modal
      open={open}
      onClose={onClose}
      maxWidth="lg"
      title={<h3 className="font-sans text-xl font-bold text-[#4A3F35]">{t.invitationDetailsTitle}</h3>}
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-11 h-11 rounded-full bg-[#EFE6DC] border border-[#CBAE94] flex items-center justify-center shrink-0">
              <span className="text-sm font-bold text-[#8B735B]">{initials}</span>
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-[#4A3F35] text-lg truncate">{guest.name}</h3>
              <div className="text-xs text-[#5D5449]/70 font-mono flex items-center gap-2 flex-wrap">
                {guest.email ? <span className="inline-flex items-center gap-1"><Mail className="w-3 h-3 shrink-0" />{guest.email}</span> : null}
                {guest.phone ? <span className="inline-flex items-center gap-1"><Smartphone className="w-3 h-3 shrink-0" />{guest.phone}</span> : null}
              </div>
            </div>
          </div>
          {statusBadge}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <span className="px-2.5 py-1 rounded-lg bg-[#EFE6DC] border border-[#CBAE94] text-xs font-bold font-mono text-[#8B735B]">{t.reservationCodeLabel} {guest.code}</span>
          <span className="px-2.5 py-1 rounded-lg bg-white border border-[#CBAE94] text-xs font-bold text-[#5D5449]">{t.colPartySize}: {partySize} / {maxSize}</span>
          <span className="px-2.5 py-1 rounded-lg bg-white border border-[#CBAE94] text-xs font-bold text-[#5D5449]">{channelLabelValue}</span>
          {guest.dietary_restrictions ? (
            <span className="px-2.5 py-1 rounded-full bg-[#EFE6DC] text-xs font-medium text-[#8B735B] border border-[#CBAE94] max-w-full">{t.dietaryRestrictionsLabel} {guest.dietary_restrictions}</span>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <label className="label-mono block text-xs font-bold text-[#8B735B]">{tf('includedAttendeesLabel', { count: String(members.length) })}</label>
          <div className="flex flex-wrap gap-1.5">
            {members.map((n, i) => (
              <span key={i} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-[#EFE6DC] border border-[#CBAE94] text-xs font-mono text-[#8B735B]">
                {n}
                <button type="button" onClick={() => requestRemove(i, n)} title={t.removeAttendeeTitle}
                  className="text-[#8B735B]/60 hover:text-rose-600 transition-colors cursor-pointer">
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        </div>

        {invitedGuests.length > 0 && (
          <div className="space-y-1.5">
            <label className="label-mono block text-xs font-bold text-[#8B735B]">{t.sentInvitesLabel}</label>
            <div className="flex flex-wrap gap-1.5">
              {invitedGuests.map((g) => (
                <span key={g.id} className="px-2 py-0.5 rounded-lg bg-white border border-[#CBAE94] text-xs font-mono text-[#5D5449]">{g.name}</span>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="label-mono block text-xs font-bold text-[#8B735B]">{t.colMagicLink}</label>
          <div className="flex gap-2">
            <input readOnly value={magicUrl}
              className="flex-1 px-3 py-2 rounded-xl border border-[#CBAE94] bg-white text-xs font-mono text-[#4A3F35]" />
            <button onClick={() => onCopyLink(guest.magic_token)}
              className="px-3 py-2 bg-[#EFE6DC] hover:bg-[#CBAE94] hover:text-white text-[#8B735B] rounded-xl text-xs font-bold font-mono transition-colors inline-flex items-center gap-1.5 border border-[#CBAE94] cursor-pointer shrink-0">
              {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{isCopied ? t.linkCopied : t.copyLink}</span>
            </button>
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="label-mono block text-xs font-bold text-[#8B735B]">{t.inviteMessageLabel}</label>
          {loadingMessage ? (
            <p className="text-xs text-[#5D5449]/70 font-mono italic flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" />{t.loadingInviteMsg}
            </p>
          ) : message ? (
            <div className="bg-[#EFE6DC]/50 p-3 rounded-xl border border-[#CBAE94] whitespace-pre-wrap text-xs text-[#5D5449] font-mono max-h-36 overflow-y-auto">{message}</div>
          ) : null}
          <button onClick={() => onCopyMessage(guest.id)}
            className="px-3 py-2 bg-[#8B735B] hover:bg-[#5D5449] text-white rounded-xl text-xs font-bold font-mono transition-colors inline-flex items-center gap-1.5 cursor-pointer">
            <Copy className="w-3 h-3" /><span>{t.copyMessageBtn}</span>
          </button>
        </div>

        <div className="flex flex-wrap gap-2 pt-3 border-t border-[#CBAE94]/30">
          <button onClick={() => onEdit(guest)}
            className="px-4 py-2 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-xl text-xs font-bold font-mono transition-colors inline-flex items-center gap-1.5 border border-amber-300 cursor-pointer">
            <Settings className="w-3.5 h-3.5" /><span>{t.editBtn}</span>
          </button>
          <button onClick={() => onDelete(guest.id, guest.name)}
            className="ml-auto px-4 py-2 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-xl text-xs font-bold font-mono transition-colors inline-flex items-center gap-1.5 border border-rose-300 cursor-pointer">
            <Trash2 className="w-3.5 h-3.5" /><span>{t.deleteGuestTitle}</span>
          </button>
        </div>
      </div>

      {/* Inline confirm — kept inside the details modal instead of a nested modal,
          so Escape/tap-outside and the focus trap stay unambiguous. */}
      {pendingRemove && (
        <div className="rounded-2xl border-2 border-rose-300 bg-rose-50 p-4 space-y-3">
          <h3 className="font-sans text-base font-bold text-[#4A3F35]">{t.removeAttendeeConfirmTitle}</h3>
          <p className="text-xs sm:text-sm text-[#5D5449] leading-relaxed">
            {members.length <= 1
              ? tf('removeLastAttendeeConfirmMsg', { name: pendingRemove.name || '' })
              : tf('removeAttendeeConfirmMsg', { name: pendingRemove.name || '', group: guest.name })}
          </p>
          {pendingRemove.index === 0 && members.length > 1 && (
            <div>
              <label className="label-mono block mb-1 text-xs font-bold text-[#8B735B]">{t.promoteLeadLabel}</label>
              <select value={promoteName} onChange={(e) => setPromoteName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-[#CBAE94] bg-white text-xs font-mono text-[#4A3F35]">
                {members.filter((_, i) => i !== 0).map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex items-center justify-end gap-3">
            <button type="button" onClick={() => setPendingRemove(null)}
              className="px-5 min-h-[44px] rounded-xl border border-[#CBAE94] text-sm font-bold text-[#5D5449] hover:bg-[#EFE6DC] transition-colors">
              {t.cancelBtn}
            </button>
            <button type="button" onClick={confirmRemove}
              className="px-5 min-h-[44px] rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold shadow-md transition-all">
              {t.removeAttendeeBtn}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
};
