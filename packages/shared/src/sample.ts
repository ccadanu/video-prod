import type { Jenis } from './jenis';
import type { Rasio } from './briefs';
import type { Status } from './status';
import { addDays as addDaysYmd, addWorkdays, mondayOf as mondayOfYmd, nextWorkday, todayJakarta as todayYmd } from './weeks';

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

// ───────────── Contoh Editing (Brief Editing Schedule & Editing Execution) ─────────────

export interface SampleEditing {
  editor: 'dio' | 'rara';
  bobot: 'gampang' | 'susah';
  /** Sudah mulai dikerjakan (On Progress). */
  started?: boolean;
  /** Sudah dikirim ke In Review atau selesai: jadwal di masa lalu. */
  done?: boolean;
  steps?: string[];
  versions?: number;
}

const ALL_STEPS = ['aset', 'klip', 'warna', 'efek', 'finishing', 'selfqc', 'export'];

/** Kondisi editing untuk brief contoh tertentu (kunci = judul di SAMPLE_BRIEFS). */
export const SAMPLE_EDITING: Record<string, SampleEditing> = {
  'Testimoni Etawaku': { editor: 'dio', bobot: 'gampang', started: true, steps: ['aset', 'klip'] },
  'Full AI Teaser Event': { editor: 'rara', bobot: 'susah' },
  'Motion Pengumuman Libur': { editor: 'dio', bobot: 'gampang', done: true, steps: ALL_STEPS, versions: 1 },
  'Product Story Etawalin': { editor: 'dio', bobot: 'gampang', started: true, steps: ['aset', 'klip', 'warna', 'efek', 'finishing'], versions: 1 },
  'Company Kit Sambutan': { editor: 'rara', bobot: 'susah', done: true, steps: ALL_STEPS, versions: 1 },
  'Infografis Data Q2': { editor: 'dio', bobot: 'gampang', done: true, steps: ALL_STEPS, versions: 1 },
};

/** Brief contoh Shooting Only yang sedang In Review: footage Drive dari VG menjadi bahan review. */
export const SAMPLE_REVIEW_FOOTAGE = ['Science Demo Glutafield'] as const;

export interface SampleQueueItem {
  judul: string;
  produk: string;
  kategori: string;
  jenis: 'full_ai' | 'editing_only' | 'motion';
  rasio: Rasio;
  durasiDetik: number;
  catatan: string;
  daysAgo: number;
}

/** Konten Daily yang sudah lolos validasi dan menunggu assign editor. */
export const SAMPLE_QUEUE: readonly SampleQueueItem[] = [
  { judul: 'Motion Banner Promo Gajian', produk: 'FITGRAINS', kategori: 'Infografis', jenis: 'motion', rasio: '1:1', durasiDetik: 15, catatan: 'Warna mengikuti panduan promo bulan ini.', daysAgo: 2 },
  { judul: 'Editing Testimoni Pelanggan', produk: 'ETAWAKU', kategori: 'Product Story', jenis: 'editing_only', rasio: '9:16', durasiDetik: 45, catatan: 'Footage mentah ada di folder Drive pada naskah.', daysAgo: 1 },
  { judul: 'Full AI Visual Produk Baru', produk: 'ETALLAGEN', kategori: 'Lifestyle/Mood', jenis: 'full_ai', rasio: '9:16', durasiDetik: 20, catatan: '', daysAgo: 0 },
];

// ───────────── Riwayat contoh (Dashboard, KPI, Blind Review) ─────────────

export interface SampleHistoryItem {
  judul: string;
  produk: string;
  kategori: string;
  jenis: Jenis;
  rasio: Rasio;
  durasiDetik: number | null;
  requester: 'sari' | 'budi' | 'maya';
  submittedAt: string;
  completedAt: string;
  revisions: number;
  vg: 'hardi' | 'yofa' | null;
  editor: 'dio' | 'rara' | null;
  /** Hari syuting (Weekly) dan kapan footage diserahkan. */
  shoot: { weekStart: string; day: number; handedAt: string } | null;
  /** Tenggat editing dan kapan hasil pertama dikirim. */
  edit: { due: string; deliveredAt: string } | null;
  /** Rating 1–5 yang akan diberikan User pada siklus evaluasi (null = tidak mengisi). */
  rating: number | null;
}

const at = (ymd: string): string => `${ymd}T03:30:00.000Z`; // 10.30 WIB

