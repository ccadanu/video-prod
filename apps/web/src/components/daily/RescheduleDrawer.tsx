import { useState } from 'react';
import { DAY_NAMES, addDays, type DailyCard } from '@ccp/shared';
import { fmtYmd } from '../../lib/format';
import { Button, Drawer, Field, Textarea, cx } from '../ui';

interface Props {
  card: DailyCard | null;
  weekStart: string;
  onSubmit: (id: number, day: number, reason: string) => Promise<unknown>;
  onClose: () => void;
}

/** Pindah ke hari lain di pekan yang sama. Alasan wajib (jejak evaluasi, PRD §7.6). */
export function RescheduleDrawer({ card, weekStart, onSubmit, onClose }: Props) {
  const [day, setDay] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const close = () => {
    setDay(null);
    setReason('');
    setError('');
    onClose();
  };

  async function submit() {
    if (!card || day === null) return;
    setBusy(true);
    setError('');
    try {
      await onSubmit(card.id, day, reason.trim());
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
      title="Reschedule"
      subtitle={card ? `${card.code} · ${card.judul}` : undefined}
      onClose={close}
      footer={
        <>
          <Button variant="ghost" full onClick={close}>Batal</Button>
          <Button full disabled={day === null || !reason.trim() || busy} onClick={() => void submit()}>{busy ? 'Menyimpan…' : 'Reschedule'}</Button>
        </>
      }
    >
      <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wider text-faint">Pindah ke hari (pekan ini)</h3>
      <div role="radiogroup" aria-label="Hari tujuan" className="mb-4 flex flex-wrap gap-2">
        {DAY_NAMES.map((name, i) => (
          <button
            key={name}
            role="radio"
            aria-checked={day === i}
            disabled={card?.day === i}
            onClick={() => setDay(i)}
            className={cx('rounded-lg border px-3 py-2 text-xs disabled:cursor-not-allowed disabled:opacity-40', day === i ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-white hover:border-brand-300')}
          >
            {name} <span className="opacity-70">· {fmtYmd(addDays(weekStart, i))}</span>
          </button>
        ))}
      </div>
      <Field label="Alasan" required error={error || undefined} hint="Tercatat untuk evaluasi. Reschedule berulang menandakan penjadwalan terlalu mepet.">
        {(id) => <Textarea id={id} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="mis. Talent cancel / cuaca / alat bentrok" maxLength={500} />}
      </Field>
      <p className="text-[11px] text-faint">Take yang sedang berjalan dibatalkan. Kebutuhan SDM mengikuti hari baru; item yang belum Ready ditandai di kartu.</p>
    </Drawer>
  );
}
