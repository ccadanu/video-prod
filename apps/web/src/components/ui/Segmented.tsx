import { cx } from './cx';

interface Props<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: readonly { value: T; label: string }[];
  label: string;
}

/** Tab / filter pil (Semua · Aktif · Perlu Review · Selesai, Locking · Jadwal, ...). */
export function Segmented<T extends string>({ value, onChange, options, label }: Props<T>) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex gap-0.5 rounded-[9px] bg-line p-[3px]">
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          aria-selected={o.value === value}
          onClick={() => onChange(o.value)}
          className={cx(
            'rounded-[7px] px-3.5 py-1.5 text-[13px] transition-colors',
            o.value === value ? 'bg-white font-semibold text-ink shadow-sm' : 'text-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
