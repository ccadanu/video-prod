import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { useId, useRef, useState, type ReactNode } from 'react';
import { Card, cx } from '../ui';

// ───────────── Format ─────────────

const nf = (d: number) => new Intl.NumberFormat('id-ID', { maximumFractionDigits: d, minimumFractionDigits: d });
export const fmtNum = (n: number, digits = 0): string => nf(digits).format(n);
export const fmtPct = (n: number, digits = 0): string => `${nf(digits).format(n)}%`;

// ───────────── Tooltip bersama ─────────────

interface Tip {
  x: number;
  y: number;
  title: string;
  lines: { label: string; value: string; color?: string }[];
}

/** Kotak hover: mengikuti pointer di dalam wadah grafik. Konten yang sama tersedia di tampilan tabel. */
export function useTip() {
  const box = useRef<HTMLDivElement>(null);
  const [tip, setTip] = useState<Tip | null>(null);
  const show = (e: { clientX: number; clientY: number }, title: string, lines: Tip['lines']) => {
    const r = box.current?.getBoundingClientRect();
    if (r) setTip({ x: e.clientX - r.left, y: e.clientY - r.top, title, lines });
  };
  const hide = () => setTip(null);
  const el = tip && (
    <div
      role="tooltip"
      style={{ left: Math.min(tip.x + 12, (box.current?.clientWidth ?? 300) - 150), top: Math.max(0, tip.y - 8) }}
      className="pointer-events-none absolute z-10 min-w-[120px] -translate-y-full rounded-lg border border-line bg-white px-2.5 py-1.5 text-[11.5px] shadow-card"
    >
      <div className="mb-0.5 font-semibold text-ink">{tip.title}</div>
      {tip.lines.map((l) => (
        <div key={l.label} className="flex items-center gap-1.5 text-muted">
          {l.color && <span aria-hidden="true" className="h-2 w-2 rounded-sm" style={{ background: l.color }} />}
          <span>{l.label}</span>
          <b className="ml-auto pl-3 text-ink">{l.value}</b>
        </div>
      ))}
    </div>
  );
  return { box, show, hide, el };
}

// ───────────── Kartu grafik + tampilan tabel ─────────────

export interface TableView {
  head: string[];
  rows: (string | number)[][];
}

