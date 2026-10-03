import { ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { EDIT_COLUMN_META, REQUIRED_STEP, type EditCard, type EditColumn } from '@ccp/shared';
import { EditDetailDrawer, OriginChip, PriorityTag, SlaTag, fmtDay } from '../components/editing/parts';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge, Button, Card, Empty, Field, Input, JenisChip, Select, Textarea, cx } from '../components/ui';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useEditingMutations, useEditorBoard, useSchedule } from '../lib/editingApi';

const COLUMNS: EditColumn[] = ['todo', 'progress', 'review'];
const DOT: Record<EditColumn, string> = { todo: '#94A3B8', progress: '#6d45e0', review: '#E08A2B' };
const errText = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Terjadi kesalahan');

function Strip({ label, value, tone }: { label: string; value: number; tone?: 'warn' }) {
  return (
    <Card className="min-w-[120px] flex-1 px-4 py-3">
      <div className={cx('text-xl font-bold tracking-tight', tone === 'warn' && value > 0 && 'text-danger')}>{value}</div>
      <div className="mt-0.5 text-[11px] text-muted">{label}</div>
    </Card>
  );
}

/** Checklist langkah + kirim hasil ke In Review (hanya Editor pemilik tugas). */
function Workbench({ card, onStep, onSubmit, busy }: {
  card: EditCard;
  onStep: (key: string, done: boolean) => Promise<unknown>;
  onSubmit: (url: string, note: string) => Promise<unknown>;
  busy: boolean;
}) {
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const qcDone = card.steps.find((s) => s.key === REQUIRED_STEP)?.done === true;
  const done = card.steps.filter((s) => s.done).length;

  const guard = async (fn: () => Promise<unknown>) => {
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(errText(e));
    }
  };

  return (
    <section aria-label="Pengerjaan">
      <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-faint">Langkah editing · {done}/{card.steps.length}</h3>
      <ul className="mb-4 space-y-1">
        {card.steps.map((s) => (
          <li key={s.key}>
            <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-[13px] hover:bg-canvas">
              <input type="checkbox" checked={s.done} disabled={busy} onChange={(e) => void guard(() => onStep(s.key, e.target.checked))} className="h-4 w-4 accent-brand-600" />
              <span className={s.done ? 'text-muted line-through' : ''}>{s.label}</span>
              {s.key === REQUIRED_STEP && <span className="ml-auto text-[10px] font-semibold text-orange-800">wajib sebelum kirim</span>}
            </label>
          </li>
        ))}
      </ul>
      <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-faint">Kirim hasil ke In Review</h3>
      <Field label="Link hasil (Google Drive)" required hint="Setiap pengiriman menjadi versi baru; User mereview versi terbaru.">
        {(id) => <Input id={id} type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://drive.google.com/…" />}
      </Field>
      <Field label="Catatan untuk User (opsional)">
        {(id) => <Textarea id={id} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />}
      </Field>
      {error && <p role="alert" className="mb-3 text-[12.5px] text-danger">{error}</p>}
      <Button full disabled={!qcDone || !url.trim() || busy} onClick={() => void guard(async () => { await onSubmit(url.trim(), note.trim()); })}>
        Kirim ke In Review {card.versions.length > 0 ? `(v${card.versions.length + 1})` : '(v1)'}
      </Button>
      {!qcDone && <p className="mt-1.5 text-[11px] text-faint">Centang Self-QC dulu untuk mengaktifkan tombol kirim.</p>}
    </section>
  );
}

