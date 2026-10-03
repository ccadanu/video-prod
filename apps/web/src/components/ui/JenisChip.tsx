import { JENIS_META, type Jenis } from '@ccp/shared';
import { cx } from './cx';

const TONE: Record<Jenis, string> = {
  shooting_only: 'bg-orange-100 text-orange-800',
  shooting_edit: 'bg-brand-50 text-brand-700',
  photoshoot: 'bg-[#eee7fc] text-[#6d45e0]',
  full_ai: 'bg-[#e5f5ea] text-[#15803d]',
  editing_only: 'bg-[#e5f5ea] text-[#15803d]',
  motion: 'bg-[#f0eafb] text-[#6d45e0]',
};

export function JenisChip({ jenis, className }: { jenis: Jenis; className?: string }) {
  return <span className={cx('inline-block rounded-md px-1.5 py-0.5 text-[10.5px] font-semibold', TONE[jenis], className)}>{JENIS_META[jenis].label}</span>;
}
