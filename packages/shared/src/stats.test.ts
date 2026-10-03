import { describe, expect, it } from 'vitest';
import {
  KPI_WEIGHTS,
  MIN_RESPONSES,
  buildDashboard,
  buildKpi,
  cycleSchema,
  kpiScore,
  responseSchema,
  sampleCycles,
  sampleHistory,
  shuffled,
  windowsOf,
  type StatRow,
} from './index';

const TODAY = '2026-10-14'; // Rabu
const at = (ymd: string) => `${ymd}T03:30:00.000Z`;
const row = (o: Partial<StatRow> = {}): StatRow => ({
  id: 1, jenis: 'motion', kategori: 'Infografis', status: 'complete', requesterId: 10, requesterName: 'Sari', submittedAt: at('2026-10-06'), completedAt: at('2026-10-10'),
  revisionCount: 0, shootDate: null, handedAt: null, vgId: null, vgName: null, editDue: '2026-10-08', deliveredAt: at('2026-10-08'), editorId: 20, editorName: 'Dio', ratings: [], ...o,
});

describe('periode', () => {
  it('jendela sekarang dan sebelumnya berukuran sama, berurutan tanpa celah', () => {
    const w = windowsOf('2w', TODAY);
    expect(w.cur).toEqual({ from: '2026-10-01', to: '2026-10-14' });
    expect(w.prev).toEqual({ from: '2026-09-17', to: '2026-09-30' });
    expect(windowsOf('1y', TODAY).cur.from).toBe('2025-10-15');
  });
});

describe('buildDashboard', () => {
  const rows = [
    row({ id: 1, ratings: [5, 4] }),
    row({ id: 2, revisionCount: 1, ratings: [3], editDue: '2026-10-08', deliveredAt: at('2026-10-09') }), // editing telat
    row({ id: 3, jenis: 'shooting_edit', kategori: 'Talking Head', requesterId: 11, requesterName: 'Budi', shootDate: '2026-10-07', handedAt: at('2026-10-07'), vgId: 30, vgName: 'Hardi' }),
    row({ id: 4, status: 'editing', completedAt: null, deliveredAt: null, editDue: '2026-10-16', submittedAt: at('2026-09-20') }), // periode lalu
  ];
  const d = buildDashboard(rows, '2w', TODAY, { role: 'leader', id: 1 });

  it('menghitung selesai, volume, dan Δ terhadap periode lalu', () => {
    expect(d.selesai).toMatchObject({ value: 3, prev: 0, pct: null });
    expect(d.volume.total).toMatchObject({ value: 3, prev: 1 });
    expect(d.volume.total.pct).toBe(200);
    expect(d.volume.weekly).toBe(1);
    expect(d.volume.daily).toBe(2);
  });
  it('kepuasan rata-rata dari rating, revision rate dari konten selesai', () => {
    expect(d.kepuasan).toMatchObject({ n: 3, target: 4 });
    expect(d.kepuasan.avg).toBeCloseTo(4);
    expect(d.revisi).toMatchObject({ count: 1, total: 3, threshold: 0.25 });
  });
  it('kesesuaian SLA: syuting dan editing dihitung terpisah', () => {
    expect(d.sla.syuting).toEqual({ tepat: 1, total: 1 });
    expect(d.sla.editing).toEqual({ tepat: 2, total: 3 });
    expect(d.sla.pct).toBeCloseTo(75);
  });
  it('komposisi, kategori, funnel, heatmap', () => {
    expect(d.jalur.find((j) => j.jenis === 'motion')?.count).toBe(2);
    expect(d.kategori[0]).toEqual({ name: 'Infografis', count: 2 });
    expect(d.funnel.map((f) => f.count)).toEqual([3, 3, 3, 3, 3]);
    expect(d.heatmap.cells[d.heatmap.statuses.indexOf('editing')]![d.heatmap.jenis.indexOf('motion')]).toBe(1);
  });
  it('tren harian mencakup seluruh rentang; 3 bulan mingguan; 1 tahun bulanan', () => {
    expect(d.trend.granularity).toBe('day');
    expect(d.trend.buckets).toHaveLength(14);
    expect(d.trend.buckets.reduce((n, b) => n + b.weekly + b.daily, 0)).toBe(3);
    expect(buildDashboard(rows, '3m', TODAY, { role: 'leader', id: 1 }).trend.granularity).toBe('week');
    expect(buildDashboard(rows, '1y', TODAY, { role: 'leader', id: 1 }).trend.buckets).toHaveLength(13);
  });
  it('User biasa tidak melihat nama pemohon lain', () => {
    const u = buildDashboard(rows, '2w', TODAY, { role: 'user', id: 11 });
    expect(u.users.map((x) => x.label).sort()).toEqual(['Anda', 'Pemohon 1']);
    expect(JSON.stringify(u)).not.toContain('Sari');
  });
});