/** Konten selesai berdurasi ±3 bulan ke belakang dengan keterlambatan & revisi yang bervariasi (deterministik). */
export function sampleHistory(today: string = todayYmd(), count = 84): SampleHistoryItem[] {
  const r = mulberry(7);
  const pick = <T>(a: readonly T[]): T => a[Math.floor(r() * a.length)]!;
  const KAT = ['Talking Head', 'Talking Head', 'Product Story', 'Product Story', 'Science/Demo', 'Lifestyle/Mood', 'Infografis', 'Character/Skit', 'Company Kit'];
  const PRODUK = ['FITGRAINS', 'GLUTAFIELD', 'ETAWAKU', 'ETALLAGEN', 'ETAWALIN', 'ASA', 'MONGOL KHAN'];
  const JENIS_POOL: Jenis[] = ['shooting_edit', 'shooting_edit', 'shooting_edit', 'shooting_only', 'photoshoot', 'full_ai', 'editing_only', 'editing_only', 'motion', 'motion'];
  const FRASA = ['REKAP', 'TIPS', 'TESTIMONI', 'PROMO', 'EDUKASI', 'BEHIND THE SCENE', 'UNBOXING', 'TUTORIAL'];
  const out: SampleHistoryItem[] = [];
  for (let i = 0; i < count; i++) {
    const jenis = pick(JENIS_POOL);
    const submitted = addDaysYmd(today, -(18 + Math.floor(r() * 95)));
    const revisions = r() < 0.7 ? 0 : r() < 0.8 ? 1 : 2;
    const vg = jenis === 'full_ai' || jenis === 'editing_only' || jenis === 'motion' ? null : pick(['hardi', 'yofa'] as const);
    const editor = jenis === 'shooting_only' || jenis === 'photoshoot' ? null : pick(['dio', 'rara'] as const);
    const shootLate = r() < 0.15;
    const editLate = r() < 0.2;
    let shoot: SampleHistoryItem['shoot'] = null;
    let edit: SampleHistoryItem['edit'] = null;
    let cursor = submitted;
    if (vg) {
      const shootDate = nextWorkday(addDaysYmd(submitted, 3));
      const handed = shootLate ? nextWorkday(addDaysYmd(shootDate, 1)) : shootDate;
      const week = mondayOfYmd(shootDate);
      shoot = { weekStart: week, day: Math.round((new Date(`${shootDate}T00:00:00Z`).getTime() - new Date(`${week}T00:00:00Z`).getTime()) / 86_400_000), handedAt: at(handed) };
      cursor = handed;
    }
    if (editor) {
      const due = addWorkdays(cursor, vg ? 2 : 1);
      const delivered = editLate ? nextWorkday(addDaysYmd(due, 1)) : due;
      edit = { due, deliveredAt: at(delivered) };
      cursor = delivered;
    }
    const completed = addDaysYmd(cursor, 1 + revisions * 2);
    const quality = 4.7 - revisions * 0.7 - (shootLate ? 0.3 : 0) - (editLate ? 0.5 : 0) + (r() - 0.5) * 0.8;
    out.push({
      judul: `${pick(FRASA)} ${pick(PRODUK)} ${i + 1}`, produk: pick(PRODUK), kategori: pick(KAT), jenis,
      rasio: pick(['9:16', '9:16', '16:9', '1:1'] as const), durasiDetik: jenis === 'photoshoot' ? null : pick([20, 30, 45, 60]),
      requester: pick(['sari', 'budi', 'maya'] as const), submittedAt: at(submitted), completedAt: at(completed), revisions, vg, editor, shoot, edit,
      rating: r() < 0.85 ? Math.max(1, Math.min(5, Math.round(quality))) : null,
    });
  }
  return out.filter((x) => x.completedAt.slice(0, 10) < today);
}

export interface SampleCycle {
  name: string;
  periodStart: string;
  periodEnd: string;
  status: 'open' | 'closed';
}

/** Siklus evaluasi 2-mingguan: satu siklus berjalan (terbuka) dan siklus-siklus sebelumnya yang sudah ditutup. */
export function sampleCycles(today: string = todayYmd(), closed = 6): SampleCycle[] {
  const out: SampleCycle[] = [{ name: 'Evaluasi 2 mingguan (berjalan)', periodStart: addDaysYmd(today, -13), periodEnd: today, status: 'open' }];
  for (let i = 0; i < closed; i++) {
    const end = addDaysYmd(today, -14 - 14 * i);
    out.push({ name: `Evaluasi 2 mingguan #${closed - i}`, periodStart: addDaysYmd(end, -13), periodEnd: end, status: 'closed' });
  }
  return out;
}

/** Komentar contoh blind review (tanpa identitas). */
export const SAMPLE_EVAL_COMMENTS = {
  good: [
    'Hasil editing rapi dan sesuai referensi. Komunikasi tim jelas.',
    'Proses syuting terjadwal dengan baik, talent dan lokasi sudah siap.',
    'Revisi kecil ditangani cepat.',
    'Status konten mudah dilacak, tidak perlu bertanya ke tim.',
  ],
  improve: [
    'Kabari lebih awal bila jadwal syuting bergeser.',
    'Teks harga dan promo perlu dicek ulang sebelum dikirim ke review.',
    'Estimasi selesai sebaiknya dikonfirmasi saat brief masuk.',
    'Minta catatan revisi yang lebih spesifik agar tidak bolak-balik.',
  ],
} as const;

export const SAMPLE_FGD = {
  notes: 'FGD internal: tim sepakat memperjelas estimasi selesai di awal, memeriksa teks promo sebelum review, dan menjadwalkan ulang lebih awal bila ada pergeseran.',
  actions: [
    { text: 'Tambahkan checklist cek teks harga/promo sebelum kirim ke In Review', done: true },
    { text: 'Beri tahu User maksimal H-1 bila jadwal syuting bergeser', done: false },
    { text: 'Konfirmasi estimasi selesai saat brief Daily divalidasi', done: false },
  ],
} as const;
