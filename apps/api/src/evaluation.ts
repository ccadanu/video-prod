import {
  MIN_RESPONSES,
  shuffled,
  todayJakarta,
  type CycleInput,
  type EvalAction,
  type EvalCycle,
  type EvalForm,
  type EvalFormItem,
  type EvalResult,
  type Jenis,
  type ResponseInput,
  type Role,
} from '@ccp/shared';
import { audit, type Db, type Queryable } from './db';
import { HttpError } from './errors';

interface CycleRow {
  id: number;
  name: string;
  period_start: string;
  period_end: string;
  status: 'open' | 'closed';
  created_at: string;
  closed_at: string | null;
  fgd_at: string | null;
  fgd_notes: string;
  invited: number;
  submitted: number;
}

const CYCLE_SQL = `
  SELECT c.id, c.name, c.period_start, c.period_end, c.status, c.created_at, c.closed_at, c.fgd_at, c.fgd_notes,
         (SELECT COUNT(*) FROM eval_invites i WHERE i.cycle_id = c.id) AS invited,
         (SELECT COUNT(*) FROM eval_invites i WHERE i.cycle_id = c.id AND i.submitted_at IS NOT NULL) AS submitted
  FROM eval_cycles c`;

const need = (cond: boolean, msg: string, code = 'bad_state') => {
  if (!cond) throw new HttpError(409, code, msg);
};

/** Konten yang berhak dinilai User pada siklus: miliknya, selesai pada periode, belum pernah dinilai. */
async function eligibleItems(q: Queryable, userId: number, start: string, end: string): Promise<EvalFormItem[]> {
  const rows = await q.query<{ id: number; code: string; judul: string; jenis: Jenis; completed_at: string }>(
    `SELECT b.id, b.code, b.judul, b.jenis, b.completed_at FROM briefs b
     WHERE b.requester_id = $1 AND b.status = 'complete' AND b.completed_at IS NOT NULL
       AND (b.completed_at AT TIME ZONE 'Asia/Jakarta')::date BETWEEN $2::date AND $3::date
       AND NOT EXISTS (SELECT 1 FROM eval_responses r WHERE r.brief_id = b.id)
     ORDER BY b.completed_at, b.id`,
    [userId, start, end],
  );
  return rows.map((r) => ({ briefId: r.id, code: r.code, judul: r.judul, jenis: r.jenis, completedAt: r.completed_at }));
}

async function actionsOf(q: Queryable, ids: number[]): Promise<Map<number, EvalAction[]>> {
  const map = new Map<number, EvalAction[]>();
  if (ids.length === 0) return map;
  const marks = ids.map((_, i) => `$${i + 1}`).join(', ');
  const rows = await q.query<{ id: number; cycle_id: number; text: string; done: boolean; created_at: string }>(
    `SELECT id, cycle_id, text, done, created_at FROM eval_actions WHERE cycle_id IN (${marks}) ORDER BY id`,
    ids,
  );
  for (const r of rows) map.set(r.cycle_id, [...(map.get(r.cycle_id) ?? []), { id: r.id, text: r.text, done: r.done, createdAt: r.created_at }]);
  return map;
}

const toCycle = (r: CycleRow, actions: EvalAction[]): EvalCycle => ({
  id: r.id, name: r.name, periodStart: r.period_start, periodEnd: r.period_end, status: r.status, createdAt: r.created_at, closedAt: r.closed_at,
  invited: Number(r.invited), submitted: Number(r.submitted), fgdAt: r.fgd_at, fgdNotes: r.fgd_notes, actions,
});

/**
 * Daftar siklus menurut peran:
 * - Leader/Admin: semua siklus.
 * - User: siklus yang mengundangnya (dengan status partisipasi), tanpa hasil.
 * - Videografer/Editor: hanya siklus yang sudah ditutup (hasil tim + tindak lanjut, tanpa nama).
 */
export async function listCycles(db: Queryable, viewer: { role: Role; id: number }): Promise<EvalCycle[]> {
  const rows = await db.query<CycleRow>(`${CYCLE_SQL} ORDER BY c.period_end DESC, c.id DESC`);
  const mine = viewer.role === 'user'
    ? new Map((await db.query<{ cycle_id: number; submitted_at: string | null }>('SELECT cycle_id, submitted_at FROM eval_invites WHERE user_id = $1', [viewer.id])).map((i) => [i.cycle_id, i.submitted_at !== null]))
    : null;
  const visible = rows.filter((r) => (viewer.role === 'user' ? mine!.has(r.id) : viewer.role === 'leader' || viewer.role === 'admin' ? true : r.status === 'closed'));
  const actions = await actionsOf(db, visible.map((r) => r.id));
  return visible.map((r) => {
    const c = toCycle(r, actions.get(r.id) ?? []);
    if (viewer.role === 'user') return { ...c, invited: 0, submitted: 0, fgdNotes: '', actions: [], me: { invited: true, submitted: mine!.get(r.id)! } };
    return c;
  });
}

