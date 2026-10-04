import type { Role } from './roles';
import {
  REVISION_THRESHOLD,
  SATISFACTION_TARGET,
  avg,
  metricsOf,
  slaPct,
  windowsOf,
  within,
  ymdOf,
  type Period,
  type Range,
  type StatRow,
} from './stats';
import type { Ymd } from './weeks';

/**
 * Papan Prestasi (gamifikasi). Prinsip rancangan:
 * - Hanya poin POSITIF: tidak ada pengurangan; keterlambatan/revisi hanya berarti bonus tidak didapat.
 * - Poin dikreditkan saat konten SELESAI (disetujui User), bukan saat dikirim, agar tidak bisa "dikejar" dengan kirim cepat.
 * - Papan terpisah per peran (Editor, Videografer) agar perbandingan adil, ditambah tantangan tim.
 * Angka di bawah adalah USULAN (lihat docs/ASSUMPTIONS.md).
 */
export const ARENA_POINTS = {
  /** Setiap konten selesai yang ditangani. */
  base: 10,
  /** Tahap milik orang itu selesai pada/sebelum tenggat. */
  onTime: 5,
  /** Konten berbobot Susah. */
  susah: 5,
  /** Disetujui User tanpa revisi. */
  firstPass: 5,
  /** Rating 4 → +2, rating 5 → +4 (per rating dari blind review). */
  ratingStep: 2,
} as const;

export const LEVELS = [
  { name: 'Rookie', from: 0 },
  { name: 'Pro', from: 100 },
  { name: 'Expert', from: 250 },
  { name: 'Master', from: 500 },
  { name: 'Legend', from: 900 },
] as const;

export const BADGES = {
  tepat: { icon: '🎯', label: 'Tepat Waktu', hint: '≥5 pengiriman pada periode ini, semuanya sebelum tenggat' },
  streak5: { icon: '🔥', label: 'Streak 5', hint: '5 pengiriman tepat waktu berturut-turut (sedang berjalan)' },
  streak10: { icon: '🔥', label: 'Streak 10', hint: '10 pengiriman tepat waktu berturut-turut (sedang berjalan)' },
  zero: { icon: '💎', label: 'Zero Revisi', hint: '≥5 konten selesai pada periode ini tanpa satu pun revisi' },
  favorit: { icon: '⭐', label: 'Favorit User', hint: 'Rata-rata rating ≥4,5 dari minimal 3 rating' },
  susah: { icon: '💪', label: 'Jagoan Susah', hint: '≥3 konten berbobot Susah selesai pada periode ini' },
  produktif: { icon: '🚀', label: 'Produktif', hint: 'Konten selesai terbanyak di perannya (min. 3)' },
  naik: { icon: '📈', label: 'Naik Daun', hint: 'Poin naik ≥20 dibanding periode lalu' },
} as const;
export type BadgeKey = keyof typeof BADGES;

export type ArenaRole = 'editor' | 'videografer';

export interface ArenaBreakdown {
  base: number;
  onTime: number;
  susah: number;
  firstPass: number;
  rating: number;
}

export interface ArenaPerson {
  id: number;
  name: string;
  role: ArenaRole;
  rank: number;
  /** Peringkat pada periode lalu (null bila belum punya poin saat itu). */
  rankPrev: number | null;
  points: number;
  pointsPrev: number;
  contents: number;
  streak: number;
  level: { n: number; name: string; lifetime: number; next: number | null; progressPct: number };
  badges: BadgeKey[];
  /** Hanya untuk Leader/Admin dan orang itu sendiri. */
  onTimePct: number | null;
  avgRating: number | null;
  breakdown: ArenaBreakdown | null;
}

export interface TeamGoal {
  key: string;
  label: string;
  value: number | null;
  target: number;
  unit: '%' | '/5' | '';
  /** 'min' = harus ≥ target; 'max' = harus ≤ target. */
  direction: 'min' | 'max';
  met: boolean | null;
}

export interface ArenaDto {
  period: Period;
  range: Range;
  /** Apakah seluruh tim boleh melihat peringkat satu sama lain (diatur Leader). */
  publicToTeam: boolean;
  mode: 'full' | 'team' | 'self';
  goals: TeamGoal[];
  boards: Record<ArenaRole, { size: number; people: ArenaPerson[] }>;
}

interface Person {
  id: number;
  name: string;
  role: ArenaRole;
}

interface Credit {
  row: StatRow;
  onTime: boolean;
  susah: boolean;
  firstPass: boolean;
  ratingBonus: number;
}

const ALL_TIME: Range = { from: '0000-01-01', to: '9999-12-31' };

function owns(row: StatRow, p: Person): boolean {
  return p.role === 'videografer' ? row.vgId === p.id : row.editorId === p.id;
}

