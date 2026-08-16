import { motion } from 'motion/react';
import { CheckCircle2, Sparkles, Calendar, Edit3, ChevronRight, XCircle } from 'lucide-react';
import { Guest } from '../../types';
import { cardStagger, popIn, fadeUp } from '../shared/motionPresets';
import { useT } from '../shared/i18n';

export const ConfirmationView = ({
  guest,
  onEdit,
  onViewEvent,
}: {
  guest: Guest;
  onEdit: () => void;
  onViewEvent: () => void;
}) => {
  const t = useT();
  return (
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
            ? t.rsvpConfirmedMsgAttending
            : t.rsvpConfirmedMsgDeclined}
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
          onClick={onViewEvent}
          className="btn-accent w-full text-sm space-x-2 py-3.5"
        >
          <Calendar className="w-4 h-4" />
          <span>{t.viewEventDetailsBtn}</span>
          <ChevronRight className="w-4 h-4 ml-1" />
        </button>

        <div className="flex items-center justify-center pt-1">
          {!guest.is_read_only ? (
            <button
              onClick={onEdit}
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
          {guest.rsvp_status === 'Attending' ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-700" />
              <span>{t.rsvpConfirmedLabel} <strong>{t.statusAttendingWord} ({guest.attending_party_size || 1})</strong></span>
            </>
          ) : (
            <>
              <XCircle className="w-4 h-4 text-rose-600" />
              <span>{t.rsvpConfirmedLabel} <strong>{t.statusDeclinedWord}</strong></span>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
};