/** Leader mendistribusikan form: siklus baru + undangan untuk setiap User yang punya konten selesai pada periode. */
export const createCycle = (db: Db, actorId: number, input: CycleInput) =>
  db.transaction(async (tx) => {
    need(input.periodEnd <= todayJakarta(), 'Akhir periode tidak boleh di masa depan', 'future_period');
    const row = await tx.one<{ id: number }>(
      'INSERT INTO eval_cycles (name, period_start, period_end, created_by) VALUES ($1, $2, $3, $4) RETURNING id',
      [input.name || `Evaluasi ${input.periodStart} s.d. ${input.periodEnd}`, input.periodStart, input.periodEnd, actorId],
    );
    const id = row!.id;
    const users = await tx.query<{ requester_id: number }>(
      `SELECT DISTINCT b.requester_id FROM briefs b
       WHERE b.status = 'complete' AND b.completed_at IS NOT NULL
         AND (b.completed_at AT TIME ZONE 'Asia/Jakarta')::date BETWEEN $1::date AND $2::date
         AND NOT EXISTS (SELECT 1 FROM eval_responses r WHERE r.brief_id = b.id)`,
      [input.periodStart, input.periodEnd],
    );
    for (const u of users) await tx.query('INSERT INTO eval_invites (cycle_id, user_id) VALUES ($1, $2)', [id, u.requester_id]);
    await audit(tx, actorId, 'eval.create', 'eval_cycle', id, { invited: users.length });
    return id;
  });

export async function getForm(db: Queryable, userId: number, cycleId: number): Promise<EvalForm> {
  const c = await db.one<CycleRow>(`${CYCLE_SQL} WHERE c.id = $1`, [cycleId]);
  const inv = await db.one<{ submitted_at: string | null }>('SELECT submitted_at FROM eval_invites WHERE cycle_id = $1 AND user_id = $2', [cycleId, userId]);
  if (!c || !inv) throw new HttpError(404, 'not_found', 'Form evaluasi tidak ditemukan');
  need(c.status === 'open', 'Siklus evaluasi ini sudah ditutup');
  need(inv.submitted_at === null, 'Anda sudah mengisi evaluasi ini. Terima kasih!', 'already_submitted');
  return { cycle: { ...toCycle(c, []), invited: 0, submitted: 0 }, items: await eligibleItems(db, userId, c.period_start, c.period_end) };
}

/**
 * Menyimpan jawaban TANPA identitas: baris jawaban tidak memuat pengisi maupun waktu. Yang dicatat per orang hanyalah
 * bahwa ia sudah berpartisipasi (agar tidak mengisi dua kali). Blind di dalam aplikasi: tidak ada layar yang menampilkan identitas.
 */
export const submitResponse = (db: Db, userId: number, cycleId: number, input: ResponseInput) =>
  db.transaction(async (tx) => {
    const c = await tx.one<CycleRow>(`${CYCLE_SQL} WHERE c.id = $1`, [cycleId]);
    const inv = await tx.one<{ submitted_at: string | null }>('SELECT submitted_at FROM eval_invites WHERE cycle_id = $1 AND user_id = $2', [cycleId, userId]);
    if (!c || !inv) throw new HttpError(404, 'not_found', 'Form evaluasi tidak ditemukan');
    need(c.status === 'open', 'Siklus evaluasi ini sudah ditutup');
    need(inv.submitted_at === null, 'Anda sudah mengisi evaluasi ini', 'already_submitted');
    const items = await eligibleItems(tx, userId, c.period_start, c.period_end);
    const ids = new Set(items.map((i) => i.briefId));
    const given = new Set(input.ratings.map((r) => r.briefId));
    if (given.size !== input.ratings.length || given.size !== ids.size || [...given].some((id) => !ids.has(id))) {
      throw new HttpError(400, 'bad_ratings', 'Beri rating untuk setiap konten pada form (tanpa duplikat)');
    }
    for (const r of input.ratings) await tx.query('INSERT INTO eval_responses (cycle_id, brief_id, rating) VALUES ($1, $2, $3)', [cycleId, r.briefId, r.rating]);
    for (const [kind, body] of [['good', input.good], ['improve', input.improve]] as const) {
      if (body) await tx.query('INSERT INTO eval_comments (cycle_id, kind, body) VALUES ($1, $2, $3)', [cycleId, kind, body]);
    }
    await tx.query('UPDATE eval_invites SET submitted_at = now() WHERE cycle_id = $1 AND user_id = $2', [cycleId, userId]);
    await audit(tx, userId, 'eval.submit', 'eval_cycle', cycleId);
  });

