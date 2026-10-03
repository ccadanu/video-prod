/** Jenis Pengerjaan CCP (PRD §5.2). Weekly = perlu syuting, Daily = tanpa syuting. */
export const JENIS = [
  'shooting_only',
  'shooting_edit',
  'photoshoot',
  'full_ai',
  'editing_only',
  'motion',
] as const;
export type Jenis = (typeof JENIS)[number];

export type Cabang = 'weekly' | 'daily';

/**
 * Jalur produksi (PRD §4):
 * - weekly_edit:   syuting lalu editing (Shooting + Edit)
 * - weekly_direct: syuting lalu langsung Review User (Shooting Only, Photoshoot)
 * - daily:         tanpa syuting, langsung ke editing
 */
export type Jalur = 'weekly_edit' | 'weekly_direct' | 'daily';

interface JenisMeta {
  label: string;
  cabang: Cabang;
  jalur: Jalur;
}

export const JENIS_META: Record<Jenis, JenisMeta> = {
  shooting_only: { label: 'Shooting Only', cabang: 'weekly', jalur: 'weekly_direct' },
  shooting_edit: { label: 'Shooting + Edit', cabang: 'weekly', jalur: 'weekly_edit' },
  photoshoot: { label: 'Photoshoot', cabang: 'weekly', jalur: 'weekly_direct' },
  full_ai: { label: 'Full AI', cabang: 'daily', jalur: 'daily' },
  editing_only: { label: 'Editing Only', cabang: 'daily', jalur: 'daily' },
  motion: { label: 'Motion', cabang: 'daily', jalur: 'daily' },
};

export const isWeekly = (j: Jenis): boolean => JENIS_META[j].cabang === 'weekly';
export const jalurOf = (j: Jenis): Jalur => JENIS_META[j].jalur;

/** Footage wajib ke Drive agar User bisa review langsung (PRD §7.3). */
export const driveRequired = (j: Jenis): boolean => jalurOf(j) === 'weekly_direct';

export const KATEGORI = [
  'Talking Head',
  'Product Story',
  'Science/Demo',
  'Infografis',
  'Lifestyle/Mood',
  'Character/Skit',
  'Company Kit',
] as const;
export type Kategori = (typeof KATEGORI)[number];

export const LOKASI_OPTIONS = [
  'Studio',
  'Cafe',
  'Homestay',
  'Kantor',
  'Teras',
  'Outdoor',
  'Lainnya',
] as const;

/** Lokasi Kantor otomatis Ready; selain itu butuh booking Leader (PRD §6.4). */
export const isLokasiLuar = (lokasi: string): boolean => lokasi.trim().toLowerCase() !== 'kantor';
