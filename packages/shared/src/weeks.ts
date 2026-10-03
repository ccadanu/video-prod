/**
 * Utilitas pekan produksi. Semua tanggal berupa string 'YYYY-MM-DD' (kalender, tanpa zona waktu).
 *
 * ASUMSI (belum dikonfirmasi): konten Weekly yang disubmit pada pekan kalender W (Senin–Minggu)
 * masuk ke pekan produksi W+1 (Senin–Jumat). Sabtu sebelum pekan produksi = hari Locking.
 */
export type Ymd = string;

const MS_PER_DAY = 86_400_000;
const MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
] as const;

function toUtc(ymd: Ymd): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  if (!y || !m || !d) throw new Error(`Tanggal tidak valid: ${ymd}`);
  return new Date(Date.UTC(y, m - 1, d));
}

function fromUtc(date: Date): Ymd {
  return date.toISOString().slice(0, 10);
}

export function addDays(ymd: Ymd, days: number): Ymd {
  return fromUtc(new Date(toUtc(ymd).getTime() + days * MS_PER_DAY));
}

/** Senin dari pekan kalender yang memuat tanggal tsb. */
export function mondayOf(ymd: Ymd): Ymd {
  const dow = toUtc(ymd).getUTCDay(); // 0 = Minggu
  return addDays(ymd, dow === 0 ? -6 : 1 - dow);
}

export function productionWeekFor(submitYmd: Ymd): Ymd {
  return addDays(mondayOf(submitYmd), 7);
}

/** Sabtu sebelum pekan produksi: sesi Locking VG + User. */
export const lockingDayOf = (weekMonday: Ymd): Ymd => addDays(weekMonday, -2);

/** Tanggal Senin–Jumat pekan produksi. */
export function weekdayDates(weekMonday: Ymd): Ymd[] {
  return [0, 1, 2, 3, 4].map((i) => addDays(weekMonday, i));
}

/** Senin-Senin yang jatuh di bulan tsb → Pekan 1..5 (month: 1–12). */
export function mondaysOfMonth(year: number, month: number): Ymd[] {
  const out: Ymd[] = [];
  const cursor = new Date(Date.UTC(year, month - 1, 1));
  while (cursor.getUTCMonth() === month - 1) {
    if (cursor.getUTCDay() === 1) out.push(fromUtc(cursor));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return out;
}

/** Contoh: "Oktober 2026 · Pekan 1" (bulan & nomor pekan ditentukan oleh hari Senin-nya). */
export function weekLabel(weekMonday: Ymd): string {
  const d = toUtc(weekMonday);
  const week = Math.ceil(d.getUTCDate() / 7);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()} · Pekan ${week}`;
}

/** Tanggal hari ini di zona Asia/Jakarta (WIB). */
export function todayJakarta(now: Date = new Date()): Ymd {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(now);
}
