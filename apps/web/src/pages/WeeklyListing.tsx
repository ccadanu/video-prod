import { Boxes, CheckCircle2, Lock } from 'lucide-react';
import { useState } from 'react';
import { DAY_NAMES, productionWeekFor, todayJakarta, type ContentPatch, type DayInfo, type SdmItem, type WeeklyContent } from '@ccp/shared';
import { ContentDrawer } from '../components/weekly/ContentDrawer';
import { DocDrawer, type DocAsk } from '../components/weekly/DocDrawer';
import { LockingTable } from '../components/weekly/LockingTable';
import { ReasonDrawer, type ReasonAsk } from '../components/weekly/ReasonDrawer';
import { ScheduleBoard } from '../components/weekly/ScheduleBoard';
import { SdmDrawer } from '../components/weekly/SdmDrawer';
import { WeekPicker } from '../components/weekly/WeekPicker';
import { PageHeader } from '../components/layout/PageHeader';
import { Badge, Button, Drawer, Segmented, Stepper, type StepState } from '../components/ui';
import { ApiError } from '../lib/api';
import { useAuth } from '../lib/auth';
import { fmtYmd } from '../lib/format';
import { useWeek, useWeeklyMutations } from '../lib/weeklyApi';

const STEP_LABELS = ['Locking', 'Propose Jadwal', 'Validasi SDM', 'Ready to Execute'] as const;
const TABS = [
  { value: 'lock', label: 'Locking' },
  { value: 'board', label: 'Jadwal (Papan)' },
] as const;

const SUBTITLE = {
  videografer: 'Pra-produksi Videografer: validasi atribut, bobot, dan jadwal syuting konten Weekly.',
  leader: 'Pantau kesiapan sumber daya (SDM) per hari dan validasi item yang butuh tindak lanjut Anda.',
  user: 'Mode baca: Anda melihat progres konten milik Anda pada pekan ini.',
  admin: 'Mode baca: ringkasan seluruh pekan produksi.',
  editor: '',
} as const;

const errText = (e: unknown) => (e instanceof ApiError ? e.message : e instanceof Error ? e.message : 'Terjadi kesalahan');

