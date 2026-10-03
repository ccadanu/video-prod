import { useState } from 'react';
import { handoffNeedsDrive, type DailyCard, type HandoffInput } from '@ccp/shared';
import { cx } from '../ui';
import { Button, Drawer, Field, Input, JenisChip } from '../ui';

interface Props {
  card: DailyCard | null;
  onSubmit: (id: number, input: HandoffInput) => Promise<unknown>;
  onClose: () => void;
}

/** Bukti Serah Footage (wrap-up): yang diserahkan adalah footage mentah, laporannya hanya bukti + lokasi. */
export function HandoffDrawer({ card, onSubmit, onClose }: Props) {
  const mustDrive = card ? handoffNeedsDrive(card.jenis) : false;
  const [storage, setStorage] = useState<'drive' | 'hdd'>('drive');
  const [driveUrl, setDriveUrl] = useState('');
  const [diskName, setDiskName] = useState('');
  const [path, setPath] = useState('');
  const [fileName, setFileName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const close = () => {
    setError('');
    onClose();
  };
  const ready = storage === 'drive' ? driveUrl.trim() : diskName.trim() && path.trim() && fileName.trim();

  async function submit() {
    if (!card) return;
    setBusy(true);
    setError('');
    try {
      await onSubmit(card.id, storage === 'drive' ? { storage, driveUrl: driveUrl.trim() } : { storage, diskName: diskName.trim(), path: path.trim(), fileName: fileName.trim() });
      setDriveUrl('');
      setDiskName('');
      setPath('');
      setFileName('');
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Terjadi kesalahan');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open={card !== null}
      title="Bukti Serah Footage"
      subtitle={card ? `${card.code} · ${card.judul}` : undefined}
      onClose={close}
      footer={
        <>
          <Button variant="ghost" full onClick={close}>Batal</Button>
          <Button full disabled={!ready || busy} onClick={() => void submit()}>{busy ? 'Mengirim…' : 'Kirim & Tandai Terkirim'}</Button>
        </>
      }
    >
      {card && (
        <>
          <div className="mb-4 flex items-center gap-2"><JenisChip jenis={card.jenis} /><span className="text-xs text-muted">{card.talent} · {card.lokasi}</span></div>

          <h3 className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-faint">Tipe penyimpanan</h3>
          <div role="tablist" aria-label="Tipe penyimpanan" className="mb-4 flex gap-0.5 rounded-[9px] bg-line p-[3px]">
            {([['drive', 'Drive (HP)'], ['hdd', 'Hard Disk (Kamera)']] as const).map(([v, label]) => (
              <button
                key={v}
                role="tab"
                aria-selected={storage === v}
                disabled={v === 'hdd' && mustDrive}
                onClick={() => setStorage(v)}
                title={v === 'hdd' && mustDrive ? 'Jenis ini langsung ke Review User, jadi footage wajib di Drive' : undefined}
                className={cx('flex-1 rounded-[7px] px-2 py-2 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-40', storage === v ? 'bg-white font-semibold shadow-sm' : 'text-muted hover:text-ink')}
              >
                {label}
              </button>
            ))}
          </div>

          {storage === 'drive' ? (
            <>
              <p className="mb-3 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-800">
                <b>Upload footage ke Drive.</b> {mustDrive ? `Jenis ${card.jenis === 'photoshoot' ? 'Photoshoot' : 'Shooting Only'} tidak lewat editor: User review langsung, jadi footage harus bisa dibuka via Drive.` : 'Footage dari HP: taruh di folder Drive lalu isi link-nya.'}
              </p>
              <Field label="Link Drive (folder footage)" required error={error || undefined} hint="Pastikan akses dibuka untuk tim/User.">
                {(id) => <Input id={id} type="url" autoFocus value={driveUrl} onChange={(e) => setDriveUrl(e.target.value)} placeholder="https://drive.google.com/drive/folders/…" maxLength={500} />}
              </Field>
            </>
          ) : (
            <>
              <p className="mb-3 rounded-lg bg-orange-100 px-3 py-2 text-xs text-orange-800">
                <b>Tersimpan di hard disk / lokal.</b> Tidak perlu upload file, cukup keterangan lokasi. Tanpa foto atau screenshot.
              </p>
              <Field label="Nama hard disk / storage" required>{(id) => <Input id={id} autoFocus value={diskName} onChange={(e) => setDiskName(e.target.value)} placeholder="mis. HDD-CCP-02" maxLength={100} />}</Field>
              <Field label="Path / folder" required>{(id) => <Input id={id} value={path} onChange={(e) => setPath(e.target.value)} placeholder="mis. /2026/Okt/Pekan1/Rabu/" maxLength={300} />}</Field>
              <Field label="Nama file" required error={error || undefined}>{(id) => <Input id={id} value={fileName} onChange={(e) => setFileName(e.target.value)} placeholder="mis. clip_VID-241.mp4" maxLength={200} />}</Field>
            </>
          )}

          <h3 className="mb-1.5 mt-5 text-[11px] font-bold uppercase tracking-wider text-faint">Serah terima ke</h3>
          <p className={cx('rounded-lg px-3 py-2.5 text-[12.5px]', card.route === 'editor' ? 'bg-brand-50 text-brand-800' : 'bg-[#e3f4f1] text-[#0b7266]')}>
            {card.route === 'editor' ? <><b>Antrean Video Editor</b> via Brief Editing Schedule (Leader)</> : <><b>Review User</b> langsung (tanpa editing)</>}
          </p>
          <p className="mt-2 text-[11px] text-faint">Tanpa verifikasi: setelah dikirim langsung berstatus Terkirim.</p>
        </>
      )}
    </Drawer>
  );
}
