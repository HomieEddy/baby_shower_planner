import { motion } from 'motion/react';
import { EventDetailsCard } from '../rsvp/EventDetailsCard';
import { useT } from '../shared/i18n';
import { BackButton } from '../shared/BackButton';
import { fadeUp } from '../shared/motionPresets';

export const EventDetailsPage = () => {
  const t = useT();

  return (
    <motion.div variants={fadeUp} initial="hidden" animate="show" className="space-y-4 -mt-6 sm:mt-0">
      <BackButton label={t.backHomeBtn} />
      <EventDetailsCard />
    </motion.div>
  );
};