/** Ketepatan tahap milik orang itu: null bila tidak ada data jadwal/pengiriman. */
function stageOnTime(row: StatRow, role: ArenaRole): boolean | null {
  if (role === 'videografer') return row.handedAt && row.shootDate ? ymdOf(row.handedAt) <= row.shootDate : null;
  return row.deliveredAt && row.editDue ? ymdOf(row.deliveredAt) <= row.editDue : null;
}

function creditsOf(rows: readonly StatRow[], p: Person, r: Range): Credit[] {
  return rows
    .filter((x) => owns(x, p) && within(x.completedAt, r))
    .map((x) => ({
      row: x,
      onTime: stageOnTime(x, p.role) === true,
      susah: (p.role === 'videografer' ? x.shootBobot : x.editBobot) === 'susah',
      // Revisi VG hanya dibebankan untuk jalur langsung ke Review (footage-nya yang direview).
      firstPass: x.revisionCount === 0 && (p.role === 'editor' || x.jenis === 'shooting_only' || x.jenis === 'photoshoot'),
      ratingBonus: x.ratings.reduce((a, v) => a + (v >= 4 ? (v - 3) * ARENA_POINTS.ratingStep : 0), 0),
    }));
}

function breakdownOf(credits: readonly Credit[]): ArenaBreakdown {
  return {
    base: credits.length * ARENA_POINTS.base,
    onTime: credits.filter((c) => c.onTime).length * ARENA_POINTS.onTime,
    susah: credits.filter((c) => c.susah).length * ARENA_POINTS.susah,
    firstPass: credits.filter((c) => c.firstPass).length * ARENA_POINTS.firstPass,
    rating: credits.reduce((a, c) => a + c.ratingBonus, 0),
  };
}
const totalOf = (b: ArenaBreakdown): number => b.base + b.onTime + b.susah + b.firstPass + b.rating;

export function levelOf(lifetime: number): ArenaPerson['level'] {
  let i = 0;
  for (let k = 0; k < LEVELS.length; k++) if (lifetime >= LEVELS[k]!.from) i = k;
  const next = LEVELS[i + 1]?.from ?? null;
  const from = LEVELS[i]!.from;
  return { n: i + 1, name: LEVELS[i]!.name, lifetime, next, progressPct: next === null ? 100 : Math.round(((lifetime - from) / (next - from)) * 100) };
}

/** Pengiriman tepat waktu berturut-turut yang sedang berjalan (seumur hidup, dari yang terbaru). */
export function currentStreak(rows: readonly StatRow[], p: Person): number {
  const events = rows
    .filter((x) => owns(x, p) && stageOnTime(x, p.role) !== null)
    .map((x) => ({ at: p.role === 'videografer' ? x.handedAt! : x.deliveredAt!, ok: stageOnTime(x, p.role) === true }))
    .sort((a, b) => b.at.localeCompare(a.at));
  let n = 0;
  for (const e of events) {
    if (!e.ok) break;
    n++;
  }
  return n;
}

function rankMap(scored: { id: number; points: number; onTime: number; name: string }[]): Map<number, number> {
  const sorted = [...scored].sort((a, b) => b.points - a.points || b.onTime - a.onTime || a.name.localeCompare(b.name));
  return new Map(sorted.map((s, i) => [s.id, i + 1]));
}

