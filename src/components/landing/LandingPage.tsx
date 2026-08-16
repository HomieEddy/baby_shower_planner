import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { UserRound, ShieldCheck, CalendarDays, Baby } from 'lucide-react';
import { useSettingsStore } from '../../stores/settingsStore';
import { useAppStore } from '../../stores/appStore';
import { useT } from '../shared/i18n';
import { fadeUp } from '../shared/motionPresets';

export const LandingPage = () => {
  const t = useT();
  const navigate = useNavigate();
  const settings = useSettingsStore((s) => s.settings);
  const language = useAppStore((s) => s.language);

  const parents = settings?.parentsNames?.trim() || settings?.babyName?.trim();
  const title = language === 'EN'
    ? (parents ? `${parents}'s Baby Shower` : 'Baby Shower')
    : (parents ? `Baby Shower de ${parents}` : 'Baby Shower');

  return (
    <motion.div variants={fadeUp} initial="hidden" animate="show" className="w-full max-w-sm mx-auto pt-2 sm:pt-6">
      {/* Brand */}
      <div className="text-center mb-8">
        <div className="w-16 h-16 bg-[#E9E0D2] border-2 border-[#4A3F35] rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-xs">
          <Baby className="w-8 h-8 text-[#4A3F35]" />
        </div>
        <h1 className="font-newsreader text-3xl font-bold text-[#4A3F35]">{title}</h1>
        <p className="text-sm text-[#A09080] mt-1 font-mono">{t.landingHeroSubtitle}</p>
      </div>

      {/* Card */}
      <div className="bg-white rounded-2xl border border-[#CBAE94]/40 p-8 shadow-sm space-y-3">
        <button
          type="button"
          onClick={() => navigate('/portal')}
          className="w-full py-2.5 rounded-xl bg-[#8B735B] text-white font-bold text-sm hover:bg-[#4A3F35] transition-colors flex items-center justify-center gap-2 cursor-pointer"
        >
          <UserRound className="w-4 h-4" />
          {t.landingGuestBtn}
        </button>

        <div className="flex items-center gap-3 py-1" aria-hidden>
          <span className="flex-1 border-t border-[#CBAE94]/50" />
          <span className="text-[10px] font-mono font-bold text-[#A09080] uppercase tracking-widest">{t.landingEntryLabel}</span>
          <span className="flex-1 border-t border-[#CBAE94]/50" />
        </div>

        <button
          type="button"
          onClick={() => navigate('/admin')}
          className="w-full py-2.5 rounded-xl border-2 border-[#CBAE94] bg-white text-[#4A3F35] font-bold text-sm hover:bg-[#EFE6DC] transition-colors flex items-center justify-center gap-2 cursor-pointer"
        >
          <ShieldCheck className="w-4 h-4" />
          {t.landingAdminBtn}
        </button>
        <button
          type="button"
          onClick={() => navigate('/event')}
          className="w-full py-2.5 rounded-xl border-2 border-[#CBAE94] bg-white text-[#4A3F35] font-bold text-sm hover:bg-[#EFE6DC] transition-colors flex items-center justify-center gap-2 cursor-pointer"
        >
          <CalendarDays className="w-4 h-4" />
          {t.landingEventBtn}
        </button>
      </div>
    </motion.div>
  );
};
