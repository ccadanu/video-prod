import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { cx } from './cx';

interface FieldProps {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string | undefined;
  children: (id: string) => ReactNode;
}

export function Field({ label, required, hint, error, children }: FieldProps) {
  const id = useId();
  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1.5 block text-[12.5px] font-semibold">
        {label}
        {required && <span className="ml-0.5 text-danger" aria-hidden="true">*</span>}
      </label>
      {children(id)}
      {error ? (
        <p role="alert" className="mt-1 text-[11px] text-danger">{error}</p>
      ) : hint ? (
        <p className="mt-1 text-[11px] text-faint">{hint}</p>
      ) : null}
    </div>
  );
}

const CONTROL =
  'w-full rounded-[9px] border border-line bg-white px-3 py-2.5 text-[13.5px] text-ink placeholder:text-faint ' +
  'focus:border-brand-500 focus:outline-none read-only:bg-canvas read-only:text-muted';

export const Input = ({ className, ...p }: InputHTMLAttributes<HTMLInputElement>) => <input className={cx(CONTROL, className)} {...p} />;
export const Select = ({ className, ...p }: SelectHTMLAttributes<HTMLSelectElement>) => <select className={cx(CONTROL, className)} {...p} />;
export const Textarea = ({ className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement>) => (
  <textarea className={cx(CONTROL, 'min-h-14 resize-y', className)} {...p} />
);
