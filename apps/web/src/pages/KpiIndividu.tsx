import { useState } from 'react';
import { Link } from 'react-router-dom';
import { KPI_WEIGHTS, PERIOD_META, ROLE_LABEL, type KpiDto, type Period, type RoleKpi, type Scorecard } from '@ccp/shared';
import { ChartCard, DeltaTag, StatTile, fmtNum, fmtPct } from '../components/charts';
import { PageHeader } from '../components/layout/PageHeader';
import { Card, Empty, Segmented, cx } from '../components/ui';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtYmd } from '../lib/format';
import { useCycles, useKpi } from '../lib/statsApi';
import { PERIOD_OPTIONS } from './Dashboard';

type Tab = 'ringkasan' | 'peran' | 'individu' | 'evaluasi';
const errText = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Terjadi kesalahan');

/** Skor 0–100 → label (usulan): ≥80 sesuai target, 60–79 perlu perhatian, <60 untuk coaching. */
export function scoreBand(score: number | null): { label: string; tone: string } {
  if (score === null) return { label: 'Belum ada data', tone: 'text-muted' };
  if (score >= 80) return { label: '✓ Sesuai target', tone: 'text-[#15803d]' };
  if (score >= 60) return { label: '▲ Perlu perhatian', tone: 'text-orange-800' };
  return { label: '▼ Perlu coaching', tone: 'text-danger' };
}

function ScoreBar({ label, weight, value, detail }: { label: string; weight: number; value: number | null; detail: string }) {
  return (
    <div className="grid grid-cols-[110px_1fr_auto] items-center gap-2 text-[12px]">
      <span className="text-muted">{label} <span className="text-faint">({fmtPct(weight * 100)})</span></span>
      <div className="h-2.5 overflow-hidden rounded-[3px] bg-[var(--viz-track)]" role="img" aria-label={`${label}: ${value === null ? 'belum ada data' : fmtNum(value, 0)}`}>
        {value !== null && <div className="h-full rounded-r-[4px] bg-[var(--viz-1)]" style={{ width: `${Math.min(100, value)}%` }} />}
      </div>
      <span className="w-28 text-right text-[11.5px] text-ink">{detail}</span>
    </div>
  );
}

function Person({ c }: { c: Scorecard }) {
  const band = scoreBand(c.score);
  return (
    <Card className="p-4">
      <header className="mb-3 flex items-start gap-3">
        <div aria-hidden="true" className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-brand-50 text-[13px] font-bold text-brand-700">{c.name[0]}</div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[14px] font-bold">{c.name}</h3>
          <p className="text-[11px] text-muted">{c.role === 'videografer' ? 'Videografer' : 'Video Editor'} · {c.contents} konten diproses</p>
        </div>
        <div className="text-right">
          <div className="text-[24px] font-bold leading-none">{c.score === null ? '—' : fmtNum(c.score, 0)}</div>
          <div className={cx('mt-1 text-[10.5px] font-semibold', band.tone)}>{band.label}</div>
        </div>
      </header>
      <div className="space-y-2">
        <ScoreBar label="Kepuasan User" weight={KPI_WEIGHTS.us} value={c.parts.us} detail={c.us ? `${fmtNum(c.us.avg, 2)}/5 · ${c.us.n} rating` : 'belum ada rating'} />
        <ScoreBar label="SLA" weight={KPI_WEIGHTS.sla} value={c.parts.sla} detail={c.sla ? `${c.sla.tepat}/${c.sla.total} tepat waktu` : 'belum ada data'} />
        <ScoreBar label="Revisi" weight={KPI_WEIGHTS.revisi} value={c.parts.revisi} detail={c.revisi ? `${c.revisi.count}/${c.revisi.total} direvisi` : 'belum ada data'} />
      </div>
    </Card>
  );
}

function RoleCard({ title, r }: { title: string; r: RoleKpi }) {
  const band = scoreBand(r.score);
  return (
    <ChartCard
      title={title}
      hint={`${r.people} orang · ${r.contents} konten diproses`}
      table={{ head: ['Ukuran', 'Nilai'], rows: [['Skor KPI', r.score === null ? '—' : fmtNum(r.score, 0)], ['Rata-rata rating', r.usAvg === null ? '—' : fmtNum(r.usAvg, 2)], ['Tepat waktu', r.slaPct === null ? '—' : fmtPct(r.slaPct)], ['Revision rate', r.revisiRate === null ? '—' : fmtPct(r.revisiRate)]] }}
    >
      <div className="mb-3 flex items-baseline gap-2"><b className="text-[28px] leading-none">{r.score === null ? '—' : fmtNum(r.score, 0)}</b><span className={cx('text-[11px] font-semibold', band.tone)}>{band.label}</span></div>
      <dl className="grid grid-cols-3 gap-2 text-[12px]">
        <div><dt className="text-muted">Kepuasan</dt><dd className="font-bold">{r.usAvg === null ? '—' : `${fmtNum(r.usAvg, 2)}/5`}</dd></div>
        <div><dt className="text-muted">Tepat waktu</dt><dd className="font-bold">{r.slaPct === null ? '—' : fmtPct(r.slaPct)}</dd></div>
        <div><dt className="text-muted">Revision rate</dt><dd className="font-bold">{r.revisiRate === null ? '—' : fmtPct(r.revisiRate)}</dd></div>
      </dl>
    </ChartCard>
  );
}

