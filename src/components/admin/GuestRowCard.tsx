import { motion } from 'motion/react';
import {
  Mail,
  Smartphone,
  CheckCircle2,
  Clock,
  XCircle,
  Check,
  Copy,
  Settings,
  Trash2,
} from 'lucide-react';
import { Guest } from '../../types';
import { channelLabel } from '../../lib/capabilities';
import { getGuestPartySize } from '../seating/floorPlanHelpers';
import { useT } from '../shared/i18n';

interface GuestRowCardProps {
  guest: Guest;
  selected: boolean;
  copiedToken: string | null;
  onToggleSelect: (id: string) => void;
  onCopyLink: (token: string) => void;
  onCopyMessage: (guestId: string) => void;
  onEdit: (guest: Guest) => void;
  onDelete: (id: string, name: string) => void;
}

export const GuestRowCard = ({
  guest,
  selected,
  copiedToken,
  onToggleSelect,
  onCopyLink,
  onCopyMessage,
  onEdit,
  onDelete,
}: GuestRowCardProps) => {
  const t = useT();
  const isCopied = copiedToken === guest.magic_token;
  const initials = guest.name.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  const channelLabelValue = channelLabel(t, guest.delivery_channel || 'none');
  const partySize = getGuestPartySize(guest);
  const maxSize = Math.max(guest.max_party_size || 1, partySize);

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -10 }}
      className="bg-white border border-[#CBAE94]/50 rounded-2xl p-4 space-y-3 shadow-xs"
    >
      {/* Header: initials, name, status */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button type="button" onClick={() => onToggleSelect(guest.id)}
            className={`shrink-0 rounded-lg border-2 p-1 transition-colors cursor-pointer ${selected ? 'bg-[#8B735B] border-[#8B735B] text-white' : 'border-[#CBAE94] text-transparent hover:border-[#8B735B] hover:text-[#8B735B]'}`}
            title={selected ? t.deselectAllBtn : t.selectAllBtn}>
            <Check className="w-3.5 h-3.5" />
          </button>
          <div className="w-10 h-10 rounded-full bg-[#EFE6DC] border border-[#CBAE94] flex items-center justify-center shrink-0">
            <span className="text-xs font-bold text-[#8B735B]">{initials}</span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="font-bold text-[#5D5449] text-sm truncate">{guest.name}</h4>
              {guest.delivery_channel ? (
                <span className="px-2 py-0.5 rounded-md bg-[#EFE6DC] border border-[#CBAE94] text-[10px] font-mono font-bold text-[#8B735B]">
                  {channelLabelValue}
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
        <button onClick={() => onCopyLink(guest.magic_token)}
          className="px-2 py-3 bg-[#EFE6DC] hover:bg-[#CBAE94] hover:text-white text-[#8B735B] rounded-xl text-[11px] font-bold font-mono transition-colors inline-flex items-center justify-center space-x-1 border border-[#CBAE94] cursor-pointer"
          title={t.copyMagicLinkTitle}>
          {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" /> : <Copy className="w-3 h-3 shrink-0" />}
          <span className="truncate">{isCopied ? t.linkCopied : t.copyLink}</span>
        </button>
        <button onClick={() => onCopyMessage(guest.id)}
          className="px-2 py-3 bg-[#8B735B] hover:bg-[#5D5449] text-white rounded-xl text-[11px] font-bold font-mono transition-colors inline-flex items-center justify-center space-x-1 cursor-pointer"
          title={t.copyMessageBtn}>
          <Copy className="w-3 h-3 shrink-0" /><span className="truncate">{t.copyMessageBtn}</span>
        </button>
        <button onClick={() => onEdit(guest)}
          className="px-2 py-3 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-xl text-[11px] font-bold font-mono transition-colors inline-flex items-center justify-center space-x-1 border border-amber-300 cursor-pointer"
          title={t.editGuestTitle}>
          <Settings className="w-3 h-3 shrink-0" /><span className="truncate">{t.editBtn}</span>
        </button>
        <button onClick={() => onDelete(guest.id, guest.name)}
          className="px-2 py-3 bg-rose-100 hover:bg-rose-200 text-rose-700 rounded-xl text-[11px] font-bold font-mono transition-colors inline-flex items-center justify-center space-x-1 border border-rose-300 cursor-pointer"
          title={t.deleteGuestTitle}>
          <Trash2 className="w-3.5 h-3.5 shrink-0" />
        </button>
      </div>
    </motion.div>
  );
};