export function EditingExecution() {
  const { user } = useAuth();
  const isEditor = user?.role === 'editor';
  const [editorId, setEditorId] = useState<number | null>(null);
  const [openId, setOpenId] = useState<number | null>(null);
  const [actionError, setActionError] = useState('');
  const q = useEditorBoard(isEditor ? null : editorId);
  const editorsQ = useSchedule(!isEditor);
  const m = useEditingMutations();
  const board = q.data;
  const open = board?.cards.find((c) => c.id === openId) ?? null;

  const start = async (c: EditCard) => {
    setActionError('');
    try {
      await m.start.mutateAsync(c.id);
      if (c.status === 'revisi') setOpenId(c.id);
    } catch (e) {
      setActionError(errText(e));
    }
  };

  function renderCard(c: EditCard) {
    const total = c.steps.length;
    const done = c.steps.filter((s) => s.done).length;
    return (
      <article key={c.id} className={cx('rounded-[11px] border p-3 shadow-card', c.sla === 'telat' ? 'border-[#f0c7c1] bg-[#fffafa]' : 'border-line bg-white')}>
        <div className="mb-1 flex items-center justify-between gap-2">
          <span className="text-[10px] text-faint">{c.code}</span>
          <div className="flex items-center gap-1.5">
            {c.status === 'revisi' && <Badge tone="red" className="!text-[9.5px]">Revisi {c.revisionCount}×</Badge>}
            <PriorityTag priority={c.priority} />
            {c.column !== 'review' && <SlaTag sla={c.sla} />}
          </div>
        </div>
        <button onClick={() => setOpenId(c.id)} className="mb-2 block w-full text-left text-[13px] font-semibold leading-snug hover:text-brand-700 focus-visible:underline">{c.judul}</button>
        <div className="mb-2 flex flex-wrap gap-1"><JenisChip jenis={c.jenis} /><OriginChip origin={c.origin} /></div>
        <p className="text-[11px] text-muted">
          {c.produk} · {c.bobot === 'susah' ? 'Susah ×2' : 'Gampang'}
          {!isEditor && c.editorName && <> · <b className="text-ink">{c.editorName}</b></>}
        </p>
        {c.column !== 'review' && c.scheduledFor && (
          <p className="mt-1 text-[11px] text-muted">Mulai <b className="text-ink">{fmtDay(c.scheduledFor)}</b> · tenggat <b className="text-ink">{c.dueDate ? fmtDay(c.dueDate) : '—'}</b></p>
        )}
        {c.revisionReason && <p className="mt-2 rounded-md bg-[#fbe4e1] px-2 py-1.5 text-[10.5px] text-[#b03a2e]">Revisi: {c.revisionReason}</p>}
        {c.column === 'progress' && (
          <div className="mt-2">
            <div className="h-[5px] overflow-hidden rounded bg-[#e7ecf0]" role="progressbar" aria-label={`Langkah selesai ${c.judul}`} aria-valuenow={done} aria-valuemin={0} aria-valuemax={total}>
              <div className="h-full rounded bg-brand-500" style={{ width: `${(done / total) * 100}%` }} />
            </div>
            <p className="mt-1 text-[10.5px] text-faint">{done}/{total} langkah</p>
          </div>
        )}
        {c.column === 'review' && c.versions.length > 0 && (
          <p className="mt-2 rounded-md bg-canvas px-2 py-1.5 text-[10.5px] text-muted">
            v{c.versions.at(-1)!.version} terkirim · menunggu keputusan User{' '}
            <a href={c.versions.at(-1)!.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 font-semibold text-brand-600 hover:underline">buka <ExternalLink size={10} /></a>
          </p>
        )}
        {isEditor && c.column === 'todo' && <Button size="sm" full className="mt-2.5" disabled={m.start.isPending} onClick={() => void start(c)}>{c.status === 'revisi' ? '▶ Mulai Revisi' : '▶ Mulai Edit'}</Button>}
        {isEditor && c.column === 'progress' && <Button size="sm" full className="mt-2.5" onClick={() => setOpenId(c.id)}>Buka & kirim hasil</Button>}
      </article>
    );
  }

  const cardsIn = (col: EditColumn) => board?.cards.filter((c) => c.column === col) ?? [];
  const editors = editorsQ.data?.editors ?? [];

  return (
    <>
      <PageHeader
        title="Editing Execution"
        subtitle={isEditor ? 'Tugas editing Anda: To Do → On Progress → In Review.' : 'Mode baca: pantau pengerjaan editing oleh Video Editor.'}
        actions={
          !isEditor && (
            <>
              <label className="sr-only" htmlFor="edit-editor">Editor</label>
              <Select id="edit-editor" className="!w-auto !py-1.5 !text-[13px]" value={editorId ?? ''} onChange={(e) => setEditorId(e.target.value ? Number(e.target.value) : null)}>
                <option value="">Semua editor</option>
                {editors.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </Select>
            </>
          )
        }
      />
      <div className="px-7 pb-8">
        {q.isLoading && <p className="py-10 text-center text-[13px] text-faint">Memuat tugas…</p>}
        {q.isError && <p role="alert" className="py-10 text-center text-[13px] text-danger">{errText(q.error)}</p>}
        {board && (
          <>
            <div className="mb-3 flex flex-wrap gap-3">
              <Strip label="To Do" value={board.summary.todo} />
              <Strip label="On Progress" value={board.summary.progress} />
              <Strip label="In Review" value={board.summary.review} />
              <Strip label="Lewat tenggat" value={board.summary.telat} tone="warn" />
            </div>
            {actionError && <p role="alert" className="mb-3 rounded-lg border border-[#f0c7c1] bg-[#fdf1ef] px-3 py-2 text-[12.5px] text-danger">{actionError}</p>}
            <div className="flex h-[calc(100vh-300px)] min-h-[420px] gap-3.5 overflow-x-auto pb-2">
              {COLUMNS.map((col) => {
                const cards = cardsIn(col);
                return (
                  <section key={col} aria-label={EDIT_COLUMN_META[col].title} className="flex min-h-0 w-[300px] flex-none flex-col">
                    <header className="flex items-center gap-2 px-1 pb-2.5 pt-1">
                      <span aria-hidden="true" className="h-[9px] w-[9px] rounded-full" style={{ background: DOT[col] }} />
                      <b className="text-[13px]">{EDIT_COLUMN_META[col].title}</b>
                      <span className="rounded-full bg-[#e7ecf0] px-2 text-[11px] text-muted">{cards.length}</span>
                      <span className="ml-auto text-[10px] text-faint">{EDIT_COLUMN_META[col].hint}</span>
                    </header>
                    <div className="flex flex-1 flex-col gap-2.5 overflow-y-auto p-0.5 pb-8">
                      {cards.length === 0 ? <Empty>— kosong —</Empty> : cards.map(renderCard)}
                    </div>
                  </section>
                );
              })}
            </div>
          </>
        )}
      </div>

      <EditDetailDrawer card={open} onClose={() => setOpenId(null)}>
        {open && isEditor && open.column === 'progress' && (
          <Workbench
            key={open.id}
            card={open}
            busy={m.step.isPending || m.submit.isPending}
            onStep={(key, done) => m.step.mutateAsync({ id: open.id, key, done })}
            onSubmit={async (url, note) => {
              await m.submit.mutateAsync({ id: open.id, input: { url, note } });
              setOpenId(null);
            }}
          />
        )}
      </EditDetailDrawer>
    </>
  );
}
