import { useState } from 'react';
import { JENIS_META, MIN_RESPONSES, addDays, todayJakarta, type EvalCycle } from '@ccp/shared';
import { Donut, HBar, fmtNum } from '../components/charts';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge, Button, Card, Drawer, Empty, Field, Input, JenisChip, Textarea, cx } from '../components/ui';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtDate, fmtYmd } from '../lib/format';
import { useCycles, useEvalMutations, useForm, useResult } from '../lib/statsApi';

const errText = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Terjadi kesalahan');

// ───────────── Form pengisian (User) ─────────────

function FillDrawer({ cycleId, onClose }: { cycleId: number | null; onClose: () => void }) {
  const q = useForm(cycleId);
  const m = useEvalMutations();
  const [ratings, setRatings] = useState<Record<number, number>>({});
  const [good, setGood] = useState('');
  const [improve, setImprove] = useState('');
  const [error, setError] = useState('');
  const items = q.data?.items ?? [];
  const complete = items.length > 0 && items.every((i) => ratings[i.briefId]);

  const close = () => {
    setRatings({});
    setGood('');
    setImprove('');
    setError('');
    onClose();
  };
  async function submit() {
    if (cycleId === null) return;
    setError('');
    try {
      await m.respond.mutateAsync({ id: cycleId, input: { ratings: items.map((i) => ({ briefId: i.briefId, rating: ratings[i.briefId]! })), good, improve } });
      close();
    } catch (e) {
      setError(errText(e));
    }
  }

  return (
    <Drawer
      open={cycleId !== null}
      title="Isi evaluasi (blind review)"
      subtitle={q.data ? `${q.data.cycle.name} · ${fmtYmd(q.data.cycle.periodStart)} s.d. ${fmtYmd(q.data.cycle.periodEnd)}` : undefined}
      onClose={close}
      footer={
        <>
          <Button variant="ghost" full onClick={close}>Batal</Button>
          <Button full disabled={!complete || m.respond.isPending} onClick={() => void submit()}>{m.respond.isPending ? 'Mengirim…' : 'Kirim evaluasi'}</Button>
        </>
      }
    >
      <p className="mb-4 rounded-lg bg-brand-50 px-3 py-2 text-[12px] text-brand-800">
        Jawaban Anda <b>anonim</b>: tidak ada layar yang menampilkan siapa yang menulis. Tujuannya perbaikan tim (no blame game). Form ini <b>bukan tiket revisi</b>; untuk perbaikan konten gunakan tombol Minta revisi di Brief Order.
      </p>
      {q.isLoading && <p className="text-[13px] text-faint">Memuat…</p>}
      {q.isError && <p role="alert" className="text-[13px] text-danger">{errText(q.error)}</p>}
      {q.data && items.length === 0 && <Empty>Tidak ada konten yang perlu dinilai.</Empty>}
      {items.map((i) => (
        <fieldset key={i.briefId} className="mb-3 rounded-[11px] border border-line p-3">
          <legend className="px-1 text-[11px] text-faint">{i.code}</legend>
          <div className="mb-2 flex items-center gap-2"><b className="text-[13px]">{i.judul}</b><JenisChip jenis={i.jenis} /></div>
          <div role="radiogroup" aria-label={`Rating untuk ${i.judul}`} className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n} role="radio" aria-checked={ratings[i.briefId] === n} aria-label={`${n} dari 5`}
                onClick={() => setRatings((r) => ({ ...r, [i.briefId]: n }))}
                className={cx('h-9 w-9 rounded-lg border text-[13px] font-semibold', ratings[i.briefId] === n ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-white hover:border-brand-300')}
              >
                {n}
              </button>
            ))}
            <span className="ml-2 self-center text-[11px] text-muted">1 = sangat kurang · 5 = sangat baik</span>
          </div>
        </fieldset>
      ))}
      {items.length > 0 && (
        <>
          <Field label="Yang sudah baik (opsional)" hint="Tanpa nama. Fokus pada proses dan hasil.">{(id) => <Textarea id={id} value={good} onChange={(e) => setGood(e.target.value)} maxLength={1000} />}</Field>
          <Field label="Yang perlu diperbaiki (opsional)" hint="Tulis umpan balik yang bisa ditindaklanjuti.">{(id) => <Textarea id={id} value={improve} onChange={(e) => setImprove(e.target.value)} maxLength={1000} />}</Field>
        </>
      )}
      {error && <p role="alert" className="text-[12.5px] text-danger">{error}</p>}
    </Drawer>
  );
}

