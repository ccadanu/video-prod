import { z } from 'zod';
import { BOBOT, SLOT_PER_BOBOT, type Bobot } from './capacity';
import { isGoogleDriveUrl, type HandoffProof } from './daily';
import { jalurOf, type Jenis } from './jenis';
import type { Status } from './status';
import { addDays, addWorkdays, isValidYmd, isWorkday, mondayOf, weekLabel, type Ymd } from './weeks';

/**
 * Brief Editing Schedule (Leader) dan Editing Execution (Editor), PRD §8–§9.
 *
 * Open Item PRD §8.3/§9.3 belum dijawab tim, jadi angka di bawah adalah USULAN dan sengaja dikumpulkan
 * di sini agar mudah diubah (lihat docs/ASSUMPTIONS.md).
 */

/** Kapasitas editor per hari kerja dalam slot (Gampang = 1, Susah = 2, sama dengan konversi syuting). */
export const EDITOR_DAILY_SLOTS = 6;

/** SLA editing dalam hari kerja sejak mulai dijadwalkan. Daily: selesai H+1 (PRD §8.3); dari Syuting: usulan 3 hari. */
export const EDIT_SLA_WORKDAYS = { daily: 1, weekly_edit: 3 } as const;

export const EDIT_PRIORITIES = ['normal', 'tinggi'] as const;
export type EditPriority = (typeof EDIT_PRIORITIES)[number];
export const PRIORITY_LABEL: Record<EditPriority, string> = { normal: 'Normal', tinggi: 'Prioritas' };

/** Jendela jadwal yang ditampilkan: pekan ini + pekan depan (Senin–Jumat). */
export const SCHEDULE_DAYS = 10;

export const isEditJenis = (jenis: Jenis): boolean => jalurOf(jenis) !== 'weekly_direct';
/** Asal antrean (PRD §8.2): Daily dari Brief Order, atau hasil syuting. */
export const originOf = (jenis: Jenis): 'daily' | 'syuting' => (jalurOf(jenis) === 'daily' ? 'daily' : 'syuting');

/** Usulan tanggal tenggat dari tanggal mulai. */
export function suggestDue(jenis: Jenis, scheduledFor: Ymd): Ymd {
  const jalur = jalurOf(jenis);
  return addWorkdays(scheduledFor, jalur === 'daily' ? EDIT_SLA_WORKDAYS.daily : EDIT_SLA_WORKDAYS.weekly_edit);
}

// ───────────── Langkah editing (PRD §9.2) ─────────────

export interface EditStepDef {
  key: string;
  label: string;
}

const COMMON_STEPS: EditStepDef[] = [
  { key: 'klip', label: 'Penyusunan klip' },
  { key: 'warna', label: 'Adjustment warna & audio' },
  { key: 'efek', label: 'Transisi, efek, subtitle' },
  { key: 'finishing', label: 'Finishing' },
  { key: 'selfqc', label: 'Self-QC' },
  { key: 'export', label: 'Rendering / export' },
];

const ASSET_STEP: Record<Jenis, EditStepDef> = {
  editing_only: { key: 'aset', label: 'Aset & materi dicek, siap diedit' },
  full_ai: { key: 'aset', label: 'Generate aset AI & seleksi hasil' },
  shooting_edit: { key: 'aset', label: 'Footage diunduh & dicek' },
  motion: { key: 'aset', label: 'Aset desain & storyboard siap' },
  shooting_only: { key: 'aset', label: 'Aset siap' },
  photoshoot: { key: 'aset', label: 'Aset siap' },
};

export const stepsFor = (jenis: Jenis): EditStepDef[] => [ASSET_STEP[jenis], ...COMMON_STEPS];
/** Syarat kirim ke In Review: Self-QC selesai. */
export const REQUIRED_STEP = 'selfqc';
/** Revisi membuka kembali langkah yang harus diulang. */
export const RESET_ON_REVISION = ['selfqc', 'export'] as const;
export const isStepKey = (jenis: Jenis, key: string): boolean => stepsFor(jenis).some((s) => s.key === key);

// ───────────── Skema input ─────────────

const ymd = z.string().refine(isValidYmd, 'Tanggal tidak valid');

