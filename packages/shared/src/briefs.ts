import { z } from 'zod';
import { JENIS, KATEGORI, LOKASI_OPTIONS, isWeekly, jalurOf, type Jenis } from './jenis';
import type { Role } from './roles';
import { canTransition, type Status } from './status';

export const RASIO = ['9:16', '1:1', '16:9', '4:5'] as const;
export type Rasio = (typeof RASIO)[number];

/** Saran produk (dari mockup). Isian tetap bebas sampai ada master data produk. */
export const PRODUK_SUGGESTIONS = ['FITGRAINS', 'GLUTAFIELD', 'ETAWAKU', 'ETALLAGEN', 'ETAWALIN', 'ASA', 'MONGOL KHAN'] as const;

/**
 * Target SLA dalam hari kalender sejak submit (angka dari mockup Brief Order).
 * ASUMSI: belum dikonfirmasi tim, lihat docs/ASSUMPTIONS.md.
 */
export const SLA_DAYS: Record<Jenis, number> = {
  shooting_edit: 3,
  shooting_only: 2,
  photoshoot: 2,
  full_ai: 1,
  editing_only: 1,
  motion: 1,
};

const MS_PER_DAY = 86_400_000;

export function slaTargetFor(jenis: Jenis, submittedAt: string): string {
  return new Date(new Date(submittedAt).getTime() + SLA_DAYS[jenis] * MS_PER_DAY).toISOString();
}

export type SlaState = 'tepat' | 'telat' | 'lewat' | 'berjalan' | 'none';

/** tepat/telat = sudah selesai; lewat = belum selesai tetapi melewati target; berjalan = masih dalam target. */
export function slaState(b: { status: Status; slaTargetAt: string | null; completedAt: string | null }, now: Date = new Date()): SlaState {
  if (!b.slaTargetAt) return 'none';
  if (b.completedAt) return new Date(b.completedAt) <= new Date(b.slaTargetAt) ? 'tepat' : 'telat';
  if (b.status === 'backlog' || b.status === 'draft') return 'none';
  return now > new Date(b.slaTargetAt) ? 'lewat' : 'berjalan';
}

// ───────────── Input brief (wizard) ─────────────

const text = (max: number) => z.string().trim().min(1, 'Wajib diisi').max(max, `Maksimal ${max} karakter`);
const PICK = { message: 'Pilih salah satu' };

const GOOGLE_HOSTS = new Set(['docs.google.com', 'drive.google.com']);
export function isGoogleDocsUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && GOOGLE_HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

export const attributesSchema = z
  .object({
    talent: text(120),
    kostum: text(120),
    lokasi: z.enum(LOKASI_OPTIONS, PICK),
    lokasiDetail: z.string().trim().max(200, 'Maksimal 200 karakter').default(''),
    properti: text(500),
    desain: text(500),
  })
  .refine((a) => a.lokasi !== 'Lainnya' || a.lokasiDetail.length > 0, { path: ['lokasiDetail'], message: 'Sebutkan lokasinya' });
export type BriefAttributes = z.infer<typeof attributesSchema>;

export const briefInputSchema = z
  .object({
    jenis: z.enum(JENIS, PICK),
    kategori: z.enum(KATEGORI, PICK),
    produk: text(80),
    judul: text(150),
    rasio: z.enum(RASIO, PICK),
    durasiDetik: z.number({ message: 'Isi durasi dalam detik' }).int('Harus bilangan bulat').min(1, 'Minimal 1 detik').max(3600, 'Maksimal 3600 detik').nullable(),
    linkDocs: z
      .string()
      .trim()
      .min(1, 'Wajib diisi')
      .max(500, 'Maksimal 500 karakter')
      .refine(isGoogleDocsUrl, 'Gunakan link Google Docs/Drive (https://docs.google.com/…)'),
    catatan: z.string().trim().max(1000, 'Maksimal 1000 karakter').default(''),
    attributes: attributesSchema.nullable().default(null),
  })
  .superRefine((b, ctx) => {
    if (isWeekly(b.jenis) && !b.attributes) {
      ctx.addIssue({ code: 'custom', path: ['attributes'], message: 'Atribut produksi wajib diisi untuk jenis yang perlu syuting' });
    }
    if (b.jenis !== 'photoshoot' && b.durasiDetik === null) {
      ctx.addIssue({ code: 'custom', path: ['durasiDetik'], message: 'Isi durasi dalam detik' });
    }
  })
  // Daily tidak punya atribut produksi: buang jika terkirim.
  .transform((b) => (isWeekly(b.jenis) ? b : { ...b, attributes: null }));
export type BriefInput = z.output<typeof briefInputSchema>;

/** Draf wizard: bentuk bebas (belum tentu valid), dibatasi ukurannya di server. */
export const draftSchema = z.record(z.string(), z.unknown());

// ───────────── DTO ─────────────

export interface BriefListItem {
  id: number;
  code: string;
  status: Status;
  judul: string;
  produk: string;
  kategori: string;
  jenis: Jenis;
  rasio: Rasio;
  durasiDetik: number | null;
  requester: { id: number; name: string; unit: string };
  pic: string | null;
  submittedAt: string;
  slaTargetAt: string | null;
  completedAt: string | null;
  revisionCount: number;
}

export interface BriefEvent {
  from: Status | null;
  to: Status;
  actorName: string | null;
  reason: string;
  at: string;
}

export interface BriefDetail extends BriefListItem {
  linkDocs: string;
  catatan: string;
  attributes: BriefAttributes | null;
  history: BriefEvent[];
}

// ───────────── Transisi di Brief Order ─────────────

/** Perpindahan status yang ditangani layar Brief Order (sisanya milik fase berikutnya). */
export const BRIEF_ORDER_MOVES: readonly (readonly [Status, Status])[] = [
  ['pending_review', 'antre_editing'],
  ['pending_review', 'backlog'],
  ['backlog', 'pending_review'],
  ['backlog', 'listing'],
  ['in_review', 'complete'],
  ['in_review', 'revisi'],
];

export type MoveCheck = { ok: true } | { ok: false; code: 'not_allowed' | 'not_owner' };

export function checkBriefMove(args: { jenis: Jenis; from: Status; to: Status; role: Role; isOwner: boolean }): MoveCheck {
  const { jenis, from, to, role, isOwner } = args;
  if (!BRIEF_ORDER_MOVES.some(([f, t]) => f === from && t === to)) return { ok: false, code: 'not_allowed' };
  if (!canTransition(jalurOf(jenis), from, to, role)) return { ok: false, code: 'not_allowed' };
  if (role === 'user' && !isOwner) return { ok: false, code: 'not_owner' };
  return { ok: true };
}

/** Brief hanya bisa diedit pemiliknya saat Backlog (dikembalikan untuk dilengkapi). */
export const canEditBrief = (role: Role, isOwner: boolean, status: Status): boolean => role === 'user' && isOwner && status === 'backlog';

/** Peran yang boleh membuka Brief Order. User hanya melihat miliknya; Leader/Admin melihat semua. */
export const canViewBriefs = (role: Role): boolean => role === 'user' || role === 'leader' || role === 'admin';
