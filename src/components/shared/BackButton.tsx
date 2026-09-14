import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useT } from './i18n';

interface BackButtonProps {
  to?: string;
  label?: string;
  variant?: 'text' | 'outline';
  className?: string;
}

/** Shared back affordance used across guest and admin pages. */
export const BackButton = ({
  to = '/',
  label,
  variant = 'text',
  className = '',
}: BackButtonProps) => {
  const t = useT();
  const base =
    variant === 'outline'
      ? 'btn-outline-accent px-5 py-2.5 text-xs font-bold gap-1.5'
      : 'text-xs font-bold font-mono text-[#8B735B] hover:text-[#D4A373] gap-1';
  return (
    <Link to={to} className={`inline-flex items-center transition-colors ${base} ${className}`}>
      <ArrowLeft className="w-3.5 h-3.5" />
      {label ?? t.backBtn}
    </Link>
  );
};
