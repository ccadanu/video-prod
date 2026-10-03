import type { ButtonHTMLAttributes } from 'react';
import { cx } from './cx';

type Variant = 'primary' | 'accent' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white shadow-card hover:bg-brand-700',
  // Satu tombol sorotan per layar (mis. gate "Ready to Execute"). Teks navy agar kontras.
  accent: 'bg-orange-500 text-navy-950 shadow-card hover:bg-yellow-500',
  ghost: 'bg-line-soft text-ink hover:bg-line',
  danger: 'bg-[#fbeae7] text-danger hover:bg-[#f6d9d4]',
};
const SIZE: Record<Size, string> = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2.5 text-[13px]' };

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  full?: boolean;
}

export function Button({ variant = 'primary', size = 'md', full, className, type = 'button', ...rest }: Props) {
  return (
    <button
      type={type}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-[9px] font-semibold transition-colors',
        'disabled:cursor-not-allowed disabled:bg-line disabled:text-faint disabled:shadow-none',
        VARIANT[variant],
        SIZE[size],
        full && 'w-full',
        className,
      )}
      {...rest}
    />
  );
}
