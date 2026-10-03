import { useState } from 'react';
import {
  BOBOT,
  BOBOT_LABEL,
  DAY_NAMES,
  JENIS_META,
  LOKASI_OPTIONS,
  PLANNING_STATUSES,
  isLokasiLuar,
  type ContentPatch,
  type WeekDto,
  type WeeklyContent,
} from '@ccp/shared';
import { ApiError } from '../../lib/api';
import { fmtYmd } from '../../lib/format';
import { Button, Drawer, Field, Input, JenisChip, Select, StatusPill, Textarea } from '../ui';

interface Props {
  content: WeeklyContent | null;
  week: WeekDto;
  canEdit: boolean; // VG
  canReturn: boolean; // VG atau Leader
  onSave: (patch: Partial<ContentPatch>) => Promise<unknown>;
  onPostpone: (reason: string) => Promise<unknown>;
  onReturn: (reason: string) => Promise<unknown>;
  onClose: () => void;
}

type Intent = 'postpone' | 'return' | null;

/** Validasi atribut oleh VG: menimpa isian User, menentukan item tindak lanjut Leader (FU), bobot, dan hari. */
export function ContentDrawer({ content, week, canEdit, canReturn, onSave, onPostpone, onReturn, onClose }: Props) {
  // Form diinisialisasi dari konten; `key` di pemanggil mereset saat konten berganti.
  const [f, setF] = useState(() => ({
    talent: content?.talent ?? '', kostum: content?.kostum ?? '', lokasi: content?.lokasi ?? '', lokasiDetail: content?.lokasiDetail ?? '',
    properti: content?.properti ?? '', desain: content?.desain ?? '',
    fuProperti: content?.fuProperti ?? '', fuKostum: content?.fuKostum ?? '', fuDesain: content?.fuDesain ?? '',
    bobot: content?.bobot ?? 'gampang', day: content?.day ?? null,
  }));
  const [reason, setReason] = useState('');
  const [intent, setIntent] = useState<Intent>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!content) return <Drawer open={false} title="" onClose={onClose}>{null}</Drawer>;

  const planning = PLANNING_STATUSES.includes(content.status);
  const locked = content.status !== 'listing';
  const editable = canEdit && planning;
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));

  const attrChanged = (['talent', 'kostum', 'lokasi', 'properti', 'desain', 'fuProperti', 'fuKostum', 'fuDesain'] as const).some((k) => f[k] !== content[k]) ||
    (f.lokasi === 'Lainnya' && f.lokasiDetail !== content.lokasiDetail);
  const dayChanged = f.day !== content.day;
  const changed = attrChanged || dayChanged || f.bobot !== content.bobot;
  const needsReason = locked && (attrChanged || dayChanged);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true);
    setError('');
    try {
      await fn();
      return true;
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Terjadi kesalahan');
      return false;
    } finally {
      setBusy(false);
    }
  }

  const save = () =>
    run(async () => {
      await onSave({
        talent: f.talent, kostum: f.kostum, lokasi: f.lokasi as ContentPatch['lokasi'], lokasiDetail: f.lokasi === 'Lainnya' ? f.lokasiDetail : '',
        properti: f.properti, desain: f.desain, fuProperti: f.fuProperti, fuKostum: f.fuKostum, fuDesain: f.fuDesain,
        bobot: f.bobot, day: f.day, reason: reason.trim(),
      });
      setReason('');
    });

  const confirmIntent = async () => {
    if (!intent) return;
    const ok = await run(() => (intent === 'postpone' ? onPostpone(reason.trim()) : onReturn(reason.trim())));
    if (ok) onClose();
  };

  return (
    <Drawer
      open
      title={content.judul}
      subtitle={`${content.code} · ${content.requesterName}`}
      onClose={onClose}
      footer={
        intent ? (
          <>
            <Button variant="ghost" full onClick={() => { setIntent(null); setReason(''); setError(''); }}>Batal</Button>
            <Button full variant={intent === 'return' ? 'danger' : 'primary'} disabled={!reason.trim() || busy} onClick={() => void confirmIntent()}>
              {intent === 'postpone' ? 'Tunda ke pekan depan' : 'Kembalikan ke User'}
            </Button>
          </>
        ) : editable ? (
          <Button full disabled={!changed || busy || (needsReason && !reason.trim())} onClick={() => void save()}>
            {busy ? 'Menyimpan…' : locked ? 'Simpan penyesuaian' : 'Simpan validasi'}
          </Button>
        ) : undefined
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusPill status={content.status} />
        <JenisChip jenis={content.jenis} />
        <a href={content.linkDocs} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-brand-600 hover:underline">Buka brief (Docs)</a>
      </div>
      {!planning && <p role="note" className="mb-4 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800">Konten ini sudah masuk produksi. Perubahan dilakukan lewat Daily Shooting.</p>}
      {error && <p role="alert" className="mb-3 text-[12.5px] text-danger">{error}</p>}

      {intent && (
        <Field
          label="Alasan"
          required
          hint={intent === 'postpone' ? 'Konten kembali ke Listing di pekan depan. Alasan tercatat untuk evaluasi.' : 'User melihat alasan ini dan bisa melengkapi brief.'}
        >
          {(id) => <Textarea id={id} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />}
        </Field>
      )}

      {!intent && (
        <>
          <h3 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-faint">Atribut produksi</h3>
          <p className="mb-3 text-[11.5px] text-muted">
            Isian User divalidasi dan bisa ditimpa Videografer. {locked ? 'Setelah Locking, perubahan atribut atau hari wajib beralasan.' : 'Sebelum Locking Disepakati, perubahan tidak meminta alasan.'}
          </p>
          <Field label="Talent">{(id) => <Input id={id} disabled={!editable} value={f.talent} onChange={(e) => set('talent', e.target.value)} maxLength={120} />}</Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kostum">{(id) => <Input id={id} disabled={!editable} value={f.kostum} onChange={(e) => set('kostum', e.target.value)} maxLength={120} />}</Field>
            <Field label="Lokasi">
              {(id) => (
                <Select id={id} disabled={!editable} value={f.lokasi} onChange={(e) => set('lokasi', e.target.value)}>
                  {LOKASI_OPTIONS.map((l) => <option key={l}>{l}</option>)}
                </Select>
              )}
            </Field>
          </div>
          {f.lokasi === 'Lainnya' && (
            <Field label="Sebutkan lokasi">{(id) => <Input id={id} disabled={!editable} value={f.lokasiDetail} onChange={(e) => set('lokasiDetail', e.target.value)} maxLength={200} />}</Field>
          )}
          <p className="-mt-2 mb-3 text-[11px] text-faint">{isLokasiLuar(f.lokasi) ? 'Lokasi luar: perlu booking Leader.' : 'Lokasi kantor: otomatis Ready.'}</p>
          <Field label="Properti">{(id) => <Textarea id={id} disabled={!editable} value={f.properti} onChange={(e) => set('properti', e.target.value)} maxLength={500} />}</Field>
          <Field label="Kebutuhan desain">{(id) => <Textarea id={id} disabled={!editable} value={f.desain} onChange={(e) => set('desain', e.target.value)} maxLength={500} />}</Field>

          <h3 className="mb-1 mt-5 text-[11px] font-bold uppercase tracking-wider text-faint">Perlu tindak lanjut Leader</h3>
          <p className="mb-3 text-[11.5px] text-muted">Isi nama item hanya bila perlu ditindaklanjuti; kosongkan bila tidak. Item ini muncul di panel SDM.</p>
          <Field label="Properti yang perlu dibeli">{(id) => <Input id={id} disabled={!editable} value={f.fuProperti} onChange={(e) => set('fuProperti', e.target.value)} placeholder="mis. Teko keramik" maxLength={120} />}</Field>
          <Field label="Aset desain yang perlu diorder">{(id) => <Input id={id} disabled={!editable} value={f.fuDesain} onChange={(e) => set('fuDesain', e.target.value)} placeholder="mis. Frame design" maxLength={120} />}</Field>
          <Field label="Kostum khusus yang perlu disiapkan">{(id) => <Input id={id} disabled={!editable} value={f.fuKostum} onChange={(e) => set('fuKostum', e.target.value)} placeholder="mis. Kebaya modern" maxLength={120} />}</Field>

          <h3 className="mb-2 mt-5 text-[11px] font-bold uppercase tracking-wider text-faint">Jadwal &amp; kapasitas</h3>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Bobot" hint="Gampang = 1 slot, Susah = 2 slot.">
              {(id) => (
                <Select id={id} disabled={!editable} value={f.bobot} onChange={(e) => set('bobot', e.target.value as typeof f.bobot)}>
                  {BOBOT.map((b) => <option key={b} value={b}>{BOBOT_LABEL[b]}</option>)}
                </Select>
              )}
            </Field>
            <Field label="Hari syuting">
              {(id) => (
                <Select id={id} disabled={!editable} value={f.day === null ? '' : String(f.day)} onChange={(e) => set('day', e.target.value === '' ? null : Number(e.target.value))}>
                  <option value="">Belum dijadwal</option>
                  {DAY_NAMES.map((d, i) => <option key={d} value={i}>{d} · {fmtYmd(week.days[i]!.date)}</option>)}
                </Select>
              )}
            </Field>
          </div>

          {editable && needsReason && (
            <Field label="Alasan penyesuaian" required hint="Tercatat di riwayat konten dan dilihat User.">
              {(id) => <Textarea id={id} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />}
            </Field>
          )}

          {(editable || canReturn) && (
            <div className="mt-5 flex flex-wrap gap-2 border-t border-line pt-4">
              {editable && <Button variant="ghost" size="sm" onClick={() => { setReason(''); setIntent('postpone'); }}>Tunda ke pekan depan</Button>}
              {canReturn && content.status === 'listing' && (
                <Button variant="danger" size="sm" onClick={() => { setReason(''); setIntent('return'); }}>Kembalikan ke User</Button>
              )}
            </div>
          )}
        </>
      )}
      <p className="mt-4 text-[11px] text-faint">{JENIS_META[content.jenis].label} · {content.produk} · {content.kategori}</p>
    </Drawer>
  );
}
