import type { Actor } from './roles';
import type { Jalur } from './jenis';

/** Kamus status (PRD §4.4) + draft & antre_editing agar jalur tidak ambigu. */
export const STATUSES = [
  'draft',
  'pending_review',
  'backlog',
  'listing',
  'validasi_sdm',
  'ready',
  'syuting',
  'footage_siap',
  'terkirim',
  'antre_editing',
  'editing',
  'in_review',
  'revisi',
  'complete',
] as const;
export type Status = (typeof STATUSES)[number];

export type Tone = 'slate' | 'sky' | 'amber' | 'violet' | 'coral' | 'green' | 'red' | 'blue';

export const STATUS_META: Record<Status, { label: string; tone: Tone }> = {
  draft: { label: 'Draft', tone: 'slate' },
  pending_review: { label: 'Pending Review', tone: 'amber' },
  backlog: { label: 'Backlog', tone: 'slate' },
  listing: { label: 'Listing (To Do)', tone: 'sky' },
  validasi_sdm: { label: 'Locking / Validasi SDM', tone: 'blue' },
  ready: { label: 'Ready to Execute', tone: 'green' },
  syuting: { label: 'Syuting', tone: 'amber' },
  footage_siap: { label: 'Footage Siap', tone: 'sky' },
  terkirim: { label: 'Footage Terkirim', tone: 'green' },
  antre_editing: { label: 'To Do (Antre Editing)', tone: 'sky' },
  editing: { label: 'Editing', tone: 'violet' },
  in_review: { label: 'In Review', tone: 'coral' },
  revisi: { label: 'Revisi', tone: 'red' },
  complete: { label: 'Selesai', tone: 'green' },
};

export interface Transition {
  from: Status;
  to: Status;
  actors: readonly Actor[];
  /** Kosong = berlaku untuk semua jalur. */
  jalur?: readonly Jalur[];
  /** Alasan wajib dicatat (jejak evaluasi, PRD §7.6). */
  reason?: boolean;
}

const WEEKLY: readonly Jalur[] = ['weekly_edit', 'weekly_direct'];

export const TRANSITIONS: readonly Transition[] = [
  // Brief Order
  { from: 'draft', to: 'listing', actors: ['user'], jalur: WEEKLY },
  { from: 'draft', to: 'pending_review', actors: ['user'], jalur: ['daily'] },
  { from: 'pending_review', to: 'antre_editing', actors: ['leader'], jalur: ['daily'] },
  { from: 'pending_review', to: 'backlog', actors: ['leader'], jalur: ['daily'], reason: true },
  { from: 'listing', to: 'backlog', actors: ['videografer', 'leader'], jalur: WEEKLY, reason: true },
  { from: 'backlog', to: 'pending_review', actors: ['user'], jalur: ['daily'] },
  { from: 'backlog', to: 'listing', actors: ['user'], jalur: WEEKLY },

  // Pra-produksi (Weekly Listing). "Locking / Validasi SDM" adalah satu status (PRD §4.4):
  // konten tetap `listing` sampai "Locking Disepakati", lalu `validasi_sdm` sampai "Ready to Execute".
  { from: 'listing', to: 'validasi_sdm', actors: ['videografer'], jalur: WEEKLY },
  { from: 'validasi_sdm', to: 'ready', actors: ['videografer', 'system'], jalur: WEEKLY },
  // Kesiapan dibatalkan bila SDM/jadwal berubah setelah Ready (mis. talent diganti).
  { from: 'ready', to: 'validasi_sdm', actors: ['videografer', 'leader', 'system'], jalur: WEEKLY, reason: true },
  // Tunda ke pekan depan: kembali ke Weekly Listing (PRD §6.8, §7.6)
  { from: 'validasi_sdm', to: 'listing', actors: ['videografer'], jalur: WEEKLY, reason: true },
  { from: 'ready', to: 'listing', actors: ['videografer'], jalur: WEEKLY, reason: true },

  // Produksi (Daily Shooting)
  { from: 'ready', to: 'syuting', actors: ['videografer'], jalur: WEEKLY },
  { from: 'syuting', to: 'footage_siap', actors: ['videografer'], jalur: WEEKLY },
  // Penyesuaian hari-H (PRD §7.6): take dibatalkan lalu dijadwal ulang atau ditunda ke pekan depan.
  { from: 'syuting', to: 'ready', actors: ['videografer'], jalur: WEEKLY, reason: true },
  { from: 'syuting', to: 'listing', actors: ['videografer'], jalur: WEEKLY, reason: true },
  { from: 'footage_siap', to: 'terkirim', actors: ['videografer'], jalur: WEEKLY },
  // Handoff bercabang (PRD §7.4)
  { from: 'terkirim', to: 'antre_editing', actors: ['system'], jalur: ['weekly_edit'] },
  { from: 'terkirim', to: 'in_review', actors: ['system'], jalur: ['weekly_direct'] },

  // Editing
  { from: 'antre_editing', to: 'editing', actors: ['leader'] },
  { from: 'editing', to: 'in_review', actors: ['editor'] },

  // Review & Revisi
  { from: 'in_review', to: 'complete', actors: ['user'] },
  { from: 'in_review', to: 'revisi', actors: ['user'], reason: true },
  { from: 'revisi', to: 'editing', actors: ['editor', 'leader'], jalur: ['weekly_edit', 'daily'] },
  { from: 'revisi', to: 'syuting', actors: ['videografer'], jalur: ['weekly_direct'] },
];

const appliesTo = (t: Transition, jalur: Jalur): boolean => !t.jalur || t.jalur.includes(jalur);

export function transitionsFrom(jalur: Jalur, from: Status): Transition[] {
  return TRANSITIONS.filter((t) => t.from === from && appliesTo(t, jalur));
}

export function findTransition(jalur: Jalur, from: Status, to: Status): Transition | undefined {
  return TRANSITIONS.find((t) => t.from === from && t.to === to && appliesTo(t, jalur));
}

export function canTransition(jalur: Jalur, from: Status, to: Status, actor: Actor): boolean {
  return findTransition(jalur, from, to)?.actors.includes(actor) ?? false;
}

export function requiresReason(jalur: Jalur, from: Status, to: Status): boolean {
  return findTransition(jalur, from, to)?.reason === true;
}

/** Filter di Brief Order (PRD §5.1). */
export const BRIEF_FILTERS = {
  all: (_s: Status) => true,
  aktif: (s: Status) => s !== 'complete' && s !== 'backlog' && s !== 'draft',
  review: (s: Status) => s === 'in_review',
  selesai: (s: Status) => s === 'complete',
} as const;
export type BriefFilter = keyof typeof BRIEF_FILTERS;
