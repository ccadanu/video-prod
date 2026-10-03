import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addDays, mondaysOfMonth } from '@ccp/shared';
import { fmtYmd } from '../../lib/format';
import { Select } from '../ui';

const MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];

/** Pemilih Tahun → Bulan → Pekan (Pekan 1–5 ditentukan oleh hari Senin, PRD §6.1). */
export function WeekPicker({ week, onChange }: { week: string; onChange: (week: string) => void }) {
  const [y, m] = week.split('-').map(Number) as [number, number];
  const mondays = mondaysOfMonth(y, m);
  const years = [y - 1, y, y + 1];
  const first = (year: number, month: number) => mondaysOfMonth(year, month)[0]!;

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Pilih pekan">
      <button aria-label="Pekan sebelumnya" onClick={() => onChange(addDays(week, -7))} className="rounded-md p-1.5 text-muted hover:bg-line-soft hover:text-ink">
        <ChevronLeft size={16} />
      </button>
      <label className="sr-only" htmlFor="wk-year">Tahun</label>
      <Select id="wk-year" className="!w-auto !py-1.5 !text-[13px]" value={y} onChange={(e) => onChange(first(Number(e.target.value), m))}>
        {years.map((v) => <option key={v}>{v}</option>)}
      </Select>
      <label className="sr-only" htmlFor="wk-month">Bulan</label>
      <Select id="wk-month" className="!w-auto !py-1.5 !text-[13px]" value={m} onChange={(e) => onChange(first(y, Number(e.target.value)))}>
        {MONTHS.map((name, i) => <option key={name} value={i + 1}>{name}</option>)}
      </Select>
      <label className="sr-only" htmlFor="wk-week">Pekan</label>
      <Select id="wk-week" className="!w-auto !py-1.5 !text-[13px]" value={week} onChange={(e) => onChange(e.target.value)}>
        {mondays.map((d, i) => <option key={d} value={d}>Pekan {i + 1} · {fmtYmd(d)}</option>)}
      </Select>
      <button aria-label="Pekan berikutnya" onClick={() => onChange(addDays(week, 7))} className="rounded-md p-1.5 text-muted hover:bg-line-soft hover:text-ink">
        <ChevronRight size={16} />
      </button>
    </div>
  );
}
