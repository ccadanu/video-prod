import { useState } from 'react';
import { JENIS_META, PERIODS, PERIOD_META, STATUS_META, type DashboardDto, type Jenis, type Period } from '@ccp/shared';
import { ChartCard, DeltaTag, Donut, Funnel, Gauge, GroupedBars, HBar, Heatmap, StackedArea, StatTile, fmtNum, fmtPct } from '../components/charts';
import { PageHeader } from '../components/layout/PageHeader';
import { Segmented } from '../components/ui';
import { ApiError } from '../lib/api';
import { useDashboard } from '../lib/statsApi';
import { fmtYmd } from '../lib/format';

/** Urutan warna tetap per jenis pengerjaan (palet kategorikal tervalidasi). */
export const JENIS_COLOR: Record<Jenis, string> = {
  shooting_edit: 'var(--viz-1)',
  shooting_only: 'var(--viz-2)',
  photoshoot: 'var(--viz-3)',
  full_ai: 'var(--viz-4)',
  editing_only: 'var(--viz-5)',
  motion: 'var(--viz-6)',
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
export const bucketLabel = (g: DashboardDto['trend']['granularity']) => (key: string) =>
  g === 'month' ? `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(2, 4)}` : fmtYmd(key);

export const PERIOD_OPTIONS = PERIODS.map((p) => ({ value: p, label: PERIOD_META[p].label }));
const errText = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Terjadi kesalahan');

export function Dashboard() {
  const [period, setPeriod] = useState<Period>('1m');
  const q = useDashboard(period);
  const d = q.data;

  return (
    <>
      <PageHeader
        title="Dashboard Statistik"
        subtitle="Performa video production tingkat tim (agregat). Bukan penilaian individu."
        actions={<Segmented label="Periode" value={period} onChange={setPeriod} options={PERIOD_OPTIONS} />}
      />
      <div className="px-7 pb-10">
        {q.isLoading && <p className="py-10 text-center text-[13px] text-faint">Memuat statistik…</p>}
        {q.isError && <p role="alert" className="py-10 text-center text-[13px] text-danger">{errText(q.error)}</p>}
        {d && <Body d={d} />}
      </div>
    </>
  );
}

function Body({ d }: { d: DashboardDto }) {
  const label = bucketLabel(d.trend.granularity);
  const slaTotal = d.sla.syuting.total + d.sla.editing.total;
  const slaTepat = d.sla.syuting.tepat + d.sla.editing.tepat;
  const revOver = d.revisi.rate !== null && d.revisi.rate > d.revisi.threshold;
  const revPct = d.revisi.rate !== null && d.revisi.prevRate !== null && d.revisi.prevRate > 0 ? ((d.revisi.rate - d.revisi.prevRate) / d.revisi.prevRate) * 100 : null;
  const slaDelta = d.sla.pct !== null && d.sla.prevPct !== null ? d.sla.pct - d.sla.prevPct : null;

  return (
    <>
      <p className="mb-3 text-[11.5px] text-muted">
        {fmtYmd(d.range.from)} s.d. {fmtYmd(d.range.to)} · semua perubahan (Δ) dibandingkan dengan {PERIOD_META[d.period].label.toLowerCase()} sebelumnya ({fmtYmd(d.prevRange.from)} s.d. {fmtYmd(d.prevRange.to)}).
      </p>

      <div className="mb-3 flex flex-wrap gap-3">
        <StatTile label="Total Konten Video Selesai" value={fmtNum(d.selesai.value)} sub={<DeltaTag pct={d.selesai.pct} />} />
        <StatTile
          label="Rata-rata Order Video"
          value={fmtNum(d.volume.total.value)}
          sub={<DeltaTag pct={d.volume.total.pct} />}
        >
          <p className="mt-2 text-[11px] text-muted">
            Weekly <b className="text-ink">{fmtNum(d.volume.weeklyPerWeek, 1)}</b> / pekan · Daily <b className="text-ink">{fmtNum(d.volume.dailyPerWorkday, 1)}</b> / hari kerja
          </p>
        </StatTile>
        <StatTile
          label="Revision Rate"
          value={d.revisi.rate === null ? '—' : fmtPct(d.revisi.rate * 100, 1)}
          sub={<DeltaTag pct={revPct} lowerIsBetter />}
        >
          <p className={revOver ? 'mt-2 text-[11px] font-semibold text-danger' : 'mt-2 text-[11px] text-muted'}>
            {revOver ? '▲ Di atas ambang' : d.revisi.rate === null ? 'Belum ada konten selesai' : '✓ Dalam ambang'} ≤ {fmtPct(d.revisi.threshold * 100)} · {d.revisi.count} dari {d.revisi.total} konten
          </p>
        </StatTile>
      </div>

      <div className="mb-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <ChartCard
          title="Skor Kepuasan User"
          hint="Rata-rata rating blind review (siklus yang sudah ditutup)"
          table={{ head: ['Ukuran', 'Nilai'], rows: [['Rata-rata (x/5)', d.kepuasan.avg === null ? '—' : fmtNum(d.kepuasan.avg, 2)], ['Jumlah rating', d.kepuasan.n], ['Target', fmtNum(d.kepuasan.target, 1)], ['Periode lalu', d.kepuasan.prevAvg === null ? '—' : fmtNum(d.kepuasan.prevAvg, 2)]] }}
        >
          <Gauge value={d.kepuasan.avg} target={d.kepuasan.target} />
          <p className="mt-3 text-[11px] text-muted">
            {d.kepuasan.n > 0 ? `${d.kepuasan.n} rating` : 'Belum ada rating pada periode ini. Rating masuk setelah siklus evaluasi ditutup.'}
            {d.kepuasan.prevAvg !== null && d.kepuasan.avg !== null && ` · periode lalu ${fmtNum(d.kepuasan.prevAvg, 2)}`}
          </p>
        </ChartCard>

        <ChartCard
          title="Kesesuaian SLA"
          hint="On-time syuting (footage diserahkan di hari syuting) dan editing (hasil dikirim sebelum tenggat)"
          table={{ head: ['Tahap', 'Tepat waktu', 'Total'], rows: [['Syuting', d.sla.syuting.tepat, d.sla.syuting.total], ['Editing', d.sla.editing.tepat, d.sla.editing.total]] }}
        >
          <Donut
            data={[{ label: 'Tepat waktu', value: slaTepat, color: 'var(--viz-1)' }, { label: 'Terlambat', value: slaTotal - slaTepat, color: 'var(--viz-2)' }]}
            center={d.sla.pct === null ? '—' : fmtPct(d.sla.pct)}
            centerLabel="tepat waktu"
          />
          <p className="mt-3 text-[11px] text-muted">
            Syuting <b className="text-ink">{d.sla.syuting.tepat}/{d.sla.syuting.total}</b> · Editing <b className="text-ink">{d.sla.editing.tepat}/{d.sla.editing.total}</b>
            {slaDelta !== null && ` · ${slaDelta >= 0 ? '+' : ''}${fmtNum(slaDelta, 1)} poin vs periode lalu`}
          </p>
        </ChartCard>

        <ChartCard
          title="Adopsi Jalur Produksi"
          hint="Komposisi jenis pengerjaan pada order masuk"
          table={{ head: ['Jenis pengerjaan', 'Order'], rows: d.jalur.map((j) => [JENIS_META[j.jenis].label, j.count]) }}
        >
          <Donut
            data={d.jalur.map((j) => ({ label: JENIS_META[j.jenis].label, value: j.count, color: JENIS_COLOR[j.jenis] }))}
            center={fmtNum(d.volume.total.value)}
            centerLabel="order"
          />
        </ChartCard>
      </div>

      <div className="mb-3 grid gap-3 lg:grid-cols-3">
        <ChartCard
          title="Tren Order"
          hint={`Order masuk per ${d.trend.granularity === 'day' ? 'hari' : d.trend.granularity === 'week' ? 'pekan' : 'bulan'}, Weekly vs Daily`}
          className="lg:col-span-2"
          table={{ head: ['Periode', 'Weekly', 'Daily'], rows: d.trend.buckets.map((b) => [label(b.key), b.weekly, b.daily]) }}
        >
          <StackedArea
            buckets={d.trend.buckets.map((b) => ({ key: b.key, values: [b.weekly, b.daily] }))}
            series={[{ label: 'Weekly (perlu syuting)', color: 'var(--viz-1)' }, { label: 'Daily (tanpa syuting)', color: 'var(--viz-2)' }]}
            label={label}
          />
        </ChartCard>
        <ChartCard title="Distribusi per User" hint="Order per pemohon (8 teratas)" table={{ head: ['Pemohon', 'Order'], rows: d.users.map((u) => [u.label, u.count]) }}>
          <HBar data={d.users.map((u) => ({ label: u.label, value: u.count }))} emphasize={(l) => d.users.find((u) => u.label === l)?.self === true} />
        </ChartCard>
      </div>

      <div className="mb-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <ChartCard
          title="Beban per Peran"
          hint="Videografer vs Editor pada periode ini"
          table={{ head: ['Peran', 'Konten selesai diproses', 'Sedang dikerjakan'], rows: [['Videografer', d.peran.videografer.selesai, d.peran.videografer.aktif], ['Editor', d.peran.editor.selesai, d.peran.editor.aktif]] }}
        >
          <GroupedBars
            series={[{ label: 'Selesai diproses', color: 'var(--viz-1)' }, { label: 'Sedang dikerjakan', color: 'var(--viz-2)' }]}
            groups={[{ label: 'Videografer', values: [d.peran.videografer.selesai, d.peran.videografer.aktif] }, { label: 'Video Editor', values: [d.peran.editor.selesai, d.peran.editor.aktif] }]}
          />
        </ChartCard>
        <ChartCard title="Top Kategori" hint="Kategori konten terbanyak" table={{ head: ['Kategori', 'Order'], rows: d.kategori.map((k) => [k.name, k.count]) }}>
          <HBar data={d.kategori.map((k) => ({ label: k.name, value: k.count }))} color="var(--viz-3)" />
        </ChartCard>
        <ChartCard title="Funnel Status" hint="Order periode ini yang mencapai tiap tahap (status saat ini)" table={{ head: ['Tahap', 'Konten'], rows: d.funnel.map((f) => [f.label, f.count]) }}>
          <Funnel stages={d.funnel} />
        </ChartCard>
      </div>

      <ChartCard
        title="Heatmap Bottleneck"
        hint="Konten yang sedang berjalan: status × jenis pengerjaan (semua periode). Sel gelap = antrean menumpuk"
        table={{ head: ['Status', ...d.heatmap.jenis.map((j) => JENIS_META[j].label)], rows: d.heatmap.statuses.map((s, i) => [STATUS_META[s].label, ...d.heatmap.cells[i]!]) }}
      >
        <Heatmap rows={d.heatmap.statuses.map((s) => STATUS_META[s].label)} cols={d.heatmap.jenis.map((j) => JENIS_META[j].label)} cells={d.heatmap.cells} />
      </ChartCard>
    </>
  );
}
