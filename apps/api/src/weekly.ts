import {
  DAY_CAPACITY,
  DAY_NAMES,
  HIDDEN_FROM_WEEK,
  PLANNING_STATUSES,
  addDays,
  lockingDayOf,
  sdmKey,
  sdmNeeds,
  slotsUsed,
  weekLabel,
  weekProgress,
  type ContentPatch,
  type DayInfo,
  type SdmItem,
  type SdmSource,
  type SdmType,
  type Status,
  type WeekDto,
  type WeeklyContent,
  type Jenis,
  type Role,
} from '@ccp/shared';
import { addEvent } from './briefs';
import { audit, type Db, type Queryable } from './db';
import { HttpError } from './errors';

interface ContentRow extends SdmSource {
  id: number;
  code: string;
  judul: string;
  produk: string;
  kategori: string;
  jenis: Jenis;
  status: Status;
  link_docs: string;
  requester_id: number;
  requester_name: string;
  kostum: string;
  properti: string;
  desain: string;
  bobot: 'gampang' | 'susah';
  shoot_day: number | null;
  week_start: string;
  // snake_case dari SQL
  lokasi_detail: string;
  fu_properti: string;
  fu_kostum: string;
  fu_desain: string;
}

const CONTENT_SQL = `
  SELECT b.id, b.code, b.judul, b.produk, b.kategori, b.jenis, b.status, b.link_docs, b.bobot, b.shoot_day, b.week_start,
         b.requester_id, u.name AS requester_name,
         a.talent, a.kostum, a.lokasi, a.lokasi_detail, a.properti, a.desain, a.fu_properti, a.fu_kostum, a.fu_desain
  FROM briefs b
  JOIN users u ON u.id = b.requester_id
  JOIN brief_attributes a ON a.brief_id = b.id`;

const HIDDEN = HIDDEN_FROM_WEEK.map((s) => `'${s}'`).join(', ');

const src = (r: ContentRow): SdmSource => ({
  talent: r.talent,
  lokasi: r.lokasi,
  lokasiDetail: r.lokasi_detail,
  fuProperti: r.fu_properti,
  fuKostum: r.fu_kostum,
  fuDesain: r.fu_desain,
});

interface WeekRow {
  locked_at: string | null;
  locked_by_name: string | null;
  ready_at: string | null;
  ready_by_name: string | null;
}
interface ItemRow {
  id: number;
  day: number;
  type: SdmType;
  name: string;
  ready: boolean;
  ready_at: string | null;
  ready_by_name: string | null;
}

async function loadWeekRow(q: Queryable, week: string): Promise<WeekRow | undefined> {
  return q.one<WeekRow>(
    `SELECT w.locked_at, w.ready_at, lu.name AS locked_by_name, ru.name AS ready_by_name
     FROM weekly_weeks w LEFT JOIN users lu ON lu.id = w.locked_by LEFT JOIN users ru ON ru.id = w.ready_by
     WHERE w.week_start = $1`,
    [week],
  );
}

const loadContents = (q: Queryable, week: string) =>
  q.query<ContentRow>(`${CONTENT_SQL} WHERE b.week_start = $1 AND b.status NOT IN (${HIDDEN}) ORDER BY b.id`, [week]);

const loadItems = (q: Queryable, week: string) =>
  q.query<ItemRow>(
    `SELECT i.id, i.day, i.type, i.name, i.ready, i.ready_at, u.name AS ready_by_name
     FROM sdm_items i LEFT JOIN users u ON u.id = i.ready_by
     WHERE i.week_start = $1 ORDER BY i.day, i.type, lower(i.name)`,
    [week],
  );

async function progressOf(q: Queryable, week: string) {
  const [w, contents, items] = await Promise.all([loadWeekRow(q, week), loadContents(q, week), loadItems(q, week)]);
  return weekProgress({
    lockedAt: w?.locked_at ?? null,
    readyAt: w?.ready_at ?? null,
    contents: contents.map((c) => ({ status: c.status, day: c.shoot_day })),
    items,
  });
}

// ───────────── Baca ─────────────