/** Setiap grafik punya padanan tabel (aksesibilitas, dan "relief" untuk warna berkontras rendah). */
export function ChartCard({ title, hint, table, className, children }: { title: string; hint?: string; table: TableView; className?: string; children: ReactNode }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <Card className={cx('flex flex-col p-4', className)}>
      <header className="mb-3 flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-[13px] font-bold">{title}</h3>
          {hint && <p className="mt-0.5 text-[11px] text-muted">{hint}</p>}
        </div>
        <button
          type="button"
          aria-pressed={asTable}
          onClick={() => setAsTable((v) => !v)}
          className="rounded-md px-2 py-1 text-[11px] font-semibold text-brand-700 hover:bg-brand-50"
        >
          {asTable ? 'Grafik' : 'Tabel'}
        </button>
      </header>
      {asTable ? (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-line">{table.head.map((h) => <th key={h} scope="col" className="px-2 py-1.5 text-left font-semibold text-muted">{h}</th>)}</tr>
            </thead>
            <tbody>
              {table.rows.map((r, i) => (
                <tr key={i} className="border-b border-line-soft last:border-0">{r.map((c, j) => <td key={j} className="px-2 py-1.5">{c}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        children
      )}
    </Card>
  );
}

// ───────────── Angka & Δ ─────────────

/** Perubahan vs periode lalu. `lowerIsBetter` membalik arti naik/turun. Selalu ikon + angka, bukan hanya warna. */
export function DeltaTag({ pct, lowerIsBetter }: { pct: number | null; lowerIsBetter?: boolean }) {
  if (pct === null) return <span className="text-[11px] text-faint">belum ada pembanding</span>;
  if (Math.abs(pct) < 0.05) return <span className="inline-flex items-center gap-0.5 text-[11px] text-muted"><Minus size={12} /> 0% vs periode lalu</span>;
  const up = pct > 0;
  const good = lowerIsBetter ? !up : up;
  return (
    <span className={cx('inline-flex items-center gap-0.5 text-[11px] font-semibold', good ? 'text-[#15803d]' : 'text-danger')}>
      {up ? <ArrowUp size={12} aria-hidden="true" /> : <ArrowDown size={12} aria-hidden="true" />}
      {fmtNum(Math.abs(pct), 1)}%<span className="sr-only">{up ? ' naik' : ' turun'}</span> <span className="font-normal text-muted">vs periode lalu</span>
    </span>
  );
}

export function StatTile({ label, value, sub, children }: { label: string; value: ReactNode; sub?: ReactNode; children?: ReactNode }) {
  return (
    <Card className="min-w-[180px] flex-1 p-4">
      <div className="text-[11.5px] font-semibold text-muted">{label}</div>
      <div className="mt-1 text-[26px] font-bold leading-none tracking-tight">{value}</div>
      {sub && <div className="mt-2">{sub}</div>}
      {children}
    </Card>
  );
}

// ───────────── Legenda ─────────────

export function Legend({ items }: { items: { label: string; color: string; value?: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[11.5px]">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ background: i.color }} />
          <span className="text-ink">{i.label}</span>
          {i.value && <span className="text-muted">{i.value}</span>}
        </li>
      ))}
    </ul>
  );
}

// ───────────── Donut ─────────────

export interface Slice {
  label: string;
  value: number;
  color: string;
}

export function Donut({ data, center, centerLabel, unit = '' }: { data: Slice[]; center: string; centerLabel: string; unit?: string }) {
  const { box, show, hide, el } = useTip();
  const total = data.reduce((a, d) => a + d.value, 0);
  const R = 52;
  const C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="flex flex-wrap items-center gap-4">
      <div ref={box} className="relative h-[136px] w-[136px] flex-none">
        <svg viewBox="0 0 136 136" role="img" aria-label={`${centerLabel}: ${center}`} className="h-full w-full -rotate-90">
          <circle cx="68" cy="68" r={R} fill="none" stroke="var(--viz-track)" strokeWidth="16" />
          {total > 0 &&
            data.filter((d) => d.value > 0).map((d) => {
              const len = (d.value / total) * C;
              const seg = (
                <circle
                  key={d.label} cx="68" cy="68" r={R} fill="none" stroke={d.color} strokeWidth="16"
                  // jeda 2px antar-irisan agar tidak bergantung pada warna semata
                  strokeDasharray={`${Math.max(0, len - 2)} ${C - Math.max(0, len - 2)}`} strokeDashoffset={-acc}
                  onMouseMove={(e) => show(e, d.label, [{ label: 'Jumlah', value: `${fmtNum(d.value)}${unit}`, color: d.color }, { label: 'Porsi', value: fmtPct((d.value / total) * 100, 1) }])}
                  onMouseLeave={hide}
                />
              );
              acc += len;
              return seg;
            })}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <b className="text-[20px] leading-none">{center}</b>
          <span className="mt-1 text-[10px] text-muted">{centerLabel}</span>
        </div>
        {el}
      </div>
      <Legend items={data.map((d) => ({ label: d.label, color: d.color, value: total ? `${fmtNum(d.value)} · ${fmtPct((d.value / total) * 100)}` : '0' }))} />
    </div>
  );
}

// ───────────── Bar horizontal ─────────────

export function HBar({ data, color = 'var(--viz-1)', unit = '', emphasize }: { data: { label: string; value: number }[]; color?: string; unit?: string; emphasize?: (label: string) => boolean }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  if (data.length === 0) return <p className="py-6 text-center text-xs text-faint">Belum ada data pada periode ini.</p>;
  return (
    <ul className="space-y-2">
      {data.map((d) => (
        <li key={d.label} className="grid grid-cols-[minmax(80px,120px)_1fr_auto] items-center gap-2 text-[12px]">
          <span className={cx('truncate', emphasize?.(d.label) ? 'font-semibold text-ink' : 'text-muted')} title={d.label}>{d.label}</span>
          <div className="h-3 overflow-hidden rounded-[3px] bg-[var(--viz-track)]" role="img" aria-label={`${d.label}: ${d.value}${unit}`}>
            <div className="h-full rounded-r-[4px]" style={{ width: `${(d.value / max) * 100}%`, background: color }} />
          </div>
          <b className="w-8 text-right text-ink">{fmtNum(d.value)}{unit}</b>
        </li>
      ))}
    </ul>
  );
}

/** Bar berpasangan (mis. Videografer vs Editor): kelompok per baris, dua ukuran berdampingan. */
export function GroupedBars({ groups, series }: { groups: { label: string; values: number[] }[]; series: { label: string; color: string }[] }) {
  const max = Math.max(1, ...groups.flatMap((g) => g.values));
  return (
    <div>
      <div className="mb-3"><Legend items={series} /></div>
      <ul className="space-y-3">
        {groups.map((g) => (
          <li key={g.label}>
            <div className="mb-1 text-[12px] font-semibold">{g.label}</div>
            <div className="space-y-1">
              {g.values.map((v, i) => (
                <div key={series[i]!.label} className="grid grid-cols-[1fr_auto] items-center gap-2">
                  <div className="h-3 overflow-hidden rounded-[3px] bg-[var(--viz-track)]" role="img" aria-label={`${g.label}, ${series[i]!.label}: ${v}`}>
                    <div className="h-full rounded-r-[4px]" style={{ width: `${(v / max) * 100}%`, background: series[i]!.color }} />
                  </div>
                  <b className="w-8 text-right text-[12px]">{fmtNum(v)}</b>
                </div>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ───────────── Area bertumpuk ─────────────

export function StackedArea({ buckets, series, label }: { buckets: { key: string; values: number[] }[]; series: { label: string; color: string }[]; label: (key: string) => string }) {
  const { box, show, hide, el } = useTip();
  const gid = useId();
  const W = 520;
  const H = 150;
  const pad = { l: 28, r: 6, t: 8, b: 20 };
  const totals = buckets.map((b) => b.values.reduce((a, v) => a + v, 0));
  const maxRaw = Math.max(1, ...totals);
  const step = maxRaw <= 4 ? 1 : maxRaw <= 10 ? 2 : maxRaw <= 20 ? 5 : 10;
  const max = Math.ceil(maxRaw / step) * step;
  const n = buckets.length;
  const x = (i: number) => pad.l + (n <= 1 ? (W - pad.l - pad.r) / 2 : (i / (n - 1)) * (W - pad.l - pad.r));
  const y = (v: number) => pad.t + (1 - v / max) * (H - pad.t - pad.b);
  // lapisan dari bawah ke atas
  const layers = series.map((_, si) => {
    const lower = buckets.map((b) => b.values.slice(0, si).reduce((a, v) => a + v, 0));
    const upper = buckets.map((b, i) => lower[i]! + b.values[si]!);
    const top = upper.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i)},${y(v)}`).join(' ');
    const bottom = lower.map((v, i) => `L${x(n - 1 - i)},${y(lower[n - 1 - i]!)}`).join(' ');
    return { d: `${top} ${bottom} Z`, top };
  });
  const ticks = Array.from({ length: max / step + 1 }, (_, i) => i * step);
  const every = Math.max(1, Math.ceil(n / 6));
  return (
    <div>
      <div className="mb-2"><Legend items={series} /></div>
      <div ref={box} className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Tren order: ${series.map((s) => s.label).join(' dan ')}`} className="h-auto w-full" onMouseLeave={hide}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--viz-grid)" strokeWidth="1" />
              <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" fontSize="9" fill="var(--color-muted)">{t}</text>
            </g>
          ))}
          {layers.map((l, i) => (
            <g key={series[i]!.label}>
              <path d={l.d} fill={series[i]!.color} fillOpacity="0.85" stroke="var(--color-canvas)" strokeWidth="1.5" />
            </g>
          ))}
          {buckets.map((b, i) => (i % every === 0 || i === n - 1) && (
            <text key={b.key} x={x(i)} y={H - 6} textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'} fontSize="9" fill="var(--color-muted)">{label(b.key)}</text>
          ))}
          {/* area hover: satu kolom per bucket */}
          {buckets.map((b, i) => (
            <rect
              key={`hit-${gid}-${b.key}`} x={x(i) - (W - pad.l - pad.r) / Math.max(1, n - 1) / 2} y={pad.t} width={(W - pad.l - pad.r) / Math.max(1, n - 1)} height={H - pad.t - pad.b} fill="transparent"
              onMouseMove={(e) => show(e, label(b.key), [...series.map((s, si) => ({ label: s.label, value: fmtNum(b.values[si]!), color: s.color })), { label: 'Total', value: fmtNum(totals[i]!) }])}
            />
          ))}
        </svg>
        {el}
      </div>
    </div>
  );
}

// ───────────── Gauge (rating) ─────────────

export function Gauge({ value, target, max = 5 }: { value: number | null; target: number; max?: number }) {
  const R = 54;
  const arc = (frac: number) => {
    const a = Math.PI * (1 - frac);
    return `${70 + R * Math.cos(a)},${70 - R * Math.sin(a)}`;
  };
  const path = (from: number, to: number) => `M${arc(from)} A${R},${R} 0 0 1 ${arc(to)}`;
  const reached = value !== null && value >= target;
  const tx = (r: number) => `${70 + r * Math.cos(Math.PI * (1 - target / max))},${70 - r * Math.sin(Math.PI * (1 - target / max))}`;
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 140 84" role="img" aria-label={value === null ? 'Belum ada rating' : `Skor ${fmtNum(value, 2)} dari ${max}, target ${target}`} className="h-[84px] w-[140px] flex-none">
        <path d={path(0, 1)} fill="none" stroke="var(--viz-track)" strokeWidth="13" strokeLinecap="round" />
        {value !== null && value > 0 && <path d={path(0, Math.min(1, value / max))} fill="none" stroke={reached ? 'var(--viz-1)' : 'var(--viz-2)'} strokeWidth="13" strokeLinecap="round" />}
        <line x1={tx(44).split(',')[0]} y1={tx(44).split(',')[1]} x2={tx(66).split(',')[0]} y2={tx(66).split(',')[1]} stroke="var(--color-ink)" strokeWidth="2" />
        <text x="70" y="66" textAnchor="middle" fontSize="22" fontWeight="700" fill="var(--color-ink)">{value === null ? '—' : fmtNum(value, 2)}</text>
        <text x="70" y="80" textAnchor="middle" fontSize="9" fill="var(--color-muted)">dari {max}</text>
      </svg>
      <div className="text-[11.5px] text-muted">
        <div>Target <b className="text-ink">{fmtNum(target, 1)}</b></div>
        {value !== null && <div className={cx('mt-1 font-semibold', reached ? 'text-[#15803d]' : 'text-orange-800')}>{reached ? '✓ Target tercapai' : '▲ Di bawah target'}</div>}
      </div>
    </div>
  );
}

// ───────────── Heatmap (sekuensial satu hue) ─────────────

const SEQ = ['var(--viz-seq-100)', 'var(--viz-seq-250)', 'var(--viz-seq-400)', 'var(--viz-seq-550)', 'var(--viz-seq-700)'];

export function Heatmap({ rows, cols, cells }: { rows: string[]; cols: string[]; cells: number[][] }) {
  const { box, show, hide, el } = useTip();
  const max = Math.max(1, ...cells.flat());
  const shade = (v: number) => SEQ[Math.min(SEQ.length - 1, Math.ceil((v / max) * SEQ.length) - 1)]!;
  return (
    <div ref={box} className="relative overflow-x-auto">
      <table className="w-full border-separate border-spacing-[2px] text-[11px]">
        <thead>
          <tr>
            <th />
            {cols.map((c) => <th key={c} scope="col" className="px-1 pb-1 text-center font-semibold text-muted">{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={r}>
              <th scope="row" className="whitespace-nowrap pr-2 text-right font-medium text-muted">{r}</th>
              {cols.map((c, ci) => {
                const v = cells[ri]![ci]!;
                return (
                  <td
                    key={c} tabIndex={v ? 0 : -1} aria-label={`${r}, ${c}: ${v}`}
                    onMouseMove={(e) => show(e, `${r} · ${c}`, [{ label: 'Konten', value: String(v) }])} onMouseLeave={hide}
                    className="h-6 min-w-[34px] rounded-[3px] text-center align-middle font-semibold"
                    style={v === 0 ? { background: 'var(--color-line-soft)', color: 'var(--color-faint)' } : { background: shade(v), color: v / max > 0.4 ? '#fff' : 'var(--color-ink)' }}
                  >
                    {v === 0 ? '·' : v}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      {el}
    </div>
  );
}

// ───────────── Funnel (ordinal, satu hue) ─────────────

const ORD = ['#86b6ef', '#5598e7', '#2a78d6', '#1c5cab', '#104281'];

export function Funnel({ stages }: { stages: { label: string; count: number }[] }) {
  const top = Math.max(1, stages[0]?.count ?? 1);
  return (
    <ol className="space-y-2">
      {stages.map((s, i) => {
        const prev = i === 0 ? null : stages[i - 1]!.count;
        return (
          <li key={s.label} className="grid grid-cols-[120px_1fr] items-center gap-2 text-[12px]">
            <span className="text-muted">{s.label}</span>
            <div className="flex items-center gap-2">
              <div className="h-5 rounded-r-[4px]" style={{ width: `${Math.max(2, (s.count / top) * 100)}%`, background: ORD[i % ORD.length] }} role="img" aria-label={`${s.label}: ${s.count}`} />
              <b className="whitespace-nowrap">{fmtNum(s.count)}</b>
              {prev !== null && prev > 0 && <span className="whitespace-nowrap text-[10.5px] text-faint">{fmtPct((s.count / prev) * 100)} dari tahap sebelumnya</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