export const assignSchema = z
  .object({
    editorId: z.number({ message: 'Pilih editor' }).int().positive('Pilih editor'),
    scheduledFor: ymd.refine(isWorkday, 'Mulai edit harus hari kerja (Senin–Jumat)'),
    dueDate: ymd.refine(isWorkday, 'Tenggat harus hari kerja (Senin–Jumat)'),
    bobot: z.enum(BOBOT),
    priority: z.enum(EDIT_PRIORITIES).default('normal'),
  })
  .superRefine((v, ctx) => {
    if (v.dueDate < v.scheduledFor) ctx.addIssue({ code: 'custom', path: ['dueDate'], message: 'Tenggat tidak boleh sebelum tanggal mulai' });
  });
export type AssignInput = z.output<typeof assignSchema>;

export const stepSchema = z.object({ key: z.string().min(1).max(40), done: z.boolean() });

export const submitSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1, 'Wajib diisi')
    .max(500, 'Maksimal 500 karakter')
    .refine(isGoogleDriveUrl, 'Gunakan link Google Drive (https://drive.google.com/…)'),
  note: z.string().trim().max(500, 'Maksimal 500 karakter').default(''),
});
export type SubmitInput = z.output<typeof submitSchema>;

// ───────────── Input & DTO ─────────────

export interface DeliverableVersion {
  version: number;
  url: string;
  note: string;
  at: string;
  byName: string | null;
}

/** Baris mentah satu konten di jalur editing (dibentuk dari DB atau memori demo). */
export interface EditRow {
  id: number;
  code: string;
  judul: string;
  produk: string;
  kategori: string;
  jenis: Jenis;
  rasio: string;
  durasiDetik: number | null;
  status: Status;
  linkDocs: string;
  catatan: string;
  revisionCount: number;
  /** Alasan revisi terakhir dari User (bila ada). */
  revisionReason: string | null;
  /** Kapan masuk antrean (atau kembali sebagai revisi). */
  queuedAt: string;
  editorId: number | null;
  editorName: string | null;
  bobot: Bobot;
  priority: EditPriority;
  scheduledFor: Ymd | null;
  dueDate: Ymd | null;
  startedAt: string | null;
  doneSteps: readonly string[];
  footage: HandoffProof | null;
  versions: DeliverableVersion[];
}

export type EditSla = 'selesai' | 'telat' | 'hari_ini' | 'aman' | 'none';

export function editSla(c: { status: Status; dueDate: Ymd | null }, today: Ymd): EditSla {
  if (c.status === 'in_review' || c.status === 'complete') return 'selesai';
  if (!c.dueDate) return 'none';
  if (today > c.dueDate) return 'telat';
  return today === c.dueDate ? 'hari_ini' : 'aman';
}

export type EditColumn = 'todo' | 'progress' | 'review';
export const EDIT_COLUMN_META: Record<EditColumn, { title: string; hint: string }> = {
  todo: { title: 'To Do', hint: 'terjadwal / revisi' },
  progress: { title: 'On Progress', hint: 'sedang diedit' },
  review: { title: 'In Review', hint: 'menunggu User' },
};

export function editColumn(c: Pick<EditRow, 'status' | 'startedAt'>): EditColumn | null {
  if (c.status === 'in_review') return 'review';
  if (c.status === 'revisi') return 'todo';
  if (c.status === 'editing') return c.startedAt ? 'progress' : 'todo';
  return null;
}

export interface EditCard extends EditRow {
  origin: 'daily' | 'syuting';
  sla: EditSla;
  column: EditColumn | null;
  steps: { key: string; label: string; done: boolean }[];
}

export const toEditCard = (r: EditRow, today: Ymd): EditCard => ({
  ...r,
  origin: originOf(r.jenis),
  sla: editSla(r, today),
  column: editColumn(r),
  steps: stepsFor(r.jenis).map((s) => ({ ...s, done: r.doneSteps.includes(s.key) })),
});

