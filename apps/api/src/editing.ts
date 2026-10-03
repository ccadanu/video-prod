import {
  RESET_ON_REVISION,
  REQUIRED_STEP,
  buildEditorBoard,
  buildSchedule,
  isEditJenis,
  isStepKey,
  todayJakarta,
  type AssignInput,
  type Bobot,
  type DeliverableVersion,
  type EditPriority,
  type EditRow,
  type EditingSchedule,
  type EditorBoard,
  type HandoffProof,
  type Jenis,
  type Status,
  type SubmitInput,
} from '@ccp/shared';
import { addEvent } from './briefs';
import { audit, type Db, type Queryable } from './db';
import { HttpError } from './errors';

interface Raw {
  id: number;
  code: string;
  judul: string;
  produk: string;
  kategori: string;
  jenis: Jenis;
  rasio: string;
  durasi_detik: number | null;
  status: Status;
  link_docs: string;
  catatan: string;
  revision_count: number;
  revision_reason: string | null;
  queued_at: string;
  editor_id: number | null;
  editor_name: string | null;
  edit_bobot: Bobot;
  edit_priority: EditPriority;
  edit_scheduled_for: string | null;
  edit_due: string | null;
  edit_started_at: string | null;
  storage: 'drive' | 'hdd' | null;
  drive_url: string | null;
  disk_name: string | null;
  path: string | null;
  file_name: string | null;
  handed_at: string | null;
  handed_by_name: string | null;
}

// Jenis yang melewati Editor (Shooting Only/Photoshoot langsung ke Review User, PRD §4.2).
const EDIT_JENIS = "'shooting_edit', 'full_ai', 'editing_only', 'motion'";

const ROW_SQL = `
  SELECT b.id, b.code, b.judul, b.produk, b.kategori, b.jenis, b.rasio, b.durasi_detik, b.status, b.link_docs, b.catatan, b.revision_count,
         (SELECT e.reason FROM brief_events e WHERE e.brief_id = b.id AND e.to_status = 'revisi' ORDER BY e.id DESC LIMIT 1) AS revision_reason,
         COALESCE((SELECT max(e.created_at) FROM brief_events e WHERE e.brief_id = b.id AND e.to_status IN ('antre_editing', 'revisi')), b.updated_at) AS queued_at,
         b.editor_id, eu.name AS editor_name, b.edit_bobot, b.edit_priority, b.edit_scheduled_for, b.edit_due, b.edit_started_at,
         h.storage, h.drive_url, h.disk_name, h.path, h.file_name, h.handed_at, hu.name AS handed_by_name
  FROM briefs b
  LEFT JOIN users eu ON eu.id = b.editor_id
  LEFT JOIN footage_handoffs h ON h.brief_id = b.id
  LEFT JOIN users hu ON hu.id = h.handed_by
  WHERE b.jenis IN (${EDIT_JENIS})
    AND (b.status IN ('antre_editing', 'editing', 'revisi') OR (b.status = 'in_review' AND b.editor_id IS NOT NULL))`;

