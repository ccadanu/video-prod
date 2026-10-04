import { useState } from 'react';
import { ARENA_POINTS, BADGES, LEVELS, type ArenaPerson, type ArenaRole, type Period, type TeamGoal } from '@ccp/shared';
import { fmtNum, fmtPct } from '../charts';
import { Card, Empty, Segmented, cx } from '../ui';
import { ApiError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { useArena, useArenaSettings } from '../../lib/statsApi';

const MEDAL = ['🥇', '🥈', '🥉'];
const ROLE_TITLE: Record<ArenaRole, string> = { editor: 'Video Editor', videografer: 'Videografer' };
const errText = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Terjadi kesalahan');

function Goal({ g }: { g: TeamGoal }) {
  const v = g.value;
  const text = v === null ? '—' : g.unit === '%' ? fmtPct(v, 1) : g.unit === '/5' ? `${fmtNum(v, 2)}/5` : fmtNum(v);
  const pct = v === null || g.target === 0 ? 0 : g.direction === 'min' ? Math.min(100, (v / g.target) * 100) : Math.min(100, (g.target / Math.max(v, 0.0001)) * 100);
  return (
    <Card className="p-3.5">
      <div className="flex items-start gap-2">
        <p className="min-w-0 flex-1 text-[12px] font-semibold">{g.label}</p>
        <span className={cx('text-[11px] font-bold', g.met === true ? 'text-[#15803d]' : 'text-muted')}>{g.met === true ? '✓ Tercapai' : g.met === false ? 'Belum' : '—'}</span>
      </div>
      <div className="mt-1.5 text-[20px] font-bold leading-none">{text}</div>
      <div className="mt-2 h-2 overflow-hidden rounded-[3px] bg-[var(--viz-track)]" role="progressbar" aria-label={g.label} aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
        <div className={cx('h-full rounded-r-[4px]', g.met ? 'bg-[var(--viz-6)]' : 'bg-[var(--viz-1)]')} style={{ width: `${pct}%` }} />
      </div>
    </Card>
  );
}

function RankChange({ p }: { p: ArenaPerson }) {
  if (p.rankPrev === null) return <span className="text-[10px] font-semibold text-brand-700">baru</span>;
  const d = p.rankPrev - p.rank;
  if (d > 0) return <span className="text-[10.5px] font-semibold text-[#15803d]" title={`Naik ${d} peringkat`}>▲{d}<span className="sr-only"> naik {d}</span></span>;
  if (d < 0) return <span className="text-[10.5px] text-faint" title={`Turun ${-d} peringkat`}>▼{-d}<span className="sr-only"> turun {-d}</span></span>;
  return <span className="text-[10.5px] text-faint" title="Tetap">•</span>;
}

function Badges({ p }: { p: ArenaPerson }) {
  if (p.badges.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {p.badges.map((b) => (
        <span key={b} title={`${BADGES[b].label}: ${BADGES[b].hint}`} aria-label={BADGES[b].label} role="img" className="inline-flex items-center gap-0.5 rounded-md bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-800">
          {BADGES[b].icon} {BADGES[b].label}
        </span>
      ))}
    </span>
  );
}

function Podium({ people }: { people: ArenaPerson[] }) {
  const top = people.filter((p) => p.points > 0).slice(0, 3);
  if (top.length === 0) return <Empty>Belum ada poin pada periode ini.</Empty>;
  // urutan tampil: 2 · 1 · 3 (juara 1 di tengah dan tertinggi)
  const order = [top[1], top[0], top[2]].filter((p): p is ArenaPerson => p !== undefined);
  const height: Record<number, string> = { 1: 'h-28', 2: 'h-20', 3: 'h-14' };
  return (
    <ol className="mx-auto flex max-w-[560px] items-end justify-center gap-3" aria-label="Podium tiga teratas">
      {order.map((p) => (
        <li key={p.id} className="flex flex-1 flex-col items-center">
          <span className="text-[22px]" aria-hidden="true">{MEDAL[p.rank - 1]}</span>
          <b className="max-w-full truncate text-[13px]">{p.name}</b>
          <span className="text-[10.5px] text-muted">Lv{p.level.n} {p.level.name}</span>
          <div className={cx('mt-1.5 flex w-full items-start justify-center rounded-t-[10px] pt-2 text-[15px] font-bold', height[p.rank] ?? 'h-12', p.rank === 1 ? 'bg-orange-500 text-navy-950' : p.rank === 2 ? 'bg-brand-200 text-navy-950' : 'bg-brand-100 text-navy-950')}>
            {fmtNum(p.points)}<span className="ml-0.5 text-[10px] font-semibold opacity-80">poin</span>
          </div>
        </li>
      ))}
    </ol>
  );
}

function MyCard({ p, size }: { p: ArenaPerson; size: number }) {
  const b = p.breakdown;
  const rows: [string, number, string][] = b
    ? [['Konten selesai', b.base, `${p.contents} × ${ARENA_POINTS.base}`], ['Tepat waktu', b.onTime, `× ${ARENA_POINTS.onTime}`], ['Bobot Susah', b.susah, `× ${ARENA_POINTS.susah}`], ['Tanpa revisi', b.firstPass, `× ${ARENA_POINTS.firstPass}`], ['Bonus rating', b.rating, 'rating 4–5']]
    : [];
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <Card className="p-4">
      <header className="mb-3 flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-[14px] font-bold">Pencapaian saya</h3>
          <p className="text-[11.5px] text-muted">Peringkat <b className="text-ink">#{p.rank}</b> dari {size} {ROLE_TITLE[p.role].toLowerCase()} · <RankChange p={p} /></p>
        </div>
        <div className="text-right"><div className="text-[26px] font-bold leading-none">{fmtNum(p.points)}</div><div className="text-[10.5px] text-muted">poin periode ini</div></div>
      </header>
      <div className="mb-3">
        <div className="mb-1 flex justify-between text-[11.5px]"><b>Lv{p.level.n} {p.level.name}</b><span className="text-muted">{p.level.next === null ? 'Level tertinggi 🎉' : `${fmtNum(p.level.next - p.level.lifetime)} poin lagi ke ${LEVELS[p.level.n]!.name}`}</span></div>
        <div className="h-2.5 overflow-hidden rounded-[3px] bg-[var(--viz-track)]" role="progressbar" aria-label="Progres level" aria-valuenow={p.level.progressPct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-r-[4px] bg-orange-500" style={{ width: `${p.level.progressPct}%` }} />
        </div>
      </div>
      {rows.length > 0 && (
        <ul className="mb-3 space-y-1.5">
          {rows.map(([label, v, note]) => (
            <li key={label} className="grid grid-cols-[110px_1fr_auto] items-center gap-2 text-[12px]">
              <span className="text-muted">{label}</span>
              <div className="h-2.5 overflow-hidden rounded-[3px] bg-[var(--viz-track)]"><div className="h-full rounded-r-[4px] bg-[var(--viz-1)]" style={{ width: `${(v / max) * 100}%` }} /></div>
              <span className="w-24 text-right"><b>+{fmtNum(v)}</b> <span className="text-[10px] text-faint">{note}</span></span>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap items-center gap-2 text-[11.5px] text-muted">
        <span>🔥 Streak tepat waktu <b className="text-ink">{p.streak}</b></span>
        {p.onTimePct !== null && <span>· Tepat waktu <b className="text-ink">{fmtPct(p.onTimePct)}</b></span>}
        {p.avgRating !== null && <span>· Rating <b className="text-ink">{fmtNum(p.avgRating, 2)}/5</b></span>}
      </div>
      {p.badges.length > 0 && <div className="mt-2"><Badges p={p} /></div>}
    </Card>
  );
}

function Rules() {
  return (
    <details className="rounded-[14px] border border-line bg-white p-4 text-[12.5px] shadow-card">
      <summary className="cursor-pointer text-[13px] font-bold">Cara kerja poin, level, dan lencana</summary>
      <div className="mt-3 grid gap-4 md:grid-cols-3">
        <div>
          <h4 className="mb-1 font-semibold">Poin (hanya bertambah)</h4>
          <ul className="space-y-0.5 text-muted">
            <li>+{ARENA_POINTS.base} setiap konten yang selesai (disetujui User)</li>
            <li>+{ARENA_POINTS.onTime} bila tahap Anda tepat waktu</li>
            <li>+{ARENA_POINTS.susah} untuk konten berbobot Susah</li>
            <li>+{ARENA_POINTS.firstPass} bila disetujui tanpa revisi</li>
            <li>+{ARENA_POINTS.ratingStep}/+{ARENA_POINTS.ratingStep * 2} untuk rating 4/5 dari blind review</li>
          </ul>
          <p className="mt-1.5 text-faint">Tidak ada pengurangan poin. Poin dikreditkan saat konten selesai, bukan saat dikirim.</p>
        </div>
        <div>
          <h4 className="mb-1 font-semibold">Level (poin sepanjang waktu)</h4>
          <ul className="space-y-0.5 text-muted">{LEVELS.map((l, i) => <li key={l.name}>Lv{i + 1} {l.name} · {l.from}+ poin</li>)}</ul>
        </div>
        <div>
          <h4 className="mb-1 font-semibold">Lencana</h4>
          <ul className="space-y-0.5 text-muted">{Object.values(BADGES).map((b) => <li key={b.label}>{b.icon} <b className="text-ink">{b.label}</b>: {b.hint}</li>)}</ul>
        </div>
      </div>
    </details>
  );
}

/** Papan Prestasi: tantangan tim, podium, peringkat per peran, dan pencapaian pribadi. */
export function Arena({ period, canConfigure }: { period: Period; canConfigure: boolean }) {
  const { user } = useAuth();
  const q = useArena(period);
  const settings = useArenaSettings();
  const a = q.data;
  const [picked, setPicked] = useState<ArenaRole | null>(null);
  const role: ArenaRole = picked ?? (user?.role === 'videografer' ? 'videografer' : 'editor');
  const board = a?.boards[role];
  const me = a ? [...a.boards.editor.people, ...a.boards.videografer.people].find((p) => p.id === user?.id) : undefined;
  const detail = a?.mode === 'full';

  return (
    <div>
      {q.isLoading && <p className="py-10 text-center text-[13px] text-faint">Memuat papan prestasi…</p>}
      {q.isError && <p role="alert" className="py-10 text-center text-[13px] text-danger">{errText(q.error)}</p>}
      {a && board && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <p className="flex-1 text-[12px] text-muted">
              Kompetisi sehat: poin hanya bertambah dan dikreditkan saat konten selesai. Papan dipisah per peran agar adil. Kerja sama tim tetap tujuan utama.
            </p>
            {canConfigure && (
              <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-line bg-white px-3 py-1.5 text-[12px]">
                <input type="checkbox" className="h-4 w-4 accent-brand-600" checked={a.publicToTeam} disabled={settings.isPending} onChange={(e) => settings.mutate(e.target.checked)} />
                Tampilkan peringkat ke seluruh tim
              </label>
            )}
          </div>
          {a.mode === 'self' && <p role="note" className="mb-3 rounded-lg bg-brand-50 px-3 py-2 text-[12px] text-brand-800">Leader menampilkan peringkat hanya untuk Leader dan masing-masing individu. Anda melihat pencapaian Anda sendiri.</p>}
          {a.mode === 'team' && <p role="note" className="mb-3 text-[11.5px] text-faint">Detail ketepatan waktu dan rating rekan tidak ditampilkan; hanya Leader dan orangnya sendiri yang melihatnya.</p>}
          {canConfigure && !a.publicToTeam && <p role="note" className="mb-3 text-[11.5px] text-faint">Peringkat saat ini tidak terlihat oleh tim; setiap orang hanya melihat dirinya sendiri.</p>}

          <h2 className="mb-2 text-[13px] font-bold">Tantangan tim</h2>
          <div className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{a.goals.map((g) => <Goal key={g.key} g={g} />)}</div>

          {(a.mode !== 'self' || (me && me.role === role)) && (
            <div className="mb-3 flex items-center gap-3">
              <h2 className="text-[13px] font-bold">Papan peringkat</h2>
              {a.mode !== 'self' && <Segmented label="Peran" value={role} onChange={setPicked} options={[{ value: 'editor', label: 'Video Editor' }, { value: 'videografer', label: 'Videografer' }]} />}
            </div>
          )}

          <div className={cx('mb-4 grid gap-3', me && a.mode !== 'self' ? 'lg:grid-cols-3' : '')}>
            {a.mode !== 'self' && (
              <div className={cx('space-y-3', me ? 'lg:col-span-2' : '')}>
                <Card className="p-4"><Podium people={board.people} /></Card>
                <Card className="overflow-x-auto">
                  <table className="w-full text-[12.5px]">
                    <thead>
                      <tr className="border-b border-line bg-canvas">
                        {['#', 'Nama', 'Level', 'Poin', 'Konten', 'Streak', ...(detail ? ['Tepat waktu', 'Rating'] : []), 'Lencana'].map((h) => <th key={h} scope="col" className="whitespace-nowrap px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted">{h}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {board.people.map((p) => (
                        <tr key={p.id} className={cx('border-b border-line-soft last:border-0', p.id === user?.id && 'bg-brand-50/60')}>
                          <td className="whitespace-nowrap px-3 py-2.5 font-bold">{MEDAL[p.rank - 1] ?? p.rank} <RankChange p={p} /></td>
                          <td className="px-3 py-2.5 font-semibold">{p.name}{p.id === user?.id && <span className="ml-1.5 text-[10px] font-bold text-brand-700">(Anda)</span>}</td>
                          <td className="whitespace-nowrap px-3 py-2.5 text-muted">Lv{p.level.n} {p.level.name}</td>
                          <td className="px-3 py-2.5 font-bold">{fmtNum(p.points)}</td>
                          <td className="px-3 py-2.5">{p.contents}</td>
                          <td className="px-3 py-2.5">{p.streak > 0 ? `🔥 ${p.streak}` : '—'}</td>
                          {detail && <td className="px-3 py-2.5">{p.onTimePct === null ? '—' : fmtPct(p.onTimePct)}</td>}
                          {detail && <td className="px-3 py-2.5">{p.avgRating === null ? '—' : `${fmtNum(p.avgRating, 2)}/5`}</td>}
                          <td className="px-3 py-2.5"><Badges p={p} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {board.people.length === 0 && <div className="p-4"><Empty>Belum ada orang pada peran ini.</Empty></div>}
                </Card>
              </div>
            )}
            {me && <MyCard p={me} size={a.boards[me.role].size} />}
          </div>
          <Rules />
        </>
      )}
    </div>
  );
}
