import {
  BRIEF_FILTERS,
  STATUSES,
  isWeekly,
  productionWeekFor,
  slaTargetFor,
  todayJakarta,
  type BriefAttributes,
  type BriefDetail,
  type BriefEvent,
  type BriefFilter,
  type BriefInput,
  type BriefListItem,
  type Jenis,
  type Rasio,
  type Status,
} from '@ccp/shared';
import { audit, type Db, type Queryable } from './db';

interface BriefRow {
  id: number;
  code: string;
  requester_id: number;
  requester_name: string;
  requester_unit: string;
  pic_name: string | null;
  jenis: Jenis;
  kategori: string;
  produk: string;
  judul: string;
  rasio: Rasio;
  durasi_detik: number | null;
  link_docs: string;
  catatan: string;
  status: Status;
  revision_count: number;
  submitted_at: string;
  sla_target_at: string | null;
  completed_at: string | null;
}

const SELECT = `
  SELECT b.*, u.name AS requester_name, u.unit AS requester_unit, p.name AS pic_name
  FROM briefs b
  JOIN users u ON u.id = b.requester_id
  LEFT JOIN users p ON p.id = b.pic_id`;

const toListItem = (r: BriefRow): BriefListItem => ({
  id: r.id,
  code: r.code,
  status: r.status,
  judul: r.judul,
  produk: r.produk,
  kategori: r.kategori,
  jenis: r.jenis,
  rasio: r.rasio,
  durasiDetik: r.durasi_detik,
  requester: { id: r.requester_id, name: r.requester_name, unit: r.requester_unit },
  pic: r.pic_name,
  submittedAt: r.submitted_at,
  slaTargetAt: r.sla_target_at,
  completedAt: r.completed_at,
  revisionCount: r.revision_count,
});

/** Kode brief: VID-YYYYMMDD-NNN, urut per hari (WIB). Penghitung atomik, aman untuk akses bersamaan. */
async function nextCode(tx: Queryable, at: Date): Promise<string> {
  const day = todayJakarta(at).replaceAll('-', '');
  const row = await tx.one<{ n: number }>(
    `INSERT INTO brief_counters (day, n) VALUES ($1, 1)
     ON CONFLICT (day) DO UPDATE SET n = brief_counters.n + 1
     RETURNING n`,
    [day],
  );
  return `VID-${day}-${String(row!.n).padStart(3, '0')}`;
}

export interface InsertBrief {
  requesterId: number;
  input: BriefInput;
  status: Status;
  actorId: number | null;
  submittedAt?: Date;
  completedAt?: Date | null;
  revisionCount?: number;
  reason?: string;
  /** Hanya untuk seed/uji: mengisi data Weekly Listing langsung. */
  weekly?: { weekStart: string; bobot: 'gampang' | 'susah'; day: number | null; fuProperti: string; fuKostum: string; fuDesain: string };
}

export async function insertBrief(db: Db, p: InsertBrief): Promise<number> {
  return db.transaction(async (tx) => {
    const submitted = p.submittedAt ?? new Date();
    const submittedIso = submitted.toISOString();
    const { input } = p;
    const row = await tx.one<{ id: number }>(
      `INSERT INTO briefs (code, requester_id, jenis, kategori, produk, judul, rasio, durasi_detik, link_docs, catatan,
         status, revision_count, submitted_at, sla_target_at, completed_at, week_start, bobot, shoot_day)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
       RETURNING id`,
      [
        await nextCode(tx, submitted), p.requesterId, input.jenis, input.kategori, input.produk, input.judul, input.rasio,
        input.durasiDetik, input.linkDocs, input.catatan, p.status, p.revisionCount ?? 0, submittedIso,
        slaTargetFor(input.jenis, submittedIso), p.completedAt?.toISOString() ?? null,
        isWeekly(input.jenis) ? (p.weekly?.weekStart ?? productionWeekFor(todayJakarta(submitted))) : null,
        p.weekly?.bobot ?? 'gampang', p.weekly?.day ?? null,
      ],
    );
    const id = row!.id;
    await writeAttributes(tx, id, input.attributes);
    if (p.weekly && input.attributes) {
      await tx.query('UPDATE brief_attributes SET fu_properti = $2, fu_kostum = $3, fu_desain = $4 WHERE brief_id = $1', [
        id, p.weekly.fuProperti, p.weekly.fuKostum, p.weekly.fuDesain,
      ]);
    }
    await addEvent(tx, id, null, p.status, p.actorId, p.reason ?? '');
    return id;
  });
}

export async function writeAttributes(q: Queryable, briefId: number, a: BriefAttributes | null): Promise<void> {
  if (!a) {
    await q.query('DELETE FROM brief_attributes WHERE brief_id = $1', [briefId]);
    return;
  }
  await q.query(
    `INSERT INTO brief_attributes (brief_id, talent, kostum, lokasi, lokasi_detail, properti, desain)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (brief_id) DO UPDATE SET talent = EXCLUDED.talent, kostum = EXCLUDED.kostum, lokasi = EXCLUDED.lokasi,
       lokasi_detail = EXCLUDED.lokasi_detail, properti = EXCLUDED.properti, desain = EXCLUDED.desain`,
    [briefId, a.talent, a.kostum, a.lokasi, a.lokasiDetail, a.properti, a.desain],
  );
}

