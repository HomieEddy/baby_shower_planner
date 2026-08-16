import { motion } from 'motion/react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { EventDetailsCard } from '../rsvp/EventDetailsCard';
import { useT } from '../shared/i18n';
import { fadeUp } from '../shared/motionPresets';

export const EventDetailsPage = () => {
  const t = useT();
  const navigate = useNavigate();

  return (
    <motion.div variants={fadeUp} initial="hidden" animate="show" className="space-y-4">
      <button
        type="button"
        onClick={() => navigate('/')}
        className="text-xs font-bold font-mono text-[#8B735B] hover:text-[#D4A373] inline-flex items-center gap-1 transition-colors cursor-pointer"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        {t.backHomeBtn}
      </button>
      <EventDetailsCard />
    </motion.div>
  );
};
