import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface AdminPageHeaderProps {
  icon: LucideIcon;
  /** Small spaced caption above the title, shown as a chip with the icon. */
  eyebrow: string;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Buttons on the right (wrap under the title on phones). */
  actions?: ReactNode;
  className?: string;
}

/** Shared heading card for admin tabs: eyebrow chip, title, subtitle, actions. */
export const AdminPageHeader = ({
  icon: Icon,
  eyebrow,
  title,
  subtitle,
  actions,
  className = '',
}: AdminPageHeaderProps) => (
  <div className={`card-soft p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 ${className}`}>
    <div className="min-w-0 space-y-1.5">
      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[#EFE6DC] text-[#5D5449] text-xs font-mono font-bold uppercase tracking-wider">
        <Icon className="w-3.5 h-3.5 shrink-0" aria-hidden />
        <span>{eyebrow}</span>
      </span>
      <h2 className="font-gaegu text-2xl sm:text-3xl font-bold text-[#4A3F35] leading-tight">{title}</h2>
      {subtitle && <p className="text-sm text-[#5D5449] leading-relaxed max-w-2xl">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
  </div>
);

interface AdminSectionTitleProps {
  icon: LucideIcon;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Controls on the right of the title (wrap under it on phones). */
  actions?: ReactNode;
  className?: string;
}

/** Title row for a card inside an admin tab: icon, title, optional subtitle. */
export const AdminSectionTitle = ({ icon: Icon, title, subtitle, actions, className = '' }: AdminSectionTitleProps) => (
  <div className={`flex flex-col sm:flex-row sm:items-start justify-between gap-3 ${className}`}>
    <div className="flex items-start gap-2.5 min-w-0">
      <Icon className="w-5 h-5 mt-0.5 shrink-0 text-[#8B735B]" aria-hidden />
      <div className="min-w-0">
        <h3 className="font-gaegu text-xl font-bold text-[#4A3F35] leading-snug">{title}</h3>
        {subtitle && <p className="text-sm text-[#5D5449] mt-0.5">{subtitle}</p>}
      </div>
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
  </div>
);