// ───────────── Distribusi form (Leader) ─────────────

function CreateDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const m = useEvalMutations();
  const today = todayJakarta();
  const [start, setStart] = useState(addDays(today, -13));
  const [end, setEnd] = useState(today);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  async function submit() {
    setError('');
    try {
      await m.create.mutateAsync({ periodStart: start, periodEnd: end, name });
      onClose();
    } catch (e) {
      setError(errText(e));
    }
  }
  return (
    <Drawer
      open={open}
      title="Distribusikan form evaluasi"
      subtitle="Form dikirim ke setiap User yang kontennya selesai pada periode"
      onClose={onClose}
      footer={<><Button variant="ghost" full onClick={onClose}>Batal</Button><Button full disabled={m.create.isPending} onClick={() => void submit()}>{m.create.isPending ? 'Membuat…' : 'Distribusikan'}</Button></>}
    >
      <Field label="Nama siklus (opsional)">{(id) => <Input id={id} value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="mis. Evaluasi 2 mingguan #8" />}</Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Awal periode" required>{(id) => <Input id={id} type="date" value={start} max={end} onChange={(e) => setStart(e.target.value)} />}</Field>
        <Field label="Akhir periode" required>{(id) => <Input id={id} type="date" value={end} min={start} max={today} onChange={(e) => setEnd(e.target.value)} />}</Field>
      </div>
      <p className="text-[11.5px] text-muted">Siklus 2-mingguan dengan periode maksimal 31 hari. Konten yang sudah pernah dinilai tidak diminta lagi.</p>
      {error && <p role="alert" className="mt-3 text-[12.5px] text-danger">{error}</p>}
    </Drawer>
  );
}

// ───────────── Detail siklus: hasil, FGD, tindak lanjut ─────────────