export async function getWeek(db: Queryable, week: string, viewer: { id: number; role: Role }): Promise<WeekDto> {
  const isUser = viewer.role === 'user';
  const [w, all, items, docs] = await Promise.all([
    loadWeekRow(db, week),
    loadContents(db, week),
    loadItems(db, week),
    db.query<{
      day: number;
      shotlist_url: string | null; shotlist_by_name: string | null;
      skrip_url: string | null; skrip_by_name: string | null;
      talent_reconfirmed_at: string | null; talent_reconfirmed_by_name: string | null;
    }>(
      `SELECT d.day, d.shotlist_url, d.skrip_url, d.talent_reconfirmed_at,
              su.name AS shotlist_by_name, ku.name AS skrip_by_name, tu.name AS talent_reconfirmed_by_name
       FROM weekly_day_docs d
       LEFT JOIN users su ON su.id = d.shotlist_by LEFT JOIN users ku ON ku.id = d.skrip_by LEFT JOIN users tu ON tu.id = d.talent_reconfirmed_by
       WHERE d.week_start = $1`,
      [week],
    ),
  ]);

  // Progres dihitung dari seluruh konten pekan; User hanya melihat angka/boolean-nya.
  const progress = weekProgress({
    lockedAt: w?.locked_at ?? null,
    readyAt: w?.ready_at ?? null,
    contents: all.map((c) => ({ status: c.status, day: c.shoot_day })),
    items,
  });

  const unready = new Set(items.filter((i) => !i.ready).map((i) => sdmKey(i.day, i)));
  const counts = new Map<string, number>();
  const locked = (c: ContentRow) => c.status !== 'listing';
  for (const c of all) {
    if (c.shoot_day === null || !locked(c)) continue;
    for (const n of sdmNeeds(src(c))) counts.set(sdmKey(c.shoot_day, n), (counts.get(sdmKey(c.shoot_day, n)) ?? 0) + 1);
  }

  const visible = isUser ? all.filter((c) => c.requester_id === viewer.id) : all;
  const contents: WeeklyContent[] = visible.map((c) => ({
    id: c.id, code: c.code, judul: c.judul, produk: c.produk, kategori: c.kategori, jenis: c.jenis, status: c.status,
    linkDocs: c.link_docs, requesterName: c.requester_name,
    talent: c.talent, kostum: c.kostum, lokasi: c.lokasi, lokasiDetail: c.lokasi_detail, properti: c.properti, desain: c.desain,
    fuProperti: c.fu_properti, fuKostum: c.fu_kostum, fuDesain: c.fu_desain,
    bobot: c.bobot, day: c.shoot_day,
    sdmIssue: c.shoot_day !== null && locked(c) && sdmNeeds(src(c)).some((n) => unready.has(sdmKey(c.shoot_day!, n))),
  }));

  const days: DayInfo[] = DAY_NAMES.map((_, day) => {
    const onDay = visible.filter((c) => c.shoot_day === day);
    const dayItems = items.filter((i) => i.day === day);
    const d = docs.find((x) => x.day === day);
    const lockedOnDay = all.some((c) => c.shoot_day === day && locked(c));
    const sdmReady = dayItems.filter((i) => i.ready).length;
    return {
      day,
      date: addDays(week, day),
      count: onDay.length,
      slots: isUser ? null : slotsUsed(all.filter((c) => c.shoot_day === day)),
      capacity: isUser ? null : DAY_CAPACITY[day]!,
      sdmReady: isUser ? 0 : sdmReady,
      sdmTotal: isUser ? 0 : dayItems.length,
      docsOpen: !isUser && lockedOnDay && sdmReady === dayItems.length,
      shotlistUrl: isUser ? null : (d?.shotlist_url ?? null),
      shotlistByName: isUser ? null : (d?.shotlist_by_name ?? null),
      skripUrl: isUser ? null : (d?.skrip_url ?? null),
      skripByName: isUser ? null : (d?.skrip_by_name ?? null),
      talentReconfirmedAt: isUser ? null : (d?.talent_reconfirmed_at ?? null),
      talentReconfirmedByName: isUser ? null : (d?.talent_reconfirmed_by_name ?? null),
    };
  });

  const sdm: SdmItem[] = isUser
    ? []
    : items.map((i) => ({
        id: i.id, day: i.day, type: i.type, name: i.name, ready: i.ready, readyByName: i.ready_by_name, readyAt: i.ready_at,
        contentCount: counts.get(sdmKey(i.day, i)) ?? 0,
      }));

  return {
    weekStart: week,
    label: weekLabel(week),
    lockingDay: lockingDayOf(week),
    lockedAt: w?.locked_at ?? null,
    lockedByName: w?.locked_by_name ?? null,
    readyAt: w?.ready_at ?? null,
    readyByName: w?.ready_by_name ?? null,
    progress,
    contents,
    days,
    sdm,
  };
}

