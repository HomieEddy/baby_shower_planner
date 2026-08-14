import { ReactNode, InputHTMLAttributes, SelectHTMLAttributes } from 'react';
import { Search } from 'lucide-react';

// Small, theme-consistent form primitives. Two visual variants:
//   solid — bold 2px border (settings / guest edit forms)
//   soft  — thin border, compact (tracker / check-in forms)

const SOLID =
  'w-full px-3.5 py-2.5 rounded-2xl border-2 border-[#CBAE94] text-sm font-bold focus:outline-none focus:ring-2 focus:ring-[#8B735B] bg-white text-[#5D5449]';
const SOFT =
  'w-full px-3.5 py-2 rounded-xl border border-[#CBAE94] text-xs font-bold focus:outline-none focus:ring-2 focus:ring-[#8B735B] bg-white text-[#4A3F35]';

type Variant = 'solid' | 'soft';

const variantClass = (variant: Variant) => (variant === 'solid' ? SOLID : SOFT);

interface FieldProps {
  label: ReactNode;
  children: ReactNode;
  className?: string;
}

export const Field = ({ label, children, className = '' }: FieldProps) => (
  <div className={className}>
    <label className="label-mono block text-xs font-bold mb-1">{label}</label>
    {children}
  </div>
);

interface TextInputProps extends InputHTMLAttributes<HTMLInputElement> {
  variant?: Variant;
}

export const TextInput = ({ variant = 'solid', className = '', ...props }: TextInputProps) => (
  <input {...props} className={`${variantClass(variant)} ${className}`} />
);

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  variant?: Variant;
}

export const Select = ({ variant = 'solid', className = '', ...props }: SelectProps) => (
  <select {...props} className={`${variantClass(variant)} ${className}`} />
);

// Search input with an embedded magnifier icon.
//   sm — compact pill (toolbars); lg — full-width box (check-in)
interface SearchInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> {
  variant?: 'sm' | 'lg';
  className?: string;
}

export const SearchInput = ({ variant = 'sm', className = '', ...props }: SearchInputProps) => (
  <div className="relative">
    <Search
      className={
        variant === 'lg'
          ? 'w-4 h-4 text-[#A09080] absolute left-3 top-1/2 -translate-y-1/2'
          : 'w-3.5 h-3.5 text-[#CBAE94] absolute left-3 top-2.5'
      }
    />
    <input
      type="text"
      {...props}
      className={
        variant === 'lg'
          ? `w-full pl-10 pr-4 py-3 rounded-2xl border-2 border-[#CBAE94] bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#8B735B] ${className}`
          : `pl-8 pr-3 py-1.5 rounded-full border border-[#CBAE94] text-xs font-bold text-[#4A3F35] bg-white focus:outline-none focus:ring-2 focus:ring-[#8B735B] ${className}`
      }
    />
  </div>
);
