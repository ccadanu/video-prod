import { describe, expect, it } from 'vitest';
import {
  JENIS,
  STATUSES,
  TRANSITIONS,
  canTransition,
  capacityOf,
  flattenNav,
  isOverCapacity,
  jalurOf,
  mondayOf,
  mondaysOfMonth,
  navFor,
  productionWeekFor,
  requiresReason,
  slotsUsed,
  transitionsFrom,
  weekLabel,
  weekdayDates,
  lockingDayOf,
  todayJakarta,
  driveRequired,
} from './index';

describe('jalur', () => {
  it('memetakan jenis ke jalur sesuai PRD §4', () => {
    expect(jalurOf('shooting_edit')).toBe('weekly_edit');
    expect(jalurOf('shooting_only')).toBe('weekly_direct');
    expect(jalurOf('photoshoot')).toBe('weekly_direct');
    for (const j of ['full_ai', 'editing_only', 'motion'] as const) expect(jalurOf(j)).toBe('daily');
  });

  it('mewajibkan Drive hanya untuk jalur langsung ke Review User', () => {
    expect(JENIS.filter(driveRequired)).toEqual(['shooting_only', 'photoshoot']);
  });
});

describe('state machine status', () => {
  it('tidak punya transisi ke/dari status yang tidak dikenal', () => {
    for (const t of TRANSITIONS) {
      expect(STATUSES).toContain(t.from);
      expect(STATUSES).toContain(t.to);
    }
  });

  it('jalur Shooting + Edit: syuting → footage → editor → review → selesai', () => {
    const path = ['listing', 'locking', 'validasi_sdm', 'ready', 'syuting', 'footage_siap', 'terkirim', 'antre_editing', 'editing', 'in_review', 'complete'] as const;
    const actors = ['videografer', 'videografer', 'videografer', 'videografer', 'videografer', 'videografer', 'system', 'leader', 'editor', 'user'] as const;
    path.slice(0, -1).forEach((from, i) => {
      const to = path[i + 1]!;
      expect(canTransition('weekly_edit', from, to, actors[i]!), `${from} → ${to}`).toBe(true);
    });
  });

  it('Shooting Only / Photoshoot tidak lewat Editor', () => {
    expect(canTransition('weekly_direct', 'terkirim', 'in_review', 'system')).toBe(true);
    expect(canTransition('weekly_direct', 'terkirim', 'antre_editing', 'system')).toBe(false);
  });

  it('jalur Daily: Leader memvalidasi lalu masuk antrean editing, tanpa syuting', () => {
    expect(canTransition('daily', 'draft', 'pending_review', 'user')).toBe(true);
    expect(canTransition('daily', 'pending_review', 'antre_editing', 'leader')).toBe(true);
    expect(canTransition('daily', 'draft', 'listing', 'user')).toBe(false);
    expect(canTransition('daily', 'ready', 'syuting', 'videografer')).toBe(false);
  });

  it('Weekly langsung ke Weekly Listing tanpa validasi Leader (PRD §5.3)', () => {
    expect(canTransition('weekly_edit', 'draft', 'listing', 'user')).toBe(true);
    expect(canTransition('weekly_edit', 'draft', 'pending_review', 'user')).toBe(false);
  });

  it('hanya User yang approve atau minta revisi; Leader tidak bisa', () => {
    expect(canTransition('daily', 'in_review', 'complete', 'user')).toBe(true);
    expect(canTransition('daily', 'in_review', 'complete', 'leader')).toBe(false);
    expect(canTransition('daily', 'in_review', 'revisi', 'user')).toBe(true);
  });

  it('Leader tidak mengubah jadwal syuting (wewenang VG)', () => {
    expect(canTransition('weekly_edit', 'ready', 'listing', 'leader')).toBe(false);
    expect(canTransition('weekly_edit', 'ready', 'listing', 'videografer')).toBe(true);
  });

  it('admin tidak bisa melompati alur status', () => {
    for (const t of TRANSITIONS) expect(t.actors).not.toContain('admin');
  });

  it('revisi kembali ke editor, atau ke VG untuk jalur langsung', () => {
    expect(canTransition('weekly_edit', 'revisi', 'editing', 'editor')).toBe(true);
    expect(canTransition('weekly_direct', 'revisi', 'syuting', 'videografer')).toBe(true);
    expect(canTransition('weekly_direct', 'revisi', 'editing', 'editor')).toBe(false);
  });

  it('menandai transisi yang wajib beralasan', () => {
    expect(requiresReason('weekly_edit', 'ready', 'listing')).toBe(true);
    expect(requiresReason('daily', 'in_review', 'revisi')).toBe(true);
    expect(requiresReason('daily', 'in_review', 'complete')).toBe(false);
  });

  it('transitionsFrom memfilter menurut jalur', () => {
    const tos = transitionsFrom('weekly_direct', 'terkirim').map((t) => t.to);
    expect(tos).toEqual(['in_review']);
  });
});

