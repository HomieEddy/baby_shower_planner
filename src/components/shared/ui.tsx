import { ReactNode, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

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

interface TextAreaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  variant?: Variant;
}

export const TextArea = ({ variant = 'solid', className = '', ...props }: TextAreaProps) => (
  <textarea {...props} className={`${variantClass(variant)} ${className}`} />
);

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  variant?: Variant;
}

export const Select = ({ variant = 'solid', className = '', ...props }: SelectProps) => (
  <select {...props} className={`${variantClass(variant)} ${className}`} />
);