export function buildArena(rows: readonly StatRow[], people: readonly Person[], period: Period, today: Ymd): Omit<ArenaDto, 'publicToTeam' | 'mode'> {
  const { cur, prev } = windowsOf(period, today);
  const out: Record<ArenaRole, ArenaPerson[]> = { editor: [], videografer: [] };

  for (const role of ['editor', 'videografer'] as const) {
    const group = people.filter((p) => p.role === role);
    const stats = group.map((p) => {
      const credits = creditsOf(rows, p, cur);
      const b = breakdownOf(credits);
      const prevPts = totalOf(breakdownOf(creditsOf(rows, p, prev)));
      const stagesDone = rows.filter((x) => owns(x, p) && stageOnTime(x, p.role) !== null && within(p.role === 'videografer' ? x.handedAt : x.deliveredAt, cur));
      const onTimeN = stagesDone.filter((x) => stageOnTime(x, p.role)).length;
      return { p, credits, b, points: totalOf(b), prevPts, stagesDone, onTimeN, onTimeRatio: stagesDone.length ? onTimeN / stagesDone.length : 0 };
    });
    const ranks = rankMap(stats.map((s) => ({ id: s.p.id, points: s.points, onTime: s.onTimeRatio, name: s.p.name })));
    const prevRanks = rankMap(stats.filter((s) => s.prevPts > 0).map((s) => ({ id: s.p.id, points: s.prevPts, onTime: 0, name: s.p.name })));
    const topDone = Math.max(0, ...stats.map((s) => s.credits.length));

    out[role] = stats
      .map((s): ArenaPerson => {
        const lifetime = totalOf(breakdownOf(creditsOf(rows, s.p, ALL_TIME)));
        const streak = currentStreak(rows, s.p);
        const ratings = s.credits.flatMap((c) => c.row.ratings);
        const badges: BadgeKey[] = [];
        if (s.stagesDone.length >= 5 && s.onTimeN === s.stagesDone.length) badges.push('tepat');
        if (streak >= 10) badges.push('streak10');
        else if (streak >= 5) badges.push('streak5');
        if (s.credits.length >= 5 && s.credits.every((c) => c.row.revisionCount === 0)) badges.push('zero');
        if (ratings.length >= 3 && avg(ratings)! >= 4.5) badges.push('favorit');
        if (s.credits.filter((c) => c.susah).length >= 3) badges.push('susah');
        if (s.credits.length >= 3 && s.credits.length === topDone) badges.push('produktif');
        if (s.points - s.prevPts >= 20 && s.prevPts > 0) badges.push('naik');
        return {
          id: s.p.id, name: s.p.name, role, rank: ranks.get(s.p.id)!, rankPrev: s.prevPts > 0 ? (prevRanks.get(s.p.id) ?? null) : null,
          points: s.points, pointsPrev: s.prevPts, contents: s.credits.length, streak, level: levelOf(lifetime), badges,
          onTimePct: s.stagesDone.length ? (s.onTimeN / s.stagesDone.length) * 100 : null, avgRating: avg(ratings), breakdown: s.b,
        };
      })
      .sort((a, b) => a.rank - b.rank);
  }

  const m = metricsOf(rows, cur);
  const pm = metricsOf(rows, prev);
  const sla = slaPct(m);
  const rate = m.revisi.total ? m.revisi.count / m.revisi.total : null;
  const rating = avg(m.ratings);
  const goals: TeamGoal[] = [
    { key: 'volume', label: 'Konten selesai ≥ periode lalu', value: m.selesai, target: pm.selesai, unit: '', direction: 'min', met: pm.selesai === 0 && m.selesai === 0 ? null : m.selesai >= pm.selesai },
    { key: 'sla', label: 'Tepat waktu ≥ 90%', value: sla, target: 90, unit: '%', direction: 'min', met: sla === null ? null : sla >= 90 },
    { key: 'revisi', label: `Revision rate ≤ ${REVISION_THRESHOLD * 100}%`, value: rate === null ? null : rate * 100, target: REVISION_THRESHOLD * 100, unit: '%', direction: 'max', met: rate === null ? null : rate <= REVISION_THRESHOLD },
    { key: 'rating', label: `Kepuasan User ≥ ${SATISFACTION_TARGET.toFixed(1).replace('.', ',')}`, value: rating, target: SATISFACTION_TARGET, unit: '/5', direction: 'min', met: rating === null ? null : rating >= SATISFACTION_TARGET },
  ];

  return {
    period, range: cur, goals,
    boards: {
      editor: { size: out.editor.length, people: out.editor },
      videografer: { size: out.videografer.length, people: out.videografer },
    },
  };
}

/**
 * Menerapkan aturan visibilitas:
 * - Leader/Admin: semua detail.
 * - VG/Editor + publik: semua papan, tetapi detail sensitif (ketepatan, rating, rincian poin) hanya milik sendiri.
 * - VG/Editor + tidak publik: hanya baris miliknya sendiri (dengan peringkat & ukuran papan).
 */
export function arenaFor(base: Omit<ArenaDto, 'publicToTeam' | 'mode'>, viewer: { role: Role; id: number }, publicToTeam: boolean): ArenaDto {
  if (viewer.role === 'leader' || viewer.role === 'admin') return { ...base, publicToTeam, mode: 'full' };
  const strip = (p: ArenaPerson): ArenaPerson => (p.id === viewer.id ? p : { ...p, onTimePct: null, avgRating: null, breakdown: null });
  const boards = {
    editor: { size: base.boards.editor.size, people: base.boards.editor.people.map(strip) },
    videografer: { size: base.boards.videografer.size, people: base.boards.videografer.people.map(strip) },
  };
  if (publicToTeam) return { ...base, publicToTeam, mode: 'team', boards };
  const only = (b: { size: number; people: ArenaPerson[] }) => ({ size: b.size, people: b.people.filter((p) => p.id === viewer.id) });
  return { ...base, publicToTeam, mode: 'self', boards: { editor: only(boards.editor), videografer: only(boards.videografer) } };
}

