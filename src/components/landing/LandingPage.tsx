import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { UserRound } from 'lucide-react';
import { AppMark } from '../shared/AppMark';
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
      <GuestPageHeader mark={<AppMark settings={settings} className="w-6 h-6 text-[#8B735B]" />} title={title} subtitle={t.landingHeroSubtitle} />

      <div className="card-soft p-6 sm:p-8 space-y-3">
        <button
          type="button"
          onClick={() => navigate('/portal')}
          className="btn-accent w-full py-3 text-sm font-bold gap-2 cursor-pointer"
        >
          <UserRound className="w-4 h-4" />
          {t.landingGuestBtn}
        </button>
        <p className="text-xs text-[#5D5449] text-center">{t.landingGuestCaption}</p>
      </div>
    </motion.div>
  );
};
