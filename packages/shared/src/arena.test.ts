import { describe, expect, it } from 'vitest';
import { ARENA_POINTS, arenaFor, buildArena, currentStreak, levelOf, sampleHistory, type StatRow } from './index';

const TODAY = '2026-10-14';
const at = (ymd: string) => `${ymd}T03:30:00.000Z`;
const row = (o: Partial<StatRow> = {}): StatRow => ({
  id: 1, jenis: 'motion', kategori: 'Infografis', status: 'complete', requesterId: 10, requesterName: 'Sari', submittedAt: at('2026-10-02'), completedAt: at('2026-10-10'),
  revisionCount: 0, shootDate: null, handedAt: null, vgId: null, vgName: null, editDue: '2026-10-08', deliveredAt: at('2026-10-08'), editorId: 20, editorName: 'Dio',
  shootBobot: null, editBobot: 'gampang', ratings: [], ...o,
});
const people = [
  { id: 20, name: 'Dio', role: 'editor' as const },
  { id: 21, name: 'Rara', role: 'editor' as const },
  { id: 30, name: 'Hardi', role: 'videografer' as const },
];

describe('poin', () => {
  it('menjumlahkan dasar + tepat waktu + susah + tanpa revisi + bonus rating (hanya positif)', () => {
    const rows = [
      row({ id: 1, editBobot: 'susah', ratings: [5, 4] }), // 10 + 5 + 5 + 5 + (4+2)
      row({ id: 2, revisionCount: 2, deliveredAt: at('2026-10-09'), ratings: [2] }), // 10 saja: telat, revisi, rating rendah tidak mengurangi
    ];
    const a = buildArena(rows, people, '2w', TODAY);
    const dio = a.boards.editor.people.find((p) => p.id === 20)!;
    expect(dio.breakdown).toEqual({ base: 20, onTime: 5, susah: 5, firstPass: 5, rating: 6 });
    expect(dio.points).toBe(41);
    expect(ARENA_POINTS.base).toBe(10);
  });

  it('poin hanya dari konten selesai pada periode (belum selesai tidak dihitung)', () => {
    const rows = [row({ id: 1 }), row({ id: 2, status: 'in_review', completedAt: null }), row({ id: 3, completedAt: at('2026-08-01') })];
    expect(buildArena(rows, people, '2w', TODAY).boards.editor.people.find((p) => p.id === 20)!.points).toBe(20);
  });

  it('VG: tepat waktu dari hari syuting; revisi hanya dibebankan pada jalur langsung ke Review', () => {
    const rows = [
      row({ id: 1, jenis: 'shooting_only', editorId: null, vgId: 30, shootDate: '2026-10-07', handedAt: at('2026-10-07'), editDue: null, deliveredAt: null, shootBobot: 'susah' }), // 10+5+5+5
      row({ id: 2, jenis: 'shooting_edit', vgId: 30, shootDate: '2026-10-06', handedAt: at('2026-10-07') }), // telat; weekly_edit tidak dapat bonus tanpa revisi → 10
    ];
    const h = buildArena(rows, people, '2w', TODAY).boards.videografer.people[0]!;
    expect(h.points).toBe(25 + 10);
  });
});

