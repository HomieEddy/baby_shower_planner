import type { LucideIcon } from 'lucide-react';

interface GuestPageHeaderProps {
  icon?: LucideIcon;
  /** Custom mark (e.g. the event logo) shown in the tile instead of `icon`. */
  mark?: React.ReactNode;
  title: string;
  /** Small spaced caption above the title. */
  eyebrow?: string;
  subtitle?: string;
  /** Use h2 when the page already owns an h1. */
  as?: 'h1' | 'h2';
  children?: React.ReactNode;
}

/** Shared heading block for guest pages: icon tile, eyebrow, title, subtitle. */
export const GuestPageHeader = ({
  icon: Icon,
  mark,
  title,
  eyebrow,
  subtitle,
  as: Heading = 'h1',
  children,
}: GuestPageHeaderProps) => (
  <div className="text-center space-y-2">
    <div className="w-12 h-12 mx-auto mb-3 rounded-2xl bg-[#EFE6DC] border border-[#CBAE94]/60 flex items-center justify-center">
      {mark ?? (Icon && <Icon className="w-6 h-6 text-[#8B735B]" aria-hidden />)}
    </div>
    {eyebrow && <p className="label-mono">{eyebrow}</p>}
    <Heading className="font-gaegu text-3xl sm:text-4xl font-bold text-[#4A3F35] leading-tight">
      {title}
    </Heading>
    {subtitle && (
      <p className="text-sm text-[#5D5449] leading-relaxed max-w-md mx-auto">{subtitle}</p>
    )}
    {children}
  </div>
);
