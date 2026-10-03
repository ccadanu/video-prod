import { describe, expect, it } from 'vitest';
import {
  canTransition,
  dailyColumn,
  handoffNeedsDrive,
  handoffSchema,
  isGoogleDriveUrl,
  pullSchema,
  rescheduleSchema,
  routeOf,
  sampleExecution,
  summarize,
  type ColumnInput,
} from './index';

const c = (o: Partial<ColumnInput>): ColumnInput => ({ status: 'ready', day: 2, handedOff: false, ...o });

describe('dailyColumn', () => {
  it('memetakan status ke kolom pada hari yang dilihat', () => {
    expect(dailyColumn(c({}), 2)).toBe('belum');
    expect(dailyColumn(c({ status: 'syuting' }), 2)).toBe('sedang');
    expect(dailyColumn(c({ status: 'footage_siap' }), 2)).toBe('footage');
    expect(dailyColumn(c({ handedOff: true, status: 'antre_editing' }), 2)).toBe('terkirim');
  });

  it('konten hari berikutnya di pekan yang sama masuk "Terjadwal Nanti" (hanya yang masih ready)', () => {
    expect(dailyColumn(c({ day: 3 }), 2)).toBe('later');
    expect(dailyColumn(c({ day: 3, status: 'syuting' }), 2)).toBeNull();
    expect(dailyColumn(c({ day: 3, handedOff: true }), 2)).toBeNull();
  });

  it('konten hari sebelumnya yang belum selesai tidak hilang (terlewat / terbawa), yang sudah terkirim tidak ikut', () => {
    expect(dailyColumn(c({ day: 0 }), 2)).toBe('belum');
    expect(dailyColumn(c({ day: 0, status: 'syuting' }), 2)).toBe('sedang');
    expect(dailyColumn(c({ day: 0, status: 'footage_siap' }), 2)).toBe('footage');
    expect(dailyColumn(c({ day: 0, handedOff: true }), 2)).toBeNull();
  });

  it('revisi untuk jalur langsung ke Review kembali ke "Belum Take" di hari apa pun, meski sudah pernah terkirim', () => {
    expect(dailyColumn(c({ status: 'revisi', handedOff: true, redo: true }), 2)).toBe('belum');
    expect(dailyColumn(c({ status: 'revisi', handedOff: true, redo: true, day: 4 }), 2)).toBe('belum');
    expect(dailyColumn(c({ status: 'revisi', handedOff: true }), 2)).toBe('terkirim'); // revisi ke Editor: tetap tercatat terkirim
  });

  it('konten tanpa hari atau di luar tahap produksi tidak tampil', () => {
    expect(dailyColumn(c({ day: null }), 2)).toBeNull();
    expect(dailyColumn(c({ status: 'validasi_sdm' }), 2)).toBeNull();
    expect(dailyColumn(c({ status: 'listing' }), 2)).toBeNull();
  });
});

describe('summarize', () => {
  it('menghitung ringkasan tanpa kolom "Terjadwal Nanti"', () => {
    const cards = [
      { column: 'belum' as const, holdReason: null },
      { column: 'belum' as const, holdReason: 'telat' },
      { column: 'sedang' as const, holdReason: null },
      { column: 'footage' as const, holdReason: null },
      { column: 'terkirim' as const, holdReason: null },
      { column: 'later' as const, holdReason: null },
    ];
    expect(summarize(cards)).toEqual({ total: 5, taken: 2, taking: 1, handed: 1, held: 1 });
  });
});

describe('bukti serah footage', () => {
  it('Drive: wajib link drive.google.com; docs.google.com ditolak', () => {
    expect(handoffSchema.safeParse({ storage: 'drive', driveUrl: 'https://drive.google.com/drive/folders/1' }).success).toBe(true);
    for (const bad of ['https://docs.google.com/document/d/1', 'http://drive.google.com/x', 'https://drive.google.com.evil.example/x', '']) {
      expect(handoffSchema.safeParse({ storage: 'drive', driveUrl: bad }).success, bad).toBe(false);
    }
    expect(isGoogleDriveUrl('https://drive.google.com/file/d/1')).toBe(true);
  });

  it('Hard disk: nama disk, path, dan nama file wajib; tanpa foto/screenshot', () => {
    expect(handoffSchema.safeParse({ storage: 'hdd', diskName: 'HDD-CCP-02', path: '/2026/Okt/Rabu/', fileName: 'clip_1.mp4' }).success).toBe(true);
    expect(handoffSchema.safeParse({ storage: 'hdd', diskName: 'HDD', path: '', fileName: 'a' }).success).toBe(false);
    expect(handoffSchema.safeParse({ storage: 'hdd', diskName: 'HDD', path: '/x' }).success).toBe(false);
    expect(handoffSchema.safeParse({ storage: 'nas', diskName: 'x' }).success).toBe(false);
  });

  it('jalur langsung ke Review User wajib Drive; ke Editor boleh keduanya; tujuan sesuai PRD §7.4', () => {
    expect(handoffNeedsDrive('shooting_only')).toBe(true);
    expect(handoffNeedsDrive('photoshoot')).toBe(true);
    expect(handoffNeedsDrive('shooting_edit')).toBe(false);
    expect(routeOf('shooting_edit')).toBe('editor');
    expect(routeOf('photoshoot')).toBe('review');
  });
});

describe('penyesuaian hari-H', () => {
  it('reschedule wajib hari 0–4 dan alasan; pull hanya hari', () => {
    expect(rescheduleSchema.safeParse({ day: 3, reason: 'Talent cancel' }).success).toBe(true);
    expect(rescheduleSchema.safeParse({ day: 3, reason: ' ' }).success).toBe(false);
    expect(rescheduleSchema.safeParse({ day: 5, reason: 'x' }).success).toBe(false);
    expect(pullSchema.safeParse({ day: 0 }).success).toBe(true);
    expect(pullSchema.safeParse({}).success).toBe(false);
  });

  it('take bisa dibatalkan (syuting → ready) atau ditunda (syuting → listing) oleh VG saja', () => {
    expect(canTransition('weekly_edit', 'syuting', 'ready', 'videografer')).toBe(true);
    expect(canTransition('weekly_direct', 'syuting', 'listing', 'videografer')).toBe(true);
    expect(canTransition('weekly_edit', 'syuting', 'ready', 'leader')).toBe(false);
    expect(canTransition('daily', 'syuting', 'ready', 'videografer')).toBe(false);
  });
});

describe('sampleExecution', () => {
  it('skenario tetap: tiap kolom terisi pada Rabu, dan ada hold dan jadwal berikutnya', () => {
    const items = sampleExecution();
    const wed = items.filter((i) => i.day === 2);
    expect(new Set(wed.map((i) => i.state))).toEqual(new Set(['handed', 'footage', 'syuting', 'ready']));
    expect(wed.filter((i) => i.hold)).toHaveLength(1);
    expect(items.filter((i) => i.day > 2).every((i) => i.state === 'ready')).toBe(true);
    expect(items.filter((i) => i.day < 2).every((i) => i.state === 'handed')).toBe(true);
    // Shooting Only/Photoshoot yang sudah terkirim wajib di Drive
    expect(items.filter((i) => i.state === 'handed' && i.jenis !== 'shooting_edit').every((i) => i.storage === 'drive')).toBe(true);
  });
});