function CycleDrawer({ cycle, canEdit, canSeeResult, onClose }: { cycle: EvalCycle | null; canEdit: boolean; canSeeResult: boolean; onClose: () => void }) {
  const m = useEvalMutations();
  const result = useResult(cycle && canSeeResult ? cycle.id : null);
  const [notes, setNotes] = useState<string | null>(null);
  const [fgdAt, setFgdAt] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const r = result.data;
  const guard = async (fn: () => Promise<unknown>) => {
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(errText(e));
    }
  };
  const close = () => {
    setNotes(null);
    setFgdAt(null);
    setText('');
    setError('');
    onClose();
  };

  return (
    <Drawer open={cycle !== null} title={cycle?.name ?? ''} subtitle={cycle ? `${fmtYmd(cycle.periodStart)} s.d. ${fmtYmd(cycle.periodEnd)} · ${cycle.submitted}/${cycle.invited} mengisi` : undefined} onClose={close}>
      {cycle && (
        <>
          {error && <p role="alert" className="mb-3 text-[12.5px] text-danger">{error}</p>}
          {canEdit && cycle.status === 'open' && (
            <Button variant="danger" size="sm" className="mb-4" disabled={m.close.isPending} onClick={() => void guard(() => m.close.mutateAsync(cycle.id))}>Tutup siklus & buka hasil</Button>
          )}

          {canSeeResult && (
            <section aria-label="Hasil" className="mb-5">
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-faint">Hasil tim (tanpa identitas)</h3>
              {result.isError && <p className="text-[12.5px] text-muted">{errText(result.error)}</p>}
              {r && !r.enough && <p role="note" className="rounded-lg bg-orange-100 px-3 py-2 text-[12px] text-orange-800">Baru {r.responses} responden. Hasil ditampilkan setelah minimal {r.min} responden agar tidak mengarah ke satu orang.</p>}
              {r && r.enough && (
                <>
                  <div className="mb-3 flex items-center gap-4">
                    <Donut
                      data={[1, 2, 3, 4, 5].map((n) => ({ label: `Rating ${n}`, value: r.dist[n - 1]!, color: ['var(--viz-2)', 'var(--viz-4)', 'var(--viz-5)', 'var(--viz-3)', 'var(--viz-1)'][n - 1]! }))}
                      center={r.avg === null ? '—' : fmtNum(r.avg, 2)}
                      centerLabel={`dari 5 · ${r.responses} responden`}
                    />
                  </div>
                  <h4 className="mb-1.5 text-[11.5px] font-semibold text-muted">Rata-rata per jenis pengerjaan</h4>
                  <div className="mb-4"><HBar data={r.byJenis.map((j) => ({ label: JENIS_META[j.jenis].label, value: Math.round(j.avg * 100) / 100 }))} color="var(--viz-1)" /></div>
                  {([['Yang sudah baik', r.good], ['Yang perlu diperbaiki', r.improve]] as const).map(([title, list]) => (
                    <div key={title} className="mb-3">
                      <h4 className="mb-1.5 text-[11.5px] font-semibold text-muted">{title}</h4>
                      {list.length === 0 ? <p className="text-[12px] text-faint">—</p> : <ul className="space-y-1.5 text-[12.5px]">{list.map((c, i) => <li key={i} className="rounded-md bg-canvas px-2.5 py-1.5">“{c}”</li>)}</ul>}
                    </div>
                  ))}
                </>
              )}
            </section>
          )}

          <section aria-label="FGD" className="mb-5">
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-faint">Forum Group Discussion (FGD)</h3>
            {canEdit ? (
              <>
                <Field label="Tanggal FGD">{(id) => <Input id={id} type="date" value={fgdAt ?? cycle.fgdAt ?? todayJakarta()} onChange={(e) => setFgdAt(e.target.value)} />}</Field>
                <Field label="Catatan / kesimpulan FGD">{(id) => <Textarea id={id} value={notes ?? cycle.fgdNotes} onChange={(e) => setNotes(e.target.value)} maxLength={3000} />}</Field>
                <Button size="sm" disabled={m.fgd.isPending} onClick={() => void guard(() => m.fgd.mutateAsync({ id: cycle.id, notes: notes ?? cycle.fgdNotes, at: fgdAt ?? cycle.fgdAt ?? todayJakarta() }))}>Simpan catatan FGD</Button>
              </>
            ) : cycle.fgdNotes ? (
              <p className="rounded-md bg-canvas px-3 py-2 text-[12.5px]"><span className="text-faint">{cycle.fgdAt ? fmtYmd(cycle.fgdAt) : ''}</span> {cycle.fgdNotes}</p>
            ) : (
              <p className="text-[12px] text-faint">Belum ada catatan FGD.</p>
            )}
          </section>

          <section aria-label="Tindak lanjut">
            <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-faint">Umpan balik yang bisa ditindaklanjuti</h3>
            {cycle.actions.length === 0 && <p className="mb-2 text-[12px] text-faint">Belum ada tindak lanjut.</p>}
            <ul className="mb-2 space-y-1">
              {cycle.actions.map((a) => (
                <li key={a.id}>
                  <label className={cx('flex items-start gap-2.5 rounded-md px-2 py-1.5 text-[13px]', canEdit && 'cursor-pointer hover:bg-canvas')}>
                    <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-600" checked={a.done} disabled={!canEdit || m.toggleAction.isPending} onChange={(e) => void guard(() => m.toggleAction.mutateAsync({ id: a.id, done: e.target.checked }))} />
                    <span className={a.done ? 'text-muted line-through' : ''}>{a.text}</span>
                  </label>
                </li>
              ))}
            </ul>
            {canEdit && (
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) void guard(async () => { await m.addAction.mutateAsync({ id: cycle.id, text: text.trim() }); setText(''); }); }}>
                <label className="sr-only" htmlFor="new-action">Tindak lanjut baru</label>
                <Input id="new-action" value={text} onChange={(e) => setText(e.target.value)} placeholder="Tambah tindak lanjut…" maxLength={300} />
                <Button type="submit" size="sm" disabled={!text.trim() || m.addAction.isPending}>Tambah</Button>
              </form>
            )}
          </section>
        </>
      )}
    </Drawer>
  );
}