describe('kapasitas', () => {
  it('Senin–Kamis 15 slot, Jumat 7 slot', () => {
    expect([0, 1, 2, 3, 4].map(capacityOf)).toEqual([15, 15, 15, 15, 7]);
    expect(capacityOf(5)).toBe(0);
  });

  it('menghitung slot dari bobot, bukan jumlah konten', () => {
    const items = [{ bobot: 'gampang' }, { bobot: 'susah' }, { bobot: 'susah' }] as const;
    expect(slotsUsed(items)).toBe(5);
  });

  it('over kapasitas Jumat lebih cepat daripada Senin', () => {
    const items = Array.from({ length: 8 }, () => ({ bobot: 'gampang' as const }));
    expect(isOverCapacity(0, items)).toBe(false);
    expect(isOverCapacity(4, items)).toBe(true);
  });
});

describe('pekan produksi', () => {
  it('mondayOf menangani Minggu sebagai akhir pekan', () => {
    expect(mondayOf('2026-10-05')).toBe('2026-10-05'); // Senin
    expect(mondayOf('2026-10-03')).toBe('2026-09-28'); // Sabtu
    expect(mondayOf('2026-10-04')).toBe('2026-09-28'); // Minggu
  });

  it('konten disubmit pekan W masuk pekan produksi W+1', () => {
    expect(productionWeekFor('2026-10-01')).toBe('2026-10-05');
    expect(productionWeekFor('2026-10-05')).toBe('2026-10-12');
  });

  it('Locking jatuh pada Sabtu sebelum pekan produksi', () => {
    expect(lockingDayOf('2026-10-05')).toBe('2026-10-03');
  });

  it('weekdayDates memberi Senin–Jumat dan melewati batas bulan', () => {
    expect(weekdayDates('2026-09-28')).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02']);
  });

  it('pekan 1–5 per bulan ditentukan oleh Senin', () => {
    expect(mondaysOfMonth(2026, 10)).toEqual(['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
    expect(mondaysOfMonth(2026, 11)).toHaveLength(5);
    expect(weekLabel('2026-10-05')).toBe('Oktober 2026 · Pekan 1');
    expect(weekLabel('2026-11-30')).toBe('November 2026 · Pekan 5');
    expect(weekLabel('2026-09-28')).toBe('September 2026 · Pekan 4');
  });

  it('todayJakarta memakai zona WIB, bukan UTC', () => {
    // 20:00 UTC tanggal 3 = 03:00 WIB tanggal 4
    expect(todayJakarta(new Date('2026-10-03T20:00:00Z'))).toBe('2026-10-04');
  });
});

describe('navigasi per peran', () => {
  it('User melihat Brief Order tetapi bukan Daily Shooting', () => {
    const keys = flattenNav(navFor('user')).map((n) => n.key);
    expect(keys).toContain('brief-order');
    expect(keys).toContain('weekly-listing');
    expect(keys).not.toContain('daily-shooting');
    expect(keys).not.toContain('admin-users');
  });

  it('Videografer melihat Weekly Listing & Daily Shooting, bukan Brief Order', () => {
    const keys = flattenNav(navFor('videografer')).map((n) => n.key);
    expect(keys).toEqual(expect.arrayContaining(['weekly-listing', 'daily-shooting']));
    expect(keys).not.toContain('brief-order');
  });

  it('Kelola Pengguna hanya untuk admin', () => {
    for (const role of ['user', 'leader', 'videografer', 'editor'] as const) {
      expect(flattenNav(navFor(role)).map((n) => n.key)).not.toContain('admin-users');
    }
    expect(flattenNav(navFor('admin')).map((n) => n.key)).toContain('admin-users');
  });
});
