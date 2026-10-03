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

// ───────────── Contoh isi satu pekan Weekly Listing (seed dev & pratinjau) ─────────────

export interface SampleWeeklyItem {
  judul: string;
  produk: string;
  kategori: string;
  jenis: 'shooting_only' | 'shooting_edit' | 'photoshoot';
  rasio: Rasio;
  durasiDetik: number | null;
  talent: string;
  kostum: string;
  lokasi: string;
  properti: string;
  desain: string;
  fuProperti: string;
  fuKostum: string;
  fuDesain: string;
  bobot: 'gampang' | 'susah';
  day: number | null;
}

/** PRNG kecil yang deterministik agar contoh stabil di setiap seed. */
function mulberry(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function sampleWeekly(count = 22): SampleWeeklyItem[] {
  const r = mulberry(2026);
  const pick = <T>(a: readonly T[]): T => a[Math.floor(r() * a.length)]!;
  const PRODUK = ['FITGRAINS', 'GLUTAFIELD', 'ETAWAKU', 'ETALLAGEN', 'ETAWALIN', 'ASA', 'MONGOL KHAN'];
  const FRASA = ['PROMO 9.9', 'HARGA RESMI', 'VIRAL', 'BULAN HEMAT', 'SENDI ENTENG', 'KRONIS NYERI', 'TESTIMONI', 'PAKET SEPAKAT', 'LUTUT ENTENG', 'REKOMENDASI', 'SETELAH MINUM', 'BESAR BESARAN'];
  const KAT = ['Talking Head', 'Product Story', 'Science/Demo', 'Lifestyle/Mood', 'Character/Skit', 'Company Kit'];
  const JENIS = ['shooting_edit', 'shooting_edit', 'shooting_only', 'photoshoot'] as const;
  const TALENT = ['Lida', 'Rani', 'Bima', 'dr. Aji', 'Bu Tatik', 'Cindo', 'Bu Nurul', 'Ibu-ibu', 'Cewek muda'];
  const KOSTUM = ['Casual', 'Formal', 'Daster', 'Olahraga'];
  const LOKASI = ['Studio', 'Studio', 'Cafe', 'Homestay', 'Kantor', 'Kantor', 'Teras'];
  const out: SampleWeeklyItem[] = [];
  for (let i = 0; i < count; i++) {
    const jenis = pick(JENIS);
    const fuProp = r() < 0.25 ? pick(['Teko keramik', 'Uang prop 100rb', 'Bunga segar', 'Papan nama']) : '';
    const fuKostum = r() < 0.12 ? pick(['Kebaya modern', 'Seragam brand']) : '';
    const fuDesain = r() < 0.18 ? pick(['Frame design', 'Overlay grafis']) : '';
    out.push({
      judul: `${pick(FRASA)} ${i + 1}`,
      produk: pick(PRODUK),
      kategori: pick(KAT),
      jenis,
      rasio: pick(['9:16', '9:16', '16:9', '4:5'] as const),
      durasiDetik: jenis === 'photoshoot' ? null : pick([30, 45, 60, 90]),
      talent: pick(TALENT),
      kostum: pick(KOSTUM),
      lokasi: pick(LOKASI),
      properti: 'Box produk',
      desain: fuDesain ? 'Perlu frame desain' : 'Tidak ada',
      fuProperti: fuProp,
      fuKostum,
      fuDesain,
      bobot: r() < 0.32 ? 'susah' : 'gampang',
      // 4 konten terakhir sengaja belum dijadwalkan agar langkah "Propose Jadwal" bisa dicoba.
      day: i >= count - 4 ? null : Math.floor(r() * 5),
    });
  }
  return out;
}

// ───────────── Contoh pekan yang sedang berjalan (Daily Shooting) ─────────────

export interface SampleExecItem {
  judul: string;
  produk: string;
  kategori: string;
  jenis: 'shooting_only' | 'shooting_edit' | 'photoshoot';
  rasio: Rasio;
  durasiDetik: number | null;
  talent: string;
  lokasi: string;
  bobot: 'gampang' | 'susah';
  day: number;
  state: 'ready' | 'syuting' | 'footage' | 'handed';
  storage?: 'drive' | 'hdd';
  hold?: string;
}

/**
 * Satu pekan yang sudah Ready dan sedang dieksekusi. Skenario tetap (tidak bergantung tanggal):
 * Senin–Selasa selesai terkirim, Rabu campuran (belum take, sedang take, footage siap, terkirim, hold), Kamis–Jumat terjadwal.
 */
export function sampleExecution(): SampleExecItem[] {
  const mk = (
    i: number, day: number, state: SampleExecItem['state'], jenis: SampleExecItem['jenis'], talent: string, lokasi: string, extra: Partial<SampleExecItem> = {},
  ): SampleExecItem => ({
    judul: `${['TESTIMONI', 'PROMO 9.9', 'VIRAL', 'SENDI ENTENG', 'HARGA RESMI', 'KRONIS NYERI', 'REKOMENDASI', 'PAKET SEPAKAT'][i % 8]} ${100 + i}`,
    produk: ['FITGRAINS', 'ETAWAKU', 'GLUTAFIELD', 'ETALLAGEN', 'ETAWALIN'][i % 5]!,
    kategori: ['Talking Head', 'Product Story', 'Science/Demo', 'Character/Skit'][i % 4]!,
    jenis, rasio: '9:16', durasiDetik: jenis === 'photoshoot' ? null : 45, talent, lokasi, bobot: i % 4 === 0 ? 'susah' : 'gampang', day, state, ...extra,
  });
  return [
    mk(0, 0, 'handed', 'shooting_edit', 'Rani', 'Studio', { storage: 'drive' }),
    mk(1, 0, 'handed', 'shooting_only', 'Bu Tatik', 'Homestay', { storage: 'drive' }),
    mk(2, 0, 'handed', 'shooting_edit', 'Lida', 'Kantor', { storage: 'hdd' }),
    mk(3, 1, 'handed', 'photoshoot', 'Cindo', 'Studio', { storage: 'drive' }),
    mk(4, 1, 'handed', 'shooting_edit', 'dr. Aji', 'Cafe', { storage: 'hdd' }),
    mk(5, 2, 'handed', 'shooting_edit', 'Rani', 'Studio', { storage: 'drive' }),
    mk(6, 2, 'handed', 'shooting_only', 'Bima', 'Studio', { storage: 'drive' }),
    mk(7, 2, 'footage', 'shooting_edit', 'Lida', 'Studio'),
    mk(8, 2, 'syuting', 'shooting_only', 'Bu Nurul', 'Teras'),
    mk(9, 2, 'ready', 'shooting_edit', 'Rani', 'Studio'),
    mk(10, 2, 'ready', 'photoshoot', 'Cewek muda', 'Kantor'),
    mk(11, 2, 'ready', 'shooting_edit', 'Bima', 'Homestay', { hold: 'Talent terlambat 2 jam' }),
    mk(12, 3, 'ready', 'shooting_edit', 'Lida', 'Kantor'),
    mk(13, 3, 'ready', 'shooting_only', 'Cindo', 'Cafe'),
    mk(14, 3, 'ready', 'shooting_edit', 'Rani', 'Studio'),
    mk(15, 4, 'ready', 'shooting_edit', 'dr. Aji', 'Studio'),
    mk(16, 4, 'ready', 'photoshoot', 'Bu Tatik', 'Kantor'),
  ];
}
