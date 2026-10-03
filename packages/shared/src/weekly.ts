import { z } from 'zod';
import { isGoogleDocsUrl } from './briefs';
import { BOBOT } from './capacity';
import { LOKASI_OPTIONS, isLokasiLuar, type Jenis } from './jenis';
import type { Status } from './status';

// ───────────── SDM (sumber daya): kebutuhan yang perlu ditindaklanjuti Leader (PRD §6.4) ─────────────

export const SDM_TYPES = ['talent', 'lokasi', 'prop', 'desain', 'kostum'] as const;
export type SdmType = (typeof SDM_TYPES)[number];

export const SDM_META: Record<SdmType, { label: string; group: string }> = {
  talent: { label: 'Talent', group: 'Talent: perlu dikonfirmasi' },
  lokasi: { label: 'Lokasi luar', group: 'Lokasi luar: perlu booking' },
  prop: { label: 'Properti', group: 'Properti: perlu dibeli' },
  desain: { label: 'Aset desain', group: 'Aset desain: perlu diorder' },
  kostum: { label: 'Kostum khusus', group: 'Kostum khusus: perlu disiapkan' },
};

export interface SdmNeed {
  type: SdmType;
  name: string;
}

export interface SdmSource {
  talent: string;
  lokasi: string;
  lokasiDetail: string;
  fuProperti: string;
  fuKostum: string;
  fuDesain: string;
}

const NO_TALENT = new Set(['-', '—', 'tidak ada', 'tanpa talent', 'n/a']);

/**
 * Kebutuhan SDM sebuah konten. Lokasi Kantor dan properti/kostum/desain standar otomatis Ready,
 * jadi tidak muncul. Properti, kostum, dan desain hanya muncul bila VG menandainya (kolom FU).
 */
export function sdmNeeds(c: SdmSource): SdmNeed[] {
  const out: SdmNeed[] = [];
  const talent = c.talent.trim();
  if (talent && !NO_TALENT.has(talent.toLowerCase())) out.push({ type: 'talent', name: talent });
  if (isLokasiLuar(c.lokasi)) out.push({ type: 'lokasi', name: (c.lokasi === 'Lainnya' ? c.lokasiDetail : c.lokasi).trim() || c.lokasi });
  if (c.fuProperti.trim()) out.push({ type: 'prop', name: c.fuProperti.trim() });
  if (c.fuDesain.trim()) out.push({ type: 'desain', name: c.fuDesain.trim() });
  if (c.fuKostum.trim()) out.push({ type: 'kostum', name: c.fuKostum.trim() });
  return out;
}

/** Kunci unik item SDM: satu item per (hari, jenis, nama) tanpa membedakan huruf besar/kecil. */
export const sdmKey = (day: number, n: SdmNeed): string => `${day}|${n.type}|${n.name.trim().toLowerCase()}`;

// ───────────── Progres pekan ─────────────

/** Status yang masih bisa dijadwalkan/disesuaikan VG; sesudahnya milik Daily Shooting. */
export const PLANNING_STATUSES: readonly Status[] = ['listing', 'validasi_sdm', 'ready'];
/** Status yang tampil di Weekly Listing (belum lolos validasi = backlog, tidak tampil). */
export const HIDDEN_FROM_WEEK: readonly Status[] = ['draft', 'pending_review', 'backlog'];

export interface ProgressInput {
  lockedAt: string | null;
  readyAt: string | null;
  contents: readonly { status: Status; day: number | null }[];
  items: readonly { ready: boolean }[];
}

export interface WeekProgress {
  /** [Locking, Propose Jadwal, Validasi SDM, Ready to Execute] */
  steps: readonly [boolean, boolean, boolean, boolean];
  pendingLock: number;
  unscheduled: number;
  canLock: boolean;
  canMarkReady: boolean;
  /** Syarat SDM/jadwal untuk konten yang sudah dikunci masih terpenuhi (dipakai untuk membatalkan Ready). */
  lockedGateOk: boolean;
  label: string;
}

