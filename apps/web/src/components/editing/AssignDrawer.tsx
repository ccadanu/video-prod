import { useMemo, useState } from 'react';
import {
  BOBOT,
  BOBOT_LABEL,
  EDIT_PRIORITIES,
  PRIORITY_LABEL,
  SLOT_PER_BOBOT,
  nextWorkday,
  suggestDue,
  suggestEditor,
  type AssignInput,
  type Bobot,
  type EditCard,
  type EditPriority,
  type EditingSchedule,
} from '@ccp/shared';
import { Button, Field, Select, cx } from '../ui';
import { EditDetailDrawer, fmtDay, OriginChip, waitingLabel } from './parts';

interface Props {
  card: EditCard | null;
  schedule: EditingSchedule;
  onSubmit: (id: number, input: AssignInput) => Promise<unknown>;
  onClose: () => void;
}

/** Assign editor + jadwal + prioritas (Leader). Beban editor per hari terlihat sebelum memilih. */
function AssignForm({ card, schedule, onSubmit, onClose }: Props & { card: EditCard }) {
  const { days, editors, capacity, today } = schedule;
  const firstDay = useMemo(() => days.find((d) => d >= nextWorkday(today)) ?? days[0]!, [days, today]);
  const initialStart = card.scheduledFor && days.includes(card.scheduledFor) ? card.scheduledFor : firstDay;
  const [start, setStart] = useState(initialStart);
  const [due, setDue] = useState(card.dueDate && days.includes(card.dueDate) ? card.dueDate : suggestDue(card.jenis, initialStart));
  const [editorId, setEditorId] = useState<number | null>(card.editorId ?? suggestEditor(schedule, initialStart));
  const [bobot, setBobot] = useState<Bobot>(card.bobot);
  const [priority, setPriority] = useState<EditPriority>(card.priority);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const idx = days.indexOf(start);
  const loadOf = (id: number) => editors.find((e) => e.id === id)?.slots[idx] ?? 0;
  // Beban kartu ini sendiri tidak dihitung dua kali bila hanya mengubah jadwal.
  const own = card.editorId !== null && card.scheduledFor === start && card.status !== 'antre_editing' ? SLOT_PER_BOBOT[card.bobot] : 0;
  const projected = editorId === null ? 0 : loadOf(editorId) - (editorId === card.editorId ? own : 0) + SLOT_PER_BOBOT[bobot];
  const over = editorId !== null && projected > capacity;
  const reassign = card.editorId !== null;

  function changeStart(next: string) {
    setStart(next);
    setDue(suggestDue(card.jenis, next));
  }

  async function submit() {
    if (editorId === null) return;
    setBusy(true);
    setError('');
    try {
      await onSubmit(card.id, { editorId, scheduledFor: start, dueDate: due, bobot, priority });
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Terjadi kesalahan');
    } finally {
      setBusy(false);
    }
  }

  return (
    <EditDetailDrawer
      card={card}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" full onClick={onClose}>Batal</Button>
          <Button full disabled={editorId === null || busy} onClick={() => void submit()}>{busy ? 'Menyimpan…' : reassign ? 'Simpan jadwal' : 'Assign ke editor'}</Button>
        </>
      }
    >
      <p className="mb-3 flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted">
        <OriginChip origin={card.origin} /> Menunggu sejak {waitingLabel(card.queuedAt)}. Antrean berurut FIFO (paling lama menunggu dulu); konten Prioritas ditampilkan lebih awal di papan editor.
      </p>
      <Field label="Editor" required>
        {(id) => (
          <Select id={id} value={editorId ?? ''} onChange={(e) => setEditorId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">Pilih editor…</option>
            {editors.map((e) => (
              <option key={e.id} value={e.id}>{e.name} · {e.slots[idx] ?? 0}/{capacity} slot pada {fmtDay(start)}</option>
            ))}
          </Select>
        )}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Mulai edit" required>
          {(id) => <Select id={id} value={start} onChange={(e) => changeStart(e.target.value)}>{days.map((d) => <option key={d} value={d}>{fmtDay(d)}</option>)}</Select>}
        </Field>
        <Field label="Tenggat" required hint="Usulan: Daily H+1, dari Syuting +3 hari kerja.">
          {(id) => <Select id={id} value={due} onChange={(e) => setDue(e.target.value)}>{days.filter((d) => d >= start).map((d) => <option key={d} value={d}>{fmtDay(d)}</option>)}</Select>}
        </Field>
      </div>
      <fieldset className="mb-4">
        <legend className="mb-1.5 text-[12.5px] font-semibold">Bobot editing</legend>
        <div role="radiogroup" aria-label="Bobot editing" className="flex gap-2">
          {BOBOT.map((b) => (
            <button key={b} role="radio" aria-checked={bobot === b} onClick={() => setBobot(b)}
              className={cx('rounded-lg border px-3 py-2 text-xs', bobot === b ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-white hover:border-brand-300')}>
              {BOBOT_LABEL[b]} <span className="opacity-70">· {SLOT_PER_BOBOT[b]} slot</span>
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset className="mb-4">
        <legend className="mb-1.5 text-[12.5px] font-semibold">Prioritas</legend>
        <div role="radiogroup" aria-label="Prioritas" className="flex gap-2">
          {EDIT_PRIORITIES.map((p) => (
            <button key={p} role="radio" aria-checked={priority === p} onClick={() => setPriority(p)}
              className={cx('rounded-lg border px-3 py-2 text-xs', priority === p ? 'border-brand-600 bg-brand-600 text-white' : 'border-line bg-white hover:border-brand-300')}>
              {PRIORITY_LABEL[p]}
            </button>
          ))}
        </div>
      </fieldset>
      {over && <p role="note" className="mb-3 rounded-lg bg-orange-100 px-3 py-2 text-xs text-orange-800">Beban editor ini menjadi {projected}/{capacity} slot pada {fmtDay(start)}. Masih bisa disimpan, tetapi pertimbangkan editor atau hari lain.</p>}
      {error && <p role="alert" className="mb-3 text-[12.5px] text-danger">{error}</p>}
    </EditDetailDrawer>
  );
}

export function AssignDrawer(props: Props) {
  // key: form dibuat ulang untuk setiap konten agar isian tidak terbawa.
  return props.card ? <AssignForm key={props.card.id} {...props} card={props.card} /> : <EditDetailDrawer card={null} onClose={props.onClose} />;
}