export async function addEvent(q: Queryable, briefId: number, from: Status | null, to: Status, actorId: number | null, reason: string): Promise<void> {
  await q.query('INSERT INTO brief_events (brief_id, from_status, to_status, actor_id, reason) VALUES ($1, $2, $3, $4, $5)', [
    briefId, from, to, actorId, reason,
  ]);
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function listBriefs(db: Queryable, opts: { requesterId?: number; filter: BriefFilter; q: string }): Promise<BriefListItem[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  const bind = (v: unknown) => `$${params.push(v)}`;

  if (opts.requesterId !== undefined) where.push(`b.requester_id = ${bind(opts.requesterId)}`);
  const statuses = STATUSES.filter(BRIEF_FILTERS[opts.filter]);
  where.push(`b.status IN (${statuses.map((s) => bind(s)).join(', ')})`);
  if (opts.q) {
    // lower(...) LIKE lower(...) = pencarian tak peka huruf besar/kecil yang sama di semua database SQL.
    const like = bind(`%${escapeLike(opts.q)}%`);
    where.push(`(lower(b.code) LIKE lower(${like}) ESCAPE '\\' OR lower(b.judul) LIKE lower(${like}) ESCAPE '\\' OR lower(b.produk) LIKE lower(${like}) ESCAPE '\\')`);
  }
  const rows = await db.query<BriefRow>(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY b.submitted_at DESC, b.id DESC`, params);
  return rows.map(toListItem);
}

export const getBriefRow = (db: Queryable, id: number) => db.one<BriefRow>(`${SELECT} WHERE b.id = $1`, [id]);

export async function getBriefDetail(db: Queryable, id: number): Promise<BriefDetail | undefined> {
  const row = await getBriefRow(db, id);
  if (!row) return undefined;
  const a = await db.one<{ talent: string; kostum: string; lokasi: BriefAttributes['lokasi']; lokasi_detail: string; properti: string; desain: string }>(
    'SELECT * FROM brief_attributes WHERE brief_id = $1',
    [id],
  );
  const history = await db.query<{ from_status: Status | null; to_status: Status; reason: string; created_at: string; actor_name: string | null }>(
    `SELECT e.from_status, e.to_status, e.reason, e.created_at, u.name AS actor_name
     FROM brief_events e LEFT JOIN users u ON u.id = e.actor_id
     WHERE e.brief_id = $1 ORDER BY e.id`,
    [id],
  );
  const events: BriefEvent[] = history.map((h) => ({ from: h.from_status, to: h.to_status, actorName: h.actor_name, reason: h.reason, at: h.created_at }));
  return {
    ...toListItem(row),
    linkDocs: row.link_docs,
    catatan: row.catatan,
    attributes: a
      ? { talent: a.talent, kostum: a.kostum, lokasi: a.lokasi, lokasiDetail: a.lokasi_detail, properti: a.properti, desain: a.desain }
      : null,
    history: events,
  };
}

export async function updateBriefContent(db: Db, id: number, actorId: number, input: BriefInput): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.query(
      `UPDATE briefs SET kategori = $1, produk = $2, judul = $3, rasio = $4, durasi_detik = $5, link_docs = $6, catatan = $7,
         updated_at = now() WHERE id = $8`,
      [input.kategori, input.produk, input.judul, input.rasio, input.durasiDetik, input.linkDocs, input.catatan, id],
    );
    await writeAttributes(tx, id, input.attributes);
    await audit(tx, actorId, 'brief.update', 'brief', id);
  });
}

export async function applyTransition(
  db: Db,
  b: { id: number; jenis: Jenis; status: Status; revision_count: number },
  to: Status,
  actorId: number,
  reason: string,
): Promise<void> {
  await db.transaction(async (tx) => {
    const now = new Date().toISOString();
    const params: unknown[] = [];
    const bind = (v: unknown) => `$${params.push(v)}`;
    const sets = [`status = ${bind(to)}`, 'updated_at = now()'];
    if (to === 'complete') sets.push(`completed_at = ${bind(now)}`);
    if (to === 'revisi') sets.push(`revision_count = ${bind(b.revision_count + 1)}`);
    // Kirim ulang dari Backlog: jam SLA dimulai lagi.
    if (b.status === 'backlog') {
      sets.push(`submitted_at = ${bind(now)}`, `sla_target_at = ${bind(slaTargetFor(b.jenis, now))}`);
      if (isWeekly(b.jenis)) sets.push(`week_start = ${bind(productionWeekFor(todayJakarta(new Date(now))))}`, 'shoot_day = NULL');
    }
    await tx.query(`UPDATE briefs SET ${sets.join(', ')} WHERE id = ${bind(b.id)}`, params);
    await addEvent(tx, b.id, b.status, to, actorId, reason);
    await audit(tx, actorId, 'brief.transition', 'brief', b.id, { from: b.status, to, reason });
  });
}