async function loadRows(q: Queryable): Promise<EditRow[]> {
  const raws = await q.query<Raw>(`${ROW_SQL} ORDER BY b.id`);
  if (raws.length === 0) return [];
  const ids = raws.map((r) => r.id);
  const marks = ids.map((_, i) => `$${i + 1}`).join(', ');
  const [steps, vers] = await Promise.all([
    q.query<{ brief_id: number; step_key: string }>(`SELECT brief_id, step_key FROM edit_steps WHERE brief_id IN (${marks})`, ids),
    q.query<{ brief_id: number; version: number; url: string; note: string; submitted_at: string; by_name: string | null }>(
      `SELECT d.brief_id, d.version, d.url, d.note, d.submitted_at, u.name AS by_name
       FROM deliverables d LEFT JOIN users u ON u.id = d.submitted_by WHERE d.brief_id IN (${marks}) ORDER BY d.version`,
      ids,
    ),
  ]);
  return raws.map((r) => {
    const footage: HandoffProof | null = r.storage
      ? { storage: r.storage, driveUrl: r.drive_url, diskName: r.disk_name, path: r.path, fileName: r.file_name, handedAt: r.handed_at!, handedByName: r.handed_by_name }
      : null;
    const versions: DeliverableVersion[] = vers
      .filter((v) => v.brief_id === r.id)
      .map((v) => ({ version: v.version, url: v.url, note: v.note, at: v.submitted_at, byName: v.by_name }));
    return {
      id: r.id, code: r.code, judul: r.judul, produk: r.produk, kategori: r.kategori, jenis: r.jenis, rasio: r.rasio, durasiDetik: r.durasi_detik,
      status: r.status, linkDocs: r.link_docs, catatan: r.catatan, revisionCount: r.revision_count,
      revisionReason: r.status === 'revisi' ? r.revision_reason : null,
      queuedAt: r.queued_at, editorId: r.editor_id, editorName: r.editor_name, bobot: r.edit_bobot, priority: r.edit_priority,
      scheduledFor: r.edit_scheduled_for, dueDate: r.edit_due, startedAt: r.edit_started_at,
      doneSteps: steps.filter((s) => s.brief_id === r.id).map((s) => s.step_key), footage, versions,
    };
  });
}

export async function getSchedule(db: Queryable): Promise<EditingSchedule> {
  const [rows, editors] = await Promise.all([
    loadRows(db),
    db.query<{ id: number; name: string }>("SELECT id, name FROM users WHERE role = 'editor' AND active = TRUE ORDER BY name, id"),
  ]);
  return buildSchedule(rows, editors, todayJakarta());
}

export async function getEditorBoard(db: Queryable, editorId: number | null): Promise<EditorBoard> {
  return buildEditorBoard(await loadRows(db), editorId, todayJakarta());
}

// ───────────── Aksi ─────────────

interface Row {
  id: number;
  code: string;
  jenis: Jenis;
  status: Status;
  editor_id: number | null;
  edit_started_at: string | null;
}

async function load(q: Queryable, id: number): Promise<Row> {
  const r = await q.one<Row>('SELECT id, code, jenis, status, editor_id, edit_started_at FROM briefs WHERE id = $1', [id]);
  if (!r || !isEditJenis(r.jenis)) throw new HttpError(404, 'not_found', 'Konten tidak ditemukan');
  return r;
}
const need = (cond: boolean, msg: string, code = 'bad_state') => {
  if (!cond) throw new HttpError(409, code, msg);
};
const mine = (r: Row, actorId: number) => {
  if (r.editor_id !== actorId) throw new HttpError(403, 'not_assignee', 'Konten ini bukan tugas Anda');
};

/** Assign editor + jadwal (Leader). Dari antrean → Editing; bila sudah di-assign, hanya mengubah editor/jadwal/prioritas. */
export const assign = (db: Db, actorId: number, id: number, input: AssignInput) =>
  db.transaction(async (tx) => {
    const r = await load(tx, id);
    need(['antre_editing', 'editing', 'revisi'].includes(r.status), 'Konten ini tidak bisa di-assign');
    const ed = await tx.one<{ id: number; name: string }>("SELECT id, name FROM users WHERE id = $1 AND role = 'editor' AND active = TRUE", [input.editorId]);
    if (!ed) throw new HttpError(400, 'bad_editor', 'Editor tidak ditemukan atau tidak aktif');
    const changedEditor = r.editor_id !== null && r.editor_id !== input.editorId;
    const detail = `${ed.name} · mulai ${input.scheduledFor} · tenggat ${input.dueDate}${input.priority === 'tinggi' ? ' · prioritas' : ''}`;
    const to: Status = r.status === 'antre_editing' ? 'editing' : r.status;
    await tx.query(
      `UPDATE briefs SET status = $2, editor_id = $3, edit_bobot = $4, edit_priority = $5, edit_scheduled_for = $6, edit_due = $7,
         edit_started_at = CASE WHEN $8 THEN NULL ELSE edit_started_at END, pic_id = $3, updated_at = now() WHERE id = $1`,
      [id, to, input.editorId, input.bobot, input.priority, input.scheduledFor, input.dueDate, changedEditor],
    );
    await addEvent(tx, id, r.status, to, actorId, r.status === 'antre_editing' ? `Assign: ${detail}` : `Jadwal editing diubah: ${detail}`);
    await audit(tx, actorId, 'editing.assign', 'brief', id, { ...input });
  });

