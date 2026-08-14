import { motion } from 'motion/react';
import { CheckCircle2, Calendar, Users, ChevronLeft, ChevronRight } from 'lucide-react';
import { useT } from '../shared/i18n';

export type RsvpTab = 'rsvp' | 'event' | 'invite';

const TAB_ORDER: RsvpTab[] = ['rsvp', 'event', 'invite'];

const TabPill = ({
  tab,
  icon,
  label,
  activeTab,
  onTabChange,
}: {
  tab: RsvpTab;
  icon: React.ReactNode;
  label: string;
  activeTab: RsvpTab;
  onTabChange: (tab: RsvpTab) => void;
}) => (
  <button
    onClick={() => onTabChange(tab)}
    className={`relative px-2 sm:px-4 py-2 rounded-full text-xs font-bold font-mono transition-all flex items-center space-x-1 sm:space-x-2 z-10 min-w-0 ${
      activeTab === tab
        ? 'text-[#F8F5F0]'
        : 'text-[#4A3F35]/70 hover:text-[#4A3F35]'
    }`}
  >
    {activeTab === tab && (
      <motion.div
        layoutId="activeCarouselTab"
        className="absolute inset-0 bg-[#4A3F35] rounded-full -z-10"
        transition={{ type: 'spring', stiffness: 350, damping: 30 }}
      />
    )}
    <span className="hidden sm:block shrink-0">{icon}</span>
    <span className="truncate whitespace-nowrap">{label}</span>
  </button>
);

export const RsvpCarouselTabs = ({
  activeTab,
  onTabChange,
}: {
  activeTab: RsvpTab;
  onTabChange: (tab: RsvpTab) => void;
}) => {
  const t = useT();
  const step = (dir: 1 | -1) =>
    onTabChange(TAB_ORDER[(TAB_ORDER.indexOf(activeTab) + (dir === 1 ? 1 : 2)) % 3]);

  return (
    <div className="bg-white border-2 border-[#4A3F35] p-1.5 rounded-full flex items-center justify-between max-w-lg mx-auto shadow-sm overflow-hidden">
      <button
        onClick={() => step(-1)}
        className="p-1.5 sm:p-2.5 rounded-full hover:bg-[#E9E0D2]/50 text-[#4A3F35] transition-colors shrink-0"
        title={t.prevSlideBtn}
      >
        <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5" />
      </button>

      <div className="flex items-center justify-center flex-1 min-w-0 space-x-0.5 sm:space-x-1 relative bg-[#F8F5F0] p-1 rounded-full border border-[#4A3F35]/15">
        <TabPill tab="rsvp" icon={<CheckCircle2 className="w-3.5 h-3.5" />} label={t.rsvpTabLabel} activeTab={activeTab} onTabChange={onTabChange} />
        <TabPill tab="event" icon={<Calendar className="w-3.5 h-3.5" />} label={t.eventTabLabel} activeTab={activeTab} onTabChange={onTabChange} />
        <TabPill tab="invite" icon={<Users className="w-3.5 h-3.5" />} label={t.inviteTabLabel} activeTab={activeTab} onTabChange={onTabChange} />
      </div>

      <button
        onClick={() => step(1)}
        className="p-1.5 sm:p-2.5 rounded-full hover:bg-[#E9E0D2]/50 text-[#4A3F35] transition-colors shrink-0"
        title={t.nextSlideBtn}
      >
        <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5" />
      </button>
    </div>
  );
};
