import { useState } from 'react';
import { DAY_NAMES } from '@ccp/shared';
import { Button, Drawer, Field, Input } from '../ui';

export interface DocAsk {
  day: number;
  kind: 'shotlist' | 'skrip';
  current: string | null;
  save: (url: string) => Promise<unknown>;
}

/** Unggah link Google Docs Shotlist / Skrip (H-1) untuk satu hari syuting. */
export function DocDrawer({ ask, onClose }: { ask: DocAsk | null; onClose: () => void }) {
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const close = () => {
    setUrl('');
    setError('');
    onClose();
  };
  const label = ask?.kind === 'shotlist' ? 'Shotlist' : 'Skrip talent';

  async function submit() {
    if (!ask) return;
    setBusy(true);
    setError('');
    try {
      await ask.save(url.trim());
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Terjadi kesalahan');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Drawer
      open={ask !== null}
      title={ask ? `${label} · ${DAY_NAMES[ask.day]}` : ''}
      subtitle="Dokumen dibuat di Google Docs; di sini cukup menaruh link-nya."
      onClose={close}
      footer={
        <>
          <Button variant="ghost" full onClick={close}>Batal</Button>
          <Button full disabled={!url.trim() || busy} onClick={() => void submit()}>{busy ? 'Menyimpan…' : 'Simpan link'}</Button>
        </>
      }
    >
      {ask?.current && (
        <p className="mb-4 text-[12.5px] text-muted">
          Link saat ini: <a className="break-all font-semibold text-brand-600 hover:underline" href={ask.current} target="_blank" rel="noopener noreferrer">{ask.current}</a>. Menyimpan link baru menggantikannya.
        </p>
      )}
      <Field label={`Link ${label}`} required error={error || undefined} hint="Pastikan akses dibuka untuk tim.">
        {(id) => <Input id={id} type="url" autoFocus value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://docs.google.com/document/d/…" maxLength={500} />}
      </Field>
    </Drawer>
  );
}
