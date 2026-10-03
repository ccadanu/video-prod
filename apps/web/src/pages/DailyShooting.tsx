import { ExternalLink } from 'lucide-react';
import { useState } from 'react';
import {
  DAILY_COLUMN_META,
  DAY_NAMES,
  addDays,
  mondayOf,
  todayJakarta,
  type DailyCard,
  type DailyColumn,
} from '@ccp/shared';
import { HandoffDrawer } from '../components/daily/HandoffDrawer';
import { KebabMenu } from '../components/daily/KebabMenu';
import { RescheduleDrawer } from '../components/daily/RescheduleDrawer';
import { PageHeader } from '../components/layout/PageHeader';
import { ReasonDrawer, type ReasonAsk } from '../components/weekly/ReasonDrawer';
import { WeekPicker } from '../components/weekly/WeekPicker';
import { Badge, Button, Card, Drawer, Empty, JenisChip, Select, StatusPill, cx } from '../components/ui';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useBoard, useDailyMutations } from '../lib/dailyApi';
import { fmtDateTime, fmtYmd } from '../lib/format';

const COLUMNS: DailyColumn[] = ['later', 'belum', 'sedang', 'footage', 'terkirim'];
const DOT: Record<DailyColumn, string> = { later: '#E08A2B', belum: '#94A3B8', sedang: '#E08A2B', footage: '#228CCD', terkirim: '#16A34A' };
const errText = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Terjadi kesalahan');

/** Hari kerja yang ditampilkan: hari ini bila Senin–Jumat, selain itu Jumat (hari kerja terakhir). */
function defaultDay(): number {
  const dow = new Date(`${todayJakarta()}T00:00:00Z`).getUTCDay(); // 0 = Minggu
  return dow >= 1 && dow <= 5 ? dow - 1 : 4;
}

function Strip({ label, value, tone, bar }: { label: string; value: string | number; tone?: 'hold'; bar?: number }) {
  return (
    <Card className="flex-1 px-4 py-3">
      <div className={cx('text-xl font-bold tracking-tight', tone === 'hold' && Number(value) > 0 && 'text-orange-800')}>{value}</div>
      <div className="mt-0.5 text-[11px] text-muted">{label}</div>
      {bar !== undefined && (
        <div className="mt-2 h-[5px] overflow-hidden rounded bg-[#e7ecf0]" role="progressbar" aria-valuenow={bar} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
          <div className="h-full rounded bg-ok" style={{ width: `${bar}%` }} />
        </div>
      )}
    </Card>
  );
}