// ───────────── Sinkronisasi SDM & pembatalan Ready ─────────────

/** Menyamakan sdm_items dengan kebutuhan konten terjadwal yang sudah dikunci. Status Ready item yang tidak berubah dipertahankan. */
export async function syncSdm(tx: Queryable, week: string): Promise<void> {
  const rows = await tx.query<ContentRow>(
    `${CONTENT_SQL} WHERE b.week_start = $1 AND b.shoot_day IS NOT NULL AND b.status NOT IN (${HIDDEN}, 'listing')`,
    [week],
  );
  const desired = new Map<string, { day: number; type: SdmType; name: string }>();
  for (const c of rows) {
    for (const n of sdmNeeds(src(c))) desired.set(sdmKey(c.shoot_day!, n), { day: c.shoot_day!, type: n.type, name: n.name });
  }
  const existing = await tx.query<{ id: number; day: number; type: SdmType; name: string }>(
    'SELECT id, day, type, name FROM sdm_items WHERE week_start = $1',
    [week],
  );
  const have = new Set<string>();
  for (const e of existing) {
    const k = sdmKey(e.day, e);
    if (desired.has(k)) have.add(k);
    else await tx.query('DELETE FROM sdm_items WHERE id = $1', [e.id]);
  }
  for (const [k, d] of desired) {
    if (!have.has(k)) await tx.query('INSERT INTO sdm_items (week_start, day, type, name) VALUES ($1, $2, $3, $4)', [week, d.day, d.type, d.name]);
  }
}

/** Bila pekan sudah Ready tetapi syarat SDM/jadwal tidak terpenuhi lagi, batalkan Ready (konten kembali ke validasi SDM). */
async function reevaluateWeek(tx: Queryable, week: string, actorId: number, why: string): Promise<void> {
  const w = await tx.one<{ ready_at: string | null }>('SELECT ready_at FROM weekly_weeks WHERE week_start = $1', [week]);
  if (!w?.ready_at) return;
  if ((await progressOf(tx, week)).lockedGateOk) return;
  await tx.query('UPDATE weekly_weeks SET ready_at = NULL, ready_by = NULL WHERE week_start = $1', [week]);
  const ready = await tx.query<{ id: number }>("SELECT id FROM briefs WHERE week_start = $1 AND status = 'ready'", [week]);
  await tx.query("UPDATE briefs SET status = 'validasi_sdm', updated_at = now() WHERE week_start = $1 AND status = 'ready'", [week]);
  for (const r of ready) await addEvent(tx, r.id, 'ready', 'validasi_sdm', actorId, `Ready dibatalkan: ${why}`);
  await audit(tx, actorId, 'weekly.ready_revoked', 'week', week, { why });
}

const ensureWeekRow = (q: Queryable, week: string) => q.query('INSERT INTO weekly_weeks (week_start) VALUES ($1) ON CONFLICT DO NOTHING', [week]);

// ───────────── Aksi VG ─────────────

/** "Locking Disepakati (VG + User)": mengunci atribut semua konten yang masih Listing dan mengirim kebutuhan SDM ke Leader. */
export async function lockWeek(db: Db, week: string, actorId: number): Promise<void> {
  await db.transaction(async (tx) => {
    await ensureWeekRow(tx, week);
    const pending = await tx.query<{ id: number }>("SELECT id FROM briefs WHERE week_start = $1 AND status = 'listing' ORDER BY id", [week]);
    if (pending.length === 0) throw new HttpError(409, 'nothing_to_lock', 'Tidak ada konten yang perlu dikunci');
    await tx.query("UPDATE briefs SET status = 'validasi_sdm', updated_at = now() WHERE week_start = $1 AND status = 'listing'", [week]);
    for (const p of pending) await addEvent(tx, p.id, 'listing', 'validasi_sdm', actorId, '');
    await tx.query('UPDATE weekly_weeks SET locked_at = COALESCE(locked_at, now()), locked_by = COALESCE(locked_by, $2) WHERE week_start = $1', [week, actorId]);
    await syncSdm(tx, week);
    await reevaluateWeek(tx, week, actorId, 'ada konten susulan yang baru dikunci');
    await audit(tx, actorId, 'weekly.lock', 'week', week, { count: pending.length });
  });
}

