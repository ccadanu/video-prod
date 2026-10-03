import { useState } from 'react';
import { EDITOR_DAILY_SLOTS, type EditCard, type EditingSchedule as Schedule } from '@ccp/shared';
import { AssignDrawer } from '../components/editing/AssignDrawer';
import { EditDetailDrawer, OriginChip, PriorityTag, SlaTag, fmtDay, waitingLabel } from '../components/editing/parts';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge, Button, Card, Empty, JenisChip, Segmented, StatusPill, cx } from '../components/ui';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useEditingMutations, useSchedule } from '../lib/editingApi';

const TH = 'whitespace-nowrap px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-muted';
const TD = 'px-3 py-2.5 align-middle';
const errText = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Terjadi kesalahan');

function Strip({ label, value, tone }: { label: string; value: number; tone?: 'warn' }) {
  return (
    <Card className="min-w-[120px] flex-1 px-4 py-3">
      <div className={cx('text-xl font-bold tracking-tight', tone === 'warn' && value > 0 && 'text-danger')}>{value}</div>
      <div className="mt-0.5 text-[11px] text-muted">{label}</div>
    </Card>
  );
}

/** Beban editor per hari (slot terpakai / kapasitas). Merah bila melebihi kapasitas. */
function LoadGrid({ schedule }: { schedule: Schedule }) {
  const [half, setHalf] = useState<'ini' | 'depan'>('ini');
  const from = half === 'ini' ? 0 : 5;
  const days = schedule.days.slice(from, from + 5);
  return (
    <Card className="mb-5 overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
        <h2 className="text-[13px] font-bold">Beban editor</h2>
        <span className="text-[11px] text-muted">Kapasitas {EDITOR_DAILY_SLOTS} slot per editor per hari (Gampang 1 · Susah 2)</span>
        <div className="flex-1" />
        <Segmented
          label="Pekan beban editor"
          value={half}
          onChange={setHalf}
          options={[{ value: 'ini', label: schedule.weekLabels[0].split(' · ')[1]! + ' ini' }, { value: 'depan', label: schedule.weekLabels[1].split(' · ')[1]! + ' depan' }]}
        />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="border-b border-line bg-canvas">
              <th className={TH}>Editor</th>
              {days.map((d) => <th key={d} className={cx(TH, d === schedule.today && 'text-brand-700')}>{fmtDay(d)}{d === schedule.today && ' · hari ini'}</th>)}
            </tr>
          </thead>
          <tbody>
            {schedule.editors.length === 0 && <tr><td colSpan={6} className="px-3 py-6 text-center text-faint">Belum ada akun Editor aktif.</td></tr>}
            {schedule.editors.map((e) => (
              <tr key={e.id} className="border-b border-line-soft last:border-0">
                <td className={cx(TD, 'font-semibold')}>{e.name}</td>
                {e.slots.slice(from, from + 5).map((n, i) => (
                  <td key={days[i]} className={TD}>
                    <div className={cx('text-[12px] font-semibold', n > EDITOR_DAILY_SLOTS && 'text-danger')}>{n}/{EDITOR_DAILY_SLOTS}</div>
                    <div className="mt-1 h-[5px] w-20 overflow-hidden rounded bg-[#e7ecf0]" role="progressbar" aria-label={`${e.name} ${fmtDay(days[i]!)}`} aria-valuenow={n} aria-valuemin={0} aria-valuemax={EDITOR_DAILY_SLOTS}>
                      <div className={cx('h-full rounded', n > EDITOR_DAILY_SLOTS ? 'bg-danger' : 'bg-ok')} style={{ width: `${Math.min(100, (n / EDITOR_DAILY_SLOTS) * 100)}%` }} />
                    </div>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function EditingSchedule() {
  const { user } = useAuth();
  const isLeader = user?.role === 'leader';
  const q = useSchedule();
  const m = useEditingMutations();
  const [assign, setAssign] = useState<EditCard | null>(null);
  const [detail, setDetail] = useState<EditCard | null>(null);
  const s = q.data;
  // Selalu ambil versi terbaru kartu dari data (drawer tetap sinkron setelah mutasi).
  const fresh = (c: EditCard | null) => (c && s ? ([...s.queue, ...s.assigned].find((x) => x.id === c.id) ?? c) : c);

  return (
    <>
      <PageHeader
        title="Brief Editing Schedule"
        subtitle={isLeader ? 'Assign editor, tetapkan jadwal, prioritas, dan tenggat untuk antrean editing.' : 'Mode baca: pantau antrean dan jadwal editing.'}
      />
      <div className="px-7 pb-8">
        {q.isLoading && <p className="py-10 text-center text-[13px] text-faint">Memuat jadwal…</p>}
        {q.isError && <p role="alert" className="py-10 text-center text-[13px] text-danger">{errText(q.error)}</p>}
        {s && (
          <>
            <div className="mb-4 flex flex-wrap gap-3">
              <Strip label="Menunggu assign" value={s.summary.antre} />
              <Strip label="Terjadwal (belum mulai)" value={s.summary.terjadwal} />
              <Strip label="Sedang diedit" value={s.summary.berjalan} />
              <Strip label="Revisi" value={s.summary.revisi} />
              <Strip label="Lewat tenggat" value={s.summary.telat} tone="warn" />
            </div>

            <LoadGrid schedule={s} />

            <section className="mb-6" aria-label="Antrean editing">
              <h2 className="mb-2 flex items-center gap-2 text-[13px] font-bold">Antrean editing <span className="rounded-full bg-[#e7ecf0] px-2 text-[11px] font-normal text-muted">{s.queue.length}</span></h2>
              <Card className="overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="border-b border-line bg-canvas">{['#', 'Code', 'Judul / Campaign', 'Jenis', 'Asal', 'Menunggu', 'Status', 'Aksi'].map((h) => <th key={h} className={TH}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {s.queue.map((c, i) => (
                      <tr key={c.id} className="border-b border-line-soft last:border-0 hover:bg-brand-50/50">
                        <td className={cx(TD, 'text-faint')}>{i + 1}</td>
                        <td className={cx(TD, 'text-[11.5px] text-muted')}>{c.code}</td>
                        <td className={cx(TD, 'max-w-[280px]')}>
                          <button onClick={() => setDetail(c)} className="max-w-full truncate text-left font-semibold hover:text-brand-700 focus-visible:underline">{c.judul}</button>
                          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-faint">{c.produk} <PriorityTag priority={c.priority} /></div>
                        </td>
                        <td className={TD}><JenisChip jenis={c.jenis} /></td>
                        <td className={TD}><OriginChip origin={c.origin} /></td>
                        <td className={TD}>{waitingLabel(c.queuedAt)}</td>
                        <td className={TD}>{c.status === 'revisi' ? <Badge tone="red">Revisi {c.revisionCount}×</Badge> : <StatusPill status={c.status} />}</td>
                        <td className={TD}>{isLeader ? <Button size="sm" onClick={() => setAssign(c)}>Assign</Button> : <span className="text-faint">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {s.queue.length === 0 && <div className="p-4"><Empty>Antrean kosong. Konten Daily yang lolos validasi dan footage yang diserahkan VG muncul di sini.</Empty></div>}
              </Card>
            </section>

            <section aria-label="Terjadwal">
              <h2 className="mb-2 flex items-center gap-2 text-[13px] font-bold">Terjadwal & berjalan <span className="rounded-full bg-[#e7ecf0] px-2 text-[11px] font-normal text-muted">{s.assigned.length}</span></h2>
              <Card className="overflow-x-auto">
                <table className="w-full text-[12.5px]">
                  <thead>
                    <tr className="border-b border-line bg-canvas">{['Code', 'Judul / Campaign', 'Editor', 'Mulai', 'Tenggat', 'Bobot', 'Tahap', 'SLA', 'Aksi'].map((h) => <th key={h} className={TH}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {s.assigned.map((c) => (
                      <tr key={c.id} className="border-b border-line-soft last:border-0 hover:bg-brand-50/50">
                        <td className={cx(TD, 'text-[11.5px] text-muted')}>{c.code}</td>
                        <td className={cx(TD, 'max-w-[260px]')}>
                          <button onClick={() => setDetail(c)} className="max-w-full truncate text-left font-semibold hover:text-brand-700 focus-visible:underline">{c.judul}</button>
                          <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-faint"><JenisChip jenis={c.jenis} /> <PriorityTag priority={c.priority} /></div>
                        </td>
                        <td className={TD}>{c.editorName}</td>
                        <td className={TD}>{c.scheduledFor ? fmtDay(c.scheduledFor) : '—'}</td>
                        <td className={TD}>{c.dueDate ? fmtDay(c.dueDate) : '—'}</td>
                        <td className={TD}>{c.bobot === 'susah' ? 'Susah ×2' : 'Gampang'}</td>
                        <td className={TD}>{c.status === 'revisi' ? <Badge tone="red">Revisi {c.revisionCount}×</Badge> : c.column === 'progress' ? <Badge tone="violet">On Progress</Badge> : <Badge tone="sky">To Do</Badge>}</td>
                        <td className={TD}><SlaTag sla={c.sla} /></td>
                        <td className={TD}>{isLeader ? <Button variant="ghost" size="sm" onClick={() => setAssign(c)}>Ubah</Button> : <span className="text-faint">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {s.assigned.length === 0 && <div className="p-4"><Empty>Belum ada konten yang di-assign.</Empty></div>}
              </Card>
            </section>
          </>
        )}
      </div>

      {s && <AssignDrawer card={fresh(assign)} schedule={s} onSubmit={(id, input) => m.assign.mutateAsync({ id, input })} onClose={() => setAssign(null)} />}
      <EditDetailDrawer card={fresh(detail)} onClose={() => setDetail(null)} />
    </>
  );
}