describe('KPI', () => {
  it('skor berbobot 60/20/20 dan bobot dinormalkan bila komponen tak ada', () => {
    expect(kpiScore({ us: 80, sla: 100, revisi: 50 })).toBeCloseTo(0.6 * 80 + 0.2 * 100 + 0.2 * 50);
    expect(kpiScore({ us: null, sla: 100, revisi: 50 })).toBeCloseTo((0.2 * 100 + 0.2 * 50) / 0.4);
    expect(kpiScore({ us: null, sla: null, revisi: null })).toBeNull();
    expect(KPI_WEIGHTS.us + KPI_WEIGHTS.sla + KPI_WEIGHTS.revisi).toBeCloseTo(1);
  });

  const rows = [
    row({ id: 1, ratings: [5], jenis: 'shooting_only', editorId: null, editDue: null, deliveredAt: null, shootDate: '2026-10-07', handedAt: at('2026-10-08'), vgId: 30, vgName: 'Hardi', revisionCount: 1 }),
    row({ id: 2, ratings: [4] }),
    row({ id: 3, ratings: [2], revisionCount: 2, deliveredAt: at('2026-10-09') }),
  ];
  const people = [
    { id: 20, name: 'Dio', role: 'editor' as const },
    { id: 30, name: 'Hardi', role: 'videografer' as const },
  ];
  it('scorecard per individu: US, SLA, revisi, skor', () => {
    const k = buildKpi(rows, people, '2w', TODAY, { role: 'leader', id: 1 });
    const dio = k.individuals.find((c) => c.id === 20)!;
    expect(dio.us).toEqual({ avg: 3, n: 2 });
    expect(dio.sla).toEqual({ tepat: 1, total: 2 });
    expect(dio.revisi).toEqual({ count: 1, total: 2 });
    expect(dio.score).toBeCloseTo((0.6 * 60 + 0.2 * 50 + 0.2 * 50) / 1);
    const hardi = k.individuals.find((c) => c.id === 30)!;
    expect(hardi.sla).toEqual({ tepat: 0, total: 1 }); // diserahkan sehari setelah hari syuting
    expect(hardi.revisi).toEqual({ count: 1, total: 1 });
  });
  it('akses berjenjang: individu hanya melihat dirinya, Leader/Admin semua', () => {
    expect(buildKpi(rows, people, '2w', TODAY, { role: 'editor', id: 20 }).individuals.map((c) => c.id)).toEqual([20]);
    expect(buildKpi(rows, people, '2w', TODAY, { role: 'videografer', id: 20 }).individuals.map((c) => c.id)).toEqual([20]);
    expect(buildKpi(rows, people, '2w', TODAY, { role: 'admin', id: 1 }).individuals).toHaveLength(2);
  });
  it('ringkasan per peran & tim', () => {
    const k = buildKpi(rows, people, '2w', TODAY, { role: 'leader', id: 1 });
    expect(k.byRole.editor).toMatchObject({ people: 1, contents: 2 });
    expect(k.team.selesai).toBe(3);
    expect(k.team.usAvg).toBeCloseTo(11 / 3);
  });
});

describe('evaluasi & data contoh', () => {
  it('skema siklus: periode valid, maks 31 hari', () => {
    expect(cycleSchema.safeParse({ periodStart: '2026-10-01', periodEnd: '2026-10-14' }).success).toBe(true);
    expect(cycleSchema.safeParse({ periodStart: '2026-10-14', periodEnd: '2026-10-01' }).success).toBe(false);
    expect(cycleSchema.safeParse({ periodStart: '2026-09-01', periodEnd: '2026-10-14' }).success).toBe(false);
  });
  it('skema respons: rating 1–5 wajib', () => {
    expect(responseSchema.safeParse({ ratings: [{ briefId: 1, rating: 5 }] }).success).toBe(true);
    expect(responseSchema.safeParse({ ratings: [{ briefId: 1, rating: 6 }] }).success).toBe(false);
    expect(responseSchema.safeParse({ ratings: [] }).success).toBe(false);
    expect(MIN_RESPONSES).toBeGreaterThan(1);
  });
  it('shuffled deterministik dan tidak menghilangkan item', () => {
    const a = [1, 2, 3, 4, 5, 6];
    expect(shuffled(a, 3)).toEqual(shuffled(a, 3));
    expect([...shuffled(a, 3)].sort()).toEqual(a);
  });
  it('riwayat contoh koheren: urutan waktu, selesai sebelum hari ini, siklus berurutan', () => {
    const h = sampleHistory(TODAY);
    expect(h.length).toBeGreaterThan(60);
    for (const x of h) {
      expect(x.submittedAt < x.completedAt).toBe(true);
      expect(x.completedAt.slice(0, 10) < TODAY).toBe(true);
      if (x.shoot && x.edit) expect(x.shoot.handedAt <= x.edit.deliveredAt).toBe(true);
      if (x.edit) expect(x.edit.deliveredAt <= x.completedAt).toBe(true);
      expect(x.shoot === null).toBe(x.vg === null);
    }
    const c = sampleCycles(TODAY);
    expect(c[0]).toMatchObject({ status: 'open', periodEnd: TODAY });
    expect(c.slice(1).every((x) => x.status === 'closed')).toBe(true);
    expect(c[1]!.periodEnd < c[0]!.periodStart).toBe(true);
  });
});