export async function markReady(db: Db, week: string, actorId: number): Promise<void> {
  await db.transaction(async (tx) => {
    const p = await progressOf(tx, week);
    if (!p.canMarkReady) {
      const why =
        p.pendingLock > 0 ? 'Masih ada konten yang belum dikunci (Locking Disepakati).'
        : p.unscheduled > 0 ? `Masih ada ${p.unscheduled} konten tanpa hari syuting.`
        : !p.steps[2] ? 'Masih ada SDM yang belum Ready.'
        : 'Pekan ini belum bisa ditandai Ready.';
      throw new HttpError(409, 'not_ready', why);
    }
    const rows = await tx.query<{ id: number }>("SELECT id FROM briefs WHERE week_start = $1 AND status = 'validasi_sdm'", [week]);
    await tx.query("UPDATE briefs SET status = 'ready', updated_at = now() WHERE week_start = $1 AND status = 'validasi_sdm'", [week]);
    for (const r of rows) await addEvent(tx, r.id, 'validasi_sdm', 'ready', actorId, '');
    await tx.query('UPDATE weekly_weeks SET ready_at = now(), ready_by = $2 WHERE week_start = $1', [week, actorId]);
    await audit(tx, actorId, 'weekly.ready', 'week', week, { count: rows.length });
  });
}

const ATTR_FIELDS = ['talent', 'kostum', 'lokasi', 'lokasiDetail', 'properti', 'desain', 'fuProperti', 'fuKostum', 'fuDesain'] as const;
const COLUMN: Record<(typeof ATTR_FIELDS)[number], string> = {
  talent: 'talent', kostum: 'kostum', lokasi: 'lokasi', lokasiDetail: 'lokasi_detail', properti: 'properti', desain: 'desain',
  fuProperti: 'fu_properti', fuKostum: 'fu_kostum', fuDesain: 'fu_desain',
};
const ROW_KEY: Record<(typeof ATTR_FIELDS)[number], keyof ContentRow> = {
  talent: 'talent', kostum: 'kostum', lokasi: 'lokasi', lokasiDetail: 'lokasi_detail', properti: 'properti', desain: 'desain',
  fuProperti: 'fu_properti', fuKostum: 'fu_kostum', fuDesain: 'fu_desain',
};
const FIELD_LABEL: Record<string, string> = {
  talent: 'talent', kostum: 'kostum', lokasi: 'lokasi', lokasiDetail: 'keterangan lokasi', properti: 'properti', desain: 'kebutuhan desain',
  fuProperti: 'properti dibeli', fuKostum: 'kostum khusus', fuDesain: 'aset desain', bobot: 'bobot', day: 'hari',
};

const dayName = (d: number | null) => (d === null ? 'belum dijadwal' : DAY_NAMES[d]!);

async function loadContent(q: Queryable, id: number): Promise<ContentRow> {
  const row = await q.one<ContentRow>(`${CONTENT_SQL} WHERE b.id = $1`, [id]);
  if (!row || !row.week_start) throw new HttpError(404, 'not_found', 'Konten Weekly tidak ditemukan');
  return row;
}

function assertPlanning(row: ContentRow): void {
  if (!PLANNING_STATUSES.includes(row.status)) {
    throw new HttpError(409, 'not_adjustable', 'Konten ini sudah masuk produksi, ubah lewat Daily Shooting');
  }
}

/**
 * Validasi atribut, bobot, dan hari oleh VG. Sebelum Locking Disepakati bebas (tanpa histori, PRD §6.2).
 * Sesudahnya (Field Adjustment, PRD §6.8) perubahan atribut/hari wajib beralasan dan tercatat.
 */
