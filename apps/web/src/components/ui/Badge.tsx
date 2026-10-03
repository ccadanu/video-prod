import type { ReactNode } from 'react';
import { STATUS_META, type Status, type Tone } from '@ccp/shared';
import { cx } from './cx';

const TONE: Record<Tone | 'neutral', string> = {
  slate: 'bg-line-soft text-muted',
  sky: 'bg-[#e1f4fb] text-[#0b6f8f]',
  amber: 'bg-orange-100 text-orange-800',
  violet: 'bg-[#eee7fc] text-[#6d45e0]',
  coral: 'bg-[#fdeae5] text-[#b5472b]',
  green: 'bg-[#e5f5ea] text-[#15803d]',
  red: 'bg-[#fbe4e1] text-[#b03a2e]',
  blue: 'bg-brand-50 text-brand-700',
  neutral: 'bg-line-soft text-muted',
};

export function Badge({ tone = 'neutral', children, className }: { tone?: Tone | 'neutral'; children: ReactNode; className?: string }) {
  return <span className={cx('inline-block rounded-full px-2.5 py-0.5 text-[10.5px] font-semibold', TONE[tone], className)}>{children}</span>;
}

export function StatusPill({ status }: { status: Status }) {
  const meta = STATUS_META[status];
  return <Badge tone={meta.tone}>{meta.label}</Badge>;
}
