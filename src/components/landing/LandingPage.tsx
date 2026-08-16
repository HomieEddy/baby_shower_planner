import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { UserRound, ShieldCheck, Sparkles } from 'lucide-react';
import { EventDetailsCard } from '../rsvp/EventDetailsCard';
import { useSettingsStore } from '../../stores/settingsStore';
import { useT } from '../shared/i18n';
import { fadeUp } from '../shared/motionPresets';

export const LandingPage = () => {
  const t = useT();
  const navigate = useNavigate();
  const settings = useSettingsStore((s) => s.settings);

  const parents = settings?.parentsNames?.trim() || settings?.babyName?.trim();
  const heroTitle = parents ? t.landingHeroTitle.replace('{{parents}}', parents) : t.rsvpPageTitle;

  return (
    <motion.div variants={fadeUp} initial="hidden" animate="show" className="space-y-6">
      {/* Hero with the two login buttons */}
      <div className="card-paper p-8 sm:p-12 text-center relative overflow-hidden">
        <div className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-widest px-4 py-1.5 bg-[#E9E0D2] text-[#4A3F35] rounded-full font-bold mb-6 border border-[#4A3F35]/10">
          <Sparkles className="w-3.5 h-3.5 text-[#D4A373]" />
          {t.eventBadge}
        </div>

        <h1 className="font-newsreader text-4xl sm:text-5xl font-bold text-[#4A3F35] tracking-tight leading-tight mb-3">
          {heroTitle}
        </h1>
        <p className="text-[#4A3F35]/70 text-sm sm:text-base max-w-md mx-auto leading-relaxed mb-8 font-sans">
          {t.landingHeroSubtitle}
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/portal')}
            className="btn-accent w-full sm:w-auto px-8 py-3.5 text-sm font-bold inline-flex items-center justify-center gap-2"
          >
            <UserRound className="w-4 h-4" />
            {t.landingGuestBtn}
          </button>
          <button
            type="button"
            onClick={() => navigate('/admin')}
            className="w-full sm:w-auto px-8 py-3.5 text-sm font-bold rounded-2xl border-2 border-[#4A3F35]/25 bg-white hover:bg-[#EFE6DC] text-[#4A3F35] transition-colors inline-flex items-center justify-center gap-2 cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4" />
            {t.landingAdminBtn}
          </button>
        </div>
      </div>

      <EventDetailsCard />
    </motion.div>
  );
};
