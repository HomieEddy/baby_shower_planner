import { ReactNode } from 'react';
import { motion } from 'motion/react';
import { adminCardVariants } from './motionPresets';

interface MetricCardProps {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  footer: string;
  iconClass?: string;
  onClick?: () => void;
}

// Compact stat card. Clickable when it drives a filter/scroll, otherwise static.
export const MetricCard = ({ label, value, icon, footer, iconClass = 'text-[#8B735B]', onClick }: MetricCardProps) => {
  const cardClass = `card-paper-sm p-4 sm:p-5 min-w-0 overflow-hidden text-left ${
    onClick ? 'cursor-pointer hover:-translate-y-0.5 transition-transform w-full' : ''
  }`;
  const inner = (
    <>
      <div className="flex items-start justify-between gap-2 min-w-0">
        <span className="label-mono min-w-0 break-words">{label}</span>
        <span className={`shrink-0 ${iconClass}`}>{icon}</span>
      </div>
      <div className="mt-3">
        <span className="text-2xl sm:text-3xl font-sans font-bold text-[#8B735B]">{value}</span>
      </div>
      <div className="mt-2 text-xs text-[#8B735B] font-mono font-bold break-words">{footer}</div>
    </>
  );
  return onClick ? (
    <motion.button type="button" variants={adminCardVariants} onClick={onClick} className={cardClass}>
      {inner}
    </motion.button>
  ) : (
    <motion.div variants={adminCardVariants} className={cardClass}>
      {inner}
    </motion.div>
  );
};
