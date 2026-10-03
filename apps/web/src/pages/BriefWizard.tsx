import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import {
  JENIS,
  JENIS_META,
  KATEGORI,
  LOKASI_OPTIONS,
  PRODUK_SUGGESTIONS,
  RASIO,
  STATUS_META,
  SLA_DAYS,
  briefInputSchema,
  canEditBrief,
  isWeekly,
  type BriefDetail,
  type Jenis,
} from '@ccp/shared';
import { PageHeader } from '../components/layout/PageHeader';
import { Button, Card, Field, Input, Select, Stepper, Textarea, cx, type StepState } from '../components/ui';
import { api, ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useBrief, useBriefMutations, useDraftQuery } from '../lib/briefApi';

interface Form {
  kategori: string;
  jenis: Jenis;
  produk: string;
  judul: string;
  rasio: string;
  durasi: string;
  linkDocs: string;
  catatan: string;
  talent: string;
  kostum: string;
  lokasi: string;
  lokasiDetail: string;
  properti: string;
  desain: string;
}

const EMPTY: Form = {
  kategori: 'Talking Head', jenis: 'shooting_edit', produk: '', judul: '', rasio: '9:16', durasi: '', linkDocs: '', catatan: '',
  talent: '', kostum: '', lokasi: '', lokasiDetail: '', properti: '', desain: '',
};

const STEPS = ['Identitas', 'Jenis & Pengerjaan', 'Atribut Produksi', 'Brief (Docs) & Review'] as const;
/** Kolom hasil validasi yang dimiliki tiap langkah. */
const STEP_FIELDS: Record<number, (path: string) => boolean> = {
  1: () => false,
  2: (p) => p === 'kategori' || p === 'jenis',
  3: (p) => p.startsWith('attributes'),
  4: (p) => ['produk', 'judul', 'rasio', 'durasiDetik', 'linkDocs', 'catatan'].includes(p),
};

function toInput(f: Form) {
  const weekly = isWeekly(f.jenis);
  return {
    jenis: f.jenis, kategori: f.kategori, produk: f.produk, judul: f.judul, rasio: f.rasio,
    durasiDetik: f.durasi.trim() === '' ? null : Number(f.durasi),
    linkDocs: f.linkDocs, catatan: f.catatan,
    attributes: weekly ? { talent: f.talent, kostum: f.kostum, lokasi: f.lokasi, lokasiDetail: f.lokasiDetail, properti: f.properti, desain: f.desain } : null,
  };
}

function fromDetail(b: BriefDetail): Form {
  const a = b.attributes;
  return {
    kategori: b.kategori, jenis: b.jenis, produk: b.produk, judul: b.judul, rasio: b.rasio, durasi: b.durasiDetik?.toString() ?? '',
    linkDocs: b.linkDocs, catatan: b.catatan,
    talent: a?.talent ?? '', kostum: a?.kostum ?? '', lokasi: a?.lokasi ?? '', lokasiDetail: a?.lokasiDetail ?? '', properti: a?.properti ?? '', desain: a?.desain ?? '',
  };
}

/** Pulihkan draf dari server hanya untuk kolom yang dikenal dan bertipe string. */
function fromDraft(data: Record<string, unknown>): { form: Form; step: number } {
  const form = { ...EMPTY };
  for (const k of Object.keys(EMPTY) as (keyof Form)[]) {
    const v = data[k];
    if (typeof v === 'string') (form[k] as string) = v;
  }
  if (!(JENIS as readonly string[]).includes(form.jenis)) form.jenis = EMPTY.jenis;
  const step = typeof data.step === 'number' && data.step >= 1 && data.step <= 4 ? data.step : 1;
  return { form, step };
}

type Save = 'idle' | 'saving' | 'saved' | 'error';