export function DailyShooting() {
  const { user } = useAuth();
  const isVg = user?.role === 'videografer';
  const [week, setWeek] = useState(() => mondayOf(todayJakarta()));
  const [day, setDay] = useState(defaultDay);
  const [handoff, setHandoff] = useState<DailyCard | null>(null);
  const [resched, setResched] = useState<DailyCard | null>(null);
  const [detail, setDetail] = useState<DailyCard | null>(null);
  const [reasonAsk, setReasonAsk] = useState<ReasonAsk | null>(null);
  const [actionError, setActionError] = useState('');

  const q = useBoard(week, day);
  const m = useDailyMutations();
  const board = q.data;

  const guard = async (fn: () => Promise<unknown>) => {
    setActionError('');
    try {
      await fn();
    } catch (e) {
      setActionError(errText(e));
    }
  };

  const askHold = (c: DailyCard) =>
    setReasonAsk({
      title: 'Hold konten',
      subtitle: `${c.judul} · ${c.talent} · ${c.lokasi}`,
      hint: 'Konten dijeda sementara dan tetap di hari ini. Bisa dilanjutkan (Resume) nanti atau dijadwal ulang. Alasan tercatat untuk evaluasi.',
      confirm: 'Tandai Hold',
      run: (reason) => m.hold.mutateAsync({ id: c.id, reason }),
    });
  const askPostpone = (c: DailyCard) =>
    setReasonAsk({
      title: 'Tunda ke pekan depan',
      subtitle: `${c.judul}`,
      hint: 'Konten tidak bisa dieksekusi pekan ini dan kembali ke Weekly Listing pekan depan. Perubahan konsep = tiket baru, bukan lewat sini.',
      confirm: 'Tunda ke pekan depan',
      run: (reason) => m.postpone.mutateAsync({ id: c.id, reason }),
    });

  const cardsIn = (col: DailyColumn) => board?.cards.filter((c) => c.column === col) ?? [];

  function action(c: DailyCard) {
    if (!isVg) return null;
    if (c.holdReason !== null) return <Button variant="ghost" size="sm" full className="mt-2.5 !bg-orange-100 !text-orange-800" onClick={() => void guard(() => m.resume.mutateAsync(c.id))}>▶ Lanjutkan (Resume)</Button>;
    const redo = c.status === 'revisi';
    switch (c.column) {
      case 'later':
        return <Button variant="ghost" size="sm" full className="mt-2.5" onClick={() => void guard(() => m.pull.mutateAsync({ id: c.id, day }))}>⚡ Pull to Today</Button>;
      case 'belum':
        return <Button size="sm" full className="mt-2.5" onClick={() => void guard(() => m.start.mutateAsync(c.id))}>{redo ? '▶ Mulai take ulang' : '▶ Mulai Take'}</Button>;
      case 'sedang':
        return <Button size="sm" full className="mt-2.5" onClick={() => void guard(() => m.finish.mutateAsync(c.id))}>✓ Selesai Take</Button>;
      case 'footage':
        return <Button size="sm" full className="mt-2.5" onClick={() => setHandoff(c)}>📤 Isi Bukti Serah Footage</Button>;
      default:
        return null;
    }
  }

  function renderCard(c: DailyCard) {
    const held = c.holdReason !== null;
    return (
      <article key={c.id} className={cx('rounded-[11px] border p-3 shadow-card', held ? 'border-[#edd8b8] bg-[#fffbf4]' : 'border-line bg-white')}>
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-[10px] text-faint">{c.code}</span>
          <div className="flex items-center gap-1.5">
            {held && <Badge tone="amber" className="!text-[9.5px]">⏸ Hold</Badge>}
            {c.status === 'revisi' && <Badge tone="red" className="!text-[9.5px]">Revisi</Badge>}
            {c.column === 'sedang' && !held && <Badge tone="amber" className="!text-[9.5px]">● take</Badge>}
            {c.sdmIssue && <span title="SDM hari ini belum Ready" className="text-[10px] font-bold text-danger">⚠ SDM</span>}
            {isVg && c.column !== 'terkirim' && (
              <KebabMenu
                label={`Aksi untuk ${c.judul}`}
                items={[
                  held ? { label: '▶ Lanjutkan (Resume)', onSelect: () => void guard(() => m.resume.mutateAsync(c.id)) } : { label: '⏸ Hold (jeda konten)', onSelect: () => askHold(c) },
                  ...(c.status === 'ready' || c.status === 'syuting' ? [{ label: '📅 Reschedule ke hari…', onSelect: () => setResched(c) }, { label: '⏭ Tunda ke pekan depan', onSelect: () => askPostpone(c), danger: true }] : []),
                ]}
              />
            )}
          </div>
        </div>
        <button onClick={() => setDetail(c)} className="mb-2 block w-full text-left text-[13px] font-semibold leading-snug hover:text-brand-700 focus-visible:underline">{c.judul}</button>
        <div className="mb-2 flex flex-wrap gap-1">
          <JenisChip jenis={c.jenis} />
          <span className="rounded-md bg-[#fdecec] px-1.5 py-0.5 text-[10px] font-semibold text-[#c0483c]">{c.talent}</span>
          <span className="rounded-md bg-brand-50 px-1.5 py-0.5 text-[10px] font-semibold text-brand-700">{c.lokasi}</span>
          {c.column === 'later' && <span className="rounded-md bg-orange-100 px-1.5 py-0.5 text-[10px] font-semibold text-orange-800">{DAY_NAMES[c.day]}</span>}
          {c.fromDay !== null && <span className="rounded-md bg-[#fbe4e1] px-1.5 py-0.5 text-[10px] font-semibold text-[#b03a2e]">Terlewat dari {DAY_NAMES[c.fromDay]}</span>}
        </div>
        <p className="text-[11px] text-muted">{c.produk} · {c.bobot === 'susah' ? 'Susah ×2' : 'Gampang'}</p>
        {held ? (
          <p className="mt-2 rounded-md bg-orange-100 px-2 py-1.5 text-[10.5px] text-orange-800">⏸ Hold: {c.holdReason}</p>
        ) : c.column !== 'later' && (
          <p className="mt-2 flex items-center gap-1 border-t border-line-soft pt-2 text-[10.5px]">
            <span className="text-faint">Setelah siap:</span> →
            <b className={c.route === 'editor' ? 'text-brand-700' : 'text-[#0b7266]'}>{c.route === 'editor' ? 'Antrean Video Editor' : 'Review User'}</b>
          </p>
        )}
        {c.proof && (
          <p className="mt-2 rounded-md bg-canvas px-2 py-1.5 text-[10.5px] text-muted">
            {c.proof.storage === 'drive' ? <>💾 <b className="text-ink">Drive</b> · link footage terlampir</> : <>🖥️ <b className="text-ink">{c.proof.diskName}</b> · {c.proof.path}{c.proof.fileName}</>}
          </p>
        )}
        {action(c)}
      </article>
    );
  }

  const s = board?.summary;
  const pct = s && s.total > 0 ? Math.round((s.taken / s.total) * 100) : 0;

  return (
    <>
      <PageHeader
        title="Daily Shooting"
        subtitle={isVg ? 'Eksekusi syuting per hari. Perubahan hari-H (Hold, Reschedule, Tunda) ditangani di sini.' : 'Mode baca: pantau eksekusi syuting harian oleh Videografer.'}
        actions={
          <>
            <WeekPicker week={week} onChange={setWeek} />
            <label className="sr-only" htmlFor="daily-day">Hari</label>
            <Select id="daily-day" className="!w-auto !py-1.5 !text-[13px]" value={day} onChange={(e) => setDay(Number(e.target.value))}>
              {DAY_NAMES.map((n, i) => (
                <option key={n} value={i}>{n} · {fmtYmd(addDays(week, i))}{board ? ` · ${board.dayCounts[i]} konten` : ''}</option>
              ))}
            </Select>
            {board && <Badge tone={board.weekReady ? 'green' : 'amber'} className="!px-3 !py-1 !text-[11px]">{board.weekReady ? 'Syuting Berjalan' : 'Pekan belum Ready'}</Badge>}
          </>
        }
      />

      <div className="px-7 pb-8">
        {q.isLoading && <p className="py-10 text-center text-[13px] text-faint">Memuat board…</p>}
        {q.isError && <p role="alert" className="py-10 text-center text-[13px] text-danger">{errText(q.error)}</p>}

        {board && s && (
          <>
            <div className="mb-3 flex flex-wrap gap-3">
              <Strip label="Selesai di-take hari ini" value={`${s.taken}/${s.total}`} bar={pct} />
              <Strip label="Sedang take" value={s.taking} />
              <Strip label="Footage terkirim" value={s.handed} />
              <Strip label="Di-hold" value={s.held} tone="hold" />
            </div>

            <p className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted">
              <b className="text-ink">Panduan hari ini:</b>
              {[['Shotlist', board.guide.shotlistUrl], ['Skrip talent', board.guide.skripUrl]].map(([name, url]) =>
                url ? (
                  <a key={name} href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-lg bg-[#e5f5ea] px-2.5 py-1 font-semibold text-[#15803d] hover:underline">
                    {name} {DAY_NAMES[board.day]} ✓ <ExternalLink size={11} />
                  </a>
                ) : (
                  <span key={name} className="rounded-lg bg-line-soft px-2.5 py-1 font-semibold text-faint">{name} belum diunggah</span>
                ),
              )}
              <span className="text-faint">dari Weekly Listing (hanya baca)</span>
            </p>

            {actionError && <p role="alert" className="mb-3 rounded-lg border border-[#f0c7c1] bg-[#fdf1ef] px-3 py-2 text-[12.5px] text-danger">{actionError}</p>}
            {!board.weekReady && <p role="note" className="mb-3 rounded-lg bg-orange-100 px-3 py-2 text-xs text-orange-800">Pekan ini belum ditandai Ready to Execute di Weekly Listing, jadi belum ada konten yang bisa di-take.</p>}

            <div className="flex h-[calc(100vh-330px)] min-h-[420px] gap-3.5 overflow-x-auto pb-2">
              {COLUMNS.map((col) => {
                const cards = cardsIn(col);
                return (
                  <section key={col} aria-label={DAILY_COLUMN_META[col].title} className={cx('flex min-h-0 flex-none flex-col', col === 'later' ? 'w-[270px]' : 'w-[290px]')}>
                    <header className="flex items-center gap-2 px-1 pb-2.5 pt-1">
                      <span aria-hidden="true" className="h-[9px] w-[9px] rounded-full" style={{ background: DOT[col] }} />
                      <b className="text-[13px]">{DAILY_COLUMN_META[col].title}</b>
                      <span className="rounded-full bg-[#e7ecf0] px-2 text-[11px] text-muted">{cards.length}</span>
                      <span className="ml-auto text-[10px] text-faint">{DAILY_COLUMN_META[col].hint}</span>
                    </header>
                    <div className={cx('flex flex-1 flex-col gap-2.5 overflow-y-auto p-0.5 pb-8', col === 'later' && 'rounded-[11px] border border-dashed border-[#f0dcc2] bg-[#fffbf4] p-2.5')}>
                      {cards.length === 0 ? <Empty>{col === 'later' ? 'Tidak ada konten hari berikutnya' : '— kosong —'}</Empty> : cards.map(renderCard)}
                    </div>
                  </section>
                );
              })}
            </div>
          </>
        )}
      </div>

      <HandoffDrawer key={handoff?.id ?? 'none'} card={handoff} onSubmit={(id, input) => m.handoff.mutateAsync({ id, input })} onClose={() => setHandoff(null)} />
      <RescheduleDrawer key={`r${resched?.id ?? 'none'}`} card={resched} weekStart={week} onSubmit={(id, d, reason) => m.reschedule.mutateAsync({ id, day: d, reason })} onClose={() => setResched(null)} />
      <ReasonDrawer ask={reasonAsk} onClose={() => setReasonAsk(null)} />

      <Drawer open={detail !== null} title={detail?.judul ?? ''} subtitle={detail ? `${detail.code} · ${detail.produk}` : undefined} onClose={() => setDetail(null)}>
        {detail && (
          <dl className="text-[13px]">
            {([
              ['Status', <StatusPill key="s" status={detail.status} />],
              ['Jenis', <JenisChip key="j" jenis={detail.jenis} />],
              ['Hari syuting', DAY_NAMES[detail.day]],
              ['Talent', detail.talent],
              ['Lokasi', detail.lokasi],
              ['Jalur', detail.route === 'editor' ? 'Antrean Video Editor' : 'Review User'],
            ] as const).map(([k, v]) => (
              <div key={k} className="grid grid-cols-[110px_1fr] gap-2 border-b border-line-soft py-2 last:border-0">
                <dt className="text-muted">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
            {detail.holdReason && <p className="mt-3 rounded-lg bg-orange-100 px-3 py-2 text-xs text-orange-800">⏸ Sedang hold: {detail.holdReason}</p>}
            {detail.proof && (
              <section className="mt-4">
                <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-faint">Bukti footage</h3>
                {detail.proof.storage === 'drive' && detail.proof.driveUrl ? (
                  <a href={detail.proof.driveUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand-600 hover:underline">Buka folder Drive <ExternalLink size={12} /></a>
                ) : (
                  <p className="text-xs">🖥️ {detail.proof.diskName} · {detail.proof.path}{detail.proof.fileName}</p>
                )}
                <p className="mt-1 text-[11px] text-faint">Diserahkan {fmtDateTime(detail.proof.handedAt)}{detail.proof.handedByName ? ` oleh ${detail.proof.handedByName}` : ''}</p>
              </section>
            )}
          </dl>
        )}
      </Drawer>
    </>
  );
}
