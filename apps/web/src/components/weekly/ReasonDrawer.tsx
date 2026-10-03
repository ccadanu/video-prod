import { useState } from 'react';
import { Button, Drawer, Field, Textarea } from '../ui';

export interface ReasonAsk {
  title: string;
  subtitle?: string;
  hint: string;
  confirm: string;
  run: (reason: string) => Promise<unknown>;
}

/** Meminta alasan wajib sebelum aksi (penyesuaian setelah Locking, tunda, kembalikan). Alasan tercatat untuk evaluasi. */
export function ReasonDrawer({ ask, onClose }: { ask: ReasonAsk | null; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const close = () => {
    setReason('');
    setError('');
    onClose();
  };

  async function submit() {
    if (!ask) return;
    setBusy(true);
    setError('');
    try {
      await ask.run(reason.trim());
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
      title={ask?.title ?? ''}
      subtitle={ask?.subtitle}
      onClose={close}
      footer={
        <>
          <Button variant="ghost" full onClick={close}>Batal</Button>
          <Button full disabled={!reason.trim() || busy} onClick={() => void submit()}>{busy ? 'Menyimpan…' : ask?.confirm}</Button>
        </>
      }
    >
      <Field label="Alasan" required hint={ask?.hint} error={error || undefined}>
        {(id) => <Textarea id={id} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} />}
      </Field>
    </Drawer>
  );
}
