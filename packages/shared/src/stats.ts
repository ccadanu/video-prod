import { JENIS, isWeekly, type Jenis } from './jenis';
import type { Role } from './roles';
import type { Status } from './status';
import { addDays, mondayOf, todayJakarta, type Ymd } from './weeks';

/**
 * Dashboard Statistik (PRD §10) dan KPI Individu (PRD §11). Semua hitungan murni di atas `StatRow`
 * sehingga server (SQL → baris) dan mode demo (memori → baris) memakai logika yang sama.
 * Definisi metrik adalah USULAN (spesifikasi dokumen terpisah belum tersedia): lihat docs/ASSUMPTIONS.md.
 */

export const PERIODS = ['2w', '1m', '3m', '1y'] as const;
export type Period = (typeof PERIODS)[number];
export const PERIOD_META: Record<Period, { label: string; days: number }> = {
  '2w': { label: '2 Minggu', days: 14 },
  '1m': { label: '1 Bulan', days: 30 },
  '3m': { label: '3 Bulan', days: 90 },
  '1y': { label: '1 Tahun', days: 365 },
};
export const isPeriod = (v: unknown): v is Period => typeof v === 'string' && (PERIODS as readonly string[]).includes(v);

/** Parameter KPI (PRD §13). */
export const KPI_WEIGHTS = { us: 0.6, sla: 0.2, revisi: 0.2 } as const;
export const SATISFACTION_TARGET = 4.0;
export const REVISION_THRESHOLD = 0.25;

/** Satu konten dengan fakta yang dibutuhkan statistik. Semua waktu ISO; semua tanggal 'YYYY-MM-DD' (WIB). */
export interface StatRow {
  id: number;
  jenis: Jenis;
  kategori: string;
  status: Status;
  requesterId: number;
  requesterName: string;
  submittedAt: string;
  completedAt: string | null;
  revisionCount: number;
  /** Tanggal hari syuting (Weekly), dan kapan footage diserahkan VG. */
  shootDate: Ymd | null;
  handedAt: string | null;
  vgId: number | null;
  vgName: string | null;
  /** Tenggat editing, dan kapan hasil pertama dikirim ke In Review. */
  editDue: Ymd | null;
  deliveredAt: string | null;
  editorId: number | null;
  editorName: string | null;
  /** Rating blind review (1–5) dari siklus evaluasi yang sudah ditutup. */
  ratings: number[];
}

export interface Range {
  from: Ymd;
  to: Ymd;
}
export interface Windows {
  cur: Range;
  prev: Range;
}

export function windowsOf(period: Period, today: Ymd): Windows {
  const days = PERIOD_META[period].days;
  const from = addDays(today, -(days - 1));
  return { cur: { from, to: today }, prev: { from: addDays(from, -days), to: addDays(from, -1) } };
}

