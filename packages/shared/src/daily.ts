import { z } from 'zod';
import { jalurOf, type Jenis } from './jenis';
import type { Status } from './status';
import { BOBOT } from './capacity';

// ───────────── Kolom board harian (PRD §7.1) ─────────────

export const DAILY_COLUMNS = ['belum', 'sedang', 'footage', 'terkirim'] as const;
export type DailyColumn = (typeof DAILY_COLUMNS)[number] | 'later';

export const DAILY_COLUMN_META: Record<DailyColumn, { title: string; hint: string }> = {
  later: { title: 'Terjadwal Nanti', hint: 'pekan ini' },
  belum: { title: 'Belum Take', hint: 'antre syuting' },
  sedang: { title: 'Sedang Take', hint: 'directing / record' },
  footage: { title: 'Footage Siap', hint: 'wrap-up & serah' },
  terkirim: { title: 'Terkirim', hint: 'ke editor / review' },
};

export interface ColumnInput {
  status: Status;
  day: number | null;
  handedOff: boolean;
  /** Revisi dari User untuk jalur langsung ke Review: footage perlu diambil ulang oleh VG. */
  redo?: boolean;
}

/**
 * Kolom sebuah konten pada tampilan hari `selected` (0–4), atau null bila tidak tampil.
 * Konten dari hari sebelumnya yang belum selesai ikut tampil (tanda "terlewat"/"terbawa"), bukan menghilang.
 */
export function dailyColumn(c: ColumnInput, selected: number): DailyColumn | null {
  if (c.day === null) return null;
  if (c.redo) return 'belum';
  if (c.handedOff) return c.day === selected ? 'terkirim' : null;
  if (c.status === 'ready') return c.day > selected ? 'later' : 'belum';
  if (c.day > selected) return null;
  if (c.status === 'syuting') return 'sedang';
  if (c.status === 'footage_siap') return 'footage';
  return null;
}

/** Tujuan footage setelah terkirim (PRD §7.4). */
export const routeOf = (jenis: Jenis): 'editor' | 'review' => (jalurOf(jenis) === 'weekly_edit' ? 'editor' : 'review');

// ───────────── Bukti serah footage (PRD §7.3) ─────────────

const text = (max: number) => z.string().trim().min(1, 'Wajib diisi').max(max, `Maksimal ${max} karakter`);

export function isGoogleDriveUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && u.hostname === 'drive.google.com';
  } catch {
    return false;
  }
}

export const handoffSchema = z.discriminatedUnion('storage', [
  z.object({
    storage: z.literal('drive'),
    driveUrl: z.string().trim().min(1, 'Wajib diisi').max(500, 'Maksimal 500 karakter').refine(isGoogleDriveUrl, 'Gunakan link Google Drive (https://drive.google.com/…)'),
  }),
  z.object({
    storage: z.literal('hdd'),
    diskName: text(100),
    path: text(300),
    fileName: text(200),
  }),
]);
export type HandoffInput = z.infer<typeof handoffSchema>;

/** Shooting Only & Photoshoot langsung ke Review User: footage wajib di Drive agar bisa dibuka User. */
export const handoffNeedsDrive = (jenis: Jenis): boolean => routeOf(jenis) === 'review';

export const rescheduleSchema = z.object({
  day: z.number({ message: 'Pilih hari tujuan' }).int().min(0).max(4),
  reason: z.string().trim().min(1, 'Alasan wajib diisi').max(500, 'Maksimal 500 karakter'),
});
export const pullSchema = z.object({ day: z.number().int().min(0).max(4) });

// ───────────── DTO ─────────────

export interface HandoffProof {
  storage: 'drive' | 'hdd';
  driveUrl: string | null;
  diskName: string | null;
  path: string | null;
  fileName: string | null;
  handedAt: string;
  handedByName: string | null;
}

export interface DailyCard {
  id: number;
  code: string;
  judul: string;
  produk: string;
  jenis: Jenis;
  status: Status;
  day: number;
  column: DailyColumn;
  talent: string;
  lokasi: string;
  bobot: (typeof BOBOT)[number];
  route: 'editor' | 'review';
  holdReason: string | null;
  /** Hari jadwal asli berbeda dari hari yang dilihat (terlewat / terbawa). */
  fromDay: number | null;
  sdmIssue: boolean;
  proof: HandoffProof | null;
}

export interface DayBoard {
  weekStart: string;
  day: number;
  date: string;
  weekLabel: string;
  weekReady: boolean;
  summary: { total: number; taken: number; taking: number; handed: number; held: number };
  guide: { shotlistUrl: string | null; skripUrl: string | null };
  /** Jumlah konten terjadwal per hari (Senin–Jumat) untuk pemilih hari. */
  dayCounts: number[];
  cards: DailyCard[];
}

export function summarize(cards: readonly { column: DailyColumn; holdReason: string | null }[]) {
  const today = cards.filter((c) => c.column !== 'later');
  return {
    total: today.length,
    taken: today.filter((c) => c.column === 'footage' || c.column === 'terkirim').length,
    taking: today.filter((c) => c.column === 'sedang').length,
    handed: today.filter((c) => c.column === 'terkirim').length,
    held: today.filter((c) => c.holdReason !== null).length,
  };
}
