import { ButtonHTMLAttributes } from 'react';

type IconButtonVariant = 'plain' | 'outline' | 'danger' | 'amber';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible name + tooltip. */
  label: string;
  variant?: IconButtonVariant;
}

const VARIANTS: Record<IconButtonVariant, string> = {
  plain: 'text-[#5D5449] hover:bg-[#EFE6DC]',
  outline: 'border border-[#CBAE94] text-[#8B735B] hover:bg-[#EFE6DC]',
  danger: 'border border-rose-300 text-rose-600 hover:bg-rose-100',
  amber: 'border border-amber-300 text-amber-700 hover:bg-amber-100',
};

// Icon-only button: always a 44px touch target with an accessible name.
export const IconButton = ({ label, variant = 'outline', className = '', ...props }: IconButtonProps) => (
  <button
    type="button"
    aria-label={label}
    title={label}
    className={`inline-flex min-w-[44px] min-h-[44px] items-center justify-center rounded-xl transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-[#8B735B] disabled:opacity-40 disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
    {...props}
  />
);