describe('peringkat, level, streak, lencana', () => {
  const rows = [
    row({ id: 1, editorId: 20 }), row({ id: 2, editorId: 20 }), row({ id: 3, editorId: 20 }),
    row({ id: 4, editorId: 21 }),
    // periode lalu
    row({ id: 5, editorId: 21, completedAt: at('2026-09-20'), deliveredAt: at('2026-09-19'), editDue: '2026-09-19' }),
  ];
  const a = buildArena(rows, people, '2w', TODAY);
  it('peringkat berdasar poin; orang tanpa poin tetap terdaftar di bawah', () => {
    expect(a.boards.editor.people.map((p) => [p.name, p.rank])).toEqual([['Dio', 1], ['Rara', 2]]);
    expect(a.boards.videografer.people[0]).toMatchObject({ name: 'Hardi', points: 0, rank: 1 });
  });
  it('perubahan peringkat vs periode lalu & lencana Produktif', () => {
    const rara = a.boards.editor.people.find((p) => p.id === 21)!;
    expect(rara.rankPrev).toBe(1);
    expect(a.boards.editor.people[0]!.rankPrev).toBeNull();
    expect(a.boards.editor.people[0]!.badges).toContain('produktif');
  });
  it('level dari poin seumur hidup', () => {
    expect(levelOf(0)).toMatchObject({ n: 1, name: 'Rookie', next: 100, progressPct: 0 });
    expect(levelOf(175)).toMatchObject({ n: 2, name: 'Pro', next: 250, progressPct: 50 });
    expect(levelOf(5000)).toMatchObject({ n: 5, name: 'Legend', next: null, progressPct: 100 });
  });
  it('streak berhenti pada keterlambatan terbaru', () => {
    const r = [
      row({ id: 1, deliveredAt: at('2026-10-01'), editDue: '2026-10-02' }),
      row({ id: 2, deliveredAt: at('2026-10-03'), editDue: '2026-10-02' }), // telat
      row({ id: 3, deliveredAt: at('2026-10-06'), editDue: '2026-10-06' }),
      row({ id: 4, deliveredAt: at('2026-10-08'), editDue: '2026-10-09' }),
    ];
    expect(currentStreak(r, people[0]!)).toBe(2);
  });
  it('lencana: Zero Revisi, Tepat Waktu, Favorit User butuh jumlah minimum', () => {
    const many = Array.from({ length: 5 }, (_, i) => row({ id: 100 + i, ratings: [5] }));
    const p = buildArena(many, people, '2w', TODAY).boards.editor.people.find((x) => x.id === 20)!;
    expect(p.badges).toEqual(expect.arrayContaining(['tepat', 'zero', 'favorit', 'streak5']));
    expect(buildArena(many.slice(0, 2), people, '2w', TODAY).boards.editor.people.find((x) => x.id === 20)!.badges).not.toContain('zero');
  });
  it('tantangan tim', () => {
    expect(a.goals.map((g) => g.key)).toEqual(['volume', 'sla', 'revisi', 'rating']);
    expect(a.goals.find((g) => g.key === 'volume')).toMatchObject({ value: 4, target: 1, met: true });
    expect(a.goals.find((g) => g.key === 'rating')).toMatchObject({ value: null, met: null });
  });
});

describe('visibilitas', () => {
  const base = buildArena([row({ id: 1, ratings: [5] }), row({ id: 2, editorId: 21, ratings: [3] })], people, '2w', TODAY);
  it('Leader/Admin melihat semua detail', () => {
    const a = arenaFor(base, { role: 'leader', id: 1 }, false);
    expect(a.mode).toBe('full');
    expect(a.boards.editor.people.every((p) => p.breakdown !== null)).toBe(true);
  });
  it('tim (publik): semua papan, tetapi detail sensitif hanya milik sendiri', () => {
    const a = arenaFor(base, { role: 'editor', id: 21 }, true);
    expect(a.mode).toBe('team');
    expect(a.boards.editor.people).toHaveLength(2);
    expect(a.boards.editor.people.find((p) => p.id === 20)).toMatchObject({ breakdown: null, onTimePct: null, avgRating: null });
    expect(a.boards.editor.people.find((p) => p.id === 21)!.breakdown).not.toBeNull();
  });
  it('tidak publik: hanya baris sendiri, ukuran papan tetap diketahui', () => {
    const a = arenaFor(base, { role: 'editor', id: 21 }, false);
    expect(a.mode).toBe('self');
    expect(a.boards.editor.people.map((p) => p.id)).toEqual([21]);
    expect(a.boards.editor.size).toBe(2);
    expect(a.boards.videografer.people).toEqual([]);
    expect(JSON.stringify(a)).not.toContain('Dio');
  });
});

describe('data contoh', () => {
  it('riwayat memuat banyak editor/VG sehingga papan bersaing', () => {
    const h = sampleHistory(TODAY);
    expect(new Set(h.map((x) => x.editor).filter(Boolean)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(h.map((x) => x.vg).filter(Boolean)).size).toBeGreaterThanOrEqual(3);
  });
});
