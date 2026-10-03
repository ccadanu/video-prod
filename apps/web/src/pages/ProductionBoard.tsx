import { Link } from 'react-router-dom';
import { flattenNav, navFor } from '@ccp/shared';
import { DeltaTag, Funnel, StatTile, fmtNum, fmtPct } from '../components/charts';
import { PageHeader } from '../components/layout/PageHeader';
import { Card } from '../components/ui';
import { useAuth } from '../lib/auth';
import { ROADMAP } from '../lib/access';
import { usePulse } from '../lib/statsApi';

/** Ringkasan papan produksi: strip KPI 2 minggu (klik → Dashboard) + pintasan ke sub-fitur sesuai peran (PRD §3, §10). */
export function ProductionBoard() {
  const { user } = useAuth();
  const q = usePulse();
  const p = q.data;
  const sub = flattenNav(navFor(user!.role).filter((n) => n.key === 'production-board'));
  const drill = user!.role === 'user' || user!.role === 'leader' || user!.role === 'admin' ? '/dashboard' : '/kpi';

  return (
    <>
      <PageHeader title="Production Board" subtitle="Ringkasan 2 minggu terakhir. Klik strip KPI untuk membuka dashboard lengkap." />
      <div className="px-7 pb-10">
        {p && (
          <Link to={drill} aria-label="Buka dashboard lengkap" className="mb-4 flex flex-wrap gap-3 rounded-[14px] outline-none focus-visible:ring-2 focus-visible:ring-brand-500">
            <StatTile label="Konten selesai" value={fmtNum(p.selesai.value)} sub={<DeltaTag pct={p.selesai.pct} />} />
            <StatTile label="Kesesuaian SLA" value={p.sla.pct === null ? '—' : fmtPct(p.sla.pct)} />
            <StatTile label="Revision rate" value={p.revisi.rate === null ? '—' : fmtPct(p.revisi.rate * 100, 1)} sub={<span className="text-[11px] text-muted">ambang ≤ {fmtPct(p.revisi.threshold * 100)}</span>} />
            <StatTile label="Skor kepuasan" value={p.kepuasan.avg === null ? '—' : `${fmtNum(p.kepuasan.avg, 2)}/5`} sub={<span className="text-[11px] text-muted">target {fmtNum(p.kepuasan.target, 1)}</span>} />
          </Link>
        )}
        {q.isError && <p role="alert" className="mb-4 text-[13px] text-danger">Ringkasan KPI tidak dapat dimuat.</p>}

        <div className="grid gap-3 lg:grid-cols-3">
          <Card className="p-4 lg:col-span-2">
            <h2 className="mb-3 text-[13px] font-bold">Posisi order 2 minggu terakhir</h2>
            {p ? <Funnel stages={p.funnel} /> : <p className="text-xs text-faint">Memuat…</p>}
          </Card>
          <Card className="p-4">
            <h2 className="mb-3 text-[13px] font-bold">Pintasan</h2>
            <ul className="space-y-2">
              {sub.map((n) => (
                <li key={n.key}>
                  <Link to={n.path} className="block rounded-lg px-2.5 py-2 hover:bg-brand-50 focus-visible:bg-brand-50">
                    <span className="text-[13px] font-semibold text-brand-700">{n.label}</span>
                    {ROADMAP[n.key] && <span className="mt-0.5 block text-[11px] text-muted">{ROADMAP[n.key]!.blurb}</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