export async function patchContent(db: Db, actorId: number, id: number, patch: ContentPatch): Promise<string> {
  return db.transaction(async (tx) => {
    const row = await loadContent(tx, id);
    assertPlanning(row);
    const lokasi = patch.lokasi ?? row.lokasi;
    const detail = lokasi === 'Lainnya' ? (patch.lokasiDetail ?? row.lokasi_detail) : '';
    if (lokasi === 'Lainnya' && !detail) throw new HttpError(400, 'validation', 'lokasiDetail: Sebutkan lokasinya');

    const next: Record<string, string | number | null> = {};
    const changes: string[] = [];
    for (const f of ATTR_FIELDS) {
      const value = f === 'lokasiDetail' ? detail : f === 'lokasi' ? lokasi : (patch[f] ?? (row[ROW_KEY[f]] as string));
      if (value !== (row[ROW_KEY[f]] as string)) {
        next[COLUMN[f]] = value;
        changes.push(`${FIELD_LABEL[f]}: “${row[ROW_KEY[f]] as string}” → “${value}”`);
      }
    }
    const attrChanged = changes.length > 0;
    const bobotChanged = patch.bobot !== undefined && patch.bobot !== row.bobot;
    const dayChanged = patch.day !== undefined && patch.day !== row.shoot_day;
    if (bobotChanged) changes.push(`bobot: ${row.bobot} → ${patch.bobot}`);
    if (dayChanged) changes.push(`hari: ${dayName(row.shoot_day)} → ${dayName(patch.day ?? null)}`);
    if (changes.length === 0) return row.week_start;

    const locked = row.status !== 'listing';
    if (locked && (attrChanged || dayChanged) && !patch.reason) throw new HttpError(400, 'reason_required', 'Alasan wajib diisi untuk penyesuaian setelah Locking');

    if (attrChanged) {
      const cols = Object.keys(next);
      await tx.query(
        `UPDATE brief_attributes SET ${cols.map((c, i) => `${c} = $${i + 2}`).join(', ')} WHERE brief_id = $1`,
        [id, ...cols.map((c) => next[c])],
      );
    }
    if (bobotChanged || dayChanged) {
      await tx.query('UPDATE briefs SET bobot = $2, shoot_day = $3, updated_at = now() WHERE id = $1', [
        id, patch.bobot ?? row.bobot, patch.day === undefined ? row.shoot_day : patch.day,
      ]);
    }
    if (locked) {
      await syncSdm(tx, row.week_start);
      await reevaluateWeek(tx, row.week_start, actorId, patch.reason || 'penyesuaian jadwal/atribut');
      if (patch.reason) await addEvent(tx, id, row.status, row.status, actorId, `Penyesuaian (${changes.join('; ')}). Alasan: ${patch.reason}`);
    }
    await audit(tx, actorId, 'weekly.adjust', 'brief', id, { changes, reason: patch.reason });
    return row.week_start;
  });
}

/**
 * Tunda ke pekan depan (VG, wajib beralasan): kembali ke Listing di pekan berikutnya, hari dikosongkan.
 * `fromShooting`: dipanggil dari Daily Shooting (hari-H), boleh dari status syuting dan tidak membatalkan Ready pekan berjalan.
 */
export async function postponeContent(db: Db, actorId: number, id: number, reason: string, fromShooting = false): Promise<string> {
  return db.transaction(async (tx) => {
    const row = await loadContent(tx, id);
    if (!(fromShooting && row.status === 'syuting')) assertPlanning(row);
    const nextWeek = addDays(row.week_start, 7);
    await tx.query("UPDATE briefs SET week_start = $2, status = 'listing', shoot_day = NULL, hold_reason = NULL, updated_at = now() WHERE id = $1", [id, nextWeek]);
    await addEvent(tx, id, row.status, 'listing', actorId, `Ditunda ke ${weekLabel(nextWeek)}. Alasan: ${reason}`);
    if (row.status !== 'listing') {
      await syncSdm(tx, row.week_start);
      if (!fromShooting) await reevaluateWeek(tx, row.week_start, actorId, `konten ${row.code} ditunda`);
    }
    await audit(tx, actorId, 'weekly.postpone', 'brief', id, { from: row.week_start, to: nextWeek, reason });
    return row.week_start;
  });
}

