import {
  BRIEF_FILTERS,
  STATUSES,
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
import { audit, type Db } from './db';

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

/** Kode brief: VID-YYYYMMDD-NNN, urut per hari (WIB). */
function nextCode(db: Db, at: Date): string {
  const day = todayJakarta(at).replaceAll('-', '');
  const prefix = `VID-${day}-`;
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM briefs WHERE code LIKE ?').get(`${prefix}%`) as { n: number };
  return `${prefix}${String(n + 1).padStart(3, '0')}`;
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
}

export function insertBrief(db: Db, p: InsertBrief): number {
  return db.transaction(() => {
    const submitted = p.submittedAt ?? new Date();
    const submittedIso = submitted.toISOString();
    const { input } = p;
    const info = db
      .prepare(
        `INSERT INTO briefs (code, requester_id, jenis, kategori, produk, judul, rasio, durasi_detik, link_docs, catatan,
           status, revision_count, submitted_at, sla_target_at, completed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        nextCode(db, submitted), p.requesterId, input.jenis, input.kategori, input.produk, input.judul, input.rasio,
        input.durasiDetik, input.linkDocs, input.catatan, p.status, p.revisionCount ?? 0, submittedIso,
        slaTargetFor(input.jenis, submittedIso), p.completedAt?.toISOString() ?? null,
      );
    const id = Number(info.lastInsertRowid);
    writeAttributes(db, id, input.attributes);
    addEvent(db, id, null, p.status, p.actorId, p.reason ?? '');
    return id;
  })();
}

export function writeAttributes(db: Db, briefId: number, a: BriefAttributes | null): void {
  if (!a) {
    db.prepare('DELETE FROM brief_attributes WHERE brief_id = ?').run(briefId);
    return;
  }
  db.prepare(
    `INSERT INTO brief_attributes (brief_id, talent, kostum, lokasi, lokasi_detail, properti, desain)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(brief_id) DO UPDATE SET talent = excluded.talent, kostum = excluded.kostum, lokasi = excluded.lokasi,
       lokasi_detail = excluded.lokasi_detail, properti = excluded.properti, desain = excluded.desain`,
  ).run(briefId, a.talent, a.kostum, a.lokasi, a.lokasiDetail, a.properti, a.desain);
}

export function addEvent(db: Db, briefId: number, from: Status | null, to: Status, actorId: number | null, reason: string): void {
  db.prepare('INSERT INTO brief_events (brief_id, from_status, to_status, actor_id, reason) VALUES (?, ?, ?, ?, ?)').run(
    briefId, from, to, actorId, reason,
  );
}

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export function listBriefs(db: Db, opts: { requesterId?: number; filter: BriefFilter; q: string }): BriefListItem[] {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (opts.requesterId !== undefined) {
    where.push('b.requester_id = ?');
    params.push(opts.requesterId);
  }
  const statuses = STATUSES.filter(BRIEF_FILTERS[opts.filter]);
  where.push(`b.status IN (${statuses.map(() => '?').join(',')})`);
  params.push(...statuses);
  if (opts.q) {
    const like = `%${escapeLike(opts.q)}%`;
    where.push("(b.code LIKE ? ESCAPE '\\' OR b.judul LIKE ? ESCAPE '\\' OR b.produk LIKE ? ESCAPE '\\')");
    params.push(like, like, like);
  }
  const rows = db.prepare(`${SELECT} WHERE ${where.join(' AND ')} ORDER BY b.submitted_at DESC, b.id DESC`).all(...params) as BriefRow[];
  return rows.map(toListItem);
}

export function getBriefRow(db: Db, id: number): BriefRow | undefined {
  return db.prepare(`${SELECT} WHERE b.id = ?`).get(id) as BriefRow | undefined;
}

export function getBriefDetail(db: Db, id: number): BriefDetail | undefined {
  const row = getBriefRow(db, id);
  if (!row) return undefined;
  const a = db.prepare('SELECT * FROM brief_attributes WHERE brief_id = ?').get(id) as
    | { talent: string; kostum: string; lokasi: BriefAttributes['lokasi']; lokasi_detail: string; properti: string; desain: string }
    | undefined;
  const history = db
    .prepare(
      `SELECT e.from_status, e.to_status, e.reason, e.created_at, u.name AS actor_name
       FROM brief_events e LEFT JOIN users u ON u.id = e.actor_id
       WHERE e.brief_id = ? ORDER BY e.id`,
    )
    .all(id) as { from_status: Status | null; to_status: Status; reason: string; created_at: string; actor_name: string | null }[];
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

export function updateBriefContent(db: Db, id: number, actorId: number, input: BriefInput): void {
  db.transaction(() => {
    db.prepare(
      `UPDATE briefs SET kategori = ?, produk = ?, judul = ?, rasio = ?, durasi_detik = ?, link_docs = ?, catatan = ?,
         updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`,
    ).run(input.kategori, input.produk, input.judul, input.rasio, input.durasiDetik, input.linkDocs, input.catatan, id);
    writeAttributes(db, id, input.attributes);
    audit(db, actorId, 'brief.update', 'brief', id);
  })();
}

export function applyTransition(
  db: Db,
  b: { id: number; jenis: Jenis; status: Status; revision_count: number },
  to: Status,
  actorId: number,
  reason: string,
): void {
  db.transaction(() => {
    const now = new Date().toISOString();
    const sets = ['status = ?', "updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')"];
    const params: (string | number | null)[] = [to];
    if (to === 'complete') {
      sets.push('completed_at = ?');
      params.push(now);
    }
    if (to === 'revisi') {
      sets.push('revision_count = ?');
      params.push(b.revision_count + 1);
    }
    // Kirim ulang dari Backlog: jam SLA dimulai lagi.
    if (b.status === 'backlog') {
      sets.push('submitted_at = ?', 'sla_target_at = ?');
      params.push(now, slaTargetFor(b.jenis, now));
    }
    db.prepare(`UPDATE briefs SET ${sets.join(', ')} WHERE id = ?`).run(...params, b.id);
    addEvent(db, b.id, b.status, to, actorId, reason);
    audit(db, actorId, 'brief.transition', 'brief', b.id, { from: b.status, to, reason });
  })();
}