export function WeeklyListing() {
  const { user } = useAuth();
  const role = user!.role;
  const isVg = role === 'videografer';
  const isLeader = role === 'leader';
  const showOps = role !== 'user';

  const [week, setWeek] = useState(() => productionWeekFor(todayJakarta()));
  const [tab, setTab] = useState<(typeof TABS)[number]['value']>('lock');
  const [openId, setOpenId] = useState<number | null>(null);
  const [sdmDay, setSdmDay] = useState<number | 'all' | null>(null);
  const [reasonAsk, setReasonAsk] = useState<ReasonAsk | null>(null);
  const [docAsk, setDocAsk] = useState<DocAsk | null>(null);
  const [confirmLock, setConfirmLock] = useState(false);
  const [actionError, setActionError] = useState('');

  const q = useWeek(week);
  const m = useWeeklyMutations();
  const data = q.data;
  const open = data?.contents.find((c) => c.id === openId) ?? null;

  const guard = async (fn: () => Promise<unknown>) => {
    setActionError('');
    try {
      await fn();
    } catch (e) {
      setActionError(errText(e));
    }
  };

  /** Hari berubah: sebelum Locking langsung disimpan; sesudahnya wajib beralasan (Field Adjustment). */
  const changeDay = (c: WeeklyContent, day: number | null) => {
    const from = c.day === null ? 'belum dijadwal' : DAY_NAMES[c.day];
    const to = day === null ? 'belum dijadwal' : DAY_NAMES[day];
    if (c.status === 'listing') return void guard(() => m.patch.mutateAsync({ id: c.id, patch: { day } }));
    setReasonAsk({
      title: 'Penyesuaian jadwal',
      subtitle: `${c.judul}: ${from} → ${to}`,
      hint: 'Setelah Locking, perubahan hari wajib beralasan. Alasan tercatat dan dilihat User.',
      confirm: 'Simpan penyesuaian',
      run: (reason) => m.patch.mutateAsync({ id: c.id, patch: { day, reason } }),
    });
  };
  const changeBobot = (c: WeeklyContent, bobot: NonNullable<ContentPatch['bobot']>) => void guard(() => m.patch.mutateAsync({ id: c.id, patch: { bobot } }));

  const progress = data?.progress;
  const firstTodo = progress ? progress.steps.findIndex((s) => !s) : -1;
  const stepper = STEP_LABELS.map((label, i) => ({
    label,
    state: (progress?.steps[i] ? 'done' : i === firstTodo ? 'current' : 'todo') as StepState,
  }));
  const scheduled = data ? data.contents.filter((c) => c.day !== null).length : 0;
  const slotsReady = data ? data.sdm.filter((i) => i.ready).length : 0;

  return (
    <>
      <PageHeader
        title="Weekly Listing"
        subtitle={SUBTITLE[role]}
        actions={
          <>
            <WeekPicker week={week} onChange={setWeek} />
            {progress && <Badge tone={progress.steps[3] ? 'green' : 'blue'} className="!px-3 !py-1 !text-[11px]">{progress.label}</Badge>}
          </>
        }
      />

      <div className="px-7 pb-8">
        {q.isLoading && <p className="py-10 text-center text-[13px] text-faint">Memuat pekan…</p>}
        {q.isError && <p role="alert" className="py-10 text-center text-[13px] text-danger">{errText(q.error)}</p>}

        {data && progress && (
          <>
            <nav aria-label="Tahap pekan" className="mb-3 max-w-3xl"><Stepper steps={stepper} /></nav>
            <p className="mb-3 text-xs text-muted">
              {data.label} · Locking Sabtu {fmtYmd(data.lockingDay)} · produksi Senin–Jumat
              {data.lockedAt && data.lockedByName ? ` · dikunci oleh ${data.lockedByName}` : ''}
              {data.readyAt && data.readyByName ? ` · Ready oleh ${data.readyByName}` : ''}
            </p>

            <div className="mb-3 flex flex-wrap items-center gap-3">
              <Segmented label="Tampilan" value={tab} onChange={setTab} options={TABS} />
              <p className="text-xs text-muted" aria-live="polite">
                <b className="text-ink">{data.contents.length}</b> konten · <b className="text-ink">{scheduled}</b> terjadwal · <b className="text-ink">{progress.unscheduled}</b> belum dijadwal
              </p>
              <div className="flex-1" />
              {showOps && (
                <Button variant="ghost" onClick={() => setSdmDay('all')}>
                  <Boxes size={15} /> SDM per hari
                  <span aria-hidden="true" className={`h-2 w-2 rounded-full ${data.sdm.length > 0 && slotsReady === data.sdm.length ? 'bg-ok' : data.sdm.length === 0 ? 'bg-faint' : 'bg-danger'}`} />
                  <span className="font-normal text-muted">{data.sdm.length === 0 ? 'belum ada' : `${slotsReady}/${data.sdm.length} Ready`}</span>
                </Button>
              )}
              {progress.canLock && isVg && (
                <Button onClick={() => setConfirmLock(true)}><Lock size={15} /> Locking Disepakati (VG + User)</Button>
              )}
              {!progress.canLock && data.lockedAt && (
                <span className="inline-flex items-center gap-1.5 rounded-[9px] border border-[#b7e0c4] bg-[#e5f5ea] px-3 py-2 text-xs font-semibold text-[#15803d]"><CheckCircle2 size={14} /> Locking disepakati</span>
              )}
              {isVg && (
                <Button
                  variant="accent"
                  disabled={!progress.canMarkReady || m.ready.isPending}
                  title={progress.canMarkReady ? undefined : 'Aktif setelah semua konten dikunci, terjadwal, dan semua SDM Ready'}
                  onClick={() => void guard(() => m.ready.mutateAsync(week))}
                >
                  {data.readyAt ? '✓ Ready to Execute' : 'Tandai Ready to Execute'}
                </Button>
              )}
            </div>

            {actionError && <p role="alert" className="mb-3 rounded-lg border border-[#f0c7c1] bg-[#fdf1ef] px-3 py-2 text-[12.5px] text-danger">{actionError}</p>}
            {progress.pendingLock > 0 && data.lockedAt && (
              <p role="note" className="mb-3 rounded-lg border border-orange-500/40 bg-orange-100 px-3 py-2 text-xs text-orange-800">
                Ada <b>{progress.pendingLock}</b> konten susulan yang belum dikunci. Mengunci konten susulan membuka kembali validasi SDM bila kebutuhannya baru.
              </p>
            )}

            {data.contents.length === 0 ? (
              <p className="rounded-xl border border-dashed border-line px-4 py-12 text-center text-[13px] text-faint">
                Belum ada konten Weekly di pekan ini. Konten masuk otomatis dari Brief Order (jenis Shooting Only, Shooting + Edit, Photoshoot).
              </p>
            ) : tab === 'lock' ? (
              <>
                <p className="mb-2 rounded-lg border border-line border-l-[3px] border-l-brand-500 bg-white px-3 py-2 text-xs text-muted">
                  <b className="text-ink">Tampilan Locking.</b> Atribut diisi User saat Brief; pada sesi tatap muka (Sabtu) Videografer memvalidasi dan boleh menimpanya. Tandai item yang butuh tindak lanjut Leader lewat tombol Ubah (klik judul).
                  {!isVg && <b className="ml-1 text-danger"> Anda: hanya melihat.</b>}
                </p>
                <LockingTable contents={data.contents} canEdit={isVg} onBobot={changeBobot} onDay={changeDay} onOpen={(c) => setOpenId(c.id)} />
              </>
            ) : (
              <ScheduleBoard
                week={data}
                canEdit={isVg}
                showOps={showOps}
                onMove={changeDay}
                onOpen={(c) => setOpenId(c.id)}
                onOpenSdm={setSdmDay}
                onDoc={(d: DayInfo, kind) =>
                  setDocAsk({
                    day: d.day,
                    kind,
                    current: kind === 'shotlist' ? d.shotlistUrl : d.skripUrl,
                    save: (url) => m.doc.mutateAsync({ week, day: d.day, kind, url }),
                  })
                }
              />
            )}

            <SdmDrawer
              week={data}
              day={sdmDay}
              canMark={isLeader}
              onToggle={(item: SdmItem, ready) => m.sdm.mutateAsync({ id: item.id, ready })}
              onReconfirm={(day) => m.reconfirm.mutateAsync({ week, day })}
              onClose={() => setSdmDay(null)}
            />

            {open && (
              <ContentDrawer
                key={`${open.id}-${open.status}`}
                content={open}
                week={data}
                canEdit={isVg}
                canReturn={isVg || isLeader}
                onSave={(patch) => m.patch.mutateAsync({ id: open.id, patch })}
                onPostpone={(reason) => m.postpone.mutateAsync({ id: open.id, reason })}
                onReturn={(reason) => m.returnToUser.mutateAsync({ id: open.id, reason })}
                onClose={() => setOpenId(null)}
              />
            )}

            <Drawer
              open={confirmLock}
              title="Locking Disepakati"
              subtitle={`${data.label} · ${progress.pendingLock} konten`}
              onClose={() => setConfirmLock(false)}
              footer={
                <>
                  <Button variant="ghost" full onClick={() => setConfirmLock(false)}>Batal</Button>
                  <Button full disabled={m.lock.isPending} onClick={() => void guard(async () => { await m.lock.mutateAsync(week); setConfirmLock(false); })}>
                    {m.lock.isPending ? 'Mengunci…' : 'Ya, kunci'}
                  </Button>
                </>
              }
            >
              <ul className="list-disc space-y-2 pl-5 text-[13px] leading-relaxed text-muted">
                <li>Atribut {progress.pendingLock} konten dikunci sebagai hasil kesepakatan Videografer dan User.</li>
                <li>Kebutuhan SDM per hari otomatis dikirim ke Leader untuk divalidasi.</li>
                <li>Perubahan atribut atau hari setelah ini wajib beralasan dan tercatat.</li>
                <li>Pastikan semua konten sudah punya hari syuting. Yang belum bisa dijadwalkan setelahnya.</li>
              </ul>
            </Drawer>

            <ReasonDrawer ask={reasonAsk} onClose={() => setReasonAsk(null)} />
            <DocDrawer ask={docAsk} onClose={() => setDocAsk(null)} />
          </>
        )}
      </div>
    </>
  );
}