const ymdOf = (iso: string): Ymd => todayJakarta(new Date(iso));
const within = (iso: string | null, r: Range): boolean => {
  if (!iso) return false;
  const d = ymdOf(iso);
  return d >= r.from && d <= r.to;
};
const avg = (xs: readonly number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const pctChange = (cur: number, prev: number): number | null => (prev === 0 ? null : ((cur - prev) / prev) * 100);

export interface Delta {
  value: number;
  prev: number;
  pct: number | null;
}
const delta = (value: number, prev: number): Delta => ({ value, prev, pct: pctChange(value, prev) });

// ───────────── Metrik inti (dipakai dashboard & KPI) ─────────────

interface Metrics {
  selesai: number;
  ratings: number[];
  syuting: { tepat: number; total: number };
  editing: { tepat: number; total: number };
  revisi: { count: number; total: number };
}

/** Metrik satu jendela waktu. `onlyVg`/`onlyEditor` membatasi ke konten milik satu individu. */
function metricsOf(rows: readonly StatRow[], r: Range): Metrics {
  const done = rows.filter((x) => within(x.completedAt, r));
  const shot = rows.filter((x) => x.shootDate !== null && within(x.handedAt, r));
  const edited = rows.filter((x) => x.editDue !== null && within(x.deliveredAt, r));
  return {
    selesai: done.length,
    ratings: done.flatMap((x) => x.ratings),
    syuting: { tepat: shot.filter((x) => ymdOf(x.handedAt!) <= x.shootDate!).length, total: shot.length },
    editing: { tepat: edited.filter((x) => ymdOf(x.deliveredAt!) <= x.editDue!).length, total: edited.length },
    revisi: { count: done.filter((x) => x.revisionCount > 0).length, total: done.length },
  };
}
const slaPct = (m: Metrics): number | null => {
  const total = m.syuting.total + m.editing.total;
  return total === 0 ? null : ((m.syuting.tepat + m.editing.tepat) / total) * 100;
};

// ───────────── Dashboard ─────────────

const STAGES: { label: string; rank: number }[] = [
  { label: 'Order masuk', rank: 0 },
  { label: 'Terjadwal / antre', rank: 1 },
  { label: 'Produksi & editing', rank: 2 },
  { label: 'In Review', rank: 3 },
  { label: 'Selesai', rank: 4 },
];
const RANK: Partial<Record<Status, number>> = {
  pending_review: 0, backlog: 0,
  listing: 1, validasi_sdm: 1, ready: 1, antre_editing: 1,
  syuting: 2, footage_siap: 2, terkirim: 2, editing: 2,
  in_review: 3, revisi: 3,
  complete: 4,
};

export const HEATMAP_STATUSES: readonly Status[] = [
  'pending_review', 'backlog', 'listing', 'validasi_sdm', 'ready', 'syuting', 'footage_siap', 'antre_editing', 'editing', 'in_review', 'revisi',
];
const VG_ACTIVE: readonly Status[] = ['ready', 'syuting', 'footage_siap'];
const EDITOR_ACTIVE: readonly Status[] = ['editing', 'revisi'];

export interface TrendBucket {
  key: string;
  weekly: number;
  daily: number;
}

export interface DashboardDto {
  period: Period;
  range: Range;
  prevRange: Range;
  selesai: Delta;
  volume: { total: Delta; weekly: number; daily: number; weeklyPerWeek: number; dailyPerWorkday: number };
  kepuasan: { avg: number | null; n: number; prevAvg: number | null; target: number };
  sla: { syuting: { tepat: number; total: number }; editing: { tepat: number; total: number }; pct: number | null; prevPct: number | null };
  revisi: { rate: number | null; count: number; total: number; prevRate: number | null; threshold: number };
  jalur: { jenis: Jenis; count: number }[];
  users: { label: string; count: number; self: boolean }[];
  trend: { granularity: 'day' | 'week' | 'month'; buckets: TrendBucket[] };
  peran: { videografer: { selesai: number; aktif: number }; editor: { selesai: number; aktif: number } };
  kategori: { name: string; count: number }[];
  heatmap: { statuses: Status[]; jenis: Jenis[]; cells: number[][] };
  funnel: { label: string; count: number }[];
}

function bucketKeys(period: Period, r: Range): { granularity: 'day' | 'week' | 'month'; keyOf: (d: Ymd) => string; keys: string[] } {
  const granularity = period === '1y' ? 'month' : period === '3m' ? 'week' : 'day';
  const keyOf = (d: Ymd) => (granularity === 'month' ? d.slice(0, 7) : granularity === 'week' ? mondayOf(d) : d);
  const keys: string[] = [];
  for (let d = r.from; d <= r.to; d = addDays(d, 1)) {
    const k = keyOf(d);
    if (keys[keys.length - 1] !== k) keys.push(k);
  }
  return { granularity, keyOf, keys };
}

export function buildDashboard(rows: readonly StatRow[], period: Period, today: Ymd, viewer: { role: Role; id: number }): DashboardDto {
  const { cur, prev } = windowsOf(period, today);
  const m = metricsOf(rows, cur);
  const pm = metricsOf(rows, prev);
  const submitted = rows.filter((x) => within(x.submittedAt, cur));
  const prevSubmitted = rows.filter((x) => within(x.submittedAt, prev));
  const weekly = submitted.filter((x) => isWeekly(x.jenis)).length;
  const daily = submitted.length - weekly;
  const days = PERIOD_META[period].days;

  const jalur = JENIS.map((jenis) => ({ jenis, count: submitted.filter((x) => x.jenis === jenis).length })).filter((j) => j.count > 0);

  // Distribusi per pemohon. User biasa hanya melihat dirinya; pemohon lain dianonimkan.
  const byUser = new Map<number, { name: string; count: number }>();
  for (const x of submitted) {
    const e = byUser.get(x.requesterId) ?? { name: x.requesterName, count: 0 };
    e.count++;
    byUser.set(x.requesterId, e);
  }
  const ranked = [...byUser.entries()].sort((a, b) => b[1].count - a[1].count || a[1].name.localeCompare(b[1].name));
  const hide = viewer.role === 'user';
  const users = ranked.slice(0, 8).map(([id, e], i) => ({
    label: hide ? (id === viewer.id ? 'Anda' : `Pemohon ${i + 1}`) : e.name,
    count: e.count,
    self: id === viewer.id,
  }));

  const { granularity, keyOf, keys } = bucketKeys(period, cur);
  const buckets = new Map<string, TrendBucket>(keys.map((key) => [key, { key, weekly: 0, daily: 0 }]));
  for (const x of submitted) {
    const b = buckets.get(keyOf(ymdOf(x.submittedAt)));
    if (b) b[isWeekly(x.jenis) ? 'weekly' : 'daily']++;
  }

  const kat = new Map<string, number>();
  for (const x of submitted) kat.set(x.kategori, (kat.get(x.kategori) ?? 0) + 1);
  const kategori = [...kat.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 5).map(([name, count]) => ({ name, count }));

  const live = rows.filter((x) => RANK[x.status] !== undefined && x.status !== 'complete');
  const cells = HEATMAP_STATUSES.map((s) => JENIS.map((j) => live.filter((x) => x.status === s && x.jenis === j).length));

  const funnel = STAGES.map((s) => ({ label: s.label, count: submitted.filter((x) => (RANK[x.status] ?? -1) >= s.rank).length }));

  const ratingAvg = avg(m.ratings);
  const rate = (x: Metrics) => (x.revisi.total === 0 ? null : x.revisi.count / x.revisi.total);
  return {
    period, range: cur, prevRange: prev,
    selesai: delta(m.selesai, pm.selesai),
    volume: {
      total: delta(submitted.length, prevSubmitted.length), weekly, daily,
      weeklyPerWeek: weekly / (days / 7), dailyPerWorkday: daily / ((days / 7) * 5),
    },
    kepuasan: { avg: ratingAvg, n: m.ratings.length, prevAvg: avg(pm.ratings), target: SATISFACTION_TARGET },
    sla: { syuting: m.syuting, editing: m.editing, pct: slaPct(m), prevPct: slaPct(pm) },
    revisi: { rate: rate(m), count: m.revisi.count, total: m.revisi.total, prevRate: rate(pm), threshold: REVISION_THRESHOLD },
    jalur, users, trend: { granularity, buckets: [...buckets.values()] },
    peran: {
      videografer: { selesai: rows.filter((x) => within(x.handedAt, cur)).length, aktif: rows.filter((x) => VG_ACTIVE.includes(x.status)).length },
      editor: { selesai: rows.filter((x) => within(x.deliveredAt, cur)).length, aktif: rows.filter((x) => EDITOR_ACTIVE.includes(x.status) && x.editorId !== null).length },
    },
    kategori,
    heatmap: { statuses: [...HEATMAP_STATUSES], jenis: [...JENIS], cells },
    funnel,
  };
}

// ───────────── KPI Individu ─────────────

export interface KpiParts {
  us: number | null;
  sla: number | null;
  revisi: number | null;
}

/** Skor 0–100 berbobot (US 60 · SLA 20 · Revisi 20). Komponen tanpa data dikeluarkan dan bobotnya dinormalkan ulang. */
export function kpiScore(p: KpiParts): number | null {
  let sum = 0;
  let weight = 0;
  for (const k of ['us', 'sla', 'revisi'] as const) {
    const v = p[k];
    if (v === null) continue;
    sum += v * KPI_WEIGHTS[k];
    weight += KPI_WEIGHTS[k];
  }
  return weight === 0 ? null : sum / weight;
}

const partsOf = (m: { ratings: number[]; sla: { tepat: number; total: number }; revisi: { count: number; total: number } }): KpiParts => ({
  us: m.ratings.length ? (avg(m.ratings)! / 5) * 100 : null,
  sla: m.sla.total ? (m.sla.tepat / m.sla.total) * 100 : null,
  // Skor revisi = persentase konten tanpa revisi (ambang ≤25% revisi = skor ≥75).
  revisi: m.revisi.total ? (1 - m.revisi.count / m.revisi.total) * 100 : null,
});

export interface Scorecard {
  id: number;
  name: string;
  role: 'videografer' | 'editor';
  /** Konten yang diserahkan (VG) / dikirim ke review (Editor) pada periode. */
  contents: number;
  us: { avg: number; n: number } | null;
  sla: { tepat: number; total: number } | null;
  revisi: { count: number; total: number } | null;
  parts: KpiParts;
  score: number | null;
}

export interface RoleKpi {
  people: number;
  contents: number;
  usAvg: number | null;
  slaPct: number | null;
  revisiRate: number | null;
  score: number | null;
}

export interface KpiDto {
  period: Period;
  range: Range;
  weights: typeof KPI_WEIGHTS;
  target: number;
  threshold: number;
  team: { score: number | null; prevScore: number | null; usAvg: number | null; slaPct: number | null; revisiRate: number | null; selesai: number };
  byRole: { videografer: RoleKpi; editor: RoleKpi };
  /** Leader/Admin: semua individu. VG/Editor: hanya dirinya. */
  individuals: Scorecard[];
}

/** Baris konten milik individu untuk satu peran. Revisi hanya dibebankan pada pemilik hasil akhir. */
function ownedBy(rows: readonly StatRow[], role: 'videografer' | 'editor', id: number): StatRow[] {
  return role === 'videografer' ? rows.filter((x) => x.vgId === id) : rows.filter((x) => x.editorId === id);
}

function personMetrics(rows: readonly StatRow[], role: 'videografer' | 'editor', id: number, r: Range) {
  const mine = ownedBy(rows, role, id);
  const m = metricsOf(mine, r);
  // VG: revisi footage hanya relevan untuk jalur langsung ke Review (Shooting Only/Photoshoot).
  const revisiRows = role === 'videografer' ? mine.filter((x) => x.jenis === 'shooting_only' || x.jenis === 'photoshoot') : mine;
  const done = revisiRows.filter((x) => within(x.completedAt, r));
  return {
    contents: role === 'videografer' ? mine.filter((x) => within(x.handedAt, r)).length : mine.filter((x) => within(x.deliveredAt, r)).length,
    ratings: m.ratings,
    sla: role === 'videografer' ? m.syuting : m.editing,
    revisi: { count: done.filter((x) => x.revisionCount > 0).length, total: done.length },
  };
}

export function scorecardOf(rows: readonly StatRow[], p: { id: number; name: string; role: 'videografer' | 'editor' }, r: Range): Scorecard {
  const m = personMetrics(rows, p.role, p.id, r);
  const parts = partsOf(m);
  return {
    id: p.id, name: p.name, role: p.role, contents: m.contents,
    us: m.ratings.length ? { avg: avg(m.ratings)!, n: m.ratings.length } : null,
    sla: m.sla.total ? m.sla : null,
    revisi: m.revisi.total ? m.revisi : null,
    parts, score: kpiScore(parts),
  };
}

export function buildKpi(
  rows: readonly StatRow[],
  people: readonly { id: number; name: string; role: 'videografer' | 'editor' }[],
  period: Period,
  today: Ymd,
  viewer: { role: Role; id: number },
): KpiDto {
  const { cur, prev } = windowsOf(period, today);
  const teamParts = (r: Range): KpiParts => {
    const m = metricsOf(rows, r);
    return partsOf({ ratings: m.ratings, sla: { tepat: m.syuting.tepat + m.editing.tepat, total: m.syuting.total + m.editing.total }, revisi: m.revisi });
  };
  const tm = metricsOf(rows, cur);
  const cards = people.map((p) => scorecardOf(rows, p, cur));
  const role = (r: 'videografer' | 'editor'): RoleKpi => {
    const group = cards.filter((c) => c.role === r);
    const sum = <T,>(f: (c: Scorecard) => T | null, g: (v: T) => number) => group.reduce((a, c) => a + (f(c) ? g(f(c)!) : 0), 0);
    const usN = sum((c) => c.us, (u) => u.n);
    const slaTotal = sum((c) => c.sla, (s) => s.total);
    const revTotal = sum((c) => c.revisi, (v) => v.total);
    const parts: KpiParts = {
      us: usN ? (sum((c) => c.us, (u) => u.avg * u.n) / usN / 5) * 100 : null,
      sla: slaTotal ? (sum((c) => c.sla, (s) => s.tepat) / slaTotal) * 100 : null,
      revisi: revTotal ? (1 - sum((c) => c.revisi, (v) => v.count) / revTotal) * 100 : null,
    };
    return {
      people: group.length, contents: group.reduce((a, c) => a + c.contents, 0),
      usAvg: usN ? sum((c) => c.us, (u) => u.avg * u.n) / usN : null,
      slaPct: parts.sla, revisiRate: parts.revisi === null ? null : 100 - parts.revisi, score: kpiScore(parts),
    };
  };
  const tp = teamParts(cur);
  return {
    period, range: cur, weights: KPI_WEIGHTS, target: SATISFACTION_TARGET, threshold: REVISION_THRESHOLD,
    team: {
      score: kpiScore(tp), prevScore: kpiScore(teamParts(prev)), usAvg: avg(tm.ratings), slaPct: tp.sla,
      revisiRate: tp.revisi === null ? null : 100 - tp.revisi, selesai: tm.selesai,
    },
    byRole: { videografer: role('videografer'), editor: role('editor') },
    individuals: viewer.role === 'leader' || viewer.role === 'admin' ? cards : cards.filter((c) => c.id === viewer.id),
  };
}
