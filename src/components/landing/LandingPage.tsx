import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { UserRound, ShieldCheck } from 'lucide-react';
import { EventDetailsCard } from '../rsvp/EventDetailsCard';
import { useT } from '../shared/i18n';
import { fadeUp } from '../shared/motionPresets';

export const LandingPage = () => {
  const t = useT();
  const navigate = useNavigate();

  return (
    <motion.div variants={fadeUp} initial="hidden" animate="show" className="space-y-6">
      {/* Hero with the two login buttons */}
      <div className="card-paper p-8 sm:p-12 text-center relative overflow-hidden">
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
