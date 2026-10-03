import {
  DAY_NAMES,
  addDays,
  dailyColumn,
  handoffNeedsDrive,
  routeOf,
  sdmKey,
  sdmNeeds,
  summarize,
  weekLabel,
  type DailyCard,
  type DayBoard,
  type HandoffInput,
  type Jenis,
  type SdmType,
  type Status,
} from '@ccp/shared';
import { addEvent } from './briefs';
import { audit, type Db, type Queryable } from './db';
import { HttpError } from './errors';
import { syncSdm } from './weekly';

interface CardRow {
  id: number;
  code: string;
  judul: string;
  produk: string;
  jenis: Jenis;
  status: Status;
  shoot_day: number;
  bobot: 'gampang' | 'susah';
  hold_reason: string | null;
  talent: string;
  lokasi: string;
  lokasi_detail: string;
  fu_properti: string;
  fu_kostum: string;
  fu_desain: string;
  storage: 'drive' | 'hdd' | null;
  drive_url: string | null;
  disk_name: string | null;
  path: string | null;
  file_name: string | null;
  handed_at: string | null;
  handed_by_name: string | null;
}

const CARD_SQL = `
  SELECT b.id, b.code, b.judul, b.produk, b.jenis, b.status, b.shoot_day, b.bobot, b.hold_reason,
         a.talent, a.lokasi, a.lokasi_detail, a.fu_properti, a.fu_kostum, a.fu_desain,
         h.storage, h.drive_url, h.disk_name, h.path, h.file_name, h.handed_at, hu.name AS handed_by_name
  FROM briefs b
  JOIN brief_attributes a ON a.brief_id = b.id
  LEFT JOIN footage_handoffs h ON h.brief_id = b.id
  LEFT JOIN users hu ON hu.id = h.handed_by
  WHERE b.week_start = $1 AND b.shoot_day IS NOT NULL
    AND (b.status IN ('ready', 'syuting', 'footage_siap') OR h.brief_id IS NOT NULL)
  ORDER BY b.shoot_day, b.id`;

export async function getBoard(db: Queryable, week: string, day: number): Promise<DayBoard> {
  const [rows, items, w, docs] = await Promise.all([
    db.query<CardRow>(CARD_SQL, [week]),
    db.query<{ day: number; type: SdmType; name: string; ready: boolean }>('SELECT day, type, name, ready FROM sdm_items WHERE week_start = $1', [week]),
    db.one<{ ready_at: string | null }>('SELECT ready_at FROM weekly_weeks WHERE week_start = $1', [week]),
    db.one<{ shotlist_url: string | null; skrip_url: string | null }>('SELECT shotlist_url, skrip_url FROM weekly_day_docs WHERE week_start = $1 AND day = $2', [week, day]),
  ]);
  const unready = new Set(items.filter((i) => !i.ready).map((i) => sdmKey(i.day, i)));

  const cards: DailyCard[] = [];
  for (const r of rows) {
    const column = dailyColumn({ status: r.status, day: r.shoot_day, handedOff: r.storage !== null, redo: r.status === 'revisi' && routeOf(r.jenis) === 'review' }, day);
    if (!column) continue;
    cards.push({
      id: r.id, code: r.code, judul: r.judul, produk: r.produk, jenis: r.jenis, status: r.status, day: r.shoot_day, column,
      talent: r.talent, lokasi: r.lokasi === 'Lainnya' && r.lokasi_detail ? r.lokasi_detail : r.lokasi, bobot: r.bobot, route: routeOf(r.jenis),
      holdReason: r.hold_reason, fromDay: r.shoot_day < day && column !== 'terkirim' ? r.shoot_day : null,
      sdmIssue: sdmNeeds({ talent: r.talent, lokasi: r.lokasi, lokasiDetail: r.lokasi_detail, fuProperti: r.fu_properti, fuKostum: r.fu_kostum, fuDesain: r.fu_desain }).some((n) => unready.has(sdmKey(r.shoot_day, n))),
      proof: r.storage
        ? { storage: r.storage, driveUrl: r.drive_url, diskName: r.disk_name, path: r.path, fileName: r.file_name, handedAt: r.handed_at!, handedByName: r.handed_by_name }
        : null,
    });
  }
  const dayCounts = [0, 1, 2, 3, 4].map((d) => rows.filter((r) => r.shoot_day === d).length);
  return {
    weekStart: week, day, date: addDays(week, day), weekLabel: weekLabel(week), weekReady: w?.ready_at != null,
    summary: summarize(cards), guide: { shotlistUrl: docs?.shotlist_url ?? null, skripUrl: docs?.skrip_url ?? null }, dayCounts, cards,
  };
}

