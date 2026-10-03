const TZ = 'Asia/Jakarta';
const date = new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', timeZone: TZ });
const dateTime = new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: TZ });

export const fmtDate = (iso: string | null): string => (iso ? date.format(new Date(iso)) : '—');
export const fmtDateTime = (iso: string): string => dateTime.format(new Date(iso));
export const fmtDurasi = (detik: number | null): string => (detik === null ? '—' : detik >= 60 && detik % 60 === 0 ? `${detik / 60} mnt` : `${detik} dtk`);

const ymdFmt = new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', timeZone: 'UTC' });
/** 'YYYY-MM-DD' → "05 Okt" (tanggal kalender, tanpa konversi zona waktu). */
export const fmtYmd = (ymd: string): string => ymdFmt.format(new Date(`${ymd}T00:00:00Z`));
