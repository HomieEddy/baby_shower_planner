import { motion } from 'motion/react';
import {
  Mail,
  Smartphone,
  CheckCircle2,
  Clock,
  XCircle,
  Check,
} from 'lucide-react';
import { Guest } from '../../types';
import { getGuestPartySize } from '../../lib/tableAssignment';
import { isAttending } from '../../lib/guestAttendees';
import { useT, useTf } from '../shared/i18n';

interface GuestRowCardProps {
  guest: Guest;
  selected: boolean;
  onToggleSelect: (id: string) => void;
  onView: (guest: Guest) => void;
}

// Whole card opens the details modal; the selection checkbox is the only
// nested control and stops propagation. div role="button" because a <button>
// cannot legally contain another interactive element.
export const GuestRowCard = ({
  guest,
  selected,
  onToggleSelect,
  onView,
}: GuestRowCardProps) => {
  const t = useT();
  const tf = useTf();
  const initials = guest.name.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  const contactLine = [guest.email, guest.phone].filter(Boolean).join(' · ');
  const extras = getGuestPartySize(guest) - 1;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -10 }}
      onClick={() => onView(guest)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onView(guest); }
      }}
      role="button"
      tabIndex={0}
      aria-label={t.viewBtn}
      className="bg-white border border-[#CBAE94]/50 rounded-2xl px-4 py-3 cursor-pointer hover:border-[#CBAE94] hover:bg-[#EFE6DC]/30 focus:outline-none focus:ring-2 focus:ring-[#8B735B] transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onToggleSelect(guest.id); }}
            onKeyDown={(e) => e.stopPropagation()}
            className={`shrink-0 rounded-md border p-1 transition-colors cursor-pointer ${selected ? 'bg-[#8B735B] border-[#8B735B] text-white' : 'border-[#CBAE94] text-transparent hover:border-[#8B735B] hover:text-[#8B735B]'}`}
            title={selected ? t.deselectAllBtn : t.selectAllBtn}
            aria-label={selected ? t.deselectAllBtn : t.selectAllBtn}>
            <Check className="w-3.5 h-3.5" />
          </button>
          <div className="hidden sm:flex w-10 h-10 rounded-full bg-[#EFE6DC] border border-[#CBAE94] items-center justify-center shrink-0">
            <span className="text-xs font-bold text-[#8B735B]">{initials}</span>
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-[#4A3F35] text-sm break-words">
                {guest.name}
                {extras > 0 && <span className="ml-1.5 text-xs font-bold text-[#8B735B]">+{extras}</span>}
              </p>
              {guest.approval_status === 'pending' && (
                <span className="px-2 py-0.5 rounded-full bg-amber-50 border border-amber-300 text-xs font-semibold text-amber-800">
                  {t.approvalPendingBadge}
                </span>
              )}
            </div>
            <div className="text-xs text-[#5D5449] truncate mt-0.5 flex items-center gap-x-2 gap-y-0.5 flex-wrap">
              {contactLine ? <span className="inline-flex items-center gap-1">
                {guest.email ? <Mail className="w-3 h-3 shrink-0" /> : <Smartphone className="w-3 h-3 shrink-0" />}
                {contactLine}
              </span> : null}
              {guest.invited_by_guest_name ? (
                <span className="inline-flex items-center gap-1 text-[#8B735B]">
                  {tf('invitedByBadge', { name: guest.invited_by_guest_name })}
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <RsvpStatusChip guest={guest} />
      </div>
    </motion.div>
  );
};

// RSVP status chip shared by the guest list and the details modal: green for
// attending, tan for pending, muted for declined (red stays for errors).
export const RsvpStatusChip = ({ guest }: { guest: Guest }) => {
  const t = useT();
  const base = 'inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border whitespace-nowrap shrink-0';
  if (isAttending(guest)) {
    return (
      <span className={`${base} status-ok`}>
        <CheckCircle2 className="w-3 h-3 shrink-0" /><span>{t.statusAttendingWord}</span>
      </span>
    );
  }
  if (guest.rsvp_status === 'Pending') {
    return (
      <span className={`${base} bg-[#EFE6DC] text-[#5D5449] border-[#CBAE94]`}>
        <Clock className="w-3 h-3 shrink-0" /><span>{t.statusPendingWord}</span>
      </span>
    );
  }
  return (
    <span className={`${base} bg-white text-[#5D5449] border-[#CBAE94]/70`}>
      <XCircle className="w-3 h-3 shrink-0" /><span>{t.statusDeclinedWord}</span>
    </span>
  );
};