/** FIFO dengan prioritas (usulan, PRD §8.3): Prioritas dulu, lalu yang paling lama menunggu. */
export function queueOrder(a: Pick<EditRow, 'priority' | 'queuedAt' | 'id'>, b: Pick<EditRow, 'priority' | 'queuedAt' | 'id'>): number {
  const pa = a.priority === 'tinggi' ? 0 : 1;
  const pb = b.priority === 'tinggi' ? 0 : 1;
  if (pa !== pb) return pa - pb;
  if (a.queuedAt !== b.queuedAt) return a.queuedAt < b.queuedAt ? -1 : 1;
  return a.id - b.id;
}

export interface EditorLoad {
  id: number;
  name: string;
  /** Slot terpakai per hari pada `days`. */
  slots: number[];
}

export interface EditingSchedule {
  today: Ymd;
  days: Ymd[];
  capacity: number;
  weekLabels: [string, string];
  editors: EditorLoad[];
  /** Menunggu assign: antre baru dan revisi yang belum punya editor. */
  queue: EditCard[];
  /** Sudah punya editor: terjadwal, sedang diedit, atau revisi. */
  assigned: EditCard[];
  summary: { antre: number; terjadwal: number; berjalan: number; telat: number; revisi: number };
}

const OPEN: readonly Status[] = ['editing', 'revisi'];

export function buildSchedule(rows: readonly EditRow[], editors: readonly { id: number; name: string }[], today: Ymd): EditingSchedule {
  const monday = mondayOf(today);
  const days = [...Array.from({ length: 5 }, (_, i) => addDays(monday, i)), ...Array.from({ length: 5 }, (_, i) => addDays(monday, 7 + i))];
  const cards = rows.map((r) => toEditCard(r, today));
  const queue = cards.filter((c) => c.status === 'antre_editing' || (c.status === 'revisi' && c.editorId === null)).sort(queueOrder);
  const assigned = cards
    .filter((c) => OPEN.includes(c.status) && c.editorId !== null)
    .sort((a, b) => (a.scheduledFor ?? '9999').localeCompare(b.scheduledFor ?? '9999') || queueOrder(a, b));
  const load = editors.map<EditorLoad>((e) => ({
    id: e.id,
    name: e.name,
    slots: days.map((d) =>
      assigned.filter((c) => c.editorId === e.id && c.scheduledFor === d && c.column !== 'review').reduce((n, c) => n + SLOT_PER_BOBOT[c.bobot], 0),
    ),
  }));
  return {
    today, days, capacity: EDITOR_DAILY_SLOTS, weekLabels: [weekLabel(monday), weekLabel(addDays(monday, 7))], editors: load, queue, assigned,
    summary: {
      antre: queue.length,
      terjadwal: assigned.filter((c) => c.column === 'todo').length,
      berjalan: assigned.filter((c) => c.column === 'progress').length,
      telat: [...queue, ...assigned].filter((c) => c.sla === 'telat').length,
      revisi: [...queue, ...assigned].filter((c) => c.status === 'revisi').length,
    },
  };
}

export interface EditorBoard {
  today: Ymd;
  /** Editor yang papannya ditampilkan; null = semua editor (Leader/Admin). */
  editorId: number | null;
  cards: EditCard[];
  summary: { todo: number; progress: number; review: number; telat: number };
}

export function buildEditorBoard(rows: readonly EditRow[], editorId: number | null, today: Ymd): EditorBoard {
  const cards = rows
    .filter((r) => r.editorId !== null && (editorId === null || r.editorId === editorId))
    .map((r) => toEditCard(r, today))
    .filter((c) => c.column !== null)
    .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999') || queueOrder(a, b));
  const count = (col: EditColumn) => cards.filter((c) => c.column === col).length;
  return { today, editorId, cards, summary: { todo: count('todo'), progress: count('progress'), review: count('review'), telat: cards.filter((c) => c.sla === 'telat').length } };
}

/** Editor dengan beban paling ringan pada tanggal tsb (untuk saran assign). Seri → urutan daftar. */
export function suggestEditor(schedule: Pick<EditingSchedule, 'days' | 'editors'>, date: Ymd): number | null {
  const i = schedule.days.indexOf(date);
  if (i < 0 || schedule.editors.length === 0) return null;
  return [...schedule.editors].sort((a, b) => a.slots[i]! - b.slots[i]!)[0]!.id;
}
