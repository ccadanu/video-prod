import { ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { JENIS_META, ROLE_LABEL, SLA_DAYS, canEditBrief, isWeekly, slaState, type BriefDetail } from '@ccp/shared';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { ApiError } from '../lib/api';
import { useBrief, useBriefMutations } from '../lib/briefApi';
import { fmtDate, fmtDateTime, fmtDurasi } from '../lib/format';
import { Button, Drawer, Field, JenisChip, StatusPill, Textarea } from './ui';
import { STATUS_META } from '@ccp/shared';

type Intent = 'revisi' | 'backlog' | null;

const REASON_COPY = {
  revisi: { title: 'Minta revisi', label: 'Apa yang perlu diperbaiki?', hint: 'Alasan tercatat di riwayat dan dilihat tim.', confirm: 'Kirim permintaan revisi', to: 'revisi' as const },
  backlog: { title: 'Kembalikan ke Backlog', label: 'Apa yang perlu dilengkapi User?', hint: 'User akan melihat alasan ini dan bisa memperbaiki brief.', confirm: 'Kembalikan ke Backlog', to: 'backlog' as const },
};

function Row({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_1fr] gap-2 border-b border-line-soft py-2 text-[13px] last:border-0">
      <dt className="text-muted">{k}</dt>
      <dd className="min-w-0 break-words font-medium">{children}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-faint">{title}</h3>
      {children}
    </section>
  );
}

