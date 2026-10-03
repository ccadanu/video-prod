import type { Jenis } from './jenis';
import type { Rasio } from './briefs';
import type { Status } from './status';

/** Data contoh (dari mockup) untuk seed dev dan mode pratinjau. Bukan data nyata. */
export interface SampleBrief {
  judul: string;
  produk: string;
  kategori: string;
  jenis: Jenis;
  rasio: Rasio;
  durasiDetik: number | null;
  status: Status;
  /** Berapa hari lalu disubmit. */
  daysAgo: number;
  revisionCount?: number;
  reason?: string;
}

export const SAMPLE_BRIEFS: readonly SampleBrief[] = [
  { judul: 'Promo 9.9 Fitgrains', produk: 'FITGRAINS', kategori: 'Product Story', jenis: 'shooting_edit', rasio: '9:16', durasiDetik: 60, status: 'syuting', daysAgo: 2 },
  { judul: 'Testimoni Etawaku', produk: 'ETAWAKU', kategori: 'Product Story', jenis: 'shooting_edit', rasio: '9:16', durasiDetik: 45, status: 'editing', daysAgo: 2 },
  { judul: 'Motion Pengumuman Libur', produk: 'ASA', kategori: 'Company Kit', jenis: 'motion', rasio: '1:1', durasiDetik: 15, status: 'in_review', daysAgo: 1 },
  { judul: 'Full AI Teaser Event', produk: 'ASA', kategori: 'Lifestyle/Mood', jenis: 'full_ai', rasio: '9:16', durasiDetik: 20, status: 'editing', daysAgo: 1 },
  { judul: 'Science Demo Glutafield', produk: 'GLUTAFIELD', kategori: 'Science/Demo', jenis: 'shooting_only', rasio: '16:9', durasiDetik: 90, status: 'in_review', daysAgo: 3 },
  { judul: 'Product Story Etawalin', produk: 'ETAWALIN', kategori: 'Product Story', jenis: 'shooting_edit', rasio: '9:16', durasiDetik: 50, status: 'revisi', daysAgo: 5, revisionCount: 1, reason: 'Teks harga di detik 12 belum sesuai promo terbaru.' },
  { judul: 'Editing Rekap Webinar', produk: 'ASA', kategori: 'Infografis', jenis: 'editing_only', rasio: '16:9', durasiDetik: 120, status: 'backlog', daysAgo: 1, reason: 'Link naskah belum bisa dibuka. Mohon buka akses dan lengkapi naskah.' },
  { judul: 'Talking Head Tips', produk: 'ETALLAGEN', kategori: 'Talking Head', jenis: 'shooting_only', rasio: '9:16', durasiDetik: 60, status: 'listing', daysAgo: 1 },
  { judul: 'Company Kit Sambutan', produk: 'ASA', kategori: 'Company Kit', jenis: 'shooting_edit', rasio: '16:9', durasiDetik: 120, status: 'complete', daysAgo: 9 },
  { judul: 'Infografis Data Q2', produk: 'ASA', kategori: 'Infografis', jenis: 'motion', rasio: '16:9', durasiDetik: 30, status: 'complete', daysAgo: 8 },
  { judul: 'Teaser Bulan Hemat', produk: 'MONGOL KHAN', kategori: 'Lifestyle/Mood', jenis: 'full_ai', rasio: '4:5', durasiDetik: 20, status: 'pending_review', daysAgo: 0 },
];