export function KpiIndividu() {
  const { user } = useAuth();
  const isLead = user?.role === 'leader' || user?.role === 'admin';
  const [tab, setTab] = useState<Tab>('ringkasan');
  const [period, setPeriod] = useState<Period>('1m');
  const q = useKpi(period);
  const cycles = useCycles();
  const k = q.data;

  const tabs: { value: Tab; label: string }[] = [
    { value: 'ringkasan', label: 'Ringkasan' },
    { value: 'peran', label: 'Per Peran' },
    { value: 'individu', label: isLead ? 'Per Individu' : 'Scorecard Saya' },
    { value: 'evaluasi', label: 'Evaluasi' },
  ];
  const teamBand = scoreBand(k?.team.score ?? null);
  const scorePct = k?.team.score !== null && k?.team.prevScore !== null && k?.team.prevScore ? ((k!.team.score! - k!.team.prevScore!) / k!.team.prevScore!) * 100 : null;
  const closed = (cycles.data ?? []).filter((c) => c.status === 'closed');

  return (
    <>
      <PageHeader
        title="KPI Individu"
        subtitle={isLead ? 'Performa per peran dan per individu untuk coaching, bukan untuk mencari kesalahan.' : 'Scorecard Anda. Hanya Anda dan Leader yang melihatnya.'}
        actions={<Segmented label="Periode" value={period} onChange={setPeriod} options={PERIOD_OPTIONS} />}
      />
      <div className="px-7 pb-10">
        <div className="mb-4"><Segmented label="Bagian KPI" value={tab} onChange={setTab} options={tabs} /></div>
        {q.isLoading && <p className="py-10 text-center text-[13px] text-faint">Memuat KPI…</p>}
        {q.isError && <p role="alert" className="py-10 text-center text-[13px] text-danger">{errText(q.error)}</p>}

        {k && tab === 'ringkasan' && (
          <>
            <p className="mb-3 text-[11.5px] text-muted">
              {fmtYmd(k.range.from)} s.d. {fmtYmd(k.range.to)} ({PERIOD_META[k.period].label}). Bobot KPI: Kepuasan User {fmtPct(k.weights.us * 100)} · SLA {fmtPct(k.weights.sla * 100)} · Revisi {fmtPct(k.weights.revisi * 100)}. Target rating {fmtNum(k.target, 1)}.
            </p>
            <div className="mb-3 flex flex-wrap gap-3">
              <StatTile label="Skor KPI tim (0–100)" value={k.team.score === null ? '—' : fmtNum(k.team.score, 0)} sub={<DeltaTag pct={scorePct} />}>
                <p className={cx('mt-2 text-[11px] font-semibold', teamBand.tone)}>{teamBand.label}</p>
              </StatTile>
              <StatTile label="Rata-rata kepuasan" value={k.team.usAvg === null ? '—' : `${fmtNum(k.team.usAvg, 2)}/5`} sub={<span className="text-[11px] text-muted">target {fmtNum(k.target, 1)}</span>} />
              <StatTile label="Kesesuaian SLA" value={k.team.slaPct === null ? '—' : fmtPct(k.team.slaPct)} />
              <StatTile label="Revision rate" value={k.team.revisiRate === null ? '—' : fmtPct(k.team.revisiRate, 1)} sub={<span className="text-[11px] text-muted">ambang ≤ {fmtPct(k.threshold * 100)}</span>} />
            </div>
            <p className="text-[11.5px] text-muted">Skor dihitung dari komponen yang punya data; bobot komponen yang kosong dinormalkan ulang. Rating baru dihitung setelah siklus evaluasinya ditutup.</p>
          </>
        )}

        {k && tab === 'peran' && (
          <div className="grid gap-3 md:grid-cols-2">
            <RoleCard title="Videografer" r={k.byRole.videografer} />
            <RoleCard title="Video Editor" r={k.byRole.editor} />
          </div>
        )}

        {k && tab === 'individu' && (
          <>
            {k.individuals.length === 0 && <Empty>Belum ada data scorecard.</Empty>}
            <div className="grid gap-3 lg:grid-cols-2">{k.individuals.map((c) => <Person key={c.id} c={c} />)}</div>
            <p className="mt-3 text-[11.5px] text-muted">{isLead ? 'Leader melihat semua individu; setiap individu hanya melihat dirinya sendiri.' : `${ROLE_LABEL[user!.role]}: hanya Anda yang melihat scorecard ini selain Leader.`} Komponen yang belum punya data tidak menurunkan skor.</p>
          </>
        )}

        {tab === 'evaluasi' && (
          <>
            <div className="mb-3 flex items-center gap-3">
              <h2 className="text-[13px] font-bold">Hasil evaluasi & tindak lanjut terbaru</h2>
              <Link to="/blind-review" className="text-[12px] font-semibold text-brand-600 hover:underline">Buka Blind Review →</Link>
            </div>
            {cycles.data && closed.length === 0 && <Empty>Belum ada siklus evaluasi yang ditutup.</Empty>}
            <div className="grid gap-3 lg:grid-cols-2">
              {closed.slice(0, 4).map((c) => (
                <Card key={c.id} className="p-4">
                  <h3 className="text-[13px] font-bold">{c.name}</h3>
                  <p className="mb-2 text-[11px] text-muted">{fmtYmd(c.periodStart)} s.d. {fmtYmd(c.periodEnd)} · {c.submitted}/{c.invited} mengisi</p>
                  {c.actions.length === 0 ? (
                    <p className="text-[12px] text-faint">Belum ada tindak lanjut dari FGD.</p>
                  ) : (
                    <ul className="space-y-1 text-[12px]">
                      {c.actions.map((a) => <li key={a.id} className="flex gap-2"><span aria-hidden="true">{a.done ? '☑' : '☐'}</span><span className={a.done ? 'text-muted line-through' : ''}>{a.text}</span></li>)}
                    </ul>
                  )}
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}
