import { Check } from 'lucide-react';
import { cx } from './cx';

export type StepState = 'done' | 'current' | 'todo';

/** Stepper horizontal (wizard Brief 4 langkah; stepper pekan di Weekly Listing). */
export function Stepper({ steps }: { steps: readonly { label: string; state: StepState; muted?: boolean }[] }) {
  return (
    <ol className="flex items-start">
      {steps.map((s, i) => (
        <li key={s.label} className={cx('relative flex flex-1 flex-col items-center gap-1.5', s.muted && 'opacity-40')}>
          {i < steps.length - 1 && (
            <span aria-hidden="true" className={cx('absolute left-1/2 top-[15px] h-0.5 w-full', s.state === 'done' ? 'bg-navy-900' : 'bg-line')} />
          )}
          <span
            aria-current={s.state === 'current' ? 'step' : undefined}
            className={cx(
              'relative z-10 grid h-[30px] w-[30px] place-items-center rounded-full border-2 text-xs font-bold',
              s.state === 'done' && 'border-navy-900 bg-navy-900 text-white',
              s.state === 'current' && 'border-brand-600 bg-brand-600 text-white',
              s.state === 'todo' && 'border-line bg-white text-faint',
            )}
          >
            {s.state === 'done' ? <Check size={14} /> : i + 1}
          </span>
          <span className={cx('text-[11.5px]', s.state === 'todo' ? 'text-faint' : 'font-medium text-ink')}>{s.label}</span>
        </li>
      ))}
    </ol>
  );
}