// ───────────── Aksi VG ─────────────

interface Row {
  id: number;
  status: Status;
  jenis: Jenis;
  week_start: string;
  shoot_day: number;
  hold_reason: string | null;
  pic_id: number | null;
  code: string;
}

async function load(q: Queryable, id: number): Promise<Row> {
  const r = await q.one<Row>('SELECT id, status, jenis, week_start, shoot_day, hold_reason, pic_id, code FROM briefs WHERE id = $1 AND week_start IS NOT NULL AND shoot_day IS NOT NULL', [id]);
  if (!r) throw new HttpError(404, 'not_found', 'Konten tidak ditemukan');
  return r;
}
const need = (cond: boolean, msg: string, code = 'bad_state') => {
  if (!cond) throw new HttpError(409, code, msg);
};
const notHeld = (r: Row) => need(r.hold_reason === null, 'Konten sedang di-hold. Lanjutkan dulu (Resume).', 'held');

export const startTake = (db: Db, actorId: number, id: number) =>
  db.transaction(async (tx) => {
    const r = await load(tx, id);
    const redo = r.status === 'revisi' && routeOf(r.jenis) === 'review';
    need(r.status === 'ready' || redo, 'Hanya konten Ready (atau revisi Shooting Only/Photoshoot) yang bisa mulai take');
    notHeld(r);
    // PIC = Videografer yang pertama kali mengambil konten.
    await tx.query("UPDATE briefs SET status = 'syuting', pic_id = COALESCE(pic_id, $2), updated_at = now() WHERE id = $1", [id, actorId]);
    await addEvent(tx, id, r.status, 'syuting', actorId, redo ? 'Take ulang karena revisi' : '');
    await audit(tx, actorId, 'daily.start', 'brief', id);
  });

export const finishTake = (db: Db, actorId: number, id: number) =>
  db.transaction(async (tx) => {
    const r = await load(tx, id);
    need(r.status === 'syuting', 'Take belum dimulai');
    notHeld(r);
    await tx.query("UPDATE briefs SET status = 'footage_siap', updated_at = now() WHERE id = $1", [id]);
    await addEvent(tx, id, 'syuting', 'footage_siap', actorId, '');
    await audit(tx, actorId, 'daily.finish', 'brief', id);
  });

/** Bukti serah footage → Terkirim → otomatis ke Antrean Editor atau Review User (PRD §7.4). Tanpa verifikasi penerima. */
export const handoff = (db: Db, actorId: number, id: number, input: HandoffInput) =>
  db.transaction(async (tx) => {
    const r = await load(tx, id);
    need(r.status === 'footage_siap', 'Footage belum siap diserahkan');
    notHeld(r);
    if (handoffNeedsDrive(r.jenis) && input.storage !== 'drive') {
      throw new HttpError(409, 'drive_required', 'Jenis ini langsung ke Review User, footage wajib diunggah ke Drive.');
    }
    await tx.query(
      `INSERT INTO footage_handoffs (brief_id, storage, drive_url, disk_name, path, file_name, handed_by, handed_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())
       ON CONFLICT (brief_id) DO UPDATE SET storage = EXCLUDED.storage, drive_url = EXCLUDED.drive_url, disk_name = EXCLUDED.disk_name,
         path = EXCLUDED.path, file_name = EXCLUDED.file_name, handed_by = EXCLUDED.handed_by, handed_at = EXCLUDED.handed_at`,
      [id, input.storage, input.storage === 'drive' ? input.driveUrl : null, input.storage === 'hdd' ? input.diskName : null, input.storage === 'hdd' ? input.path : null, input.storage === 'hdd' ? input.fileName : null, actorId],
    );
    const next: Status = routeOf(r.jenis) === 'editor' ? 'antre_editing' : 'in_review';
    await tx.query('UPDATE briefs SET status = $2, updated_at = now() WHERE id = $1', [id, next]);
    await addEvent(tx, id, 'footage_siap', 'terkirim', actorId, input.storage === 'drive' ? 'Footage di Drive' : `Footage di ${input.diskName}`);
    await addEvent(tx, id, 'terkirim', next, null, '');
    await audit(tx, actorId, 'daily.handoff', 'brief', id, { storage: input.storage });
  });