/** Kembalikan ke User (Backlog) bila brief belum lengkap. Hanya sebelum Locking Disepakati. */
export async function returnContent(db: Db, actorId: number, id: number, reason: string): Promise<string> {
  return db.transaction(async (tx) => {
    const row = await loadContent(tx, id);
    if (row.status !== 'listing') throw new HttpError(409, 'not_returnable', 'Konten yang sudah dikunci tidak bisa dikembalikan. Gunakan “Tunda ke pekan depan”.');
    await tx.query("UPDATE briefs SET status = 'backlog', shoot_day = NULL, updated_at = now() WHERE id = $1", [id]);
    await addEvent(tx, id, 'listing', 'backlog', actorId, reason);
    await audit(tx, actorId, 'weekly.return', 'brief', id, { reason });
    return row.week_start;
  });
}

// ───────────── Aksi Leader ─────────────

export async function setSdmReady(db: Db, actorId: number, itemId: number, ready: boolean): Promise<string> {
  return db.transaction(async (tx) => {
    const item = await tx.one<{ week_start: string }>('SELECT week_start FROM sdm_items WHERE id = $1', [itemId]);
    if (!item) throw new HttpError(404, 'not_found', 'Item SDM tidak ditemukan');
    await tx.query('UPDATE sdm_items SET ready = $2, ready_by = $3, ready_at = $4 WHERE id = $1', [
      itemId, ready, ready ? actorId : null, ready ? new Date().toISOString() : null,
    ]);
    if (!ready) await reevaluateWeek(tx, item.week_start, actorId, 'ada item SDM yang ditandai Tidak Ready');
    await audit(tx, actorId, 'weekly.sdm', 'sdm_item', itemId, { ready });
    return item.week_start;
  });
}

export async function reconfirmTalent(db: Db, actorId: number, week: string, day: number): Promise<void> {
  await db.transaction(async (tx) => {
    const t = await tx.one('SELECT 1 FROM sdm_items WHERE week_start = $1 AND day = $2 AND type = $3', [week, day, 'talent']);
    if (!t) throw new HttpError(409, 'no_talent', 'Tidak ada talent yang perlu dikonfirmasi pada hari ini');
    await tx.query(
      `INSERT INTO weekly_day_docs (week_start, day, talent_reconfirmed_by, talent_reconfirmed_at) VALUES ($1, $2, $3, now())
       ON CONFLICT (week_start, day) DO UPDATE SET talent_reconfirmed_by = EXCLUDED.talent_reconfirmed_by, talent_reconfirmed_at = EXCLUDED.talent_reconfirmed_at`,
      [week, day, actorId],
    );
    await audit(tx, actorId, 'weekly.reconfirm_talent', 'week', `${week}#${day}`);
  });
}

// ───────────── Shotlist & Skrip ─────────────

export async function saveDayDoc(db: Db, actorId: number, week: string, day: number, kind: 'shotlist' | 'skrip', url: string): Promise<void> {
  await db.transaction(async (tx) => {
    const lockedOnDay = await tx.one("SELECT 1 FROM briefs WHERE week_start = $1 AND shoot_day = $2 AND status NOT IN ('listing', 'backlog', 'pending_review', 'draft')", [week, day]);
    const unready = await tx.one('SELECT 1 FROM sdm_items WHERE week_start = $1 AND day = $2 AND NOT ready', [week, day]);
    if (!lockedOnDay || unready) throw new HttpError(409, 'docs_closed', 'Shotlist dan skrip bisa diunggah setelah semua SDM hari itu Ready');
    const col = kind === 'shotlist' ? 'shotlist' : 'skrip';
    await tx.query(
      `INSERT INTO weekly_day_docs (week_start, day, ${col}_url, ${col}_by, ${col}_at) VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (week_start, day) DO UPDATE SET ${col}_url = EXCLUDED.${col}_url, ${col}_by = EXCLUDED.${col}_by, ${col}_at = EXCLUDED.${col}_at`,
      [week, day, url, actorId],
    );
    await audit(tx, actorId, `weekly.${kind}`, 'week', `${week}#${day}`, { url });
  });
}