export function BriefWizard({ mode }: { mode: 'new' | 'edit' }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const params = useParams();
  const editId = mode === 'edit' ? Number(params.id) : null;
  const edit = useBrief(editId !== null && Number.isInteger(editId) ? editId : null);
  const draft = useDraftQuery(mode === 'new');
  const { create, update, transition } = useBriefMutations();

  const [form, setForm] = useState<Form>(EMPTY);
  const [step, setStep] = useState(1);
  const [attempted, setAttempted] = useState<Set<number>>(new Set());
  const [save, setSave] = useState<Save>('idle');
  const [restored, setRestored] = useState(false);
  const loaded = useRef(false);
  const dirty = useRef(false);
  // Saat mengirim, status brief berubah dan penjaga halaman akan mengalihkan tanpa banner konfirmasi.
  const submitting = useRef(false);

  // Muat draf (baru) atau brief (ubah) sekali.
  useEffect(() => {
    if (loaded.current) return;
    if (mode === 'new' && draft.isFetched) {
      loaded.current = true;
      if (draft.data) {
        const r = fromDraft(draft.data.data);
        setForm(r.form);
        setStep(r.step);
        setRestored(true);
      }
    }
    if (mode === 'edit' && edit.data) {
      loaded.current = true;
      setForm(fromDetail(edit.data));
      setStep(2);
    }
  }, [mode, draft.isFetched, draft.data, edit.data]);

  const patch = (p: Partial<Form>) => {
    dirty.current = true;
    setForm((f) => ({ ...f, ...p }));
  };

  // Auto-save draf (hanya saat membuat baru).
  useEffect(() => {
    if (mode !== 'new' || !loaded.current || !dirty.current) return;
    setSave('saving');
    const t = setTimeout(() => {
      api('/api/briefs/draft/me', { method: 'PUT', body: { data: { ...form, step } } })
        .then(() => setSave('saved'))
        .catch(() => setSave('error'));
    }, 900);
    return () => clearTimeout(t);
  }, [form, step, mode]);

  const weekly = isWeekly(form.jenis);
  const result = useMemo(() => briefInputSchema.safeParse(toInput(form)), [form]);
  const errors = useMemo(() => {
    const m = new Map<string, string>();
    if (!result.success) for (const i of result.error.issues) if (!m.has(i.path.join('.'))) m.set(i.path.join('.'), i.message);
    return m;
  }, [result]);

  const stepErrors = (s: number) => [...errors.keys()].filter(STEP_FIELDS[s]!);
  const err = (path: string, s: number) => (attempted.has(s) ? errors.get(path) : undefined);
  const nextOf = (s: number) => (s === 2 && !weekly ? 4 : s + 1);
  const prevOf = (s: number) => (s === 4 && !weekly ? 2 : s - 1);

  function go(dir: 1 | -1) {
    if (dir === 1) {
      if (stepErrors(step).length > 0) return setAttempted((a) => new Set(a).add(step));
      setStep(nextOf(step));
    } else if (step === (mode === 'edit' ? 2 : 1)) {
      nav('/brief-order');
    } else {
      setStep(prevOf(step));
    }
  }

  async function submit() {
    setAttempted(new Set([2, 3, 4]));
    if (!result.success) {
      const first = [2, 3, 4].find((s) => stepErrors(s).length > 0);
      if (first) setStep(first);
      return;
    }
    submitting.current = true;
    try {
      if (mode === 'edit' && edit.data) {
        const b = await update.mutateAsync({ id: edit.data.id, input: result.data });
        const sent = await transition.mutateAsync({ id: b.id, to: isWeekly(b.jenis) ? 'listing' : 'pending_review' });
        nav('/brief-order', { state: { created: { code: sent.code, status: STATUS_META[sent.status].label } } });
      } else {
        const b = await create.mutateAsync(result.data);
        nav('/brief-order', { state: { created: { code: b.code, status: STATUS_META[b.status].label } } });
      }
    } catch {
      submitting.current = false; // galat ditampilkan dari state mutasi
    }
  }

  if (user && user.role !== 'user') return <Navigate to="/brief-order" replace />;
  if (mode === 'edit' && !submitting.current) {
    if (edit.isError) return <Navigate to="/brief-order" replace />;
    if (edit.data && user && !canEditBrief(user.role, edit.data.requester.id === user.id, edit.data.status)) return <Navigate to="/brief-order" replace />;
  }

  const stepper = STEPS.map((label, i) => {
    const n = i + 1;
    const state: StepState = n < step ? 'done' : n === step ? 'current' : 'todo';
    const muted = n === 3 && !weekly;
    return { label: muted ? `${label} (Daily: lewati)` : label, state, muted };
  });
  const submitError = [create, update, transition].map((m) => m.error).find(Boolean);
  const busy = create.isPending || update.isPending || transition.isPending;
  const lockJenis = mode === 'edit';

  return (
    <>
      <PageHeader
        title={mode === 'edit' ? 'Perbaiki Brief' : 'Buat Brief Baru'}
        subtitle={mode === 'edit' && edit.data ? `${edit.data.code} · lengkapi sesuai catatan, lalu kirim ulang.` : undefined}
        actions={
          <>
            {mode === 'new' && (
              <span role="status" className="text-xs text-ok">
                {save === 'saving' ? <span className="text-faint">Menyimpan draf…</span> : save === 'saved' ? '✓ Draf tersimpan otomatis' : save === 'error' ? <span className="text-danger">Draf gagal tersimpan</span> : null}
              </span>
            )}
            <Button variant="ghost" size="sm" onClick={() => nav('/brief-order')}>Tutup</Button>
          </>
        }
      />
      <div className="mx-auto max-w-[860px] px-7 pb-10 pt-3">
        <nav aria-label="Langkah" className="mb-6"><Stepper steps={stepper} /></nav>

        {restored && (
          <p role="note" className="mb-3 flex flex-wrap items-center gap-3 rounded-lg bg-brand-50 px-3.5 py-2 text-[12.5px] text-brand-800">
            Melanjutkan draf Anda yang tersimpan.
            <button
              className="font-semibold underline"
              onClick={() => {
                dirty.current = true;
                setForm(EMPTY);
                setStep(1);
                setAttempted(new Set());
                setRestored(false);
              }}
            >
              Mulai dari awal
            </button>
          </p>
        )}
        {mode === 'edit' && edit.data && [...edit.data.history].reverse().find((h) => h.to === 'backlog' && h.reason) && (
          <p role="note" className="mb-3 rounded-lg border border-orange-500/40 bg-orange-100 px-3.5 py-2 text-[12.5px] text-orange-800">
            <b>Catatan pengembalian:</b> {[...edit.data.history].reverse().find((h) => h.to === 'backlog' && h.reason)?.reason}
          </p>
        )}

        <Card className="p-7">
          {step === 1 && (
            <>
              <h2 className="text-[17px] font-bold">Langkah 1: Identitas pemohon</h2>
              <p className="mb-5 mt-1 text-[12.5px] text-muted">Otomatis dari profil Anda.</p>
              <div className="grid gap-x-4 sm:grid-cols-2">
                <Field label="Nama">{(id) => <Input id={id} readOnly value={user?.name ?? ''} />}</Field>
                <Field label="Unit / Divisi">{(id) => <Input id={id} readOnly value={user?.unit || '—'} />}</Field>
              </div>
              <Field label="Role / Jabatan">{(id) => <Input id={id} readOnly value={user?.jabatan || '—'} />}</Field>
              <p className="rounded-lg bg-brand-50 px-3 py-2.5 text-xs text-brand-800">Data unit dan jabatan berasal dari profil. Jika belum sesuai, hubungi admin.</p>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="text-[17px] font-bold">Langkah 2: Jenis konten &amp; jenis pengerjaan</h2>
              <p className="mb-5 mt-1 text-[12.5px] text-muted">Penentu jalur produksi: perlu syuting atau tidak.</p>
              <Field label="Kategori Konten" required error={err('kategori', 2)}>
                {(id) => (
                  <Select id={id} value={form.kategori} onChange={(e) => patch({ kategori: e.target.value })}>
                    {KATEGORI.map((k) => <option key={k}>{k}</option>)}
                  </Select>
                )}
              </Field>
              <fieldset className="mb-4">
                <legend className="mb-1.5 text-[12.5px] font-semibold">Jenis Pengerjaan CCP<span className="ml-0.5 text-danger" aria-hidden="true">*</span></legend>
                <div role="radiogroup" className="grid gap-2.5 sm:grid-cols-2">
                  {JENIS.map((j) => {
                    const on = form.jenis === j;
                    const w = isWeekly(j);
                    return (
                      <button
                        key={j}
                        type="button"
                        role="radio"
                        aria-checked={on}
                        disabled={lockJenis && !on}
                        onClick={() => patch({ jenis: j })}
                        className={cx(
                          'rounded-[10px] border p-3 text-left text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                          on ? 'border-brand-500 bg-brand-50' : 'border-line bg-white hover:border-brand-300',
                        )}
                      >
                        <span className={cx('float-right rounded px-1.5 text-[9.5px] font-bold', w ? 'bg-orange-100 text-orange-800' : 'bg-line-soft text-muted')}>
                          {w ? 'Weekly · syuting' : 'Daily'}
                        </span>
                        <span className="block font-semibold">{JENIS_META[j].label}</span>
                        <span className="mt-0.5 block text-[11px] text-muted">
                          {w ? 'Masuk Weekly Listing → Videografer' : 'Validasi Leader → Video Editor'} · target H+{SLA_DAYS[j]}
                        </span>
                      </button>
                    );
                  })}
                </div>
                {lockJenis && <p className="mt-1.5 text-[11px] text-faint">Jenis pengerjaan tidak bisa diubah. Buat brief baru bila jalurnya berbeda.</p>}
              </fieldset>
              <p className={cx('rounded-lg px-3 py-2.5 text-xs', weekly ? 'bg-orange-100 text-orange-800' : 'bg-brand-50 text-brand-800')}>
                {weekly ? (
                  <><b>Perlu syuting.</b> Langkah berikutnya meminta Atribut Produksi (talent, kostum, lokasi, properti, kebutuhan desain). Videografer memvalidasinya saat Locking.</>
                ) : (
                  <><b>Tanpa syuting.</b> Langkah Atribut Produksi dilewati. Setelah dikirim, Leader memvalidasi brief sebelum masuk antrean editing.</>
                )}
              </p>
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="text-[17px] font-bold">Langkah 3: Atribut produksi</h2>
              <p className="mb-4 mt-1 text-[12.5px] text-muted">Ini <b>ekspektasi</b> Anda. Videografer memvalidasi dan menyesuaikannya ke kondisi lapangan saat Locking.</p>
              <p className="mb-4 rounded-lg bg-orange-100 px-3 py-2.5 text-xs text-orange-800">Semua kolom wajib diisi untuk konten yang perlu syuting.</p>
              <Field label="Talent / Pengisi" required error={err('attributes.talent', 3)} hint="Boleh preferensi (cewek muda / ibu-ibu) atau nama bila sudah pasti. Videografer yang memfinalkan.">
                {(id) => <Input id={id} value={form.talent} onChange={(e) => patch({ talent: e.target.value })} placeholder="mis. Cewek muda / Ibu-ibu / dr. Aji" maxLength={120} />}
              </Field>
              <div className="grid gap-x-4 sm:grid-cols-2">
                <Field label="Kostum / Wardrobe" required error={err('attributes.kostum', 3)}>
                  {(id) => <Input id={id} value={form.kostum} onChange={(e) => patch({ kostum: e.target.value })} placeholder="mis. Casual / Formal / Daster" maxLength={120} />}
                </Field>
                <Field label="Lokasi" required error={err('attributes.lokasi', 3)}>
                  {(id) => (
                    <Select id={id} value={form.lokasi} onChange={(e) => patch({ lokasi: e.target.value })}>
                      <option value="">— pilih lokasi —</option>
                      {LOKASI_OPTIONS.map((l) => <option key={l}>{l}</option>)}
                    </Select>
                  )}
                </Field>
              </div>
              {form.lokasi === 'Lainnya' && (
                <Field label="Sebutkan lokasi" required error={err('attributes.lokasiDetail', 3)}>
                  {(id) => <Input id={id} value={form.lokasiDetail} onChange={(e) => patch({ lokasiDetail: e.target.value })} placeholder="mis. Rumah talent di Sleman" maxLength={200} />}
                </Field>
              )}
              <Field label="Properti" required error={err('attributes.properti', 3)} hint="Sebutkan properti yang dibutuhkan. Videografer menandai mana yang perlu dibeli (tindak lanjut Leader).">
                {(id) => <Textarea id={id} value={form.properti} onChange={(e) => patch({ properti: e.target.value })} placeholder="mis. Box produk, uang prop, gelas, teko keramik" maxLength={500} />}
              </Field>
              <Field label="Kebutuhan Desain" required error={err('attributes.desain', 3)}>
                {(id) => <Textarea id={id} value={form.desain} onChange={(e) => patch({ desain: e.target.value })} placeholder="mis. Frame design, overlay grafis, atau “tidak ada”" maxLength={500} />}
              </Field>
            </>
          )}

          {step === 4 && (
            <>
              <h2 className="text-[17px] font-bold">Langkah 4: Brief (Docs) &amp; review</h2>
              <p className="mb-5 mt-1 text-[12.5px] text-muted">Lampirkan link brief Google Docs (naskah, VO, arahan), lalu periksa ringkasan.</p>
              <div className="grid gap-x-4 sm:grid-cols-2">
                <Field label="Judul Konten / Campaign" required error={err('judul', 4)}>
                  {(id) => <Input id={id} value={form.judul} onChange={(e) => patch({ judul: e.target.value })} placeholder="mis. Promo 9.9 Fitgrains" maxLength={150} />}
                </Field>
                <Field label="Produk" required error={err('produk', 4)}>
                  {(id) => (
                    <>
                      <Input id={id} list="produk-list" value={form.produk} onChange={(e) => patch({ produk: e.target.value })} placeholder="mis. FITGRAINS" maxLength={80} />
                      <datalist id="produk-list">{PRODUK_SUGGESTIONS.map((p) => <option key={p} value={p} />)}</datalist>
                    </>
                  )}
                </Field>
                <Field label="Rasio" required error={err('rasio', 4)}>
                  {(id) => (
                    <Select id={id} value={form.rasio} onChange={(e) => patch({ rasio: e.target.value })}>
                      {RASIO.map((r) => <option key={r}>{r}</option>)}
                    </Select>
                  )}
                </Field>
                <Field label={form.jenis === 'photoshoot' ? 'Durasi (detik, opsional)' : 'Durasi (detik)'} required={form.jenis !== 'photoshoot'} error={err('durasiDetik', 4)}>
                  {(id) => <Input id={id} type="number" inputMode="numeric" min={1} max={3600} value={form.durasi} onChange={(e) => patch({ durasi: e.target.value })} placeholder="mis. 60" />}
                </Field>
              </div>
              <Field label="Link Brief (Google Docs)" required error={err('linkDocs', 4)} hint="Isi naratif (naskah, VO, referensi) ada di Docs. Pastikan akses dibuka untuk tim.">
                {(id) => <Input id={id} type="url" value={form.linkDocs} onChange={(e) => patch({ linkDocs: e.target.value })} placeholder="https://docs.google.com/document/d/…" maxLength={500} />}
              </Field>
              <Field label="Deadline / Catatan (opsional)" error={err('catatan', 4)}>
                {(id) => <Textarea id={id} value={form.catatan} onChange={(e) => patch({ catatan: e.target.value })} placeholder="Catatan tambahan" maxLength={1000} />}
              </Field>

              <h3 className="mb-1 mt-5 text-[11px] font-bold uppercase tracking-wider text-faint">Ringkasan</h3>
              <dl className="text-[13px]">
                {[
                  ['Kategori', form.kategori],
                  ['Jenis Pengerjaan', JENIS_META[form.jenis].label],
                  ...(weekly
                    ? [['Talent', form.talent], ['Kostum', form.kostum], ['Lokasi', form.lokasi === 'Lainnya' ? `Lainnya: ${form.lokasiDetail}` : form.lokasi], ['Properti', form.properti], ['Kebutuhan Desain', form.desain]]
                    : []),
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-6 border-b border-line-soft py-2">
                    <dt className="text-muted">{k}</dt>
                    <dd className="max-w-[60%] break-words text-right font-medium">{v || '—'}</dd>
                  </div>
                ))}
              </dl>
              <p className="mt-4 rounded-lg bg-brand-50 px-3 py-2.5 text-xs text-brand-800">
                {weekly ? (
                  <>Setelah dikirim, status menjadi <b>Listing (To Do)</b> dan konten masuk <b>Weekly Listing</b> untuk Locking oleh Videografer.</>
                ) : (
                  <>Setelah dikirim, status menjadi <b>Pending Review</b> sampai Leader memvalidasi, lalu masuk antrean editing.</>
                )}
              </p>
              {submitError && (
                <p role="alert" className="mt-3 text-[12.5px] text-danger">
                  {submitError instanceof ApiError ? submitError.message : 'Terjadi kesalahan'}
                </p>
              )}
            </>
          )}
        </Card>

        <div className="mt-5 flex items-center">
          <Button variant="ghost" onClick={() => go(-1)}>{step === (mode === 'edit' ? 2 : 1) ? 'Batal' : '← Kembali'}</Button>
          <span className="flex-1 text-center text-xs text-muted">Langkah {step} dari {STEPS.length}</span>
          {step < 4 ? (
            <Button onClick={() => go(1)}>Lanjut →</Button>
          ) : (
            <Button disabled={busy} onClick={() => void submit()}>
              {busy ? 'Mengirim…' : mode === 'edit' ? 'Kirim Ulang Brief' : 'Kirim Brief'}
            </Button>
          )}
        </div>
      </div>
    </>
  );
}