export const hold = (db: Db, actorId: number, id: number, reason: string) =>
  db.transaction(async (tx) => {
    const r = await load(tx, id);
    need(['ready', 'syuting', 'footage_siap'].includes(r.status), 'Konten ini tidak bisa di-hold');
    need(r.hold_reason === null, 'Konten sudah di-hold');
    await tx.query('UPDATE briefs SET hold_reason = $2, updated_at = now() WHERE id = $1', [id, reason]);
    await addEvent(tx, id, r.status, r.status, actorId, `Hold: ${reason}`);
    await audit(tx, actorId, 'daily.hold', 'brief', id, { reason });
  });

export const resume = (db: Db, actorId: number, id: number) =>
  db.transaction(async (tx) => {
    const r = await load(tx, id);
    need(r.hold_reason !== null, 'Konten tidak sedang di-hold');
    await tx.query('UPDATE briefs SET hold_reason = NULL, updated_at = now() WHERE id = $1', [id]);
    await addEvent(tx, id, r.status, r.status, actorId, 'Hold dilanjutkan (Resume)');
    await audit(tx, actorId, 'daily.resume', 'brief', id);
  });

/** Pindah ke hari lain di pekan yang sama (wajib beralasan). Take yang berjalan dibatalkan. SDM mengikuti hari baru. */
export const reschedule = (db: Db, actorId: number, id: number, day: number, reason: string) =>
  db.transaction(async (tx) => {
    const r = await load(tx, id);
    need(r.status === 'ready' || r.status === 'syuting', 'Hanya konten yang belum selesai di-take yang bisa dijadwal ulang');
    need(day !== r.shoot_day, 'Pilih hari yang berbeda', 'same_day');
    await tx.query("UPDATE briefs SET shoot_day = $2, status = 'ready', hold_reason = NULL, updated_at = now() WHERE id = $1", [id, day]);
    await addEvent(tx, id, r.status, 'ready', actorId, `Reschedule ${DAY_NAMES[r.shoot_day]} → ${DAY_NAMES[day]}. Alasan: ${reason}`);
    await syncSdm(tx, r.week_start);
    await audit(tx, actorId, 'daily.reschedule', 'brief', id, { from: r.shoot_day, to: day, reason });
  });

/** Pull to Today: tarik konten hari berikutnya ke hari yang sedang dilihat. */
export const pull = (db: Db, actorId: number, id: number, day: number) =>
  db.transaction(async (tx) => {
    const r = await load(tx, id);
    need(r.status === 'ready', 'Hanya konten Ready yang bisa ditarik');
    notHeld(r);
    need(r.shoot_day > day, 'Hanya konten hari berikutnya yang bisa ditarik', 'not_later');
    await tx.query('UPDATE briefs SET shoot_day = $2, updated_at = now() WHERE id = $1', [id, day]);
    await addEvent(tx, id, 'ready', 'ready', actorId, `Ditarik ke hari ini: ${DAY_NAMES[r.shoot_day]} → ${DAY_NAMES[day]}`);
    await syncSdm(tx, r.week_start);
    await audit(tx, actorId, 'daily.pull', 'brief', id, { from: r.shoot_day, to: day });
  });
