import React from 'react';
import { motion } from 'motion/react';
import { useT } from './i18n';
import {
  HeartHandshake,
  Camera,
  BookOpen,
  Users,
  Search,
  Sparkles,
  Utensils,
  Baby,
  Smile,
  LucideIcon,
} from 'lucide-react';

export type EmptyStateType =
  | 'guestbook'
  | 'photos'
  | 'guests'
  | 'search'
  | 'tables'
  | 'rsvp'
  | 'dietary'
  | 'generic';

interface EmptyStateProps {
  type?: EmptyStateType;
  customIcon?: LucideIcon;
  title?: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}

const PRESETS: Record<
  EmptyStateType,
  {
    icon: LucideIcon;
    badgeKey: string;
    titleKey: string;
    descKey: string;
    defaultBg: string;
    accentColor: string;
  }
> = {
  guestbook: {
    icon: BookOpen,
    badgeKey: 'esGuestbookBadge',
    titleKey: 'gbNoWishesTitle',
    descKey: 'gbNoWishesMsg',
    defaultBg: 'bg-[#FFFDF9]',
    accentColor: 'text-amber-800 bg-amber-100',
  },
  photos: {
    icon: Camera,
    badgeKey: 'esPhotosBadge',
    titleKey: 'esPhotosTitle',
    descKey: 'esPhotosDesc',
    defaultBg: 'bg-[#FFFDF9]',
    accentColor: 'text-[#8B735B] bg-[#EFE6DC]',
  },
  guests: {
    icon: Users,
    badgeKey: 'esGuestsBadge',
    titleKey: 'esGuestsTitle',
    descKey: 'esGuestsDesc',
    defaultBg: 'bg-[#FFFDF9]',
    accentColor: 'text-stone-800 bg-stone-200/80',
  },
  search: {
    icon: Search,
    badgeKey: 'esSearchBadge',
    titleKey: 'esSearchTitle',
    descKey: 'esSearchDesc',
    defaultBg: 'bg-[#FFFDF9]',
    accentColor: 'text-sky-800 bg-sky-100',
  },
  tables: {
    icon: Utensils,
    badgeKey: 'esTablesBadge',
    titleKey: 'esTablesTitle',
    descKey: 'esTablesDesc',
    defaultBg: 'bg-[#FFFDF9]',
    accentColor: 'text-emerald-800 bg-emerald-100',
  },
  rsvp: {
    icon: HeartHandshake,
    badgeKey: 'esRsvpBadge',
    titleKey: 'esRsvpTitle',
    descKey: 'esRsvpDesc',
    defaultBg: 'bg-[#FFFDF9]',
    accentColor: 'text-rose-800 bg-rose-100',
  },
  dietary: {
    icon: Smile,
    badgeKey: 'esDietaryBadge',
    titleKey: 'esDietaryTitle',
    descKey: 'esDietaryDesc',
    defaultBg: 'bg-[#FFFDF9]',
    accentColor: 'text-teal-800 bg-teal-100',
  },
  generic: {
    icon: Baby,
    badgeKey: 'esGenericBadge',
    titleKey: 'esGenericTitle',
    descKey: 'esGenericDesc',
    defaultBg: 'bg-[#FFFDF9]',
    accentColor: 'text-amber-800 bg-amber-100',
  },
};

export const EmptyState: React.FC<EmptyStateProps> = ({
  type = 'generic',
  customIcon,
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
}) => {
    const t = useT();
  const preset = PRESETS[type];
  const IconComponent = customIcon || preset.icon;

  const displayTitle = title || t[preset.titleKey as keyof typeof t];
  const displayDescription = description || t[preset.descKey as keyof typeof t];

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
      className={`rounded-3xl p-8 sm:p-12 text-center border border-[#CBAE94]/40 shadow-xs max-w-xl mx-auto space-y-5 relative overflow-hidden ${preset.defaultBg}`}
    >
      {/* Background Decorative Circles */}
      <div className="absolute -top-12 -right-12 w-32 h-32 rounded-full bg-[#EFE6DC]/30 pointer-events-none blur-xl" />
      <div className="absolute -bottom-12 -left-12 w-32 h-32 rounded-full bg-amber-100/30 pointer-events-none blur-xl" />

      {/* Bébé Badge Pill */}
      <div className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#FAF6F0] border border-[#CBAE94]/40 text-xs font-bold text-[#8B735B] shadow-2xs">
        <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
        <span>{t[preset.badgeKey as keyof typeof t]}</span>
      </div>

      {/* Main Illustration Circle */}
      <div className="relative mx-auto w-20 h-20 sm:w-24 sm:h-24 rounded-full bg-[#FAF6F0] border-2 border-[#CBAE94]/40 flex items-center justify-center shadow-inner group">
        <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center shadow-xs transition-transform duration-300 group-hover:scale-110 ${preset.accentColor}`}>
          <IconComponent className="w-8 h-8 sm:w-9 sm:h-9 stroke-[2.2]" />
        </div>
      </div>

      {/* Title & Description */}
      <div className="space-y-2 max-w-md mx-auto">
        <h3 className="font-gaegu text-2xl sm:text-3xl font-bold text-[#4A3F35] leading-tight">
          {displayTitle}
        </h3>
        <p className="text-xs sm:text-sm text-[#8B735B] font-medium leading-relaxed">
          {displayDescription}
        </p>
      </div>

      {/* Action Buttons */}
      {(onAction || onSecondaryAction) && (
        <div className="pt-2 flex flex-wrap items-center justify-center gap-3">
          {onAction && actionLabel && (
            <button
              type="button"
              onClick={onAction}
              className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-[#8B735B] to-[#705C47] hover:brightness-110 text-white text-xs font-bold shadow-md transition-all active:scale-95"
            >
              {actionLabel}
            </button>
          )}

          {onSecondaryAction && secondaryActionLabel && (
            <button
              type="button"
              onClick={onSecondaryAction}
              className="px-4 py-2.5 rounded-2xl bg-[#FAF6F0] hover:bg-[#EFE6DC] text-[#4A3F35] text-xs font-bold border border-[#CBAE94]/60 transition-all active:scale-95"
            >
              {secondaryActionLabel}
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
};
