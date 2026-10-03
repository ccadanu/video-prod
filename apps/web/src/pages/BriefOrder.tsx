import { Archive, CheckCircle2, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { SLA_DAYS, slaState, type BriefFilter, type BriefListItem } from '@ccp/shared';
import { BriefDrawer } from '../components/BriefDrawer';
import { PageHeader } from '../components/layout/PageHeader';
import { Button, Card, Empty, JenisChip, Segmented, StatusPill, cx } from '../components/ui';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { useBriefMutations, useBriefs, useDraftQuery } from '../lib/briefApi';
import { fmtDate } from '../lib/format';

const FILTERS = [
  { value: 'all', label: 'Semua' },
  { value: 'aktif', label: 'Aktif' },
  { value: 'review', label: 'Perlu Review' },
  { value: 'selesai', label: 'Selesai' },
] as const satisfies readonly { value: BriefFilter; label: string }[];

function SlaCell({ b }: { b: BriefListItem }) {
  const s = slaState(b);
  if (s === 'tepat') return <span className="font-semibold text-ok">Tepat waktu</span>;
  if (s === 'telat') return <span className="font-semibold text-danger">Telat</span>;
  if (s === 'lewat') return <span className="font-semibold text-danger">Lewat target</span>;
  return <span className="text-faint">—</span>;
}

const TH = 'whitespace-nowrap px-3 py-2.5 text-left text-xs font-semibold text-muted';
const TD = 'whitespace-nowrap px-3 py-2.5';

export function BriefOrder({ archive = false }: { archive?: boolean }) {
  const { user } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const [filter, setFilter] = useState<BriefFilter>(archive ? 'selesai' : 'all');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState<{ id: number; intent?: 'revisi' } | null>(null);
  const [notice, setNotice] = useState<{ code: string; status: string } | null>(
    (location.state as { created?: { code: string; status: string } } | null)?.created ?? null,
  );

  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => {
    // Hapus state navigasi agar banner tidak muncul lagi saat dimuat ulang.
    if (location.state) nav(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, nav]);

  const isRequester = user?.role === 'user';
  const briefs = useBriefs(filter, q);
  const draft = useDraftQuery(isRequester && !archive);
  const { transition } = useBriefMutations();

  const filterLabel = FILTERS.find((f) => f.value === filter)?.label.toLowerCase();

  return (
    <>
      <PageHeader
        title={archive ? 'Arsip Konten' : 'Brief Order'}
        subtitle={
          archive
            ? 'Brief yang sudah disetujui dan selesai.'
            : isRequester
              ? 'Buat brief, pantau status tiap konten, dan review hasil saat In Review.'
              : 'Semua brief lintas pemohon. Validasi brief Daily dari sini.'
        }
        actions={
          archive ? (
            <Button variant="ghost" onClick={() => nav('/brief-order')}>← Kembali ke Brief Order</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => nav('/brief-order/arsip')}><Archive size={15} /> Arsip Konten</Button>
              {isRequester && <Button onClick={() => nav('/brief-order/baru')}><Plus size={15} /> Buat Brief Baru</Button>}
            </>
          )
        }
      />

      <div className="px-7 pb-8 pt-2">
        {notice && (
          <p role="status" className="mb-3 flex items-start gap-2 rounded-lg border border-[#b7e0c4] bg-[#e5f5ea] px-3.5 py-2.5 text-[13px] text-[#15803d]">
            <CheckCircle2 size={16} className="mt-0.5 flex-none" />
            <span>
              Brief <b>{notice.code}</b> terkirim. Status: <b>{notice.status}</b>.
              <button onClick={() => setNotice(null)} className="ml-2 underline">Tutup</button>
            </span>
          </p>
        )}
        {draft.data && (
          <p role="note" className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-orange-500/40 bg-orange-100 px-3.5 py-2.5 text-[13px] text-orange-800">
            Anda punya draf brief yang belum dikirim.
            <Link to="/brief-order/baru" className="font-semibold underline">Lanjutkan draf</Link>
          </p>
        )}

        <div className="mb-3 flex flex-wrap items-center gap-2.5">
          {!archive && <Segmented label="Filter brief" value={filter} onChange={setFilter} options={FILTERS} />}
          <div className="flex-1" />
          <label className="sr-only" htmlFor="brief-search">Cari brief</label>
          <input
            id="brief-search"
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari judul / kode / produk…"
            className="w-60 rounded-[9px] border border-line bg-white px-3 py-2 text-[13px] focus:border-brand-500 focus:outline-none"
          />
        </div>

        <Card className="overflow-x-auto">
          <table className="w-full text-[12.5px]">
            <thead>
              <tr className="border-b border-line bg-canvas">
                {['Code', 'Status', 'Judul / Campaign', 'Jenis Pengerjaan', 'Rasio', 'PIC', 'Submit', 'SLA Target', 'Konten Jadi', 'SLA', 'Aksi'].map((h) => (
                  <th key={h} className={TH}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {briefs.isLoading && <tr><td colSpan={11} className="px-3 py-8 text-center text-faint">Memuat…</td></tr>}
              {briefs.isError && (
                <tr><td colSpan={11} className="px-3 py-8 text-center text-danger">{briefs.error instanceof ApiError ? briefs.error.message : 'Gagal memuat'}</td></tr>
              )}
              {briefs.data?.map((b) => {
                const canReview = b.status === 'in_review' && isRequester;
                return (
                  <tr key={b.id} onClick={() => setOpen({ id: b.id })} className="cursor-pointer border-b border-line-soft last:border-0 hover:bg-brand-50/50">
                    <td className={cx(TD, 'text-[11.5px] text-muted')}>{b.code}</td>
                    <td className={TD}><StatusPill status={b.status} /></td>
                    <td className={cx(TD, 'max-w-[260px] truncate font-semibold')} title={b.judul}>
                      <button className="max-w-full truncate text-left font-semibold hover:text-brand-700 focus-visible:underline" onClick={(e) => { e.stopPropagation(); setOpen({ id: b.id }); }}>
                        {b.judul}
                      </button>
                      {b.revisionCount > 0 && <span className="ml-1.5 text-[10px] font-bold text-danger">Rev {b.revisionCount}×</span>}
                      {!isRequester && <span className="block text-[11px] font-normal text-faint">{b.requester.name}{b.requester.unit && ` · ${b.requester.unit}`}</span>}
                    </td>
                    <td className={TD}><JenisChip jenis={b.jenis} /></td>
                    <td className={TD}>{b.rasio}</td>
                    <td className={TD}>{b.pic ?? <span className="text-faint">belum</span>}</td>
                    <td className={TD}>{fmtDate(b.submittedAt)}</td>
                    <td className={TD}>H+{SLA_DAYS[b.jenis]}</td>
                    <td className={TD}>{fmtDate(b.completedAt)}</td>
                    <td className={TD}><SlaCell b={b} /></td>
                    <td className={TD} onClick={(e) => e.stopPropagation()}>
                      {canReview ? (
                        <span className="inline-flex gap-1.5">
                          <button
                            disabled={transition.isPending}
                            onClick={() => transition.mutate({ id: b.id, to: 'complete' })}
                            className="rounded-md bg-[#e5f5ea] px-2.5 py-1 text-[11px] font-semibold text-[#15803d] hover:bg-[#d5eedd] disabled:opacity-50"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => setOpen({ id: b.id, intent: 'revisi' })}
                            className="rounded-md bg-orange-100 px-2.5 py-1 text-[11px] font-semibold text-orange-800 hover:bg-[#ffe6c2]"
                          >
                            Revisi
                          </button>
                        </span>
                      ) : b.status === 'pending_review' && user?.role === 'leader' ? (
                        <button onClick={() => setOpen({ id: b.id })} className="rounded-md bg-brand-50 px-2.5 py-1 text-[11px] font-semibold text-brand-700 hover:bg-brand-100">Validasi</button>
                      ) : (
                        <span className="text-faint">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {briefs.data?.length === 0 && (
            <div className="p-4">
              <Empty>
                {q
                  ? `Tidak ada brief yang cocok dengan “${q}”.`
                  : archive || filter !== 'all'
                    ? `Belum ada brief ${archive ? 'selesai' : filterLabel}.`
                    : isRequester
                      ? 'Belum ada brief. Mulai dengan “Buat Brief Baru”.'
                      : 'Belum ada brief masuk.'}
              </Empty>
            </div>
          )}
        </Card>
        {transition.isError && (
          <p role="alert" className="mt-2 text-[12.5px] text-danger">{transition.error instanceof ApiError ? transition.error.message : 'Terjadi kesalahan'}</p>
        )}
        <p className="mt-2.5 text-[11.5px] text-faint">
          {isRequester ? <>Status <b>In Review</b>: Approve atau minta revisi langsung dari tabel.</> : <>Klik baris untuk melihat detail dan riwayat.</>}
        </p>
      </div>

      <BriefDrawer key={open ? `${open.id}-${open.intent ?? ''}` : 'none'} id={open?.id ?? null} initialIntent={open?.intent ?? null} onClose={() => setOpen(null)} />
    </>
  );
}