export const closeCycle = (db: Db, actorId: number, cycleId: number) =>
  db.transaction(async (tx) => {
    const c = await tx.one<{ status: string }>('SELECT status FROM eval_cycles WHERE id = $1', [cycleId]);
    if (!c) throw new HttpError(404, 'not_found', 'Siklus tidak ditemukan');
    need(c.status === 'open', 'Siklus sudah ditutup');
    await tx.query("UPDATE eval_cycles SET status = 'closed', closed_at = now() WHERE id = $1", [cycleId]);
    await audit(tx, actorId, 'eval.close', 'eval_cycle', cycleId);
  });

/** Hasil tim. Disembunyikan bila respons terlalu sedikit agar tidak mengarah ke satu orang (MIN_RESPONSES). */
export async function getResult(db: Queryable, viewer: { role: Role }, cycleId: number): Promise<EvalResult> {
  const c = await db.one<CycleRow>(`${CYCLE_SQL} WHERE c.id = $1`, [cycleId]);
  if (!c) throw new HttpError(404, 'not_found', 'Siklus tidak ditemukan');
  if (viewer.role !== 'leader' && viewer.role !== 'admin') need(c.status === 'closed', 'Hasil tersedia setelah siklus ditutup', 'not_closed');
  const responses = Number(c.submitted);
  const enough = responses >= MIN_RESPONSES;
  const base = { cycleId, responses, enough, min: MIN_RESPONSES };
  if (!enough) return { ...base, avg: null, dist: [0, 0, 0, 0, 0], byJenis: [], good: [], improve: [] };
  const rows = await db.query<{ rating: number; jenis: Jenis }>('SELECT r.rating, b.jenis FROM eval_responses r JOIN briefs b ON b.id = r.brief_id WHERE r.cycle_id = $1', [cycleId]);
  const comments = await db.query<{ kind: 'good' | 'improve'; body: string }>('SELECT kind, body FROM eval_comments WHERE cycle_id = $1', [cycleId]);
  const dist = [0, 0, 0, 0, 0];
  for (const r of rows) dist[Number(r.rating) - 1]!++;
  const byJenis = new Map<Jenis, number[]>();
  for (const r of rows) byJenis.set(r.jenis, [...(byJenis.get(r.jenis) ?? []), Number(r.rating)]);
  const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  return {
    ...base,
    avg: rows.length ? mean(rows.map((r) => Number(r.rating))) : null,
    dist,
    byJenis: [...byJenis.entries()].map(([jenis, xs]) => ({ jenis, avg: mean(xs), n: xs.length })),
    good: shuffled(comments.filter((x) => x.kind === 'good').map((x) => x.body), cycleId),
    improve: shuffled(comments.filter((x) => x.kind === 'improve').map((x) => x.body), cycleId),
  };
}

// ───────────── FGD & tindak lanjut (Leader) ─────────────

export const saveFgd = (db: Db, actorId: number, cycleId: number, notes: string, at: string) =>
  db.transaction(async (tx) => {
    const c = await tx.one('SELECT 1 AS ok FROM eval_cycles WHERE id = $1', [cycleId]);
    if (!c) throw new HttpError(404, 'not_found', 'Siklus tidak ditemukan');
    await tx.query('UPDATE eval_cycles SET fgd_notes = $2, fgd_at = $3 WHERE id = $1', [cycleId, notes, at]);
    await audit(tx, actorId, 'eval.fgd', 'eval_cycle', cycleId);
  });

export const addAction = (db: Db, actorId: number, cycleId: number, text: string) =>
  db.transaction(async (tx) => {
    const c = await tx.one('SELECT 1 AS ok FROM eval_cycles WHERE id = $1', [cycleId]);
    if (!c) throw new HttpError(404, 'not_found', 'Siklus tidak ditemukan');
    await tx.query('INSERT INTO eval_actions (cycle_id, text, created_by) VALUES ($1, $2, $3)', [cycleId, text, actorId]);
    await audit(tx, actorId, 'eval.action', 'eval_cycle', cycleId);
  });

export const toggleAction = (db: Db, actorId: number, actionId: number, done: boolean) =>
  db.transaction(async (tx) => {
    const a = await tx.one('SELECT 1 AS ok FROM eval_actions WHERE id = $1', [actionId]);
    if (!a) throw new HttpError(404, 'not_found', 'Tindak lanjut tidak ditemukan');
    await tx.query('UPDATE eval_actions SET done = $2 WHERE id = $1', [actionId, done]);
    await audit(tx, actorId, 'eval.action_done', 'eval_action', actionId, { done });
  });
