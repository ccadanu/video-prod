import {
  addDays,
  arenaFor,
  buildArena,
  buildDashboard,
  buildKpi,
  todayJakarta,
  type DashboardDto,
  type ArenaDto,
  type Bobot,
  type Jenis,
  type KpiDto,
  type Period,
  type Role,
  type StatRow,
  type Status,
} from '@ccp/shared';
import type { Queryable } from './db';

interface Raw {
  id: number;
  jenis: Jenis;
  kategori: string;
  status: Status;
  requester_id: number;
  requester_name: string;
  submitted_at: string;
  completed_at: string | null;
  revision_count: number;
  week_start: string | null;
  shoot_day: number | null;
  handed_at: string | null;
  vg_id: number | null;
  vg_name: string | null;
  edit_due: string | null;
  bobot: Bobot;
  edit_bobot: Bobot;
  editor_id: number | null;
  editor_name: string | null;
  delivered_at: string | null;
}

/** Semua konten (non-draft) beserta fakta waktu & PIC. Statistik dihitung di kode (shared), bukan di SQL, agar sama dengan mode demo. */
export async function loadStatRows(db: Queryable): Promise<StatRow[]> {
  const [raws, ratings] = await Promise.all([
    db.query<Raw>(
      `SELECT b.id, b.jenis, b.kategori, b.status, b.requester_id, ru.name AS requester_name, b.submitted_at, b.completed_at, b.revision_count,
              b.week_start, b.shoot_day, b.bobot, b.edit_bobot, h.handed_at, h.handed_by AS vg_id, vg.name AS vg_name, b.edit_due, b.editor_id, ed.name AS editor_name,
              (SELECT min(d.submitted_at) FROM deliverables d WHERE d.brief_id = b.id) AS delivered_at
       FROM briefs b
       JOIN users ru ON ru.id = b.requester_id
       LEFT JOIN footage_handoffs h ON h.brief_id = b.id
       LEFT JOIN users vg ON vg.id = h.handed_by
       LEFT JOIN users ed ON ed.id = b.editor_id
       WHERE b.status <> 'draft'
       ORDER BY b.id`,
    ),
    // Hanya siklus yang sudah ditutup: rating tidak dipakai sebelum evaluasi resmi selesai.
    db.query<{ brief_id: number; rating: number }>(
      "SELECT r.brief_id, r.rating FROM eval_responses r JOIN eval_cycles c ON c.id = r.cycle_id WHERE c.status = 'closed'",
    ),
  ]);
  const byBrief = new Map<number, number[]>();
  for (const r of ratings) byBrief.set(r.brief_id, [...(byBrief.get(r.brief_id) ?? []), Number(r.rating)]);
  return raws.map((r) => ({
    id: r.id, jenis: r.jenis, kategori: r.kategori, status: r.status, requesterId: r.requester_id, requesterName: r.requester_name,
    submittedAt: r.submitted_at, completedAt: r.completed_at, revisionCount: r.revision_count,
    shootDate: r.week_start !== null && r.shoot_day !== null ? addDays(r.week_start, r.shoot_day) : null,
    handedAt: r.handed_at, vgId: r.vg_id, vgName: r.vg_name, editDue: r.edit_due, deliveredAt: r.delivered_at,
    editorId: r.editor_id, editorName: r.editor_name,
    shootBobot: r.week_start !== null ? r.bobot : null, editBobot: r.editor_id !== null ? r.edit_bobot : null, ratings: byBrief.get(r.id) ?? [],
  }));
}

export async function getDashboard(db: Queryable, period: Period, viewer: { role: Role; id: number }): Promise<DashboardDto> {
  return buildDashboard(await loadStatRows(db), period, todayJakarta(), viewer);
}

export async function getKpi(db: Queryable, period: Period, viewer: { role: Role; id: number }): Promise<KpiDto> {
  const [rows, people] = await Promise.all([
    loadStatRows(db),
    db.query<{ id: number; name: string; role: 'videografer' | 'editor' }>("SELECT id, name, role FROM users WHERE role IN ('videografer', 'editor') AND active = TRUE ORDER BY name, id"),
  ]);
  return buildKpi(rows, people, period, todayJakarta(), viewer);
}

/** Ringkasan 2 minggu untuk strip KPI di Production Board (semua peran). */
export async function getPulse(db: Queryable, viewer: { role: Role; id: number }) {
  const d = await getDashboard(db, '2w', viewer);
  return { selesai: d.selesai, kepuasan: d.kepuasan, sla: d.sla, revisi: d.revisi, funnel: d.funnel, range: d.range };
}

export async function arenaPublic(db: Queryable): Promise<boolean> {
  const r = await db.one<{ value: string }>("SELECT value FROM app_settings WHERE key = 'arena_public'");
  return r ? r.value === 'true' : true;
}

export async function setArenaPublic(db: Queryable, actorId: number, value: boolean): Promise<void> {
  await db.query(
    `INSERT INTO app_settings (key, value, updated_by, updated_at) VALUES ('arena_public', $1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at`,
    [String(value), actorId],
  );
}

/** Papan Prestasi: dihitung penuh lalu disaring menurut peran pemirsa dan pengaturan visibilitas. */
export async function getArena(db: Queryable, period: Period, viewer: { role: Role; id: number }): Promise<ArenaDto> {
  const [rows, people, pub] = await Promise.all([
    loadStatRows(db),
    db.query<{ id: number; name: string; role: 'videografer' | 'editor' }>("SELECT id, name, role FROM users WHERE role IN ('videografer', 'editor') AND active = TRUE ORDER BY name, id"),
    arenaPublic(db),
  ]);
  return arenaFor(buildArena(rows, people, period, todayJakarta()), viewer, pub);
}
