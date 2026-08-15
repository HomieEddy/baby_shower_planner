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
} from 'lucide-react';
import { Modal } from '../shared/Modal';
import { useT } from '../shared/i18n';
import { Guest } from '../../types';
import { getGuestPartySize } from '../seating/floorPlanHelpers';
import { channelLabel } from '../../lib/capabilities';

interface GuestListModalProps {
  open: boolean;
  title: string;
  guests: Guest[];
  listView: 'invites' | 'party';
  onListViewChange: (v: 'invites' | 'party') => void;
  onClose: () => void;
}

export const GuestListModal = ({
  open,
  title,
  guests,
  listView,
  onListViewChange,
  onClose,
}: GuestListModalProps) => {
  const t = useT();

  const fullListRows = guests.flatMap((g) => {
    const members = g.attendee_names && g.attendee_names.length > 0 ? g.attendee_names : [g.name];
    return members.map((name, i) => ({ name, isLeader: i === 0, partySize: i === 0 ? getGuestPartySize(g) : null }));
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      maxWidth="lg"
      title={<h3 className="font-sans text-xl font-bold text-[#4A3F35]">{title}</h3>}
    >
      <div className="space-y-4">
        <div className="flex items-center space-x-1 bg-[#EFE6DC] p-1 rounded-full text-xs font-bold font-mono border border-[#CBAE94] w-fit">
          <button
            onClick={() => onListViewChange('invites')}
            className={`px-3 py-1.5 rounded-full transition-colors cursor-pointer ${listView === 'invites' ? 'bg-[#8B735B] text-white shadow-xs' : 'text-[#5D5449] hover:text-[#8B735B]'}`}
          >
            {t.metricViewInvitesLabel}
          </button>
          <button
            onClick={() => onListViewChange('party')}
            className={`px-3 py-1.5 rounded-full transition-colors cursor-pointer ${listView === 'party' ? 'bg-[#8B735B] text-white shadow-xs' : 'text-[#5D5449] hover:text-[#8B735B]'}`}
          >
            {t.metricViewFullListLabel}
          </button>
        </div>

        {guests.length === 0 ? (
          <p className="text-xs text-[#5D5449]/70 italic py-10 text-center font-mono">{t.noGuestsInCategory}</p>
        ) : (
          <div className="overflow-y-auto max-h-[60vh] rounded-2xl border border-[#CBAE94]/60">
            {listView === 'invites' ? (
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-[#EFE6DC]">
                  <tr className="text-[11px] font-mono font-bold text-[#8B735B] uppercase tracking-wider">
                    <th className="px-3 py-2">{t.colName}</th>
                    <th className="px-3 py-2">{t.emailLabel}</th>
                    <th className="px-3 py-2 text-right">{t.colPartySize}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#CBAE94]/30 bg-white">
                  {guests.map((g) => (
                    <tr key={g.id} className="text-[#5D5449]">
                      <td className="px-3 py-2 font-bold">{g.name}</td>
                      <td className="px-3 py-2 font-mono text-xs text-[#5D5449]/70">{g.email || '\u2014'}</td>
                      <td className="px-3 py-2 text-right font-bold">{getGuestPartySize(g)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-[#EFE6DC]">
                  <tr className="text-[11px] font-mono font-bold text-[#8B735B] uppercase tracking-wider">
                    <th className="px-3 py-2">{t.colName}</th>
                    <th className="px-3 py-2 text-right">{t.colPartySize}</th>
                  </tr>
                </thead>
                <tbody className="bg-white">
                  {fullListRows.map((r, i) => (
                    <tr key={i} className={`text-[#5D5449] ${r.isLeader && i > 0 ? 'border-t-2 border-[#8B735B]/20' : ''}`}>
                      <td className={`px-3 py-2 ${r.isLeader ? 'font-bold' : 'pl-6 font-mono text-[#5D5449]/80'}`}>{r.name}</td>
                      <td className="px-3 py-2 text-right font-bold">{r.partySize ?? ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};

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
}: GuestDetailsModalProps) => {
  const t = useT();
  if (!guest) return null;

  const initials = guest.name.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
  const partySize = getGuestPartySize(guest);
  const maxSize = Math.max(guest.max_party_size || 1, partySize);
  const isCopied = copiedToken === guest.magic_token;
  const magicUrl = `${window.location.origin}/rsvp/${guest.magic_token}`;
  const channelLabelValue = channelLabel(t, guest.delivery_channel || 'none');
  const members = guest.attendee_names && guest.attendee_names.length > 0 ? guest.attendee_names : [guest.name];
  const invitedGuests = allGuests.filter((g) => g.invited_by_guest_id === guest.id);

  const statusBadge =
    guest.rsvp_status === 'Attending' ? (
      <span className="inline-flex items-center space-x-1 px-3 py-1 rounded-full bg-[#EFE6DC] text-emerald-800 text-[11px] font-bold border border-emerald-300 whitespace-nowrap shrink-0">
        <CheckCircle2 className="w-3 h-3 text-emerald-600 shrink-0" /><span>{t.statusAttendingWord}</span>
      </span>
    ) : guest.rsvp_status === 'Pending' ? (
      <span className="inline-flex items-center space-x-1 px-3 py-1 rounded-full bg-[#EFE6DC] text-[#8B735B] text-[11px] font-bold border border-[#CBAE94] whitespace-nowrap shrink-0">
        <Clock className="w-3 h-3 text-[#8B735B] shrink-0" /><span>{t.statusPendingWord}</span>
      </span>
    ) : (
      <span className="inline-flex items-center space-x-1 px-3 py-1 rounded-full bg-rose-50 text-rose-800 text-[11px] font-bold border border-rose-300 whitespace-nowrap shrink-0">
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
              <div className="text-[11px] text-[#5D5449]/70 font-mono flex items-center gap-2 flex-wrap">
                {guest.email ? <span className="inline-flex items-center gap-1"><Mail className="w-3 h-3 shrink-0" />{guest.email}</span> : null}
                {guest.phone ? <span className="inline-flex items-center gap-1"><Smartphone className="w-3 h-3 shrink-0" />{guest.phone}</span> : null}
              </div>
            </div>
          </div>
          {statusBadge}
        </div>

        <div className="flex flex-wrap gap-1.5">
          <span className="px-2.5 py-1 rounded-lg bg-[#EFE6DC] border border-[#CBAE94] text-[11px] font-bold font-mono text-[#8B735B]">{t.reservationCodeLabel} {guest.code}</span>
          <span className="px-2.5 py-1 rounded-lg bg-white border border-[#CBAE94] text-[11px] font-bold text-[#5D5449]">{t.colPartySize}: {partySize} / {maxSize}</span>
          <span className="px-2.5 py-1 rounded-lg bg-white border border-[#CBAE94] text-[11px] font-bold text-[#5D5449]">{channelLabelValue}</span>
          {guest.dietary_restrictions ? (
            <span className="px-2.5 py-1 rounded-full bg-[#EFE6DC] text-[11px] font-medium text-[#8B735B] border border-[#CBAE94] max-w-full">{t.dietaryRestrictionsLabel} {guest.dietary_restrictions}</span>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <label className="label-mono block text-xs font-bold text-[#8B735B]">{t.includedAttendeesLabel.replace('{{count}}', String(members.length))}</label>
          <div className="flex flex-wrap gap-1.5">
            {members.map((n, i) => (
              <span key={i} className="px-2 py-0.5 rounded-lg bg-[#EFE6DC] border border-[#CBAE94] text-[11px] font-mono text-[#8B735B]">{n}</span>
            ))}
          </div>
        </div>

        {invitedGuests.length > 0 && (
          <div className="space-y-1.5">
            <label className="label-mono block text-xs font-bold text-[#8B735B]">{t.sentInvitesLabel}</label>
            <div className="flex flex-wrap gap-1.5">
              {invitedGuests.map((g) => (
                <span key={g.id} className="px-2 py-0.5 rounded-lg bg-white border border-[#CBAE94] text-[11px] font-mono text-[#5D5449]">{g.name}</span>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <label className="label-mono block text-xs font-bold text-[#8B735B]">{t.colMagicLink}</label>
          <div className="flex gap-2">
            <input readOnly value={magicUrl}
              className="flex-1 px-3 py-2 rounded-xl border border-[#CBAE94] bg-white text-xs font-mono text-[#4A3F35] focus:outline-none" />
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
            <p className="text-[11px] text-[#5D5449]/70 font-mono italic flex items-center gap-1.5">
              <Loader2 className="w-3 h-3 animate-spin" />{t.loadingInviteMsg}
            </p>
          ) : message ? (
            <div className="bg-[#EFE6DC]/50 p-3 rounded-xl border border-[#CBAE94] whitespace-pre-wrap text-[11px] text-[#5D5449] font-mono max-h-36 overflow-y-auto">{message}</div>
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
    </Modal>
  );
};