export function BriefDrawer({ id, initialIntent, onClose }: { id: number | null; initialIntent?: Intent; onClose: () => void }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const { data: brief, isLoading, error } = useBrief(id);
  const { transition } = useBriefMutations();
  const [intent, setIntent] = useState<Intent>(initialIntent ?? null);
  const [reason, setReason] = useState('');

  const close = () => {
    setIntent(null);
    setReason('');
    transition.reset();
    onClose();
  };

  const isOwner = brief && user ? brief.requester.id === user.id : false;
  const err = transition.error instanceof ApiError ? transition.error.message : transition.error ? 'Terjadi kesalahan' : undefined;

  async function move(b: BriefDetail, to: 'complete' | 'revisi' | 'backlog' | 'antre_editing' | 'pending_review' | 'listing', why = '') {
    await transition.mutateAsync({ id: b.id, to, reason: why });
    setIntent(null);
    setReason('');
  }

  function actions(b: BriefDetail) {
    if (!user || user.role === 'admin') return null;
    if (b.status === 'in_review' && user.role === 'user' && isOwner) {
      return intent === 'revisi' ? null : (
        <>
          <Button variant="danger" full onClick={() => setIntent('revisi')}>Minta revisi</Button>
          <Button full disabled={transition.isPending} onClick={() => void move(b, 'complete').catch(() => undefined)}>Setujui</Button>
        </>
      );
    }
    if (b.status === 'pending_review' && user.role === 'leader') {
      return intent === 'backlog' ? null : (
        <>
          <Button variant="ghost" full onClick={() => setIntent('backlog')}>Kembalikan ke Backlog</Button>
          <Button full disabled={transition.isPending} onClick={() => void move(b, 'antre_editing').catch(() => undefined)}>Validasi · masuk antrean editing</Button>
        </>
      );
    }
    if (canEditBrief(user.role, isOwner, b.status)) {
      return <Button full onClick={() => nav(`/brief-order/${b.id}/ubah`)}>Perbaiki &amp; kirim ulang</Button>;
    }
    return null;
  }

  const backlogReason = brief?.status === 'backlog' ? [...brief.history].reverse().find((h) => h.to === 'backlog' && h.reason)?.reason : undefined;
  const revisiReason = brief?.status === 'revisi' ? [...brief.history].reverse().find((h) => h.to === 'revisi' && h.reason)?.reason : undefined;
  const sla = brief ? slaState(brief) : 'none';

  return (
    <Drawer
      open={id !== null}
      title={brief?.judul ?? 'Detail brief'}
      subtitle={brief ? `${brief.code} · ${brief.requester.name}${brief.requester.unit ? ` (${brief.requester.unit})` : ''}` : undefined}
      onClose={close}
      footer={brief ? actions(brief) : undefined}
    >
      {isLoading && <p className="text-[13px] text-faint">Memuat…</p>}
      {error && <p role="alert" className="text-[13px] text-danger">{error instanceof ApiError ? error.message : 'Gagal memuat'}</p>}
      {brief && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <StatusPill status={brief.status} />
            <JenisChip jenis={brief.jenis} />
            {brief.revisionCount > 0 && <span className="text-xs font-semibold text-danger">Revisi {brief.revisionCount}×</span>}
          </div>

          {(backlogReason || revisiReason) && (
            <p role="note" className="mb-4 rounded-lg border border-orange-500/40 bg-orange-100 px-3 py-2 text-[12.5px] text-orange-800">
              <b>{backlogReason ? 'Dikembalikan ke Backlog:' : 'Permintaan revisi:'}</b> {backlogReason ?? revisiReason}
            </p>
          )}

          {intent && user && (
            <form
              className="mb-5 rounded-xl border border-line bg-canvas p-3.5"
              onSubmit={(e) => {
                e.preventDefault();
                void move(brief, REASON_COPY[intent].to, reason.trim()).catch(() => undefined);
              }}
            >
              <h3 className="mb-2 text-[13px] font-bold">{REASON_COPY[intent].title}</h3>
              <Field label={REASON_COPY[intent].label} required hint={REASON_COPY[intent].hint} error={err}>
                {(fid) => <Textarea id={fid} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />}
              </Field>
              <div className="flex gap-2">
                <Button variant="ghost" size="sm" onClick={() => { setIntent(null); setReason(''); transition.reset(); }}>Batal</Button>
                <Button size="sm" type="submit" disabled={!reason.trim() || transition.isPending}>{REASON_COPY[intent].confirm}</Button>
              </div>
            </form>
          )}
          {!intent && err && <p role="alert" className="mb-4 text-[12.5px] text-danger">{err}</p>}

          <Section title="Brief">
            <dl>
              <Row k="Kategori">{brief.kategori}</Row>
              <Row k="Produk">{brief.produk}</Row>
              <Row k="Jenis pengerjaan">{JENIS_META[brief.jenis].label} <span className="font-normal text-muted">({isWeekly(brief.jenis) ? 'Weekly' : 'Daily'})</span></Row>
              <Row k="Rasio · Durasi">{brief.rasio} · {fmtDurasi(brief.durasiDetik)}</Row>
              <Row k="Naskah / brief">
                <a href={brief.linkDocs} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold text-brand-600 hover:underline">
                  Buka Google Docs <ExternalLink size={12} />
                </a>
              </Row>
              {brief.catatan && <Row k="Catatan">{brief.catatan}</Row>}
              <Row k="PIC">{brief.pic ?? <span className="font-normal text-faint">Belum di-assign</span>}</Row>
              <Row k="Submit">{fmtDateTime(brief.submittedAt)}</Row>
              <Row k="Target SLA">H+{SLA_DAYS[brief.jenis]} · {fmtDate(brief.slaTargetAt)}{sla === 'lewat' && <span className="ml-1.5 font-semibold text-danger">lewat target</span>}</Row>
              {brief.completedAt && <Row k="Selesai">{fmtDateTime(brief.completedAt)} <span className={sla === 'tepat' ? 'text-ok' : 'text-danger'}>({sla === 'tepat' ? 'tepat waktu' : 'telat'})</span></Row>}
            </dl>
          </Section>

          {brief.attributes && (
            <Section title="Atribut produksi (isian User)">
              <p className="mb-1.5 text-[11.5px] text-muted">Ekspektasi User. Videografer memvalidasi dan menyesuaikannya saat Locking.</p>
              <dl>
                <Row k="Talent">{brief.attributes.talent}</Row>
                <Row k="Kostum">{brief.attributes.kostum}</Row>
                <Row k="Lokasi">{brief.attributes.lokasi}{brief.attributes.lokasiDetail && ` — ${brief.attributes.lokasiDetail}`}</Row>
                <Row k="Properti">{brief.attributes.properti}</Row>
                <Row k="Kebutuhan desain">{brief.attributes.desain}</Row>
              </dl>
            </Section>
          )}

          <Section title="Riwayat">
            <ol className="flex flex-col">
              {[...brief.history].reverse().map((h, i, arr) => (
                <li key={`${h.at}-${i}`} className="relative flex gap-3 pb-3.5 text-[12.5px]">
                  {i < arr.length - 1 && <span aria-hidden="true" className="absolute left-[6px] top-4 -bottom-0.5 w-0.5 bg-line" />}
                  <span aria-hidden="true" className={`z-10 mt-0.5 h-3.5 w-3.5 flex-none rounded-full border-2 ${i === 0 ? 'border-brand-500 bg-brand-500' : 'border-line bg-white'}`} />
                  <div className="min-w-0">
                    <b className="font-semibold">{STATUS_META[h.to].label}</b>
                    <span className="block text-[11px] text-faint">{fmtDateTime(h.at)}{h.actorName && ` · ${h.actorName}`}</span>
                    {h.reason && <span className="mt-0.5 block text-muted">“{h.reason}”</span>}
                  </div>
                </li>
              ))}
            </ol>
          </Section>
          <p className="text-[11px] text-faint">Peran Anda: {user ? ROLE_LABEL[user.role] : '—'}</p>
        </>
      )}
    </Drawer>
  );
}