export function BlindReview() {
  const { user } = useAuth();
  const role = user!.role;
  const isLeader = role === 'leader';
  const canSeeResult = role !== 'user';
  const q = useCycles();
  const [fill, setFill] = useState<number | null>(null);
  const [create, setCreate] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const cycles = q.data ?? [];
  const open = cycles.find((c) => c.id === openId) ?? null;

  const subtitle =
    role === 'user' ? 'Nilai konten yang sudah selesai secara anonim. Masukan Anda dipakai untuk perbaikan tim.'
    : isLeader ? 'Distribusikan form ke User, tutup siklus, dan catat hasil FGD beserta tindak lanjutnya.'
    : role === 'admin' ? 'Mode baca: pantau siklus evaluasi.'
    : 'Hasil evaluasi tim dan tindak lanjutnya (tanpa identitas pengkritik, no blame game).';

  return (
    <>
      <PageHeader title="Blind Review" subtitle={subtitle} actions={isLeader && <Button onClick={() => setCreate(true)}>+ Distribusikan form</Button>} />
      <div className="px-7 pb-10">
        {q.isLoading && <p className="py-10 text-center text-[13px] text-faint">Memuat…</p>}
        {q.isError && <p role="alert" className="py-10 text-center text-[13px] text-danger">{errText(q.error)}</p>}
        {q.data && cycles.length === 0 && (
          <Empty>{role === 'user' ? 'Belum ada form evaluasi untuk Anda.' : role === 'leader' ? 'Belum ada siklus evaluasi. Klik "Distribusikan form" untuk memulai.' : 'Belum ada siklus evaluasi yang ditutup.'}</Empty>
        )}
        <div className="grid gap-3 lg:grid-cols-2">
          {cycles.map((c) => {
            const pending = role === 'user' && c.status === 'open' && c.me && !c.me.submitted;
            return (
              <Card key={c.id} className="p-4">
                <header className="mb-2 flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-[14px] font-bold">{c.name}</h2>
                    <p className="text-[11.5px] text-muted">{fmtYmd(c.periodStart)} s.d. {fmtYmd(c.periodEnd)}{c.closedAt ? ` · ditutup ${fmtDate(c.closedAt)}` : ''}</p>
                  </div>
                  <Badge tone={c.status === 'open' ? 'amber' : 'green'}>{c.status === 'open' ? 'Terbuka' : 'Ditutup'}</Badge>
                </header>
                {role !== 'user' && (
                  <>
                    <div className="mb-1 flex items-center justify-between text-[11.5px] text-muted"><span>Partisipasi</span><b className="text-ink">{c.submitted}/{c.invited} User</b></div>
                    <div className="mb-3 h-2 overflow-hidden rounded-[3px] bg-[var(--viz-track)]" role="progressbar" aria-label={`Partisipasi ${c.name}`} aria-valuenow={c.submitted} aria-valuemin={0} aria-valuemax={c.invited}>
                      <div className="h-full rounded-r-[4px] bg-[var(--viz-1)]" style={{ width: `${c.invited ? (c.submitted / c.invited) * 100 : 0}%` }} />
                    </div>
                  </>
                )}
                {role === 'user' && c.me && <p className="mb-3 text-[12.5px]">{c.me.submitted ? '✓ Terima kasih, evaluasi Anda sudah terkirim.' : c.status === 'open' ? 'Anda diundang mengisi evaluasi untuk konten yang selesai pada periode ini.' : 'Siklus ditutup.'}</p>}
                <div className="flex flex-wrap gap-2">
                  {pending && <Button size="sm" onClick={() => setFill(c.id)}>Isi evaluasi</Button>}
                  {role !== 'user' && <Button variant="ghost" size="sm" onClick={() => setOpenId(c.id)}>{isLeader ? 'Kelola siklus' : 'Lihat hasil & tindak lanjut'}</Button>}
                  {role !== 'user' && c.actions.length > 0 && <span className="self-center text-[11px] text-muted">{c.actions.filter((a) => a.done).length}/{c.actions.length} tindak lanjut selesai</span>}
                </div>
              </Card>
            );
          })}
        </div>
        {role === 'user' && <p className="mt-4 text-[11.5px] text-muted">Min. {MIN_RESPONSES} responden diperlukan sebelum Leader melihat hasil, agar masukan tidak bisa ditelusuri ke satu orang.</p>}
      </div>
      {role === 'user' && <FillDrawer key={fill ?? 'none'} cycleId={fill} onClose={() => setFill(null)} />}
      {isLeader && <CreateDrawer open={create} onClose={() => setCreate(false)} />}
      <CycleDrawer key={`c${openId ?? 'none'}`} cycle={open} canEdit={isLeader} canSeeResult={canSeeResult} onClose={() => setOpenId(null)} />
    </>
  );
}
