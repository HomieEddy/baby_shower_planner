import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { UserRound, ShieldCheck, Baby } from 'lucide-react';
import { useSettings } from '../../lib/settingsQuery';
import { useAppStore } from '../../stores/appStore';
import { useT } from '../shared/i18n';
import { fadeUp } from '../shared/motionPresets';
import { GuestPageHeader } from '../shared/GuestPageHeader';

export const LandingPage = () => {
  const t = useT();
  const navigate = useNavigate();
  const settings = useSettings();
  const language = useAppStore((s) => s.language);

  const parents = settings?.parentsNames?.trim() || settings?.babyName?.trim();
  const title = language === 'EN'
    ? (parents ? `${parents}'s Baby Shower` : 'Baby Shower')
    : (parents ? `Baby Shower de ${parents}` : 'Baby Shower');

  return (
    <motion.div variants={fadeUp} initial="hidden" animate="show" className="w-full max-w-sm mx-auto pt-2 sm:pt-8 space-y-6">
      <GuestPageHeader icon={Baby} title={title} subtitle={t.landingHeroSubtitle} />

      <div className="card-guest p-6 sm:p-8 space-y-3">
        <button
          type="button"
          onClick={() => navigate('/portal')}
          className="btn-accent w-full py-3 text-sm font-bold gap-2 cursor-pointer"
        >
          <UserRound className="w-4 h-4" />
          {t.landingGuestBtn}
        </button>
        <p className="text-xs text-[#5D5449] text-center">{t.landingGuestCaption}</p>

        <div className="flex items-center gap-3 py-2" aria-hidden>
          <span className="flex-1 border-t border-[#CBAE94]/50" />
          <span className="text-xs font-mono font-bold text-[#A09080] uppercase tracking-widest">{t.landingEntryLabel}</span>
          <span className="flex-1 border-t border-[#CBAE94]/50" />
        </div>

        <button
          type="button"
          onClick={() => navigate('/admin')}
          className="btn-outline-accent w-full py-3 text-sm font-bold gap-2 cursor-pointer hover:-translate-y-0.5 hover:shadow-sm"
        >
          <ShieldCheck className="w-4 h-4" />
          {t.landingAdminBtn}
        </button>
      </div>
    </motion.div>
  );
};