/** Editor mulai mengerjakan (To Do → On Progress). Revisi: kembali ke Editing dan langkah akhir dibuka lagi. */
export const startEdit = (db: Db, actorId: number, id: number) =>
  db.transaction(async (tx) => {
    const r = await load(tx, id);
    mine(r, actorId);
    if (r.status === 'revisi') {
      await tx.query("UPDATE briefs SET status = 'editing', edit_started_at = now(), updated_at = now() WHERE id = $1", [id]);
      const marks = RESET_ON_REVISION.map((_, i) => `$${i + 2}`).join(', ');
      await tx.query(`DELETE FROM edit_steps WHERE brief_id = $1 AND step_key IN (${marks})`, [id, ...RESET_ON_REVISION]);
      await addEvent(tx, id, 'revisi', 'editing', actorId, 'Mulai mengerjakan revisi');
    } else {
      need(r.status === 'editing' && r.edit_started_at === null, 'Konten ini tidak bisa dimulai');
      await tx.query('UPDATE briefs SET edit_started_at = now(), updated_at = now() WHERE id = $1', [id]);
      await addEvent(tx, id, 'editing', 'editing', actorId, 'Mulai edit');
    }
    await audit(tx, actorId, 'editing.start', 'brief', id);
  });

export const setStep = (db: Db, actorId: number, id: number, key: string, done: boolean) =>
  db.transaction(async (tx) => {
    const r = await load(tx, id);
    mine(r, actorId);
    need(r.status === 'editing' && r.edit_started_at !== null, 'Mulai edit dulu sebelum mencentang langkah');
    if (!isStepKey(r.jenis, key)) throw new HttpError(400, 'bad_step', 'Langkah tidak dikenal');
    if (done) {
      await tx.query('INSERT INTO edit_steps (brief_id, step_key, done_by) VALUES ($1, $2, $3) ON CONFLICT (brief_id, step_key) DO NOTHING', [id, key, actorId]);
    } else {
      await tx.query('DELETE FROM edit_steps WHERE brief_id = $1 AND step_key = $2', [id, key]);
    }
  });

/** Kirim hasil ke In Review sebagai versi baru. Syarat: sedang On Progress dan Self-QC sudah dicentang. */
export const submit = (db: Db, actorId: number, id: number, input: SubmitInput) =>
  db.transaction(async (tx) => {
    const r = await load(tx, id);
    mine(r, actorId);
    need(r.status === 'editing' && r.edit_started_at !== null, 'Konten belum berstatus On Progress');
    const qc = await tx.one('SELECT 1 AS ok FROM edit_steps WHERE brief_id = $1 AND step_key = $2', [id, REQUIRED_STEP]);
    need(qc !== undefined, 'Selesaikan Self-QC dulu sebelum mengirim ke In Review', 'selfqc_required');
    const v = await tx.one<{ n: number }>('SELECT COALESCE(max(version), 0) + 1 AS n FROM deliverables WHERE brief_id = $1', [id]);
    const version = Number(v!.n);
    await tx.query('INSERT INTO deliverables (brief_id, version, url, note, submitted_by) VALUES ($1, $2, $3, $4, $5)', [id, version, input.url, input.note, actorId]);
    await tx.query("UPDATE briefs SET status = 'in_review', updated_at = now() WHERE id = $1", [id]);
    await addEvent(tx, id, 'editing', 'in_review', actorId, `Hasil editing v${version} dikirim${input.note ? `: ${input.note}` : ''}`);
    await audit(tx, actorId, 'editing.submit', 'brief', id, { version });
  });
