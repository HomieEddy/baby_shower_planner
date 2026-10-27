import { ReactNode } from 'react';
import { motion } from 'motion/react';
import { adminCardVariants } from './motionPresets';

interface MetricCardProps {
  label: string;
  value: ReactNode;
  icon: ReactNode;
  footer?: string;
  iconClass?: string;
  onClick?: () => void;
}

// Compact stat card. Clickable when it drives a filter/scroll, otherwise static.
export const MetricCard = ({ label, value, icon, footer, iconClass = 'text-[#8B735B]', onClick }: MetricCardProps) => {
  const cardClass = `card-paper-sm p-3 sm:p-4 min-w-0 overflow-hidden text-left ${
    onClick ? 'cursor-pointer hover:-translate-y-0.5 transition-transform w-full' : ''
  }`;
  const inner = (
    <>
      <div className="flex items-center gap-1.5 min-w-0">
        <span className={`shrink-0 [&>svg]:w-4 [&>svg]:h-4 ${iconClass}`}>{icon}</span>
        <span className="text-xs font-semibold text-[#5D5449] leading-snug min-w-0 break-words">{label}</span>
      </div>
      <div className="mt-2 text-2xl sm:text-3xl font-sans font-bold text-[#4A3F35] leading-none">{value}</div>
      {footer !== undefined && (
        <div className="mt-1.5 text-xs text-[#5D5449] leading-snug break-words">{footer}</div>
      )}
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
