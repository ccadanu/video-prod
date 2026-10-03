import { describe, expect, it } from 'vitest';
import {
  EDITOR_DAILY_SLOTS,
  addWorkdays,
  assignSchema,
  buildEditorBoard,
  buildSchedule,
  editColumn,
  editSla,
  isWorkday,
  queueOrder,
  stepsFor,
  submitSchema,
  suggestDue,
  suggestEditor,
  type EditRow,
} from './index';

const row = (o: Partial<EditRow> = {}): EditRow => ({
  id: 1, code: 'VID-1', judul: 'J', produk: 'ASA', kategori: 'Infografis', jenis: 'motion', rasio: '1:1', durasiDetik: 15, status: 'antre_editing',
  linkDocs: 'https://docs.google.com/x', catatan: '', revisionCount: 0, revisionReason: null, queuedAt: '2026-10-01T00:00:00.000Z',
  editorId: null, editorName: null, bobot: 'gampang', priority: 'normal', scheduledFor: null, dueDate: null, startedAt: null, doneSteps: [], footage: null, versions: [], ...o,
});

describe('hari kerja', () => {
  it('addWorkdays melewati akhir pekan', () => {
    expect(addWorkdays('2026-10-02', 1)).toBe('2026-10-05'); // Jumat + 1 = Senin
    expect(addWorkdays('2026-10-03', 0)).toBe('2026-10-05'); // Sabtu → Senin
    expect(addWorkdays('2026-10-05', 3)).toBe('2026-10-08');
    expect(isWorkday('2026-10-04')).toBe(false);
  });
  it('suggestDue: Daily H+1, dari Syuting +3 hari kerja', () => {
    expect(suggestDue('motion', '2026-10-05')).toBe('2026-10-06');
    expect(suggestDue('shooting_edit', '2026-10-05')).toBe('2026-10-08');
  });
});

describe('antrean & SLA', () => {
  it('Prioritas dulu, lalu FIFO, lalu id', () => {
    const rows = [row({ id: 3, queuedAt: '2026-10-01T00:00:00Z' }), row({ id: 2, queuedAt: '2026-10-02T00:00:00Z', priority: 'tinggi' }), row({ id: 1, queuedAt: '2026-10-01T00:00:00Z' })];
    expect(rows.sort(queueOrder).map((r) => r.id)).toEqual([2, 1, 3]);
  });
  it('editSla', () => {
    expect(editSla({ status: 'editing', dueDate: '2026-10-05' }, '2026-10-04')).toBe('aman');
    expect(editSla({ status: 'editing', dueDate: '2026-10-05' }, '2026-10-05')).toBe('hari_ini');
    expect(editSla({ status: 'editing', dueDate: '2026-10-05' }, '2026-10-06')).toBe('telat');
    expect(editSla({ status: 'in_review', dueDate: '2026-10-01' }, '2026-10-06')).toBe('selesai');
    expect(editSla({ status: 'antre_editing', dueDate: null }, '2026-10-06')).toBe('none');
  });
  it('editColumn', () => {
    expect(editColumn({ status: 'editing', startedAt: null })).toBe('todo');
    expect(editColumn({ status: 'editing', startedAt: 'x' })).toBe('progress');
    expect(editColumn({ status: 'revisi', startedAt: 'x' })).toBe('todo');
    expect(editColumn({ status: 'in_review', startedAt: 'x' })).toBe('review');
    expect(editColumn({ status: 'antre_editing', startedAt: null })).toBeNull();
  });
});

describe('buildSchedule & suggestEditor', () => {
  const today = '2026-10-07'; // Rabu
  const rows = [
    row({ id: 1 }),
    row({ id: 2, status: 'editing', editorId: 10, editorName: 'A', scheduledFor: '2026-10-07', dueDate: '2026-10-08', bobot: 'susah' }),
    row({ id: 3, status: 'editing', editorId: 10, editorName: 'A', scheduledFor: '2026-10-07', dueDate: '2026-10-06', bobot: 'gampang', startedAt: 'x' }),
    row({ id: 4, status: 'in_review', editorId: 10, editorName: 'A', scheduledFor: '2026-10-07', dueDate: '2026-10-08' }),
    row({ id: 5, status: 'revisi', editorId: null }),
  ];
  const editors = [{ id: 10, name: 'A' }, { id: 11, name: 'B' }];
  const s = buildSchedule(rows, editors, today);
  it('jendela 10 hari kerja mulai Senin pekan ini; beban memakai slot dan mengabaikan In Review', () => {
    expect(s.days[0]).toBe('2026-10-05');
    expect(s.days[5]).toBe('2026-10-12');
    expect(s.editors[0]!.slots[2]).toBe(3);
    expect(s.editors[1]!.slots.every((n) => n === 0)).toBe(true);
    expect(s.capacity).toBe(EDITOR_DAILY_SLOTS);
  });
  it('ringkasan', () => {
    expect(s.queue.map((c) => c.id).sort()).toEqual([1, 5]);
    expect(s.summary).toEqual({ antre: 2, terjadwal: 1, berjalan: 1, telat: 1, revisi: 1 });
  });
  it('suggestEditor memilih beban teringan', () => {
    expect(suggestEditor(s, '2026-10-07')).toBe(11);
    expect(suggestEditor(s, '2026-12-01')).toBeNull();
  });
  it('papan editor: hanya milik editor itu, tanpa kartu tak bertugas', () => {
    expect(buildEditorBoard(rows, 10, today).cards.map((c) => c.id).sort()).toEqual([2, 3, 4]);
    expect(buildEditorBoard(rows, 11, today).cards).toEqual([]);
  });
});

describe('skema', () => {
  const ok = { editorId: 1, scheduledFor: '2026-10-05', dueDate: '2026-10-06', bobot: 'gampang' };
  it('assign: hari kerja, tenggat ≥ mulai, default prioritas normal', () => {
    expect(assignSchema.parse(ok).priority).toBe('normal');
    expect(assignSchema.safeParse({ ...ok, scheduledFor: '2026-10-04' }).success).toBe(false);
    expect(assignSchema.safeParse({ ...ok, dueDate: '2026-10-02' }).success).toBe(false);
    expect(assignSchema.safeParse({ ...ok, scheduledFor: '2026-02-31' }).success).toBe(false);
  });
  it('submit: wajib Google Drive', () => {
    expect(submitSchema.safeParse({ url: 'https://drive.google.com/file/d/x' }).success).toBe(true);
    expect(submitSchema.safeParse({ url: 'https://docs.google.com/x' }).success).toBe(false);
  });
  it('langkah per jenis memuat Self-QC', () => {
    for (const j of ['editing_only', 'full_ai', 'shooting_edit', 'motion'] as const) expect(stepsFor(j).map((s) => s.key)).toContain('selfqc');
  });
});
