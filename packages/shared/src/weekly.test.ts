import { describe, expect, it } from 'vitest';
import {
  contentPatchSchema,
  dayDocSchema,
  isWeekStart,
  sampleWeekly,
  sdmKey,
  sdmNeeds,
  weekProgress,
  type ProgressInput,
} from './index';

const base = { talent: 'Rani', lokasi: 'Studio', lokasiDetail: '', fuProperti: '', fuKostum: '', fuDesain: '' };

describe('sdmNeeds', () => {
  it('talent + lokasi luar selalu menjadi item SDM', () => {
    expect(sdmNeeds(base)).toEqual([
      { type: 'talent', name: 'Rani' },
      { type: 'lokasi', name: 'Studio' },
    ]);
  });

  it('lokasi Kantor otomatis Ready (tidak jadi item); "Lainnya" memakai keterangan', () => {
    expect(sdmNeeds({ ...base, lokasi: 'Kantor' }).map((n) => n.type)).toEqual(['talent']);
    expect(sdmNeeds({ ...base, lokasi: 'Lainnya', lokasiDetail: 'Rumah talent' })[1]).toEqual({ type: 'lokasi', name: 'Rumah talent' });
  });

  it('properti, kostum khusus, dan aset desain hanya bila VG menandainya (FU)', () => {
    const needs = sdmNeeds({ ...base, lokasi: 'Kantor', fuProperti: 'Teko keramik', fuKostum: 'Kebaya', fuDesain: 'Frame design' });
    expect(needs.map((n) => n.type)).toEqual(['talent', 'prop', 'desain', 'kostum']);
  });

  it('talent kosong/"tidak ada" tidak menjadi item', () => {
    for (const t of ['', '  ', '-', '—', 'Tidak ada']) expect(sdmNeeds({ ...base, talent: t, lokasi: 'Kantor' })).toEqual([]);
  });

  it('kunci item tidak membedakan huruf besar/kecil dan spasi tepi', () => {
    expect(sdmKey(1, { type: 'talent', name: ' Bu Tatik ' })).toBe(sdmKey(1, { type: 'talent', name: 'bu tatik' }));
    expect(sdmKey(1, { type: 'talent', name: 'Rani' })).not.toBe(sdmKey(2, { type: 'talent', name: 'Rani' }));
  });
});

describe('weekProgress', () => {
  const input = (o: Partial<ProgressInput> = {}): ProgressInput => ({
    lockedAt: null,
    readyAt: null,
    contents: [
      { status: 'listing', day: null },
      { status: 'listing', day: 2 },
    ],
    items: [],
    ...o,
  });

  it('awal: tahap Locking, boleh mengunci, belum boleh Ready', () => {
    const p = weekProgress(input());
    expect(p.steps).toEqual([false, false, false, false]);
    expect(p).toMatchObject({ pendingLock: 2, canLock: true, canMarkReady: false, label: 'Locking' });
  });

  it('setelah dikunci tetapi ada konten tanpa hari: Propose Jadwal', () => {
    const p = weekProgress(input({ lockedAt: 't', contents: [{ status: 'validasi_sdm', day: null }, { status: 'validasi_sdm', day: 1 }] }));
    expect(p.steps).toEqual([true, false, false, false]);
    expect(p).toMatchObject({ unscheduled: 1, label: 'Propose Jadwal', canMarkReady: false });
  });

  it('semua terjadwal tetapi ada SDM belum Ready: Validasi SDM', () => {
    const p = weekProgress(
      input({ lockedAt: 't', contents: [{ status: 'validasi_sdm', day: 0 }], items: [{ ready: true }, { ready: false }] }),
    );
    expect(p.steps).toEqual([true, true, false, false]);
    expect(p).toMatchObject({ label: 'Validasi SDM', canMarkReady: false, lockedGateOk: false });
  });

  it('semua SDM Ready: boleh ditandai Ready, lalu selesai setelah ditandai', () => {
    const ok = input({ lockedAt: 't', contents: [{ status: 'validasi_sdm', day: 0 }], items: [{ ready: true }] });
    expect(weekProgress(ok)).toMatchObject({ steps: [true, true, true, false], canMarkReady: true, label: 'Siap ditandai Ready' });
    const done = weekProgress({ ...ok, readyAt: 't2', contents: [{ status: 'ready', day: 0 }] });
    expect(done).toMatchObject({ steps: [true, true, true, true], canMarkReady: false, label: 'Ready to Execute' });
  });

  it('pekan tanpa item SDM (semua Kantor) tetap bisa Ready', () => {
    expect(weekProgress(input({ lockedAt: 't', contents: [{ status: 'validasi_sdm', day: 3 }] })).canMarkReady).toBe(true);
  });

  it('konten susulan (listing) setelah pekan dikunci menahan kemajuan tetapi tidak membatalkan syarat konten yang sudah dikunci', () => {
    const p = weekProgress(
      input({ lockedAt: 't', readyAt: 't2', contents: [{ status: 'ready', day: 0 }, { status: 'listing', day: null }], items: [{ ready: true }] }),
    );
    expect(p.steps[0]).toBe(false);
    expect(p).toMatchObject({ pendingLock: 1, canLock: true, canMarkReady: false, lockedGateOk: true });
  });

  it('pekan kosong tidak dianggap selesai', () => {
    expect(weekProgress(input({ lockedAt: 't', contents: [] })).steps).toEqual([false, false, false, false]);
  });
});

describe('validasi input', () => {
  it('patch konten: bobot/hari dibatasi, string dipangkas, kolom wajib tidak boleh kosong', () => {
    expect(contentPatchSchema.safeParse({ day: 5 }).success).toBe(false);
    expect(contentPatchSchema.safeParse({ day: null, bobot: 'susah' }).success).toBe(true);
    expect(contentPatchSchema.safeParse({ bobot: 'sedang' }).success).toBe(false);
    expect(contentPatchSchema.safeParse({ talent: '   ' }).success).toBe(false);
    expect(contentPatchSchema.parse({ fuProperti: '  Teko  ' }).fuProperti).toBe('Teko');
    expect(contentPatchSchema.parse({}).reason).toBe('');
  });

  it('dokumen shotlist/skrip harus link Google', () => {
    expect(dayDocSchema.safeParse({ kind: 'shotlist', url: 'https://docs.google.com/document/d/1' }).success).toBe(true);
    expect(dayDocSchema.safeParse({ kind: 'skrip', url: 'https://evil.example/x' }).success).toBe(false);
    expect(dayDocSchema.safeParse({ kind: 'lain', url: 'https://docs.google.com/x' }).success).toBe(false);
  });

  it('awal pekan harus hari Senin yang valid', () => {
    expect(isWeekStart('2026-10-05')).toBe(true);
    expect(isWeekStart('2026-10-06')).toBe(false);
    expect(isWeekStart('2026-02-30')).toBe(false);
    expect(isWeekStart('besok')).toBe(false);
  });
});

describe('sampleWeekly', () => {
  it('deterministik, 4 konten belum dijadwalkan, dan hari dalam Senin–Jumat', () => {
    const a = sampleWeekly();
    expect(a).toEqual(sampleWeekly());
    expect(a).toHaveLength(22);
    expect(a.filter((x) => x.day === null)).toHaveLength(4);
    expect(a.every((x) => x.day === null || (x.day >= 0 && x.day <= 4))).toBe(true);
  });
});