export function weekProgress(i: ProgressInput): WeekProgress {
  const planning = i.contents.filter((c) => PLANNING_STATUSES.includes(c.status));
  const pendingLock = planning.filter((c) => c.status === 'listing').length;
  const unscheduled = planning.filter((c) => c.day === null).length;
  const lockedUnscheduled = planning.filter((c) => c.status !== 'listing' && c.day === null).length;
  const itemsReady = i.items.every((x) => x.ready);

  const lockingDone = i.lockedAt !== null && pendingLock === 0 && i.contents.length > 0;
  const proposeDone = lockingDone && unscheduled === 0;
  const sdmDone = proposeDone && itemsReady;
  const readyDone = sdmDone && i.readyAt !== null;
  const steps = [lockingDone, proposeDone, sdmDone, readyDone] as const;

  const label = readyDone ? 'Ready to Execute' : sdmDone ? 'Siap ditandai Ready' : proposeDone ? 'Validasi SDM' : lockingDone ? 'Propose Jadwal' : 'Locking';
  return {
    steps,
    pendingLock,
    unscheduled,
    canLock: pendingLock > 0,
    canMarkReady: sdmDone && i.readyAt === null && planning.some((c) => c.status === 'validasi_sdm'),
    lockedGateOk: lockedUnscheduled === 0 && itemsReady,
    label,
  };
}

// ───────────── Input & DTO ─────────────

const text = (max: number) => z.string().trim().min(1, 'Wajib diisi').max(max, `Maksimal ${max} karakter`);
const fu = z.string().trim().max(120, 'Maksimal 120 karakter');

export const contentPatchSchema = z.object({
  talent: text(120).optional(),
  kostum: text(120).optional(),
  lokasi: z.enum(LOKASI_OPTIONS, { message: 'Pilih salah satu' }).optional(),
  lokasiDetail: z.string().trim().max(200, 'Maksimal 200 karakter').optional(),
  properti: text(500).optional(),
  desain: text(500).optional(),
  fuProperti: fu.optional(),
  fuKostum: fu.optional(),
  fuDesain: fu.optional(),
  bobot: z.enum(BOBOT, { message: 'Pilih Gampang atau Susah' }).optional(),
  day: z.number().int().min(0).max(4).nullable().optional(),
  reason: z.string().trim().max(500, 'Maksimal 500 karakter').default(''),
});
export type ContentPatch = z.infer<typeof contentPatchSchema>;

export const reasonSchema = z.object({ reason: z.string().trim().min(1, 'Alasan wajib diisi').max(500, 'Maksimal 500 karakter') });

export const dayDocSchema = z.object({
  kind: z.enum(['shotlist', 'skrip']),
  url: z.string().trim().min(1, 'Wajib diisi').max(500).refine(isGoogleDocsUrl, 'Gunakan link Google Docs/Drive (https://docs.google.com/…)'),
});

export interface WeeklyContent {
  id: number;
  code: string;
  judul: string;
  produk: string;
  kategori: string;
  jenis: Jenis;
  status: Status;
  linkDocs: string;
  requesterName: string;
  talent: string;
  kostum: string;
  lokasi: string;
  lokasiDetail: string;
  properti: string;
  desain: string;
  fuProperti: string;
  fuKostum: string;
  fuDesain: string;
  bobot: (typeof BOBOT)[number];
  day: number | null;
  /** Ada item SDM yang belum Ready untuk konten ini di harinya. */
  sdmIssue: boolean;
}

export interface SdmItem {
  id: number;
  day: number;
  type: SdmType;
  name: string;
  ready: boolean;
  readyByName: string | null;
  readyAt: string | null;
  contentCount: number;
}

export interface DayInfo {
  day: number;
  date: string;
  count: number;
  /** null untuk User (kapasitas lintas pemohon tidak ditampilkan). */
  slots: number | null;
  capacity: number | null;
  sdmReady: number;
  sdmTotal: number;
  /** Shotlist & Skrip baru bisa diunggah setelah semua SDM hari itu Ready. */
  docsOpen: boolean;
  shotlistUrl: string | null;
  shotlistByName: string | null;
  skripUrl: string | null;
  skripByName: string | null;
  talentReconfirmedAt: string | null;
  talentReconfirmedByName: string | null;
}

export interface WeekDto {
  weekStart: string;
  label: string;
  lockingDay: string;
  lockedAt: string | null;
  lockedByName: string | null;
  readyAt: string | null;
  readyByName: string | null;
  progress: WeekProgress;
  contents: WeeklyContent[];
  days: DayInfo[];
  sdm: SdmItem[];
}
